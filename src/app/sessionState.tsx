import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppState } from "./state";
import type {
  CalibrationReferenceKey,
  CurrentSession,
  MeasurementType,
  PageState,
  PdfMetadata,
  Point,
  SessionSettings,
  UniformPageCalibration,
  XyPageCalibration,
} from "../types/domain";
import {
  hasValidMeasurementPoints,
  isValidPageCalibration,
  measurementPathSpecs,
} from "../utils/geometry";
import {
  findPageCalibration,
  getActiveCalibration,
  replaceCalibrationReferencePoints,
} from "../utils/calibration";

/**
 * Persistent domain state for the currently open plan.
 *
 * The `session` value is the only in-memory source of truth for CurrentSession.
 * Runtime PDF resources, interaction state, and overlay descriptors live in
 * their respective coordinators/providers and never become part of this
 * snapshot.
 */
export interface SessionState {
  session: CurrentSession | null;
}

export interface SessionCommandResult extends SessionState {
  error: string | null;
}

export type CalibrationInput =
  Omit<UniformPageCalibration, "id" | "name"> | Omit<XyPageCalibration, "id" | "name">;

export interface AddCalibrationCommand {
  pageNumber: number;
  id: string;
  name: string;
  calibration: CalibrationInput;
}

export interface RecalibrateCalibrationCommand {
  pageNumber: number;
  calibrationId: string;
  name: string;
  calibration: CalibrationInput;
}

export interface RenameCalibrationCommand {
  pageNumber: number;
  calibrationId: string;
  name: string;
}

export interface AssignMeasurementCalibrationCommand {
  pageNumber: number;
  measurementId: string;
  calibrationId: string;
}

export interface DeleteCalibrationCommand {
  pageNumber: number;
  calibrationId: string;
}

export interface UpdateCalibrationReferencePointsCommand {
  pageNumber: number;
  calibrationId: string;
  reference: CalibrationReferenceKey;
  points: [Point, Point];
}

export interface AddMeasurementCommand {
  pageNumber: number;
  id: string;
  measurementType: MeasurementType;
  points: Point[];
}

export interface UpdateMeasurementCommand {
  pageNumber: number;
  id: string;
  points: Point[];
}

export interface AssignClassificationValueCommand {
  pageNumber: number;
  measurementId: string;
  dimensionId: string;
  valueId: string;
}

export type SessionAction =
  | { type: "LOAD_SESSION"; session: CurrentSession }
  | { type: "CLEAR_SESSION" }
  | { type: "UPDATE_PAGE"; pageNumber: number }
  | ({ type: "ADD_CALIBRATION" } & AddCalibrationCommand)
  | ({ type: "RECALIBRATE_CALIBRATION" } & RecalibrateCalibrationCommand)
  | ({ type: "RENAME_CALIBRATION" } & RenameCalibrationCommand)
  | ({ type: "ASSIGN_MEASUREMENT_CALIBRATION" } & AssignMeasurementCalibrationCommand)
  | ({ type: "DELETE_CALIBRATION" } & DeleteCalibrationCommand)
  | { type: "SET_ACTIVE_CALIBRATION"; pageNumber: number; calibrationId: string }
  | ({ type: "UPDATE_CALIBRATION_REFERENCE_POINTS" } & UpdateCalibrationReferencePointsCommand)
  | ({ type: "ADD_MEASUREMENT" } & AddMeasurementCommand)
  | ({ type: "UPDATE_MEASUREMENT" } & UpdateMeasurementCommand)
  | { type: "RENAME_MEASUREMENT"; pageNumber: number; id: string; name: string }
  | { type: "SET_MEASUREMENT_VISIBILITY"; pageNumber: number; id: string; visible: boolean }
  | {
      type: "SET_MEASUREMENTS_VISIBILITY";
      pageNumber: number;
      measurementIds: string[];
      visible: boolean;
    }
  | { type: "DELETE_MEASUREMENT"; pageNumber: number; id: string }
  | { type: "ADD_CLASSIFICATION_DIMENSION"; id: string; name: string }
  | { type: "RENAME_CLASSIFICATION_DIMENSION"; id: string; name: string }
  | { type: "ARCHIVE_CLASSIFICATION_DIMENSION"; id: string }
  | { type: "RESTORE_CLASSIFICATION_DIMENSION"; id: string }
  | { type: "ADD_CLASSIFICATION_VALUE"; dimensionId: string; id: string; name: string }
  | { type: "RENAME_CLASSIFICATION_VALUE"; dimensionId: string; id: string; name: string }
  | { type: "ARCHIVE_CLASSIFICATION_VALUE"; dimensionId: string; id: string }
  | { type: "RESTORE_CLASSIFICATION_VALUE"; dimensionId: string; id: string }
  | ({ type: "ASSIGN_CLASSIFICATION_VALUE" } & AssignClassificationValueCommand)
  | ({ type: "REMOVE_CLASSIFICATION_VALUE" } & AssignClassificationValueCommand)
  | { type: "UPDATE_SETTINGS"; settings: Partial<SessionSettings> };

