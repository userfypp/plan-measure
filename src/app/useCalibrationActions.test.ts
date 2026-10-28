import { describe, expect, it, vi } from "vitest";
import type { CurrentSession, PageCalibration } from "../types/domain";
import { createEmptySession } from "./sessionState";
import { useCalibrationActions } from "./useCalibrationActions";

type Context = Parameters<typeof useCalibrationActions>[0];
// Despite its name it is a set of plain functions, not a React hook, so tests can call it directly.
const createActions = useCalibrationActions;

const scale = (id: string, name = id): PageCalibration => ({
  id,
  name,
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },
  referenceDistanceMm: 1000,
});

/** Page 1 has scales "s1" (used by one line) and "s2" (unused); page 2 has none. */
function sessionWithScales(): CurrentSession {
  const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
  const page = session.pages[1]!;
  page.calibrations = [scale("s1", "Floor"), scale("s2", "Roof")];
  page.activeCalibrationId = "s1";
  page.measurements = [
    {
      id: "line",
      name: "Wall",
      type: "line",
      calibrationId: "s1",
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
      visible: true,
      classificationValueIds: [],
    },
    {
      id: "count",
      name: "Sockets",
      type: "count",
      calibrationId: null,
      points: [{ x: 1, y: 1 }],
      visible: true,
      classificationValueIds: ["electrical"],
    },
  ];
  session.classificationCatalog.dimensions = [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "plumbing", name: "Plumbing", archived: false },
      ],
    },
  ];
  return session;
}

function setup(overrides: Partial<Record<keyof Context, unknown>> = {}) {
  const session = sessionWithScales();
  const calls = {
    clear: vi.fn(),
    setError: vi.fn(),
    clearError: vi.fn(),
    clearDraft: vi.fn(),
    chooseWorkspaceTool: vi.fn(),
    cancelWorkspaceCalibration: vi.fn(),
    focusViewer: vi.fn(),
    startCalibration: vi.fn(),
    addCalibration: vi.fn(),
    openSetScaleRatioConfirmation: vi.fn(),
    recalibrateCalibration: vi.fn(),
    openRecalibrationConfirmation: vi.fn(),
    removeClassificationValue: vi.fn(),
    assignClassificationValue: vi.fn(),
    startReferenceEdit: vi.fn(),
    closeConfirmation: vi.fn(),
    clearSelection: vi.fn(),
    updateReferenceEdit: vi.fn(),
    cancelReferenceEdit: vi.fn(),
    updateCalibration: vi.fn(),
    confirmReferenceEdit: vi.fn(),
    openCalibrationReferenceEditConfirmation: vi.fn(),
    setConfirmDimensionDeletion: vi.fn(),
    deleteClassificationDimension: vi.fn(),
    setConfirmValueDeletion: vi.fn(),
    deleteClassificationValue: vi.fn(),
    setConfirmMeasurementDeletion: vi.fn(),
    editMeasurements: vi.fn(() => true),
    performMeasurementDelete: vi.fn(),
    setConfirmScaleDeletion: vi.fn(),
    openDeleteScaleConfirmation: vi.fn(),
    deleteCalibration: vi.fn(),
  };
  const context = {
    scaleCheckStore: { clear: calls.clear },
    calibrationReferenceEdit: null,
    calibrationFlow: null,
    session,
    setError: calls.setError,
    precisionAuthoringBlocked: false,
    clearDraft: calls.clearDraft,
    selectedMeasurementId: null,
    chooseWorkspaceTool: calls.chooseWorkspaceTool,
    clearError: calls.clearError,
    cancelWorkspaceCalibration: calls.cancelWorkspaceCalibration,
    focusViewer: calls.focusViewer,
    authoringCapabilityRef: { current: { available: true } },
    startCalibration: calls.startCalibration,
    currentPage: session.pages[1],
    viewerPageBounds: null,
    addCalibration: calls.addCalibration,
    openSetScaleRatioConfirmation: calls.openSetScaleRatioConfirmation,
    recalibrateCalibration: calls.recalibrateCalibration,
    openRecalibrationConfirmation: calls.openRecalibrationConfirmation,
    removeClassificationValue: calls.removeClassificationValue,
    assignClassificationValue: calls.assignClassificationValue,
    startReferenceEdit: calls.startReferenceEdit,
    closeConfirmation: calls.closeConfirmation,
    clearSelection: calls.clearSelection,
    updateReferenceEdit: calls.updateReferenceEdit,
    cancelReferenceEdit: calls.cancelReferenceEdit,
    updateCalibration: calls.updateCalibration,
    confirmReferenceEdit: calls.confirmReferenceEdit,
    openCalibrationReferenceEditConfirmation: calls.openCalibrationReferenceEditConfirmation,
    setConfirmDimensionDeletion: calls.setConfirmDimensionDeletion,
    deleteClassificationDimension: calls.deleteClassificationDimension,
    setConfirmValueDeletion: calls.setConfirmValueDeletion,
    deleteClassificationValue: calls.deleteClassificationValue,
    setConfirmMeasurementDeletion: calls.setConfirmMeasurementDeletion,
    editMeasurements: calls.editMeasurements,
    performMeasurementDelete: calls.performMeasurementDelete,
    confirmScaleDeletion: true,
    setConfirmScaleDeletion: calls.setConfirmScaleDeletion,
    openDeleteScaleConfirmation: calls.openDeleteScaleConfirmation,
    deleteCalibration: calls.deleteCalibration,
    ...overrides,
  } as unknown as Context;
  return { actions: createActions(context), calls, session };
}

