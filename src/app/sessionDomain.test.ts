import { describe, expect, it } from "vitest";
import { getMeasurementCalibration } from "../utils/calibration";
import { lineLengthMm } from "../utils/geometry";
import { getDrawingKeyboardAction } from "../utils/keyboard";
import {
  createEmptySession,
  initialSessionState,
  sessionReducer,
  type SessionCommandResult,
} from "./sessionState";

type SessionDomainState = SessionCommandResult;

function loadedState(): SessionDomainState {
  return {
    ...initialSessionState,
    session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 2),
  };
}

function addScale(
  state: SessionDomainState,
  id: string,
  name: string,
  referenceDistanceMm = 1000,
): SessionDomainState {
  return sessionReducer(state, {
    type: "ADD_CALIBRATION",
    pageNumber: 1,
    id,
    name,
    calibration: {
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm,
    },
  });
}

function addXyScale(
  state: SessionDomainState,
  id: string,
  name: string,
  xMm = 100,
  yMm = 200,
): SessionDomainState {
  return sessionReducer(state, {
    type: "ADD_CALIBRATION",
    pageNumber: 1,
    id,
    name,
    calibration: {
      mode: "xy",
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 1 }, referenceDistanceMm: xMm },
      yReference: { start: { x: 0, y: 0 }, end: { x: 1, y: 10 }, referenceDistanceMm: yMm },
    },
  });
}

