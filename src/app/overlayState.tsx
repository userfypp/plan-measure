import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { CalibrationReferenceKey } from "../types/domain";

export interface ReplacePdfPayload { pdfId: string; fileName?: string }
export interface RecalibrationPayload { pageNumber: number; calibrationId: string; calibrationName: string; measurementCount: number }
export interface CalibrationReferenceEditConfirmationPayload { pageNumber: number; calibrationId: string; reference: CalibrationReferenceKey; calibrationName: string; measurementCount: number }
export interface DeleteMeasurementPayload { pageNumber: number; measurementId: string; measurementName: string }

export type OverlayDialog = { type: "replacePdf"; payload: ReplacePdfPayload };
export type OverlayConfirmation =
  | { type: "recalibrateScale"; payload: RecalibrationPayload }
  | { type: "saveCalibrationReferenceEdit"; payload: CalibrationReferenceEditConfirmationPayload }
  | { type: "deleteMeasurement"; payload: DeleteMeasurementPayload };

export type ActiveOverlay =
  | { kind: "confirmation"; descriptor: OverlayConfirmation }
  | { kind: "dialog"; descriptor: OverlayDialog };

export interface OverlayState { active: ActiveOverlay | null }
export const initialOverlayState: OverlayState = { active: null };

export type OverlayAction =
  | { type: "REQUEST_REPLACE_PDF"; payload: ReplacePdfPayload }
  | { type: "CLOSE_DIALOG"; dialog?: OverlayDialog }
  | { type: "REQUEST_RECALIBRATION"; payload: RecalibrationPayload }
  | { type: "REQUEST_SAVE_CALIBRATION_REFERENCE_EDIT"; payload: CalibrationReferenceEditConfirmationPayload }
  | { type: "REQUEST_DELETE_MEASUREMENT"; payload: DeleteMeasurementPayload }
  | { type: "CLOSE_CONFIRMATION"; confirmation?: OverlayConfirmation }
  | { type: "CLOSE_ALL_OVERLAYS" };

function descriptorsMatch<T extends object>(current: T | undefined, expected: T | undefined): boolean {
  return !expected || Boolean(current && JSON.stringify(current) === JSON.stringify(expected));
}

export function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case "REQUEST_REPLACE_PDF":
      return { active: { kind: "dialog", descriptor: { type: "replacePdf", payload: action.payload } } };
    case "CLOSE_DIALOG":
      return state.active?.kind === "dialog" && descriptorsMatch(state.active.descriptor, action.dialog) ? initialOverlayState : state;
    case "REQUEST_RECALIBRATION":
      if (state.active?.kind === "dialog") return state;
      return { active: { kind: "confirmation", descriptor: { type: "recalibrateScale", payload: action.payload } } };
    case "REQUEST_SAVE_CALIBRATION_REFERENCE_EDIT":
      if (state.active?.kind === "dialog") return state;
      return { active: { kind: "confirmation", descriptor: { type: "saveCalibrationReferenceEdit", payload: action.payload } } };
    case "REQUEST_DELETE_MEASUREMENT":
      if (state.active?.kind === "dialog") return state;
      return { active: { kind: "confirmation", descriptor: { type: "deleteMeasurement", payload: action.payload } } };
    case "CLOSE_CONFIRMATION":
      return state.active?.kind === "confirmation" && descriptorsMatch(state.active.descriptor, action.confirmation) ? initialOverlayState : state;
    case "CLOSE_ALL_OVERLAYS":
      return initialOverlayState;
  }
}

export function getActiveOverlay(state: OverlayState): ActiveOverlay | null { return state.active; }

interface OverlayContextValue {
  state: OverlayState;
  requestReplacePdf: (payload: ReplacePdfPayload) => void;
  closeDialog: (dialog?: OverlayDialog) => void;
  requestRecalibration: (payload: RecalibrationPayload) => void;
  requestSaveCalibrationReferenceEdit: (payload: CalibrationReferenceEditConfirmationPayload) => void;
  requestDeleteMeasurement: (payload: DeleteMeasurementPayload) => void;
  closeConfirmation: (confirmation?: OverlayConfirmation) => void;
  closeAllOverlays: () => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(overlayReducer, initialOverlayState);
  const requestReplacePdf = useCallback(
    (payload: ReplacePdfPayload) => dispatch({ type: "REQUEST_REPLACE_PDF", payload }),
    [],
  );
  const closeDialog = useCallback(
    (dialog?: OverlayDialog) => dispatch({ type: "CLOSE_DIALOG", dialog }),
    [],
  );
  const requestRecalibration = useCallback(
    (payload: RecalibrationPayload) => dispatch({ type: "REQUEST_RECALIBRATION", payload }),
    [],
  );
  const requestSaveCalibrationReferenceEdit = useCallback(
    (payload: CalibrationReferenceEditConfirmationPayload) =>
      dispatch({ type: "REQUEST_SAVE_CALIBRATION_REFERENCE_EDIT", payload }),
    [],
  );
  const requestDeleteMeasurement = useCallback(
    (payload: DeleteMeasurementPayload) =>
      dispatch({ type: "REQUEST_DELETE_MEASUREMENT", payload }),
    [],
  );
  const closeConfirmation = useCallback(
    (confirmation?: OverlayConfirmation) =>
      dispatch({ type: "CLOSE_CONFIRMATION", confirmation }),
    [],
  );
  const closeAllOverlays = useCallback(
    () => dispatch({ type: "CLOSE_ALL_OVERLAYS" }),
    [],
  );
  const value = useMemo<OverlayContextValue>(() => ({
    state,
    requestReplacePdf,
    closeDialog,
    requestRecalibration,
    requestSaveCalibrationReferenceEdit,
    requestDeleteMeasurement,
    closeConfirmation,
    closeAllOverlays,
  }), [
    closeAllOverlays,
    closeConfirmation,
    closeDialog,
    requestDeleteMeasurement,
    requestRecalibration,
    requestReplacePdf,
    requestSaveCalibrationReferenceEdit,
    state,
  ]);
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlayState(): OverlayContextValue {
  const context = useContext(OverlayContext);
  if (!context) throw new Error("useOverlayState must be used inside OverlayProvider.");
  return context;
}