const referenceEdit = {
  pageNumber: 1,
  calibrationId: "s1",
  reference: "uniform" as const,
  points: [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
  ] as [{ x: number; y: number }, { x: number; y: number }],
};

describe("choosing a tool", () => {
  it("clears the scale check for every tool except Calibrate", () => {
    const { actions, calls } = setup();
    actions.chooseTool("calibrate");
    expect(calls.clear).not.toHaveBeenCalled();
    actions.chooseTool("select");
    expect(calls.clear).toHaveBeenCalledOnce();
  });

  it("clears the draft, switches tool and clears the error", () => {
    const { actions, calls } = setup();
    actions.chooseTool("line");
    expect(calls.clearDraft).toHaveBeenCalledOnce();
    expect(calls.chooseWorkspaceTool).toHaveBeenCalledWith("line", undefined);
    expect(calls.clearError).toHaveBeenCalledOnce();
    expect(calls.setError).not.toHaveBeenCalled();
  });

  it("refuses to leave a scale reference edit or a calibration other than for Calibrate", () => {
    const editing = setup({ calibrationReferenceEdit: referenceEdit });
    editing.actions.chooseTool("line");
    expect(editing.calls.setError).toHaveBeenCalledWith(
      "Finish or cancel the scale reference edit first.",
    );
    expect(editing.calls.chooseWorkspaceTool).not.toHaveBeenCalled();

    const calibrating = setup({
      calibrationFlow: { pageNumber: 1, calibrationId: null, mode: "uniform", phase: "uniform" },
    });
    calibrating.actions.chooseTool("select");
    expect(calibrating.calls.setError).toHaveBeenCalledWith("Finish or cancel calibration first.");
    calibrating.actions.chooseTool("calibrate");
    expect(calibrating.calls.chooseWorkspaceTool).toHaveBeenCalledWith("calibrate", undefined);
  });

  it("falls back to Select with an error when a measuring tool has no scale", () => {
    const page = { ...sessionWithScales().pages[1]!, activeCalibrationId: null, calibrations: [] };
    const { actions, calls } = setup({
      currentPage: page,
      session: { ...sessionWithScales(), pages: { 1: page, 2: page }, currentPage: 1 },
    });
    for (const tool of ["line", "polyline", "polygon", "rectangle", "ellipse"] as const) {
      calls.chooseWorkspaceTool.mockClear();
      actions.chooseTool(tool);
      expect(calls.chooseWorkspaceTool).toHaveBeenCalledWith("select");
    }
    expect(calls.setError).toHaveBeenCalledWith(
      "Select a valid scale before creating measurements.",
    );
    expect(calls.clearError).not.toHaveBeenCalled();
  });

  it("lets Count and Cloud start without a scale", () => {
    const page = { ...sessionWithScales().pages[1]!, activeCalibrationId: null, calibrations: [] };
    const { actions, calls } = setup({
      currentPage: page,
      session: { ...sessionWithScales(), pages: { 1: page, 2: page }, currentPage: 1 },
    });
    actions.chooseTool("count");
    actions.chooseTool("cloud");
    expect(calls.chooseWorkspaceTool).toHaveBeenNthCalledWith(1, "count", undefined);
    expect(calls.chooseWorkspaceTool).toHaveBeenNthCalledWith(2, "cloud", undefined);
    expect(calls.setError).not.toHaveBeenCalled();
  });

  it("does nothing for a measuring tool while precision authoring is blocked", () => {
    const { actions, calls } = setup({ precisionAuthoringBlocked: true });
    actions.chooseTool("line");
    expect(calls.chooseWorkspaceTool).not.toHaveBeenCalled();
    expect(calls.clearDraft).not.toHaveBeenCalled();
    actions.chooseTool("select");
    expect(calls.chooseWorkspaceTool).toHaveBeenCalledWith("select", undefined);
  });

  it("keeps the selection only when Count is chosen with a Count selected", () => {
    const withCount = setup({ selectedMeasurementId: "count" });
    withCount.actions.chooseTool("count");
    expect(withCount.calls.chooseWorkspaceTool).toHaveBeenCalledWith("count", {
      keepSelection: true,
    });

    const withLine = setup({ selectedMeasurementId: "line" });
    withLine.actions.chooseTool("count");
    expect(withLine.calls.chooseWorkspaceTool).toHaveBeenCalledWith("count", undefined);

    const lineTool = setup({ selectedMeasurementId: "count" });
    lineTool.actions.chooseTool("line");
    expect(lineTool.calls.chooseWorkspaceTool).toHaveBeenCalledWith("line", undefined);
  });
});

