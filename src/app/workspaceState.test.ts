import { describe, expect, it } from "vitest";
import { createEmptySession, initialSessionState, sessionReducer } from "./sessionState";
import { beginCalibrationFlow, selectCalibrationReference } from "./calibrationFlow";
import { beginCalibrationReferenceEdit } from "./calibrationReferenceEdit";
import { initialWorkspaceState, workspaceReducer } from "./workspaceState";

const appReducer = sessionReducer;
const initialAppState = initialSessionState;

const uniformCalibration = {
  id: "uniform",
  name: "Uniform scale",
  mode: "uniform" as const,
  start: { x: 10, y: 20 },
  end: { x: 110, y: 20 },
  referenceDistanceMm: 1000,
};

describe("workspace selection state", () => {
  it("starts with Select as the active tool", () => {
    expect(initialWorkspaceState.activeTool).toBe("select");
  });

  it("changes the active tool through the workspace intent action", () => {
    const state = workspaceReducer(initialWorkspaceState, {
      type: "CHOOSE_TOOL",
      tool: "polygon",
    });

    expect(state.activeTool).toBe("polygon");
  });

  it("preserves an in-progress draft when the active tool is chosen again", () => {
    const drawing = {
      ...initialWorkspaceState,
      activeTool: "polygon" as const,
      draft: {
        type: "path" as const,
        measurementType: "polygon" as const,
        points: [{ x: 10, y: 10 }],
        pointer: { x: 20, y: 20 },
      },
    };

    expect(workspaceReducer(drawing, { type: "CHOOSE_TOOL", tool: "polygon" })).toBe(drawing);
  });

  it("keeps the active tool while selection changes", () => {
    const drawing = workspaceReducer(initialWorkspaceState, {
      type: "CHOOSE_TOOL",
      tool: "line",
    });
    const selected = workspaceReducer(drawing, {
      type: "SELECT_MEASUREMENT",
      id: "line-1",
    });
    const cleared = workspaceReducer(selected, { type: "CLEAR_SELECTION" });

    expect(cleared.activeTool).toBe("line");
    expect(cleared.selectedMeasurementId).toBeNull();
  });

  it("starts with no selected measurement", () => {
    expect(initialWorkspaceState.selectedMeasurementId).toBeNull();
  });

  it("starts with no draft", () => {
    expect(initialWorkspaceState.draft).toBeNull();
  });

  it("resets all interaction state when a session is installed", () => {
    const dirty = workspaceReducer(
      workspaceReducer(initialWorkspaceState, { type: "CHOOSE_TOOL", tool: "polygon" }),
      { type: "SELECT_MEASUREMENT", id: "stale-measurement" },
    );

    expect(workspaceReducer(dirty, { type: "RESET_WORKSPACE" })).toEqual({
      ...initialWorkspaceState,
      workspaceVersion: dirty.workspaceVersion + 1,
    });
  });

  it("clears page-scoped transient state while preserving Ortho on page change", () => {
    const flow = beginCalibrationFlow(1, null, "uniform");
    const edit = beginCalibrationReferenceEdit(1, uniformCalibration, "uniform");
    if (!edit) throw new Error("Expected a reference edit draft.");
    const dirty: typeof initialWorkspaceState = {
      ...initialWorkspaceState,
      activeTool: "polygon",
      selectedMeasurementId: "stale-measurement",
      draft: {
        type: "path",
        measurementType: "polygon",
        points: [{ x: 10, y: 10 }],
        pointer: { x: 20, y: 20 },
      },
      orthogonal: true,
      calibrationFlow: flow,
      calibrationCandidate: selectCalibrationReference(flow, [
        { x: 10, y: 20 },
        { x: 110, y: 20 },
      ]),
      calibrationReferenceEdit: edit,
    };

    expect(workspaceReducer(dirty, { type: "PAGE_CHANGED" })).toEqual({
      ...initialWorkspaceState,
      orthogonal: true,
    });
  });

  it("starts with Ortho disabled", () => {
    expect(initialWorkspaceState.orthogonal).toBe(false);
  });

  it("starts without temporary calibration state", () => {
    expect(initialWorkspaceState.calibrationFlow).toBeNull();
    expect(initialWorkspaceState.calibrationCandidate).toBeNull();
    expect(initialWorkspaceState.calibrationReferenceEdit).toBeNull();
    expect(initialWorkspaceState).not.toHaveProperty("archivedCalibrationIds");
  });

  it("keeps transient workspace state out of sessions and AppState", () => {
    const session = createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1);

    expect(session).not.toHaveProperty("selectedMeasurementId");
    expect(session).not.toHaveProperty("activeTool");
    expect(session).not.toHaveProperty("draft");
    expect(session).not.toHaveProperty("orthogonal");
    expect(initialAppState).not.toHaveProperty("activeTool");
    expect(initialAppState).not.toHaveProperty("draft");
    expect(initialAppState).not.toHaveProperty("orthogonal");
    expect(initialAppState).not.toHaveProperty("calibrationFlow");
    expect(initialAppState).not.toHaveProperty("calibrationCandidate");
    expect(initialAppState).not.toHaveProperty("calibrationReferenceEdit");
  });

  it("keeps catalog state out of WorkspaceState while SessionV5 owns it", () => {
    const session = createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1);

    expect(initialWorkspaceState).not.toHaveProperty("calibrations");
    expect(initialWorkspaceState).not.toHaveProperty("archivedCalibrationIds");
    expect(session).not.toHaveProperty("archivedCalibrationIds");
  });

  it("starts a calibration flow and stores its unconfirmed candidate", () => {
    const flow = beginCalibrationFlow(2, null, "xy");
    const started = workspaceReducer(initialWorkspaceState, {
      type: "START_CALIBRATION",
      flow,
    });
    const candidate = selectCalibrationReference(flow, [
      { x: 10, y: 20 },
      { x: 110, y: 22 },
    ]);
    const selected = workspaceReducer(started, {
      type: "UPDATE_CALIBRATION_CANDIDATE",
      candidate,
    });

    expect(selected.calibrationFlow).toEqual(flow);
    expect(selected.calibrationCandidate).toEqual(candidate);
  });

  it("advances an X/Y calibration phase without creating persistent state", () => {
    const started = workspaceReducer(initialWorkspaceState, {
      type: "START_CALIBRATION",
      flow: beginCalibrationFlow(1, null, "xy"),
    });
    const candidate = selectCalibrationReference(started.calibrationFlow!, [
      { x: 10, y: 20 },
      { x: 110, y: 22 },
    ]);
    const withCandidate = workspaceReducer(started, {
      type: "UPDATE_CALIBRATION_CANDIDATE",
      candidate,
    });
    const advanced = workspaceReducer(withCandidate, {
      type: "ADVANCE_CALIBRATION_STEP",
      flow: {
        ...started.calibrationFlow!,
        phase: "y",
        name: "Survey",
        xReference: {
          start: candidate.points[0],
          end: candidate.points[1],
          referenceDistanceMm: 1000,
        },
      },
    });

    expect(advanced.calibrationFlow?.phase).toBe("y");
    expect(advanced.calibrationFlow?.xReference?.referenceDistanceMm).toBe(1000);
    expect(advanced.calibrationCandidate).toBeNull();
  });

  it("cancels calibration and clears the temporary candidate and phase", () => {
    const flow = beginCalibrationFlow(1, null, "uniform");
    const started = workspaceReducer(initialWorkspaceState, {
      type: "START_CALIBRATION",
      flow,
    });
    const withCandidate = workspaceReducer(started, {
      type: "UPDATE_CALIBRATION_CANDIDATE",
      candidate: selectCalibrationReference(flow, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    });
    const withDraft = workspaceReducer(withCandidate, {
      type: "START_DRAFT",
      draft: { type: "calibrate", points: [{ x: 1, y: 1 }], pointer: { x: 2, y: 2 } },
    });
    const cancelled = workspaceReducer(withDraft, { type: "CANCEL_CALIBRATION" });

    expect(cancelled.calibrationFlow).toBeNull();
    expect(cancelled.calibrationCandidate).toBeNull();
    expect(cancelled.draft).toBeNull();
  });

  it("keeps reference edits reversible until explicit confirmation", () => {
    const edit = beginCalibrationReferenceEdit(1, uniformCalibration, "uniform");
    if (!edit) throw new Error("Expected a reference edit draft.");
    const started = workspaceReducer(initialWorkspaceState, {
      type: "START_REFERENCE_EDIT",
      edit,
    });
    const updated = workspaceReducer(started, {
      type: "UPDATE_REFERENCE_EDIT",
      points: [
        { x: 20, y: 20 },
        { x: 110, y: 20 },
      ],
    });

    expect(updated.calibrationReferenceEdit?.points).toEqual([
      { x: 20, y: 20 },
      { x: 110, y: 20 },
    ]);
    expect(updated.calibrationReferenceEdit?.originalPoints).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
    ]);
    expect(workspaceReducer(updated, { type: "CANCEL_REFERENCE_EDIT" }).calibrationReferenceEdit).toBeNull();

    const confirmed = workspaceReducer(started, { type: "CONFIRM_REFERENCE_EDIT" });
    expect(confirmed.calibrationReferenceEdit).toBeNull();
  });

  it("selects a measurement", () => {
    const state = workspaceReducer(initialWorkspaceState, {
      type: "SELECT_MEASUREMENT",
      id: "line-1",
    });

    expect(state.selectedMeasurementId).toBe("line-1");
  });

  it("keeps the classifications panel open when a canvas measurement is selected", () => {
    const catalogOpen = {
      ...initialWorkspaceState,
      secondaryPanel: "classifications" as const,
    };
    const selected = workspaceReducer(catalogOpen, {
      type: "SELECT_MEASUREMENT",
      id: "line-1",
    });

    expect(selected.secondaryPanel).toBe("classifications");
    expect(selected.selectedMeasurementId).toBe("line-1");
  });

  it("toggles Ortho atomically", () => {
    const enabled = workspaceReducer(initialWorkspaceState, { type: "TOGGLE_ORTHOGONAL" });
    expect(enabled.orthogonal).toBe(true);
    expect(workspaceReducer(enabled, { type: "TOGGLE_ORTHOGONAL" }).orthogonal).toBe(false);
  });

  it("clears the selection when its measurement is deleted", () => {
    const selected = workspaceReducer(initialWorkspaceState, {
      type: "SELECT_MEASUREMENT",
      id: "line-1",
    });
    const cleared = workspaceReducer(selected, { type: "CLEAR_SELECTION" });

    expect(cleared.selectedMeasurementId).toBeNull();
  });

  it("clears the selection on page change", () => {
    const selected = workspaceReducer(initialWorkspaceState, {
      type: "SELECT_MEASUREMENT",
      id: "stale-measurement",
    });
    const pageWorkspace = workspaceReducer(selected, { type: "CLEAR_SELECTION" });

    expect(pageWorkspace.selectedMeasurementId).toBeNull();
  });

  it("does not restore selection when a workspace is replaced", () => {
    const selected = workspaceReducer(initialWorkspaceState, {
      type: "SELECT_MEASUREMENT",
      id: "stale-measurement",
    });
    const replacementWorkspace = workspaceReducer(selected, { type: "CLEAR_SELECTION" });

    expect(replacementWorkspace.selectedMeasurementId).toBeNull();
  });

  it("keeps selection in WorkspaceState while SessionState clears its visible error", () => {
    const appWithError = appReducer(
      {
        ...initialAppState,
        session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1),
      },
      { type: "SET_ERROR", message: "A visible error" },
    );
    const selectedWorkspace = workspaceReducer(initialWorkspaceState, {
      type: "SELECT_MEASUREMENT",
      id: "line-1",
    });
    const appAfterSelection = appReducer(appWithError, { type: "SET_ERROR", message: null });

    expect(selectedWorkspace.selectedMeasurementId).toBe("line-1");
    expect(appAfterSelection.error).toBeNull();
    expect(appAfterSelection).not.toHaveProperty("selectedMeasurementId");
  });

  it("activates and deactivates Ortho through the workspace action", () => {
    const enabled = workspaceReducer(initialWorkspaceState, {
      type: "SET_ORTHOGONAL",
      value: true,
    });
    const disabled = workspaceReducer(enabled, {
      type: "SET_ORTHOGONAL",
      value: false,
    });

    expect(enabled.orthogonal).toBe(true);
    expect(disabled.orthogonal).toBe(false);
  });

  it("keeps Ortho in the current workspace without adding it to session state", () => {
    const session = createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1);
    const enabled = workspaceReducer(initialWorkspaceState, {
      type: "SET_ORTHOGONAL",
      value: true,
    });
    const drawing = workspaceReducer(enabled, { type: "CHOOSE_TOOL", tool: "polyline" });

    expect(drawing.orthogonal).toBe(true);
    expect(session).not.toHaveProperty("orthogonal");
  });
});

