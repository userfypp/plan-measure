import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { CalibrationFlow, CalibrationSelection } from "./calibrationFlow";
import {
  updateCalibrationReferenceEdit as updateCalibrationReferenceEditDraft,
  type CalibrationReferenceEdit,
} from "./calibrationReferenceEdit";
import type { DrawingDraft, Point, Tool } from "../types/domain";

/**
 * Interaction state for the current workspace. This state is intentionally not
 * part of the persisted SessionV6 document.
 */
export interface WorkspaceState {
  activeTool: Tool;
  selectedMeasurementId: string | null;
  draft: DrawingDraft | null;
  orthogonal: boolean;
  calibrationFlow: CalibrationFlow | null;
  calibrationCandidate: CalibrationSelection | null;
  calibrationReferenceEdit: CalibrationReferenceEdit | null;
  secondaryPanel: "measurements" | "classifications";
  workspaceVersion: number;
}

export type WorkspaceAction =
  | { type: "RESET_WORKSPACE" }
  | { type: "PAGE_CHANGED" }
  | { type: "CHOOSE_TOOL"; tool: Tool }
  | { type: "SELECT_MEASUREMENT"; id: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "START_DRAFT"; draft: DrawingDraft }
  | { type: "UPDATE_DRAFT"; draft: DrawingDraft }
  | { type: "UPDATE_DRAFT_POINTER"; draftType: DrawingDraft["type"]; pointer: Point }
  | { type: "CLEAR_DRAFT" }
  | { type: "COMPLETE_DRAFT" }
  | { type: "SET_ORTHOGONAL"; value: boolean }
  | { type: "TOGGLE_ORTHOGONAL" }
  | { type: "START_CALIBRATION"; flow: CalibrationFlow }
  | { type: "UPDATE_CALIBRATION_CANDIDATE"; candidate: CalibrationSelection }
  | { type: "ADVANCE_CALIBRATION_STEP"; flow: CalibrationFlow }
  | { type: "CANCEL_CALIBRATION" }
  | { type: "COMPLETE_CALIBRATION" }
  | { type: "START_REFERENCE_EDIT"; edit: CalibrationReferenceEdit }
  | { type: "UPDATE_REFERENCE_EDIT"; points: [Point, Point] }
  | { type: "CANCEL_REFERENCE_EDIT" }
  | { type: "CONFIRM_REFERENCE_EDIT" }
  | { type: "SET_SECONDARY_PANEL"; panel: WorkspaceState["secondaryPanel"] };

export const initialWorkspaceState: WorkspaceState = {
  activeTool: "select",
  selectedMeasurementId: null,
  draft: null,
  orthogonal: false,
  calibrationFlow: null,
  calibrationCandidate: null,
  calibrationReferenceEdit: null,
  secondaryPanel: "measurements",
  workspaceVersion: 0,
};

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "RESET_WORKSPACE":
      return { ...initialWorkspaceState, workspaceVersion: state.workspaceVersion + 1 };
    case "PAGE_CHANGED":
      return {
        ...state,
        activeTool: "select",
        selectedMeasurementId: null,
        draft: null,
        calibrationFlow: null,
        calibrationCandidate: null,
        calibrationReferenceEdit: null,
      };
    case "CHOOSE_TOOL":
      if (state.activeTool === action.tool) {
        const draftMatchesTool =
          state.draft === null ||
          (state.draft.type === "calibrate" && action.tool === "calibrate") ||
          (state.draft.type === "path" && state.draft.measurementType === action.tool);
        if (draftMatchesTool) return state;
      }
      return { ...state, activeTool: action.tool, draft: null };
    case "SELECT_MEASUREMENT":
      return state.selectedMeasurementId === action.id
        ? state
        : { ...state, selectedMeasurementId: action.id };
    case "CLEAR_SELECTION":
      return state.selectedMeasurementId === null
        ? state
        : { ...state, selectedMeasurementId: null };
    case "START_DRAFT":
      return { ...state, draft: action.draft };
    case "UPDATE_DRAFT":
      return { ...state, draft: action.draft };
    case "UPDATE_DRAFT_POINTER":
      if (!state.draft || state.draft.type !== action.draftType) return state;
      return { ...state, draft: { ...state.draft, pointer: action.pointer } };
    case "CLEAR_DRAFT":
    case "COMPLETE_DRAFT":
      return state.draft === null ? state : { ...state, draft: null };
    case "SET_ORTHOGONAL":
      return state.orthogonal === action.value ? state : { ...state, orthogonal: action.value };
    case "TOGGLE_ORTHOGONAL":
      return { ...state, orthogonal: !state.orthogonal };
    case "START_CALIBRATION":
      return { ...state, calibrationFlow: action.flow, calibrationCandidate: null };
    case "UPDATE_CALIBRATION_CANDIDATE":
      return { ...state, calibrationCandidate: action.candidate };
    case "ADVANCE_CALIBRATION_STEP":
      return {
        ...state,
        calibrationFlow: action.flow,
        calibrationCandidate: null,
      };
    case "CANCEL_CALIBRATION":
    case "COMPLETE_CALIBRATION":
      if (
        state.calibrationFlow === null &&
        state.calibrationCandidate === null &&
        state.draft?.type !== "calibrate"
      ) {
        return state;
      }
      return {
        ...state,
        draft: state.draft?.type === "calibrate" ? null : state.draft,
        calibrationFlow: null,
        calibrationCandidate: null,
      };
    case "START_REFERENCE_EDIT":
      return { ...state, calibrationReferenceEdit: action.edit };
    case "UPDATE_REFERENCE_EDIT":
      return state.calibrationReferenceEdit === null
        ? state
        : {
            ...state,
            calibrationReferenceEdit: updateCalibrationReferenceEditDraft(
              state.calibrationReferenceEdit,
              action.points,
            ),
          };
    case "CANCEL_REFERENCE_EDIT":
    case "CONFIRM_REFERENCE_EDIT":
      return state.calibrationReferenceEdit === null
        ? state
        : { ...state, calibrationReferenceEdit: null };
    case "SET_SECONDARY_PANEL":
      return state.secondaryPanel === action.panel
        ? state
        : { ...state, secondaryPanel: action.panel };
  }
}