describe("starting and cancelling a calibration", () => {
  it("starts a new uniform or X/Y calibration on the current page and hands focus to the plan", () => {
    const { actions, calls } = setup();
    actions.beginNewCalibration("xy");
    expect(calls.startCalibration).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: null,
      mode: "xy",
      phase: "x",
    });
    expect(calls.chooseWorkspaceTool).toHaveBeenCalledWith("calibrate", undefined);
    expect(calls.focusViewer).toHaveBeenCalledOnce();
  });

  it.each([
    ["authoring is not available", { authoringCapabilityRef: { current: { available: false } } }],
    ["authoring has not mounted", { authoringCapabilityRef: { current: null } }],
    ["a reference edit is in progress", { calibrationReferenceEdit: referenceEdit }],
    ["there is no current page", { currentPage: undefined }],
  ])("does not start a new calibration when %s", (_label, overrides) => {
    const { actions, calls } = setup(overrides);
    actions.beginNewCalibration("uniform");
    expect(calls.startCalibration).not.toHaveBeenCalled();
    expect(calls.focusViewer).not.toHaveBeenCalled();
  });

  it("cancelling clears the check and draft, returns to Select and focuses the plan", () => {
    const { actions, calls } = setup();
    actions.cancelCalibration();
    expect(calls.clear).toHaveBeenCalledOnce();
    expect(calls.cancelWorkspaceCalibration).toHaveBeenCalledOnce();
    expect(calls.clearDraft).toHaveBeenCalledOnce();
    expect(calls.chooseWorkspaceTool).toHaveBeenCalledWith("select");
    expect(calls.clearError).toHaveBeenCalledOnce();
    expect(calls.focusViewer).toHaveBeenCalledOnce();
  });
});