export const initialSessionState: SessionCommandResult = {
  session: null,
  error: null,
};

function pointsEqual(left: readonly Point[], right: readonly Point[]): boolean {
  return (
    left.length === right.length &&
    left.every((point, index) => point.x === right[index]?.x && point.y === right[index]?.y)
  );
}

function createPageState(pageNumber: number): PageState {
  return {
    pageNumber,
    calibrations: [],
    activeCalibrationId: null,
    nextCalibrationNumber: 1,
    measurements: [],
    nextMeasurementNumber: { line: 1, polyline: 1, polygon: 1 },
  };
}

export function createEmptySession(
  pdf: PdfMetadata,
  pageCount: number,
  settings?: Partial<SessionSettings>,
): CurrentSession {
  const pages: Record<number, PageState> = {};
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    pages[pageNumber] = createPageState(pageNumber);
  }
  return {
    schemaVersion: 7,
    pdf,
    pageCount,
    currentPage: 1,
    pages,
    settings: {
      displayUnit: "m",
      showLabels: true,
      showMeasurements: true,
      showCalibration: true,
      ...settings,
    },
    classificationCatalog: { dimensions: [] },
  };
}

function updatePageState(
  session: CurrentSession,
  pageNumber: number,
  updater: (page: PageState) => PageState,
): CurrentSession {
  const page = session.pages[pageNumber];
  if (!page) return session;
  return {
    ...session,
    pages: {
      ...session.pages,
      [pageNumber]: updater(page),
    },
  };
}

