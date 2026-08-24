import { describe, expect, it } from "vitest";
import {
  beginCalibrationFlow,
  cancelCalibrationFlow,
  confirmCalibration,
  selectCalibrationReference,
} from "./calibrationFlow";
import { createEmptySession, initialSessionState, sessionReducer } from "./sessionState";

const appReducer = sessionReducer;
const initialAppState = initialSessionState;

const xPoints = [
  { x: 10, y: 20 },
  { x: 110, y: 22 },
] as const;

const yPoints = [
  { x: 40, y: 30 },
  { x: 42, y: 150 },
] as const;

function loadedState() {
  return {
    ...initialAppState,
    session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1),
  };
}

describe("calibration flow", () => {
  it("transitions a new X/Y calibration from X to Y and completes exactly once", () => {
    const started = beginCalibrationFlow(1, null, "xy");
    expect(started.phase).toBe("x");

    const xSelection = selectCalibrationReference(started, [xPoints[0], xPoints[1]]);
    expect(xSelection.phase).toBe("x");

    const afterX = confirmCalibration(started, xSelection, 1000, "Survey");
    expect(afterX.kind).toBe("select-y");
    if (afterX.kind !== "select-y") throw new Error("Expected the Y selection phase.");
    expect(afterX.flow.phase).toBe("y");
    expect(afterX.flow.calibrationId).toBeNull();
    expect(afterX.flow.name).toBe("Survey");
    expect(afterX.flow.xReference).toEqual({
      start: xPoints[0],
      end: xPoints[1],
      referenceDistanceMm: 1000,
    });

    const ySelection = selectCalibrationReference(afterX.flow, [yPoints[0], yPoints[1]]);
    expect(ySelection.phase).toBe("y");
    expect(ySelection.xReference).toEqual(afterX.flow.xReference);

    const completed = confirmCalibration(afterX.flow, ySelection, 2000, "Survey");
    expect(completed.kind).toBe("complete");
    if (completed.kind !== "complete") throw new Error("Expected a complete calibration.");
    expect(completed.calibration).toEqual({
      mode: "xy",
      xReference: {
        start: xPoints[0],
        end: xPoints[1],
        referenceDistanceMm: 1000,
      },
      yReference: {
        start: yPoints[0],
        end: yPoints[1],
        referenceDistanceMm: 2000,
      },
    });

    const state = appReducer(loadedState(), {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "xy-scale",
      name: "Survey",
      calibration: completed.calibration,
    });
    const page = state.session!.pages[1]!;
    expect(page.calibrations).toHaveLength(1);
    expect(page.calibrations[0]).toMatchObject({ id: "xy-scale", name: "Survey", mode: "xy" });
    expect(page.activeCalibrationId).toBe("xy-scale");
  });

  it("does not create a partial PageCalibration after confirming only X", () => {
    const started = beginCalibrationFlow(1, null, "xy");
    const xSelection = selectCalibrationReference(started, [xPoints[0], xPoints[1]]);
    const afterX = confirmCalibration(started, xSelection, 1000, "Survey");

    expect(afterX.kind).toBe("select-y");
    expect(loadedState().session!.pages[1]!.calibrations).toHaveLength(0);
  });

  it("cancels and clears every transient phase", () => {
    const selectX = beginCalibrationFlow(1, null, "xy");
    const xSelection = selectCalibrationReference(selectX, [xPoints[0], xPoints[1]]);
    const afterX = confirmCalibration(selectX, xSelection, 1000, "Survey");
    if (afterX.kind !== "select-y") throw new Error("Expected the Y selection phase.");
    const ySelection = selectCalibrationReference(afterX.flow, [yPoints[0], yPoints[1]]);

    expect(cancelCalibrationFlow({ flow: selectX, candidate: null })).toEqual({
      flow: null,
      candidate: null,
    });
    expect(cancelCalibrationFlow({ flow: selectX, candidate: xSelection })).toEqual({
      flow: null,
      candidate: null,
    });
    expect(cancelCalibrationFlow({ flow: afterX.flow, candidate: null })).toEqual({
      flow: null,
      candidate: null,
    });
    expect(cancelCalibrationFlow({ flow: afterX.flow, candidate: ySelection })).toEqual({
      flow: null,
      candidate: null,
    });
    expect(
      cancelCalibrationFlow({ flow: beginCalibrationFlow(1, null, "uniform"), candidate: null }),
    ).toEqual({ flow: null, candidate: null });
  });

  it("keeps Uniform as a one-reference flow", () => {
    const started = beginCalibrationFlow(1, null, "uniform");
    expect(started.phase).toBe("uniform");
    const selection = selectCalibrationReference(started, [xPoints[0], xPoints[1]]);
    const completed = confirmCalibration(started, selection, 1000, "Uniform scale");

    expect(completed.kind).toBe("complete");
    if (completed.kind !== "complete") throw new Error("Expected a complete calibration.");
    expect(completed.calibration).toMatchObject({ mode: "uniform", referenceDistanceMm: 1000 });
  });

  it("recalibrates an X/Y calibration in place after the X→Y transition", () => {
    const state = appReducer(loadedState(), {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "existing-xy",
      name: "Existing XY",
      calibration: {
        mode: "xy",
        xReference: { start: xPoints[0], end: xPoints[1], referenceDistanceMm: 1000 },
        yReference: { start: yPoints[0], end: yPoints[1], referenceDistanceMm: 2000 },
      },
    });
    const started = beginCalibrationFlow(1, "existing-xy", "xy");
    const afterX = confirmCalibration(
      started,
      selectCalibrationReference(started, [xPoints[0], xPoints[1]]),
      1500,
      "Existing XY revised",
    );
    expect(afterX.kind).toBe("select-y");
    if (afterX.kind !== "select-y") throw new Error("Expected the Y selection phase.");

    const completed = confirmCalibration(
      afterX.flow,
      selectCalibrationReference(afterX.flow, [yPoints[0], yPoints[1]]),
      2500,
      "Existing XY revised",
    );
    expect(completed.kind).toBe("complete");
    if (completed.kind !== "complete") throw new Error("Expected a complete calibration.");

    const recalibrated = appReducer(state, {
      type: "RECALIBRATE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "existing-xy",
      name: "Existing XY revised",
      calibration: completed.calibration,
    });
    const page = recalibrated.session!.pages[1]!;
    expect(page.calibrations).toHaveLength(1);
    expect(page.calibrations[0]).toMatchObject({
      id: "existing-xy",
      name: "Existing XY revised",
      mode: "xy",
    });
  });
});