describe("recalibrating a scale", () => {
  it("recalibrates an unused scale straight away, keeping its mode", () => {
    const { actions, calls } = setup();
    actions.requestRecalibration("s2");
    expect(calls.startCalibration).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: "s2",
      mode: "uniform",
      phase: "uniform",
    });
    expect(calls.openRecalibrationConfirmation).not.toHaveBeenCalled();
  });

  it("asks first when measurements use the scale, and defaults to the active scale", () => {
    const { actions, calls } = setup();
    actions.requestRecalibration();
    expect(calls.openRecalibrationConfirmation).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: "s1",
      calibrationName: "Floor",
      measurementCount: 1,
    });
    expect(calls.startCalibration).not.toHaveBeenCalled();
  });

  it("reports a missing scale and ignores the request without a page or while editing", () => {
    const missing = setup();
    missing.actions.requestRecalibration("gone");
    expect(missing.calls.setError).toHaveBeenCalledWith(
      "Select a valid scale before recalibrating.",
    );

    const editing = setup({ calibrationReferenceEdit: referenceEdit });
    editing.actions.requestRecalibration("s2");
    expect(editing.calls.startCalibration).not.toHaveBeenCalled();
    expect(editing.calls.setError).not.toHaveBeenCalled();

    const noPage = setup({ currentPage: undefined });
    noPage.actions.requestRecalibration("s2");
    expect(noPage.calls.startCalibration).not.toHaveBeenCalled();
  });

  it("confirming a recalibration begins it only if the scale still exists", () => {
    const { actions, calls } = setup();
    actions.handleOverlayConfirmationConfirm({
      type: "recalibrateScale",
      payload: {
        pageNumber: 1,
        calibrationId: "s1",
        calibrationName: "Floor",
        measurementCount: 1,
      },
    });
    expect(calls.startCalibration).toHaveBeenCalledWith(
      expect.objectContaining({ calibrationId: "s1" }),
    );

    calls.startCalibration.mockClear();
    actions.handleOverlayConfirmationConfirm({
      type: "recalibrateScale",
      payload: {
        pageNumber: 1,
        calibrationId: "gone",
        calibrationName: "Old",
        measurementCount: 1,
      },
    });
    expect(calls.startCalibration).not.toHaveBeenCalled();
  });
});