export function sessionReducer(
  state: SessionCommandResult,
  action: SessionAction,
): SessionCommandResult {
  switch (action.type) {
    case "LOAD_SESSION":
      return { ...initialSessionState, session: action.session };
    case "CLEAR_SESSION":
      return initialSessionState;
    case "UPDATE_PAGE": {
      if (!state.session) return state;
      const pageNumber = Math.min(state.session.pageCount, Math.max(1, action.pageNumber));
      return {
        ...state,
        session: { ...state.session, currentPage: pageNumber },
        error: null,
      };
    }
    case "ADD_CALIBRATION": {
      if (!state.session) return state;
      const { pageNumber, id, name: rawName, calibration } = action;
      const page = state.session.pages[pageNumber];
      const name = rawName.trim();
      if (
        !page ||
        !id.trim() ||
        !name ||
        !isValidPageCalibration({ ...calibration, id, name }) ||
        findPageCalibration(page, id)
      ) {
        return {
          ...state,
          error: !name
            ? "Scale name cannot be empty."
            : "Scale requires a unique ID, two distinct points, and a valid distance greater than zero.",
        };
      }
      return {
        ...state,
        session: updatePageState(state.session, pageNumber, (currentPage) => ({
          ...currentPage,
          calibrations: [...currentPage.calibrations, { ...calibration, id, name }],
          activeCalibrationId: id,
          nextCalibrationNumber: currentPage.nextCalibrationNumber + 1,
        })),
        error: null,
      };
    }
    case "RECALIBRATE_CALIBRATION":
      return updateRecalibration(state, action);
    case "RENAME_CALIBRATION": {
      if (!state.session) return state;
      const page = state.session.pages[action.pageNumber];
      const calibration = page && findPageCalibration(page, action.calibrationId);
      const name = action.name.trim();
      if (!page || !calibration || !name) {
        return {
          ...state,
          error: !name
            ? "Scale name cannot be empty."
            : "The selected scale is no longer available.",
        };
      }
      return {
        ...state,
        session: updatePageState(state.session, action.pageNumber, (currentPage) => ({
          ...currentPage,
          calibrations: currentPage.calibrations.map((currentCalibration) =>
            currentCalibration.id === action.calibrationId
              ? { ...currentCalibration, name }
              : currentCalibration,
          ),
        })),
        error: null,
      };
    }
    case "ASSIGN_MEASUREMENT_CALIBRATION": {
      if (!state.session) return state;
      const page = state.session.pages[action.pageNumber];
      const measurement = page?.measurements.find(
        (candidate) => candidate.id === action.measurementId,
      );
      const calibration = page && findPageCalibration(page, action.calibrationId);
      if (!page || !measurement) {
        return { ...state, error: "The selected measurement is no longer available." };
      }
      if (!calibration) {
        return { ...state, error: "The selected scale is no longer available." };
      }
      return {
        ...state,
        session: updatePageState(state.session, action.pageNumber, (currentPage) => ({
          ...currentPage,
          measurements: currentPage.measurements.map((currentMeasurement) =>
            currentMeasurement.id === action.measurementId
              ? { ...currentMeasurement, calibrationId: action.calibrationId }
              : currentMeasurement,
          ),
        })),
        error: null,
      };
    }
    case "DELETE_CALIBRATION": {
      if (!state.session) return state;
      const page = state.session.pages[action.pageNumber];
      const calibration = page && findPageCalibration(page, action.calibrationId);
      if (!page || !calibration) {
        return { ...state, error: "The selected scale is no longer available." };
      }
      if (
        page.measurements.some((measurement) => measurement.calibrationId === action.calibrationId)
      ) {
        return { ...state, error: "Cannot delete a scale that is used by measurements." };
      }
      return {
        ...state,
        session: updatePageState(state.session, action.pageNumber, (currentPage) => {
          const calibrations = currentPage.calibrations.filter(
            (currentCalibration) => currentCalibration.id !== action.calibrationId,
          );
          return {
            ...currentPage,
            calibrations,
            activeCalibrationId:
              currentPage.activeCalibrationId === action.calibrationId
                ? (calibrations[0]?.id ?? null)
                : currentPage.activeCalibrationId,
          };
        }),
        error: null,
      };
    }
    case "SET_ACTIVE_CALIBRATION": {
      if (!state.session) return state;
      const page = state.session.pages[action.pageNumber];
      if (!page || !findPageCalibration(page, action.calibrationId)) {
        return { ...state, error: "The selected scale is no longer available." };
      }
      return {
        ...state,
        session: updatePageState(state.session, action.pageNumber, (currentPage) => ({
          ...currentPage,
          activeCalibrationId: action.calibrationId,
        })),
        error: null,
      };
    }
    case "UPDATE_CALIBRATION_REFERENCE_POINTS":
      return updateCalibrationReferencePoints(state, action);
    case "ADD_MEASUREMENT": {
      if (!state.session) return state;
      const { pageNumber, id, measurementType, points } = action;
      const page = state.session.pages[pageNumber];
      const calibration = page && getActiveCalibration(page);
      const duplicateId = Object.values(state.session.pages).some((candidatePage) =>
        candidatePage.measurements.some((measurement) => measurement.id === id),
      );
      if (!page || !calibration) {
        return { ...state, error: "Select a valid scale before creating measurements." };
      }
      if (!id.trim() || duplicateId || !hasValidMeasurementPoints(measurementType, points)) {
        return {
          ...state,
          error: duplicateId
            ? "Measurement IDs must be unique across the session."
            : `A ${measurementPathSpecs[measurementType].label.toLowerCase()} has an invalid set of vertices.`,
        };
      }
      const session = updatePageState(state.session, pageNumber, (currentPage) => ({
        ...currentPage,
        nextMeasurementNumber: {
          ...currentPage.nextMeasurementNumber,
          [measurementType]: currentPage.nextMeasurementNumber[measurementType] + 1,
        },
        measurements: [
          ...currentPage.measurements,
          {
            id,
            type: measurementType,
            name: `${measurementPathSpecs[measurementType].label} ${currentPage.nextMeasurementNumber[measurementType]}`,
            points,
            calibrationId: calibration.id,
            classificationValueIds: [],
            visible: true,
          },
        ],
      }));
      return { ...state, session, error: null };
    }
    case "UPDATE_MEASUREMENT": {
      if (!state.session) return state;
      const { pageNumber, id, points } = action;
      const session = updatePageState(state.session, pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.map((measurement) => {
          if (measurement.id !== id) return measurement;
          if (!hasValidMeasurementPoints(measurement.type, points)) return measurement;
          return { ...measurement, points };
        }),
      }));
      return { ...state, session };
    }
    case "RENAME_MEASUREMENT": {
      if (!state.session) return state;
      const name = action.name.trim();
      if (!name) return { ...state, error: "Measurement name cannot be empty." };
      const session = updatePageState(state.session, action.pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.map((measurement) =>
          measurement.id === action.id ? { ...measurement, name } : measurement,
        ),
      }));
      return { ...state, session, error: null };
    }
    case "SET_MEASUREMENT_VISIBILITY": {
      if (!state.session) return state;
      const page = state.session.pages[action.pageNumber];
      if (!page || !page.measurements.some((measurement) => measurement.id === action.id)) {
        return { ...state, error: "The selected measurement is no longer available." };
      }
      const session = updatePageState(state.session, action.pageNumber, (currentPage) => ({
        ...currentPage,
        measurements: currentPage.measurements.map((measurement) =>
          measurement.id === action.id ? { ...measurement, visible: action.visible } : measurement,
        ),
      }));
      return { ...state, session, error: null };
    }
    case "SET_MEASUREMENTS_VISIBILITY": {
      if (!state.session) return state;
      const page = state.session.pages[action.pageNumber];
      const measurementIds = new Set(action.measurementIds);
      if (measurementIds.size === 0) return { ...state, error: null };
      const pageMeasurementIds = new Set(
        page?.measurements.map((measurement) => measurement.id) ?? [],
      );
      if (
        !page ||
        ![...measurementIds].every((id) => pageMeasurementIds.has(id))
      ) {
        return {
          ...state,
          error: "One or more selected measurements are no longer available.",
        };
      }
      if (
        page.measurements
          .filter((measurement) => measurementIds.has(measurement.id))
          .every((measurement) => measurement.visible === action.visible)
      ) {
        return { ...state, error: null };
      }
      const session = updatePageState(state.session, action.pageNumber, (currentPage) => ({
        ...currentPage,
        measurements: currentPage.measurements.map((measurement) =>
          measurementIds.has(measurement.id)
            ? { ...measurement, visible: action.visible }
            : measurement,
        ),
      }));
      return { ...state, session, error: null };
    }
    case "DELETE_MEASUREMENT": {
      if (!state.session) return state;
      const session = updatePageState(state.session, action.pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.filter((measurement) => measurement.id !== action.id),
      }));
      return { ...state, session, error: null };
    }
    case "ADD_CLASSIFICATION_DIMENSION": {
      if (!state.session) return state;
      const id = action.id.trim();
      const name = action.name.trim();
      const dimensions = state.session.classificationCatalog.dimensions;
      const normalizedName = name.toLocaleLowerCase();
      const idExists = dimensions.some(
        (dimension) => dimension.id === id || dimension.values.some((value) => value.id === id),
      );
      if (
        !id ||
        !name ||
        idExists ||
        dimensions.some((dimension) => dimension.name.toLocaleLowerCase() === normalizedName)
      ) {
        return { ...state, error: "Classification dimensions need unique IDs and names." };
      }
      return {
        ...state,
        session: {
          ...state.session,
          classificationCatalog: {
            dimensions: [...dimensions, { id, name, archived: false, values: [] }],
          },
        },
        error: null,
      };
    }
    case "ARCHIVE_CLASSIFICATION_DIMENSION":
    case "RESTORE_CLASSIFICATION_DIMENSION": {
      if (!state.session) return state;
      const dimensions = state.session.classificationCatalog.dimensions;
      const dimension = dimensions.find((candidate) => candidate.id === action.id);
      if (!dimension) {
        return { ...state, error: "The classification dimension is no longer available." };
      }
      const archived = action.type === "ARCHIVE_CLASSIFICATION_DIMENSION";
      if (dimension.archived === archived) return { ...state, error: null };
      return {
        ...state,
        session: {
          ...state.session,
          classificationCatalog: {
            dimensions: dimensions.map((candidate) =>
              candidate.id === action.id ? { ...candidate, archived } : candidate,
            ),
          },
        },
        error: null,
      };
    }
    case "RENAME_CLASSIFICATION_DIMENSION": {
      if (!state.session) return state;
      const name = action.name.trim();
      const dimensions = state.session.classificationCatalog.dimensions;
      const dimension = dimensions.find((candidate) => candidate.id === action.id);
      if (dimension?.archived) {
        return { ...state, error: "Restore the classification dimension before editing it." };
      }
      if (
        !name ||
        !dimension ||
        dimensions.some(
          (dimension) =>
            dimension.id !== action.id &&
            dimension.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        return { ...state, error: "Classification dimension names must be unique and non-empty." };
      }
      return {
        ...state,
        session: {
          ...state.session,
          classificationCatalog: {
            dimensions: dimensions.map((dimension) =>
              dimension.id === action.id ? { ...dimension, name } : dimension,
            ),
          },
        },
        error: null,
      };
    }
    case "ADD_CLASSIFICATION_VALUE": {
      if (!state.session) return state;
      const id = action.id.trim();
      const name = action.name.trim();
      const dimensions = state.session.classificationCatalog.dimensions;
      const dimension = dimensions.find((candidate) => candidate.id === action.dimensionId);
      if (dimension?.archived) {
        return { ...state, error: "Restore the classification dimension before editing it." };
      }
      const idExists = dimensions.some(
        (candidate) => candidate.id === id || candidate.values.some((value) => value.id === id),
      );
      if (
        !dimension ||
        !id ||
        !name ||
        idExists ||
        dimension.values.some(
          (value) => value.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        return {
          ...state,
          error: "Classification values need unique IDs and names within a dimension.",
        };
      }
      return {
        ...state,
        session: {
          ...state.session,
          classificationCatalog: {
            dimensions: dimensions.map((candidate) =>
              candidate.id === action.dimensionId
                ? { ...candidate, values: [...candidate.values, { id, name, archived: false }] }
                : candidate,
            ),
          },
        },
        error: null,
      };
    }
    case "RENAME_CLASSIFICATION_VALUE": {
      if (!state.session) return state;
      const name = action.name.trim();
      const dimensions = state.session.classificationCatalog.dimensions;
      const dimension = dimensions.find((candidate) => candidate.id === action.dimensionId);
      if (dimension?.archived) {
        return { ...state, error: "Restore the classification dimension before editing it." };
      }
      if (
        !dimension ||
        !name ||
        !dimension.values.some((value) => value.id === action.id) ||
        dimension.values.some(
          (value) =>
            value.id !== action.id && value.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        return { ...state, error: "Classification value names must be unique and non-empty." };
      }
      return {
        ...state,
        session: {
          ...state.session,
          classificationCatalog: {
            dimensions: dimensions.map((candidate) =>
              candidate.id === action.dimensionId
                ? {
                    ...candidate,
                    values: candidate.values.map((value) =>
                      value.id === action.id ? { ...value, name } : value,
                    ),
                  }
                : candidate,
            ),
          },
        },
        error: null,
      };
    }
    case "ARCHIVE_CLASSIFICATION_VALUE":
    case "RESTORE_CLASSIFICATION_VALUE": {
      if (!state.session) return state;
      const dimensions = state.session.classificationCatalog.dimensions;
      const dimension = dimensions.find((candidate) => candidate.id === action.dimensionId);
      if (dimension?.archived) {
        return { ...state, error: "Restore the classification dimension before editing it." };
      }
      if (!dimension?.values.some((value) => value.id === action.id)) {
        return { ...state, error: "The classification value is no longer available." };
      }
      return {
        ...state,
        session: {
          ...state.session,
          classificationCatalog: {
            dimensions: dimensions.map((candidate) =>
              candidate.id === action.dimensionId
                ? {
                    ...candidate,
                    values: candidate.values.map((value) =>
                      value.id === action.id
                        ? { ...value, archived: action.type === "ARCHIVE_CLASSIFICATION_VALUE" }
                        : value,
                    ),
                  }
                : candidate,
            ),
          },
        },
        error: null,
      };
    }
    case "ASSIGN_CLASSIFICATION_VALUE": {
      if (!state.session) return state;
      const dimension = state.session.classificationCatalog.dimensions.find(
        (candidate) => candidate.id === action.dimensionId,
      );
      const value = dimension?.values.find((candidate) => candidate.id === action.valueId);
      const page = state.session.pages[action.pageNumber];
      if (dimension?.archived) {
        return { ...state, error: "Restore the classification dimension before assigning values." };
      }
      if (!value || value.archived) {
        return { ...state, error: "The classification value is no longer available." };
      }
      if (!page?.measurements.some((measurement) => measurement.id === action.measurementId)) {
        return { ...state, error: "The selected measurement is no longer available." };
      }
      const session = updatePageState(state.session, action.pageNumber, (currentPage) => ({
        ...currentPage,
        measurements: currentPage.measurements.map((measurement) =>
          measurement.id === action.measurementId
            ? {
                ...measurement,
                classificationValueIds: [
                  ...measurement.classificationValueIds.filter(
                    (valueId) =>
                      !dimension!.values.some((dimensionValue) => dimensionValue.id === valueId),
                  ),
                  action.valueId,
                ],
              }
            : measurement,
        ),
      }));
      return { ...state, session, error: null };
    }
    case "REMOVE_CLASSIFICATION_VALUE": {
      if (!state.session) return state;
      const dimension = state.session.classificationCatalog.dimensions.find(
        (candidate) => candidate.id === action.dimensionId,
      );
      const value = dimension?.values.find((candidate) => candidate.id === action.valueId);
      const page = state.session.pages[action.pageNumber];
      if (!dimension || !value) {
        return { ...state, error: "The classification value is no longer available." };
      }
      if (!page?.measurements.some((measurement) => measurement.id === action.measurementId)) {
        return { ...state, error: "The selected measurement is no longer available." };
      }
      const session = updatePageState(state.session, action.pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.map((measurement) =>
          measurement.id === action.measurementId
            ? {
                ...measurement,
                classificationValueIds: measurement.classificationValueIds.filter(
                  (valueId) => !dimension.values.some((candidate) => candidate.id === valueId),
                ),
              }
            : measurement,
        ),
      }));
      return { ...state, session, error: null };
    }
    case "UPDATE_SETTINGS": {
      if (!state.session) return state;
      return {
        ...state,
        session: { ...state.session, settings: { ...state.session.settings, ...action.settings } },
        error: null,
      };
    }
  }
}