interface WorkspaceContextValue extends WorkspaceState {
  resetWorkspace: () => void;
  pageChanged: () => void;
  chooseTool: (tool: Tool) => void;
  selectMeasurement: (id: string) => void;
  clearSelection: () => void;
  startDraft: (draft: DrawingDraft) => void;
  updateDraft: (draft: DrawingDraft) => void;
  updateDraftPointer: (draftType: DrawingDraft["type"], pointer: Point) => void;
  clearDraft: () => void;
  completeDraft: () => void;
  setOrthogonal: (value: boolean) => void;
  toggleOrthogonal: () => void;
  startCalibration: (flow: CalibrationFlow) => void;
  updateCalibrationCandidate: (candidate: CalibrationSelection) => void;
  advanceCalibrationStep: (flow: CalibrationFlow) => void;
  cancelCalibration: () => void;
  completeCalibration: () => void;
  startReferenceEdit: (edit: CalibrationReferenceEdit) => void;
  updateReferenceEdit: (points: [Point, Point]) => void;
  cancelReferenceEdit: () => void;
  confirmReferenceEdit: () => void;
  setSecondaryPanel: (panel: WorkspaceState["secondaryPanel"]) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const value = useMemo(
    () => ({
      ...state,
      resetWorkspace: () => dispatch({ type: "RESET_WORKSPACE" }),
      pageChanged: () => dispatch({ type: "PAGE_CHANGED" }),
      chooseTool: (tool: Tool) => dispatch({ type: "CHOOSE_TOOL", tool }),
      selectMeasurement: (id: string) => dispatch({ type: "SELECT_MEASUREMENT", id }),
      clearSelection: () => dispatch({ type: "CLEAR_SELECTION" }),
      startDraft: (draft: DrawingDraft) => dispatch({ type: "START_DRAFT", draft }),
      updateDraft: (draft: DrawingDraft) => dispatch({ type: "UPDATE_DRAFT", draft }),
      updateDraftPointer: (draftType: DrawingDraft["type"], pointer: Point) =>
        dispatch({ type: "UPDATE_DRAFT_POINTER", draftType, pointer }),
      clearDraft: () => dispatch({ type: "CLEAR_DRAFT" }),
      completeDraft: () => dispatch({ type: "COMPLETE_DRAFT" }),
      setOrthogonal: (value: boolean) => dispatch({ type: "SET_ORTHOGONAL", value }),
      toggleOrthogonal: () => dispatch({ type: "TOGGLE_ORTHOGONAL" }),
      startCalibration: (flow: CalibrationFlow) => dispatch({ type: "START_CALIBRATION", flow }),
      updateCalibrationCandidate: (candidate: CalibrationSelection) =>
        dispatch({ type: "UPDATE_CALIBRATION_CANDIDATE", candidate }),
      advanceCalibrationStep: (flow: CalibrationFlow) =>
        dispatch({ type: "ADVANCE_CALIBRATION_STEP", flow }),
      cancelCalibration: () => dispatch({ type: "CANCEL_CALIBRATION" }),
      completeCalibration: () => dispatch({ type: "COMPLETE_CALIBRATION" }),
      startReferenceEdit: (edit: CalibrationReferenceEdit) =>
        dispatch({ type: "START_REFERENCE_EDIT", edit }),
      updateReferenceEdit: (points: [Point, Point]) =>
        dispatch({ type: "UPDATE_REFERENCE_EDIT", points }),
      cancelReferenceEdit: () => dispatch({ type: "CANCEL_REFERENCE_EDIT" }),
      confirmReferenceEdit: () => dispatch({ type: "CONFIRM_REFERENCE_EDIT" }),
      setSecondaryPanel: (panel: WorkspaceState["secondaryPanel"]) =>
        dispatch({ type: "SET_SECONDARY_PANEL", panel }),
    }),
    [state],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceState(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspaceState must be used inside WorkspaceProvider.");
  return context;
}