describe("adding and changing scales by ratio", () => {
  const ratio = {
    mode: "uniform" as const,
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    referenceDistanceMm: 5000,
  };

  it("adds a standard preset with a default name on the current page", () => {
    const { actions, calls } = setup();
    actions.addStandardScalePreset(50);
    expect(calls.addCalibration).toHaveBeenCalledOnce();
    const command = calls.addCalibration.mock.calls[0]![0] as {
      pageNumber: number;
      name: string;
      id: string;
    };
    expect(command.pageNumber).toBe(1);
    expect(command.name).toBe("Scale 1");
    expect(command.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("adds a custom ratio scale with the given name", () => {
    const { actions, calls } = setup();
    actions.addCustomRatioScale("Detail", ratio);
    expect(calls.addCalibration).toHaveBeenCalledWith(
      expect.objectContaining({
        pageNumber: 1,
        name: "Detail",
        calibration: expect.objectContaining({ mode: "uniform" }),
      }),
    );
  });

  it.each([
    [
      "a calibration is in progress",
      {
        calibrationFlow: { pageNumber: 1, calibrationId: null, mode: "uniform", phase: "uniform" },
      },
    ],
    ["a reference edit is in progress", { calibrationReferenceEdit: referenceEdit }],
    ["there is no current page", { currentPage: undefined }],
  ])("adds nothing when %s", (_label, overrides) => {
    const { actions, calls } = setup(overrides);
    actions.addStandardScalePreset(100);
    actions.addCustomRatioScale("Detail", ratio);
    expect(calls.addCalibration).not.toHaveBeenCalled();
  });

  it("changes the ratio of an unused scale at once and asks first for a used one", () => {
    const { actions, calls } = setup();
    actions.setScaleRatio("s2", ratio);
    expect(calls.recalibrateCalibration).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: "s2",
      calibration: ratio,
    });
    actions.setScaleRatio("s1", ratio);
    expect(calls.openSetScaleRatioConfirmation).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: "s1",
      calibrationName: "Floor",
      measurementCount: 1,
      calibration: ratio,
    });
    expect(calls.recalibrateCalibration).toHaveBeenCalledOnce();
  });

  it("reports a scale that is gone or has another mode", () => {
    const { actions, calls } = setup();
    actions.setScaleRatio("gone", ratio);
    actions.setScaleRatio("s1", {
      mode: "xy",
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 },
      yReference: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, referenceDistanceMm: 1000 },
    });
    expect(calls.setError).toHaveBeenCalledTimes(2);
    expect(calls.setError).toHaveBeenCalledWith("The scale to update is no longer available.");
    expect(calls.recalibrateCalibration).not.toHaveBeenCalled();
  });

  it("confirming a ratio change checks again that the scale still matches", () => {
    const { actions, calls } = setup();
    const payload = {
      pageNumber: 1,
      calibrationId: "s1",
      calibrationName: "Floor",
      measurementCount: 1,
      calibration: ratio,
    };
    actions.handleOverlayConfirmationConfirm({ type: "setScaleRatio", payload });
    expect(calls.recalibrateCalibration).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: "s1",
      calibration: ratio,
    });

    actions.handleOverlayConfirmationConfirm({
      type: "setScaleRatio",
      payload: { ...payload, calibrationId: "gone" },
    });
    expect(calls.setError).toHaveBeenCalledWith("The scale to update is no longer available.");
    expect(calls.recalibrateCalibration).toHaveBeenCalledOnce();
  });
});

describe("deleting a scale", () => {
  const scaleToDelete = scale("s2", "Roof");

  it("asks for confirmation when that preference is on and deletes at once when it is off", () => {
    const asking = setup();
    asking.actions.requestScaleDelete(1, scaleToDelete);
    expect(asking.calls.openDeleteScaleConfirmation).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: "s2",
      calibrationName: "Roof",
    });
    expect(asking.calls.deleteCalibration).not.toHaveBeenCalled();

    const direct = setup({ confirmScaleDeletion: false });
    direct.actions.requestScaleDelete(1, scaleToDelete);
    expect(direct.calls.deleteCalibration).toHaveBeenCalledWith(
      expect.objectContaining({ pageNumber: 1, calibrationId: "s2" }),
    );
    expect(direct.calls.openDeleteScaleConfirmation).not.toHaveBeenCalled();
  });

  it("refuses while a calibration or reference edit is in progress", () => {
    for (const overrides of [
      {
        calibrationFlow: { pageNumber: 1, calibrationId: null, mode: "uniform", phase: "uniform" },
      },
      { calibrationReferenceEdit: referenceEdit },
    ]) {
      const { actions, calls } = setup(overrides);
      actions.requestScaleDelete(1, scaleToDelete);
      expect(calls.setError).toHaveBeenCalledWith(
        "Finish or cancel the current scale workflow first.",
      );
      expect(calls.deleteCalibration).not.toHaveBeenCalled();
      expect(calls.openDeleteScaleConfirmation).not.toHaveBeenCalled();
    }
  });

  it("confirming deletes the scale and turns the confirmation off only when asked", () => {
    const { actions, calls } = setup();
    const confirmation = {
      type: "deleteScale" as const,
      payload: { pageNumber: 1, calibrationId: "s2", calibrationName: "Roof" },
    };
    actions.handleOverlayConfirmationConfirm(confirmation);
    expect(calls.setConfirmScaleDeletion).not.toHaveBeenCalled();
    actions.handleOverlayConfirmationConfirm(confirmation, { dontAskAgain: true });
    expect(calls.setConfirmScaleDeletion).toHaveBeenCalledWith(false);
    expect(calls.deleteCalibration).toHaveBeenCalledTimes(2);
  });
});

