import { describe, expect, it } from "vitest";
import { getMeasurementCalibration } from "../utils/calibration";
import { lineLengthMm } from "../utils/geometry";
import { appReducer, createEmptySession, initialAppState, type AppState } from "./state";

function loadedState(): AppState {
  return {
    ...initialAppState,
    session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 2),
  };
}

function addScale(state: AppState, id: string, name: string, referenceDistanceMm = 1000): AppState {
  return appReducer(state, {
    type: "ADD_CALIBRATION",
    pageNumber: 1,
    id,
    name,
    calibration: {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm,
    },
  });
}

describe("application reducer", () => {
  it("rejects measurement tools on a page without an active calibration", () => {
    const line = appReducer(loadedState(), { type: "SET_TOOL", tool: "line" });
    expect(line.tool).toBe("select");
    expect(line.error).toContain("valid scale");
  });

  it("rejects programmatic measurement creation without a valid active calibration", () => {
    const lineResult = appReducer(loadedState(), {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(lineResult.session?.pages[1]?.measurements).toHaveLength(0);
    expect(lineResult.tool).toBe("select");

    const polygonResult = appReducer(loadedState(), {
      type: "ADD_POLYGON",
      pageNumber: 1,
      id: "polygon-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    expect(polygonResult.session?.pages[1]?.measurements).toHaveLength(0);
    expect(polygonResult.error).toContain("valid scale");
  });

  it("creates the first calibration and makes it active", () => {
    const state = addScale(loadedState(), "scale-1", "Main plan");
    const page = state.session?.pages[1];
    expect(page?.calibrations).toEqual([
      expect.objectContaining({ id: "scale-1", name: "Main plan", referenceDistanceMm: 1000 }),
    ]);
    expect(page?.activeCalibrationId).toBe("scale-1");
    expect(page?.nextCalibrationNumber).toBe(2);
  });

  it("creates a second calibration without changing the first and makes it active", () => {
    let state = addScale(loadedState(), "scale-1", "Main plan");
    state = addScale(state, "scale-2", "Detail A", 5000);
    const page = state.session!.pages[1]!;
    expect(page.calibrations).toHaveLength(2);
    expect(page.calibrations[0]).toMatchObject({
      id: "scale-1",
      name: "Main plan",
      referenceDistanceMm: 1000,
    });
    expect(page.calibrations[1]).toMatchObject({
      id: "scale-2",
      name: "Detail A",
      referenceDistanceMm: 5000,
    });
    expect(page.activeCalibrationId).toBe("scale-2");
  });

  it("binds new measurements to the active calibration and keeps existing links on scale changes", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1");
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-a",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = addScale(state, "scale-2", "Scale 2", 5000);
    state = appReducer(state, {
      type: "SET_ACTIVE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
    });
    expect(state.session!.pages[1]!.measurements[0]!.calibrationId).toBe("scale-1");

    state = appReducer(state, {
      type: "SET_ACTIVE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-2",
    });
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-b",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(
      state.session!.pages[1]!.measurements.map((measurement) => measurement.calibrationId),
    ).toEqual(["scale-1", "scale-2"]);
  });

  it("recalibrates only measurements linked to that calibration while preserving its ID", () => {
    let state = addScale(loadedState(), "scale-1", "Main plan");
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-a",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = addScale(state, "scale-2", "Detail A", 5000);
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-b",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });

    const pageBefore = state.session!.pages[1]!;
    const measurementA = pageBefore.measurements[0]!;
    const measurementB = pageBefore.measurements[1]!;
    const beforeA = lineLengthMm(
      measurementA.points as [{ x: number; y: number }, { x: number; y: number }],
      getMeasurementCalibration(pageBefore, measurementA)!,
    );
    const beforeB = lineLengthMm(
      measurementB.points as [{ x: number; y: number }, { x: number; y: number }],
      getMeasurementCalibration(pageBefore, measurementB)!,
    );

    state = appReducer(state, {
      type: "RECALIBRATE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
      name: "Main plan revised",
      calibration: {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 2000,
      },
    });

    const pageAfter = state.session!.pages[1]!;
    const afterA = lineLengthMm(
      pageAfter.measurements[0]!.points as [{ x: number; y: number }, { x: number; y: number }],
      getMeasurementCalibration(pageAfter, pageAfter.measurements[0]!)!,
    );
    const afterB = lineLengthMm(
      pageAfter.measurements[1]!.points as [{ x: number; y: number }, { x: number; y: number }],
      getMeasurementCalibration(pageAfter, pageAfter.measurements[1]!)!,
    );
    expect(pageAfter.calibrations[0]).toMatchObject({
      id: "scale-1",
      name: "Main plan revised",
    });
    expect(pageAfter.measurements.map((measurement) => measurement.calibrationId)).toEqual([
      "scale-1",
      "scale-2",
    ]);
    expect(afterA).toBe(beforeA * 2);
    expect(afterB).toBe(beforeB);
  });

  it("creates measurements with persistent page-local counters", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1");
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = appReducer(state, { type: "DELETE_MEASUREMENT", pageNumber: 1, id: "line-1" });
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-2",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    });
    expect(state.session?.pages[1]?.measurements[0]?.name).toBe("Line 2");
  });

  it("trims scale and measurement names and retains the last valid measurement name", () => {
    let state = addScale(loadedState(), "scale-1", "  Main plan  ");
    expect(state.session?.pages[1]?.calibrations[0]?.name).toBe("Main plan");
    state = appReducer(state, {
      type: "ADD_LINE",
      pageNumber: 1,
      id: "line-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = appReducer(state, {
      type: "RENAME_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      name: "  Hallway  ",
    });
    expect(state.session?.pages[1]?.measurements[0]?.name).toBe("Hallway");
    state = appReducer(state, {
      type: "RENAME_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      name: "   ",
    });
    expect(state.session?.pages[1]?.measurements[0]?.name).toBe("Hallway");
    expect(state.error).toContain("cannot be empty");
  });

  it("cancels drafts and stale tools on page navigation and active-scale changes", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1");
    state = addScale(state, "scale-2", "Scale 2");
    state = {
      ...state,
      tool: "line",
      draft: { type: "line", points: [{ x: 1, y: 1 }], pointer: null },
    };
    const switched = appReducer(state, {
      type: "SET_ACTIVE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
    });
    expect(switched.tool).toBe("select");
    expect(switched.draft).toBeNull();

    const result = appReducer(switched, { type: "SET_PAGE", pageNumber: 2 });
    expect(result.tool).toBe("select");
    expect(result.draft).toBeNull();
  });

  it("clears transient selection and drawing state when loading a replacement session", () => {
    const state: AppState = {
      ...loadedState(),
      tool: "polygon",
      selectedMeasurementId: "stale-measurement",
      draft: { type: "polygon", points: [{ x: 1, y: 1 }], pointer: null },
    };
    const result = appReducer(state, {
      type: "LOAD_SESSION",
      session: createEmptySession({ name: "replacement.pdf", size: 200, lastModified: 2 }, 1),
    });
    expect(result.tool).toBe("select");
    expect(result.selectedMeasurementId).toBeNull();
    expect(result.draft).toBeNull();
  });

  it("ignores stale throttled pointer updates after a draft is cancelled", () => {
    const state = appReducer(loadedState(), {
      type: "UPDATE_DRAFT_POINTER",
      draftType: "polygon",
      pointer: { x: 20, y: 20 },
    });
    expect(state.draft).toBeNull();
  });

  it("rejects invalid calibration data and duplicate calibration IDs in domain state", () => {
    const identicalPoints = appReducer(loadedState(), {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Scale 1",
      calibration: {
        start: { x: 10, y: 10 },
        end: { x: 10, y: 10 },
        referenceDistanceMm: 1000,
      },
    });
    expect(identicalPoints.session?.pages[1]?.calibrations).toHaveLength(0);
    expect(identicalPoints.error).toContain("distinct points");

    const infiniteDistance = appReducer(loadedState(), {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Scale 1",
      calibration: {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: Number.POSITIVE_INFINITY,
      },
    });
    expect(infiniteDistance.session?.pages[1]?.calibrations).toHaveLength(0);
    expect(infiniteDistance.error).toContain("valid distance");

    let state = addScale(loadedState(), "scale-1", "Scale 1");
    state = appReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Another scale",
      calibration: {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
    expect(state.session?.pages[1]?.calibrations).toHaveLength(1);
    expect(state.error).toContain("unique ID");
  });
});