describe("workspace draft state", () => {
  const lineDraft = {
    type: "path" as const,
    measurementType: "line" as const,
    points: [{ x: 10, y: 20 }],
    pointer: { x: 12, y: 22 },
  };

  it("starts a draft", () => {
    const state = workspaceReducer(initialWorkspaceState, {
      type: "START_DRAFT",
      draft: lineDraft,
    });

    expect(state.draft).toEqual(lineDraft);
  });

  it("updates a draft and its pointer", () => {
    const started = workspaceReducer(initialWorkspaceState, {
      type: "START_DRAFT",
      draft: lineDraft,
    });
    const updated = workspaceReducer(started, {
      type: "UPDATE_DRAFT",
      draft: { ...lineDraft, points: [...lineDraft.points, { x: 30, y: 40 }] },
    });
    const pointerUpdated = workspaceReducer(updated, {
      type: "UPDATE_DRAFT_POINTER",
      draftType: "path",
      pointer: { x: 35, y: 45 },
    });

    expect(pointerUpdated.draft).toEqual({
      ...lineDraft,
      points: [...lineDraft.points, { x: 30, y: 40 }],
      pointer: { x: 35, y: 45 },
    });
  });

  it("ignores a stale pointer update after the draft type changed", () => {
    const state = workspaceReducer(initialWorkspaceState, {
      type: "START_DRAFT",
      draft: { type: "calibrate", points: [{ x: 0, y: 0 }], pointer: null },
    });
    const result = workspaceReducer(state, {
      type: "UPDATE_DRAFT_POINTER",
      draftType: "path",
      pointer: { x: 20, y: 20 },
    });

    expect(result).toBe(state);
  });

  it("clears and completes a draft", () => {
    const started = workspaceReducer(initialWorkspaceState, {
      type: "START_DRAFT",
      draft: lineDraft,
    });
    const cleared = workspaceReducer(started, { type: "CLEAR_DRAFT" });
    const restarted = workspaceReducer(cleared, {
      type: "START_DRAFT",
      draft: lineDraft,
    });
    const completed = workspaceReducer(restarted, { type: "COMPLETE_DRAFT" });

    expect(cleared.draft).toBeNull();
    expect(completed.draft).toBeNull();
  });

  it("clears a draft when the tool changes", () => {
    const drawing = workspaceReducer(initialWorkspaceState, {
      type: "START_DRAFT",
      draft: lineDraft,
    });
    const selected = workspaceReducer(drawing, { type: "CHOOSE_TOOL", tool: "select" });

    expect(selected.activeTool).toBe("select");
    expect(selected.draft).toBeNull();
  });
});