describe("classification assignment from the details panel", () => {
  it("removes the current value when none is chosen and assigns a chosen one", () => {
    const { actions, calls } = setup();
    actions.assignClassification("count", "trade", null);
    expect(calls.removeClassificationValue).toHaveBeenCalledWith({
      pageNumber: 1,
      measurementId: "count",
      dimensionId: "trade",
      valueId: "electrical",
    });
    actions.assignClassification("count", "trade", "plumbing");
    expect(calls.assignClassificationValue).toHaveBeenCalledWith({
      pageNumber: 1,
      measurementId: "count",
      dimensionId: "trade",
      valueId: "plumbing",
    });
  });

  it("does nothing to clear a dimension that has no value, or for unknown ids", () => {
    const { actions, calls } = setup();
    actions.assignClassification("line", "trade", null);
    actions.assignClassification("missing", "trade", "plumbing");
    actions.assignClassification("line", "missing", "plumbing");
    expect(calls.removeClassificationValue).not.toHaveBeenCalled();
    expect(calls.assignClassificationValue).not.toHaveBeenCalled();
  });
});

describe("editing a scale reference", () => {
  it("starts an edit from the stored points, clears the selection and returns to Select", () => {
    const { actions, calls, session } = setup();
    actions.beginCalibrationReferenceEdit(session.pages[1]!.calibrations[0]!, "uniform");
    expect(calls.startReferenceEdit).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: "s1",
      reference: "uniform",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(calls.closeConfirmation).toHaveBeenCalledOnce();
    expect(calls.clearSelection).toHaveBeenCalledOnce();
    expect(calls.chooseWorkspaceTool).toHaveBeenCalledWith("select", undefined);
    expect(calls.focusViewer).toHaveBeenCalled();
  });

  it("starts nothing for a reference the scale lacks or when authoring is unavailable", () => {
    const wrongReference = setup();
    wrongReference.actions.beginCalibrationReferenceEdit(scale("s1"), "x");
    expect(wrongReference.calls.startReferenceEdit).not.toHaveBeenCalled();

    const unavailable = setup({ authoringCapabilityRef: { current: { available: false } } });
    unavailable.actions.beginCalibrationReferenceEdit(scale("s1"), "uniform");
    expect(unavailable.calls.startReferenceEdit).not.toHaveBeenCalled();
  });

  it("cancelling closes the confirmation, clears the error and focuses the plan", () => {
    const { actions, calls } = setup();
    actions.cancelCalibrationReferenceEdit();
    expect(calls.cancelReferenceEdit).toHaveBeenCalledOnce();
    expect(calls.closeConfirmation).toHaveBeenCalledOnce();
    expect(calls.clearError).toHaveBeenCalledOnce();
    expect(calls.focusViewer).toHaveBeenCalledOnce();
  });

  it("saves an edit of an unused scale at once", () => {
    const { actions, calls } = setup({
      calibrationReferenceEdit: { ...referenceEdit, calibrationId: "s2" },
    });
    actions.requestCalibrationReferenceEditSave();
    expect(calls.updateCalibration).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: "s2",
      reference: "uniform",
      points: referenceEdit.points,
    });
    expect(calls.confirmReferenceEdit).toHaveBeenCalledOnce();
    expect(calls.closeConfirmation).toHaveBeenCalledOnce();
    expect(calls.openCalibrationReferenceEditConfirmation).not.toHaveBeenCalled();
  });

  it("asks before saving an edit of a scale that measurements use", () => {
    const { actions, calls } = setup({ calibrationReferenceEdit: referenceEdit });
    actions.requestCalibrationReferenceEditSave();
    expect(calls.openCalibrationReferenceEditConfirmation).toHaveBeenCalledWith({
      pageNumber: 1,
      calibrationId: "s1",
      reference: "uniform",
      calibrationName: "Floor",
      measurementCount: 1,
    });
    expect(calls.updateCalibration).not.toHaveBeenCalled();
  });

  it.each([
    ["no edit", null],
    [
      "identical points",
      {
        ...referenceEdit,
        points: [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
      },
    ],
    ["a scale that is gone", { ...referenceEdit, calibrationId: "gone" }],
  ])("will not save %s", (_label, edit) => {
    const { actions, calls } = setup({ calibrationReferenceEdit: edit });
    actions.requestCalibrationReferenceEditSave();
    expect(calls.setError).toHaveBeenCalledWith(
      "Place the reference points in a valid position before saving.",
    );
    expect(calls.updateCalibration).not.toHaveBeenCalled();
  });

  it("confirming saves only the edit the confirmation was about", () => {
    const payload = {
      pageNumber: 1,
      calibrationId: "s1",
      reference: "uniform" as const,
      calibrationName: "Floor",
      measurementCount: 1,
    };
    const matching = setup({ calibrationReferenceEdit: referenceEdit });
    matching.actions.handleOverlayConfirmationConfirm({
      type: "saveCalibrationReferenceEdit",
      payload,
    });
    expect(matching.calls.updateCalibration).toHaveBeenCalledOnce();

    for (const edit of [
      null,
      { ...referenceEdit, calibrationId: "s2" },
      { ...referenceEdit, pageNumber: 2 },
    ]) {
      const mismatched = setup({ calibrationReferenceEdit: edit });
      mismatched.actions.handleOverlayConfirmationConfirm({
        type: "saveCalibrationReferenceEdit",
        payload,
      });
      expect(mismatched.calls.setError).toHaveBeenCalledWith(
        "The reference edit is no longer available.",
      );
      expect(mismatched.calls.updateCalibration).not.toHaveBeenCalled();
    }
  });
});

