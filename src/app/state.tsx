import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type {
  DrawingDraft,
  LinearUnit,
  MeasurementType,
  PageState,
  UniformPageCalibration,
  XyPageCalibration,
  PdfMetadata,
  Point,
  SessionSettings,
  SessionV4,
  Tool,
} from "../types/domain";
import {
  hasValidMeasurementPoints,
  isMeasurementType,
  isValidPageCalibration,
  measurementPathSpecs,
} from "../utils/geometry";
import { findPageCalibration, getActiveCalibration } from "../utils/calibration";

export interface AppState {
  session: SessionV4 | null;
  tool: Tool;
  selectedMeasurementId: string | null;
  draft: DrawingDraft | null;
  orthogonal: boolean;
  error: string | null;
}

type CalibrationInput =
  Omit<UniformPageCalibration, "id" | "name"> | Omit<XyPageCalibration, "id" | "name">;

export type AppAction =
  | { type: "LOAD_SESSION"; session: SessionV4 }
  | { type: "CLEAR_SESSION" }
  | { type: "SET_PAGE"; pageNumber: number }
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "SET_DRAFT"; draft: DrawingDraft | null }
  | { type: "UPDATE_DRAFT_POINTER"; draftType: DrawingDraft["type"]; pointer: Point }
  | { type: "SET_ORTHOGONAL"; value: boolean }
  | {
      type: "ADD_CALIBRATION";
      pageNumber: number;
      id: string;
      name: string;
      calibration: CalibrationInput;
    }
  | {
      type: "RECALIBRATE_CALIBRATION";
      pageNumber: number;
      calibrationId: string;
      name: string;
      calibration: CalibrationInput;
    }
  | { type: "SET_ACTIVE_CALIBRATION"; pageNumber: number; calibrationId: string }
  | {
      type: "ADD_MEASUREMENT";
      pageNumber: number;
      id: string;
      measurementType: MeasurementType;
      points: Point[];
    }
  | { type: "SELECT_MEASUREMENT"; id: string | null }
  | { type: "UPDATE_MEASUREMENT_POINTS"; pageNumber: number; id: string; points: Point[] }
  | { type: "RENAME_MEASUREMENT"; pageNumber: number; id: string; name: string }
  | { type: "DELETE_MEASUREMENT"; pageNumber: number; id: string }
  | { type: "SET_SETTING"; setting: "displayUnit"; value: LinearUnit }
  | {
      type: "SET_SETTING";
      setting: "showLabels" | "showMeasurements" | "showCalibration";
      value: boolean;
    }
  | { type: "SET_ERROR"; message: string | null };

export const initialAppState: AppState = {
  session: null,
  tool: "select",
  selectedMeasurementId: null,
  draft: null,
  orthogonal: false,
  error: null,
};

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
): SessionV4 {
  const pages: Record<number, PageState> = {};
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    pages[pageNumber] = createPageState(pageNumber);
  }
  return {
    schemaVersion: 4,
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
  };
}