function updateRecalibration(
  state: SessionCommandResult,
  command: RecalibrateCalibrationCommand,
): SessionCommandResult {
  if (!state.session) return state;
  const { pageNumber, calibrationId, name: rawName, calibration } = command;
  const page = state.session.pages[pageNumber];
  const existing = page && findPageCalibration(page, calibrationId);
  const name = rawName.trim();
  if (
    !page ||
    !existing ||
    !name ||
    existing.mode !== calibration.mode ||
    !isValidPageCalibration({ ...calibration, id: existing.id, name })
  ) {
    return {
      ...state,
      error: !name
        ? "Scale name cannot be empty."
        : "Scale requires two distinct points and a valid distance greater than zero.",
    };
  }
  return {
    ...state,
    session: updatePageState(state.session, pageNumber, (currentPage) => ({
      ...currentPage,
      calibrations: currentPage.calibrations.map((currentCalibration) =>
        currentCalibration.id === existing.id
          ? { ...calibration, id: existing.id, name }
          : currentCalibration,
      ),
    })),
    error: null,
  };
}

function updateCalibrationReferencePoints(
  state: SessionCommandResult,
  command: UpdateCalibrationReferencePointsCommand,
): SessionCommandResult {
  if (!state.session) return state;
  const { pageNumber, calibrationId, reference, points } = command;
  const page = state.session.pages[pageNumber];
  const calibration = page && findPageCalibration(page, calibrationId);
  const updatedCalibration =
    calibration && replaceCalibrationReferencePoints(calibration, reference, points);
  if (!page || !calibration || !updatedCalibration || !isValidPageCalibration(updatedCalibration)) {
    return {
      ...state,
      error: "Scale reference requires distinct points and a valid uniform, X, or Y orientation.",
    };
  }
  return {
    ...state,
    session: updatePageState(state.session, pageNumber, (currentPage) => ({
      ...currentPage,
      calibrations: currentPage.calibrations.map((currentCalibration) =>
        currentCalibration.id === calibrationId ? updatedCalibration : currentCalibration,
      ),
    })),
    error: null,
  };
}