describe("confirming deletions", () => {
  it("deletes a classification dimension or value and remembers 'don't ask again'", () => {
    const { actions, calls } = setup();
    actions.handleOverlayConfirmationConfirm(
      {
        type: "deleteClassification",
        payload: { target: "dimension", dimensionId: "trade", name: "Trade" },
      },
      { dontAskAgain: true },
    );
    expect(calls.setConfirmDimensionDeletion).toHaveBeenCalledWith(false);
    expect(calls.deleteClassificationDimension).toHaveBeenCalledWith("trade");

    actions.handleOverlayConfirmationConfirm({
      type: "deleteClassification",
      payload: { target: "value", dimensionId: "trade", valueId: "plumbing", name: "Plumbing" },
    });
    expect(calls.setConfirmValueDeletion).not.toHaveBeenCalled();
    expect(calls.deleteClassificationValue).toHaveBeenCalledWith("trade", "plumbing");
  });

  it("deletes a selection in one command and clears it only if the command worked", () => {
    const { actions, calls } = setup();
    actions.handleOverlayConfirmationConfirm({
      type: "deleteMeasurement",
      payload: { measurementIds: ["line", "count"] },
    });
    expect(calls.editMeasurements).toHaveBeenCalledWith({
      measurementIds: ["line", "count"],
      operation: { type: "delete" },
    });
    expect(calls.clearSelection).toHaveBeenCalledOnce();

    calls.editMeasurements.mockReturnValueOnce(false);
    actions.handleOverlayConfirmationConfirm({
      type: "deleteMeasurement",
      payload: { measurementIds: ["line"] },
    });
    expect(calls.clearSelection).toHaveBeenCalledOnce();
  });

  it("deletes a single measurement and remembers 'don't ask again'", () => {
    const { actions, calls } = setup();
    const payload = { pageNumber: 1, measurementId: "line", measurementName: "Wall" };
    actions.handleOverlayConfirmationConfirm(
      { type: "deleteMeasurement", payload },
      { dontAskAgain: true },
    );
    expect(calls.setConfirmMeasurementDeletion).toHaveBeenCalledWith(false);
    expect(calls.performMeasurementDelete).toHaveBeenCalledWith(payload);
    expect(calls.editMeasurements).not.toHaveBeenCalled();
  });
});