describe("session domain reducer", () => {
  it("rejects programmatic measurement creation without a valid active calibration", () => {
    const lineResult = sessionReducer(loadedState(), {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(lineResult.session?.pages[1]?.measurements).toHaveLength(0);

    const polygonResult = sessionReducer(loadedState(), {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "polygon-1",
      measurementType: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    expect(polygonResult.session?.pages[1]?.measurements).toHaveLength(0);
    expect(polygonResult.error).toContain("valid scale");
  });

  it("creates consecutive Line measurements", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1");

    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-2",
      measurementType: "line",
      points: [
        { x: 20, y: 20 },
        { x: 30, y: 20 },
      ],
    });
    const page = state.session!.pages[1]!;
    expect(page.measurements.map((measurement) => measurement.name)).toEqual(["Line 1", "Line 2"]);
    expect(page.nextMeasurementNumber.line).toBe(3);
  });

  it("creates consecutive Polygon measurements", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1");

    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "polygon-1",
      measurementType: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "polygon-2",
      measurementType: "polygon",
      points: [
        { x: 20, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 30 },
      ],
    });
    const page = state.session!.pages[1]!;
    expect(page.measurements.map((measurement) => measurement.name)).toEqual([
      "Polygon 1",
      "Polygon 2",
    ]);
    expect(page.nextMeasurementNumber.polygon).toBe(3);
  });

  it("rejects completion of a self-intersecting Polygon", () => {
    const state = sessionReducer(addScale(loadedState(), "scale-1", "Scale 1"), {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "bow-tie",
      measurementType: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
        { x: 4, y: 0 },
      ],
    });

    expect(state.session!.pages[1]!.measurements).toEqual([]);
    expect(state.error).toContain("invalid set of vertices");
  });

  it("accepts Polygon completion with a diagonal closing edge", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1");
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "orthogonal-polygon",
      measurementType: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 4, y: 10 },
        { x: 4, y: 3 },
      ],
    });

    expect(state.session!.pages[1]!.measurements).toContainEqual(
      expect.objectContaining({ id: "orthogonal-polygon", type: "polygon" }),
    );
    expect(state.session!.pages[1]!.measurements[0]!.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 4, y: 10 },
      { x: 4, y: 3 },
    ]);
  });

  it("completes a Polyline with Enter and creates it with an independent generic counter", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1");
    const draft = {
      type: "path" as const,
      measurementType: "polyline" as const,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    };
    expect(getDrawingKeyboardAction("Enter", "polyline", draft)).toBe("complete-path");
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "polyline-1",
      measurementType: "polyline",
      points: draft.points,
    });

    const page = state.session!.pages[1]!;
    expect(page.measurements[0]).toMatchObject({ type: "polyline", name: "Polyline 1" });
    expect(page.nextMeasurementNumber).toEqual({ line: 1, polyline: 2, polygon: 1 });
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

  it("creates an X/Y calibration and binds new measurements to it", () => {
    let state = addScale(loadedState(), "uniform", "Main plan");
    state = addXyScale(state, "xy", "Scanned detail");
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "xy-line",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    });
    const page = state.session!.pages[1]!;
    expect(page.activeCalibrationId).toBe("xy");
    expect(page.calibrations[1]).toMatchObject({ id: "xy", mode: "xy" });
    expect(page.measurements[0]!.calibrationId).toBe("xy");
    expect(
      lineLengthMm(
        page.measurements[0]!.points,
        getMeasurementCalibration(page, page.measurements[0]!)!,
      ),
    ).toBeCloseTo(Math.hypot(30, 80));
  });

  it("binds new measurements to the active calibration and keeps existing links on scale changes", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1");
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-a",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = addScale(state, "scale-2", "Scale 2", 5000);
    state = sessionReducer(state, {
      type: "SET_ACTIVE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
    });
    expect(state.session!.pages[1]!.measurements[0]!.calibrationId).toBe("scale-1");

    state = sessionReducer(state, {
      type: "SET_ACTIVE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-2",
    });
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-b",
      measurementType: "line",
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
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-a",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = addScale(state, "scale-2", "Detail A", 5000);
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-b",
      measurementType: "line",
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

    state = sessionReducer(state, {
      type: "RECALIBRATE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
      name: "Main plan revised",
      calibration: {
        mode: "uniform",
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

  it("recalibrates X/Y in place and changes only its linked measurement results", () => {
    let state = addScale(loadedState(), "uniform", "Main plan");
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "uniform-line",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    });
    state = addXyScale(state, "xy", "Scanned detail");
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "xy-line",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    });
    const before = state.session!.pages[1]!;
    const beforeUniform = lineLengthMm(
      before.measurements[0]!.points,
      getMeasurementCalibration(before, before.measurements[0]!)!,
    );
    const beforeXy = lineLengthMm(
      before.measurements[1]!.points,
      getMeasurementCalibration(before, before.measurements[1]!)!,
    );
    state = sessionReducer(state, {
      type: "RECALIBRATE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "xy",
      name: "Scanned detail revised",
      calibration: {
        mode: "xy",
        xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 1 }, referenceDistanceMm: 200 },
        yReference: { start: { x: 0, y: 0 }, end: { x: 1, y: 10 }, referenceDistanceMm: 400 },
      },
    });
    const after = state.session!.pages[1]!;
    expect(after.calibrations[1]).toMatchObject({
      id: "xy",
      mode: "xy",
      name: "Scanned detail revised",
    });
    expect(
      lineLengthMm(
        after.measurements[0]!.points,
        getMeasurementCalibration(after, after.measurements[0]!)!,
      ),
    ).toBe(beforeUniform);
    expect(
      lineLengthMm(
        after.measurements[1]!.points,
        getMeasurementCalibration(after, after.measurements[1]!)!,
      ),
    ).toBe(beforeXy * 2);
  });

  it("creates measurements with persistent page-local counters", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1");
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = sessionReducer(state, { type: "DELETE_MEASUREMENT", pageNumber: 1, id: "line-1" });
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-2",
      measurementType: "line",
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
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = sessionReducer(state, {
      type: "RENAME_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      name: "  Hallway  ",
    });
    expect(state.session?.pages[1]?.measurements[0]?.name).toBe("Hallway");
    state = sessionReducer(state, {
      type: "RENAME_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      name: "   ",
    });
    expect(state.session?.pages[1]?.measurements[0]?.name).toBe("Hallway");
    expect(state.error).toContain("cannot be empty");
  });

  it("rejects invalid calibration data and duplicate calibration IDs in domain state", () => {
    const identicalPoints = sessionReducer(loadedState(), {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Scale 1",
      calibration: {
        mode: "uniform",
        start: { x: 10, y: 10 },
        end: { x: 10, y: 10 },
        referenceDistanceMm: 1000,
      },
    });
    expect(identicalPoints.session?.pages[1]?.calibrations).toHaveLength(0);
    expect(identicalPoints.error).toContain("distinct points");

    const infiniteDistance = sessionReducer(loadedState(), {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Scale 1",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: Number.POSITIVE_INFINITY,
      },
    });
    expect(infiniteDistance.session?.pages[1]?.calibrations).toHaveLength(0);
    expect(infiniteDistance.error).toContain("valid distance");

    let state = addScale(loadedState(), "scale-1", "Scale 1");
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Another scale",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
    expect(state.session?.pages[1]?.calibrations).toHaveLength(1);
    expect(state.error).toContain("unique ID");
  });

  it("updates valid uniform reference points without changing IDs, links, or geometry", () => {
    let state = addScale(loadedState(), "scale-1", "Scale 1", 1000);
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    const before = lineLengthMm(
      state.session!.pages[1]!.measurements[0]!.points,
      state.session!.pages[1]!.calibrations[0]!,
    );

    state = sessionReducer(state, {
      type: "UPDATE_CALIBRATION_REFERENCE_POINTS",
      pageNumber: 1,
      calibrationId: "scale-1",
      reference: "uniform",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    });
    const page = state.session!.pages[1]!;
    expect(page.calibrations[0]).toMatchObject({ id: "scale-1", name: "Scale 1" });
    expect(page.measurements[0]).toMatchObject({ calibrationId: "scale-1" });
    expect(page.measurements[0]!.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(lineLengthMm(page.measurements[0]!.points, page.calibrations[0]!)).toBe(before / 2);
  });

  it("rejects an invalid uniform, X, or Y reference update", () => {
    const uniform = addScale(loadedState(), "uniform", "Uniform");
    const invalidUniform = sessionReducer(uniform, {
      type: "UPDATE_CALIBRATION_REFERENCE_POINTS",
      pageNumber: 1,
      calibrationId: "uniform",
      reference: "uniform",
      points: [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
    });
    expect(invalidUniform.session).toEqual(uniform.session);

    const xy = addXyScale(loadedState(), "xy", "X/Y");
    const invalidX = sessionReducer(xy, {
      type: "UPDATE_CALIBRATION_REFERENCE_POINTS",
      pageNumber: 1,
      calibrationId: "xy",
      reference: "x",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ],
    });
    const invalidY = sessionReducer(xy, {
      type: "UPDATE_CALIBRATION_REFERENCE_POINTS",
      pageNumber: 1,
      calibrationId: "xy",
      reference: "y",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(invalidX.session).toEqual(xy.session);
    expect(invalidY.session).toEqual(xy.session);
  });

  it("updates X/Y references independently and recalculates only linked measurements", () => {
    let state = addScale(loadedState(), "uniform", "Uniform", 1000);
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "uniform-line",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    });
    state = addXyScale(state, "xy", "X/Y", 100, 200);
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "xy-line",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    });
    const before = state.session!.pages[1]!;
    const uniformBefore = lineLengthMm(before.measurements[0]!.points, before.calibrations[0]!);
    const xyBefore = lineLengthMm(before.measurements[1]!.points, before.calibrations[1]!);

    state = sessionReducer(state, {
      type: "UPDATE_CALIBRATION_REFERENCE_POINTS",
      pageNumber: 1,
      calibrationId: "xy",
      reference: "x",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 1 },
      ],
    });
    const after = state.session!.pages[1]!;
    expect(after.calibrations[1]).toMatchObject({ id: "xy", mode: "xy" });
    expect(after.measurements.map((measurement) => measurement.calibrationId)).toEqual([
      "uniform",
      "xy",
    ]);
    expect(lineLengthMm(after.measurements[0]!.points, after.calibrations[0]!)).toBe(uniformBefore);
    expect(lineLengthMm(after.measurements[1]!.points, after.calibrations[1]!)).toBeLessThan(xyBefore);
  });

  it("updates a valid Y reference while preserving the X reference", () => {
    let state = addXyScale(loadedState(), "xy", "X/Y", 100, 200);
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "vertical-line",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 4 },
      ],
    });
    const before = state.session!.pages[1]!;
    const beforeLength = lineLengthMm(before.measurements[0]!.points, before.calibrations[0]!);

    state = sessionReducer(state, {
      type: "UPDATE_CALIBRATION_REFERENCE_POINTS",
      pageNumber: 1,
      calibrationId: "xy",
      reference: "y",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 20 },
      ],
    });
    const calibration = state.session!.pages[1]!.calibrations[0]!;
    if (calibration.mode !== "xy") throw new Error("Expected an X/Y calibration.");
    expect(calibration.xReference).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 10, y: 1 },
      referenceDistanceMm: 100,
    });
    expect(calibration.yReference.end).toEqual({ x: 1, y: 20 });
    expect(lineLengthMm(state.session!.pages[1]!.measurements[0]!.points, calibration)).toBe(
      beforeLength / 2,
    );
  });
});