interface SessionContextValue extends SessionState {
  loadSession: (session: CurrentSession) => void;
  clearSession: () => void;
  updatePage: (pageNumber: number) => void;
  addCalibration: (command: AddCalibrationCommand) => void;
  recalibrateCalibration: (command: RecalibrateCalibrationCommand) => void;
  renameCalibration: (command: RenameCalibrationCommand) => void;
  assignMeasurementCalibration: (command: AssignMeasurementCalibrationCommand) => void;
  deleteCalibration: (command: DeleteCalibrationCommand) => void;
  setActiveCalibration: (pageNumber: number, calibrationId: string) => void;
  updateCalibration: (command: UpdateCalibrationReferencePointsCommand) => void;
  addMeasurement: (command: AddMeasurementCommand) => void;
  updateMeasurement: (command: UpdateMeasurementCommand) => boolean;
  renameMeasurement: (pageNumber: number, id: string, name: string) => void;
  setMeasurementVisibility: (pageNumber: number, id: string, visible: boolean) => void;
  setMeasurementsVisibility: (
    pageNumber: number,
    measurementIds: string[],
    visible: boolean,
  ) => void;
  deleteMeasurement: (pageNumber: number, id: string) => void;
  addClassificationDimension: (id: string, name: string) => void;
  renameClassificationDimension: (id: string, name: string) => void;
  archiveClassificationDimension: (id: string) => void;
  restoreClassificationDimension: (id: string) => void;
  addClassificationValue: (dimensionId: string, id: string, name: string) => void;
  renameClassificationValue: (dimensionId: string, id: string, name: string) => void;
  archiveClassificationValue: (dimensionId: string, id: string) => void;
  restoreClassificationValue: (dimensionId: string, id: string) => void;
  assignClassificationValue: (command: AssignClassificationValueCommand) => void;
  removeClassificationValue: (command: AssignClassificationValueCommand) => void;
  updateSettings: (settings: Partial<SessionSettings>) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { setError } = useAppState();
  const [session, setSession] = useState<CurrentSession | null>(null);
  const sessionRef = useRef<CurrentSession | null>(null);
  const applyAction = useCallback(
    (action: SessionAction): SessionCommandResult => {
      const result = sessionReducer({ session: sessionRef.current, error: null }, action);
      sessionRef.current = result.session;
      setSession(result.session);
      setError(result.error);
      return result;
    },
    [setError],
  );
  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      loadSession: (nextSession) => applyAction({ type: "LOAD_SESSION", session: nextSession }),
      clearSession: () => applyAction({ type: "CLEAR_SESSION" }),
      updatePage: (pageNumber) => applyAction({ type: "UPDATE_PAGE", pageNumber }),
      addCalibration: (command) => applyAction({ type: "ADD_CALIBRATION", ...command }),
      recalibrateCalibration: (command) =>
        applyAction({ type: "RECALIBRATE_CALIBRATION", ...command }),
      renameCalibration: (command) => applyAction({ type: "RENAME_CALIBRATION", ...command }),
      assignMeasurementCalibration: (command) =>
        applyAction({ type: "ASSIGN_MEASUREMENT_CALIBRATION", ...command }),
      deleteCalibration: (command) => applyAction({ type: "DELETE_CALIBRATION", ...command }),
      setActiveCalibration: (pageNumber, calibrationId) =>
        applyAction({ type: "SET_ACTIVE_CALIBRATION", pageNumber, calibrationId }),
      updateCalibration: (command) =>
        applyAction({ type: "UPDATE_CALIBRATION_REFERENCE_POINTS", ...command }),
      addMeasurement: (command) => applyAction({ type: "ADD_MEASUREMENT", ...command }),
      updateMeasurement: (command) => {
        const result = applyAction({ type: "UPDATE_MEASUREMENT", ...command });
        const measurement = result.session?.pages[command.pageNumber]?.measurements.find(
          (candidate) => candidate.id === command.id,
        );
        return measurement ? pointsEqual(measurement.points, command.points) : false;
      },
      renameMeasurement: (pageNumber, id, name) =>
        applyAction({ type: "RENAME_MEASUREMENT", pageNumber, id, name }),
      setMeasurementVisibility: (pageNumber, id, visible) =>
        applyAction({ type: "SET_MEASUREMENT_VISIBILITY", pageNumber, id, visible }),
      setMeasurementsVisibility: (pageNumber, measurementIds, visible) =>
        applyAction({ type: "SET_MEASUREMENTS_VISIBILITY", pageNumber, measurementIds, visible }),
      deleteMeasurement: (pageNumber, id) =>
        applyAction({ type: "DELETE_MEASUREMENT", pageNumber, id }),
      addClassificationDimension: (id, name) =>
        applyAction({ type: "ADD_CLASSIFICATION_DIMENSION", id, name }),
      renameClassificationDimension: (id, name) =>
        applyAction({ type: "RENAME_CLASSIFICATION_DIMENSION", id, name }),
      archiveClassificationDimension: (id) =>
        applyAction({ type: "ARCHIVE_CLASSIFICATION_DIMENSION", id }),
      restoreClassificationDimension: (id) =>
        applyAction({ type: "RESTORE_CLASSIFICATION_DIMENSION", id }),
      addClassificationValue: (dimensionId, id, name) =>
        applyAction({ type: "ADD_CLASSIFICATION_VALUE", dimensionId, id, name }),
      renameClassificationValue: (dimensionId, id, name) =>
        applyAction({ type: "RENAME_CLASSIFICATION_VALUE", dimensionId, id, name }),
      archiveClassificationValue: (dimensionId, id) =>
        applyAction({ type: "ARCHIVE_CLASSIFICATION_VALUE", dimensionId, id }),
      restoreClassificationValue: (dimensionId, id) =>
        applyAction({ type: "RESTORE_CLASSIFICATION_VALUE", dimensionId, id }),
      assignClassificationValue: (command) =>
        applyAction({ type: "ASSIGN_CLASSIFICATION_VALUE", ...command }),
      removeClassificationValue: (command) =>
        applyAction({ type: "REMOVE_CLASSIFICATION_VALUE", ...command }),
      updateSettings: (settings) => applyAction({ type: "UPDATE_SETTINGS", settings }),
    }),
    [applyAction, session],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionState(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSessionState must be used inside SessionProvider.");
  return context;
}