function updatePage(
  session: SessionV4,
  pageNumber: number,
  updater: (page: PageState) => PageState,
): SessionV4 {
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

function pageHasActiveCalibration(session: SessionV4 | null, pageNumber?: number): boolean {
  if (!session) return false;
  const page = session.pages[pageNumber ?? session.currentPage];
  return Boolean(page && getActiveCalibration(page));
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "LOAD_SESSION":
      return {
        ...initialAppState,
        session: action.session,
      };
    case "CLEAR_SESSION":
      return initialAppState;
    case "SET_PAGE": {
      if (!state.session) return state;
      const pageNumber = Math.min(state.session.pageCount, Math.max(1, action.pageNumber));
      return {
        ...state,
        session: { ...state.session, currentPage: pageNumber },
        tool: "select",
        selectedMeasurementId: null,
        draft: null,
        error: null,
      };
    }
    case "SET_TOOL": {
      if (isMeasurementType(action.tool) && !pageHasActiveCalibration(state.session)) {
        return {
          ...state,
          tool: "select",
          draft: null,
          error: "Select a valid scale before creating measurements.",
        };
      }
      return {
        ...state,
        tool: action.tool,
        draft: null,
        error: null,
      };
    }
    case "SET_DRAFT":
      return { ...state, draft: action.draft };
    case "UPDATE_DRAFT_POINTER":
      if (!state.draft || state.draft.type !== action.draftType) return state;
      return { ...state, draft: { ...state.draft, pointer: action.pointer } };
    case "SET_ORTHOGONAL":
      return { ...state, orthogonal: action.value };
    case "ADD_CALIBRATION": {
      if (!state.session) return state;
      const page = state.session.pages[action.pageNumber];
      const name = action.name.trim();
      if (
        !page ||
        !action.id.trim() ||
        !name ||
        !isValidPageCalibration({ ...action.calibration, id: action.id, name }) ||
        findPageCalibration(page, action.id)
      ) {
        return {
          ...state,
          tool: "select",
          draft: null,
          error: !name
            ? "Scale name cannot be empty."
            : "Scale requires a unique ID, two distinct points, and a valid distance greater than zero.",
        };
      }
      return {
        ...state,
        session: updatePage(state.session, action.pageNumber, (page) => ({
          ...page,
          calibrations: [...page.calibrations, { ...action.calibration, id: action.id, name }],
          activeCalibrationId: action.id,
          nextCalibrationNumber: page.nextCalibrationNumber + 1,
        })),
        tool: "select",
        draft: null,
        error: null,
      };
    }
    case "RECALIBRATE_CALIBRATION": {
      if (!state.session) return state;
      const page = state.session.pages[action.pageNumber];
      const calibration = page && findPageCalibration(page, action.calibrationId);
      const name = action.name.trim();
      if (
        !page ||
        !calibration ||
        !name ||
        calibration.mode !== action.calibration.mode ||
        !isValidPageCalibration({ ...action.calibration, id: calibration.id, name })
      ) {
        return {
          ...state,
          tool: "select",
          draft: null,
          error: !name
            ? "Scale name cannot be empty."
            : "Scale requires two distinct points and a valid distance greater than zero.",
        };
      }
      return {
        ...state,
        session: updatePage(state.session, action.pageNumber, (currentPage) => ({
          ...currentPage,
          calibrations: currentPage.calibrations.map((currentCalibration) =>
            currentCalibration.id === calibration.id
              ? { ...action.calibration, id: calibration.id, name }
              : currentCalibration,
          ),
        })),
        tool: "select",
        draft: null,
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
        session: updatePage(state.session, action.pageNumber, (currentPage) => ({
          ...currentPage,
          activeCalibrationId: action.calibrationId,
        })),
        tool: state.draft ? "select" : state.tool,
        draft: null,
        error: null,
      };
    }
    case "ADD_MEASUREMENT": {
      const page = state.session?.pages[action.pageNumber];
      const calibration = page && getActiveCalibration(page);
      if (!state.session || !page || !calibration) {
        return {
          ...state,
          tool: "select",
          draft: null,
          error: "Select a valid scale before creating measurements.",
        };
      }
      if (!action.id.trim() || !hasValidMeasurementPoints(action.measurementType, action.points)) {
        return {
          ...state,
          error: `A ${measurementPathSpecs[action.measurementType].label.toLowerCase()} has an invalid set of vertices.`,
        };
      }
      const session = updatePage(state.session, action.pageNumber, (page) => ({
        ...page,
        nextMeasurementNumber: {
          ...page.nextMeasurementNumber,
          [action.measurementType]: page.nextMeasurementNumber[action.measurementType] + 1,
        },
        measurements: [
          ...page.measurements,
          {
            id: action.id,
            type: action.measurementType,
            name: `${measurementPathSpecs[action.measurementType].label} ${page.nextMeasurementNumber[action.measurementType]}`,
            points: action.points,
            calibrationId: calibration.id,
          },
        ],
      }));
      return {
        ...state,
        session,
        draft: null,
        selectedMeasurementId: action.id,
        error: null,
      };
    }
    case "SELECT_MEASUREMENT":
      return { ...state, selectedMeasurementId: action.id, error: null };
    case "UPDATE_MEASUREMENT_POINTS": {
      if (!state.session) return state;
      const session = updatePage(state.session, action.pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.map((measurement) => {
          if (measurement.id !== action.id) return measurement;
          if (!hasValidMeasurementPoints(measurement.type, action.points)) return measurement;
          return { ...measurement, points: action.points };
        }),
      }));
      return { ...state, session };
    }
    case "RENAME_MEASUREMENT": {
      if (!state.session) return state;
      const name = action.name.trim();
      if (!name) {
        return { ...state, error: "Measurement name cannot be empty." };
      }
      const session = updatePage(state.session, action.pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.map((measurement) =>
          measurement.id === action.id ? { ...measurement, name } : measurement,
        ),
      }));
      return { ...state, session, error: null };
    }
    case "DELETE_MEASUREMENT": {
      if (!state.session) return state;
      const session = updatePage(state.session, action.pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.filter((measurement) => measurement.id !== action.id),
      }));
      return {
        ...state,
        session,
        selectedMeasurementId:
          state.selectedMeasurementId === action.id ? null : state.selectedMeasurementId,
        error: null,
      };
    }
    case "SET_SETTING": {
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          settings: {
            ...state.session.settings,
            [action.setting]: action.value,
          },
        },
        error: null,
      };
    }
    case "SET_ERROR":
      return { ...state, error: action.message };
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used inside AppProvider.");
  return context;
}
