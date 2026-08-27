import { describe, expect, it } from "vitest";
import type { CurrentSession } from "../types/domain";
import { createEmptySession, initialSessionState, sessionReducer } from "./sessionState";

function session(): CurrentSession {
  return createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 2);
}

describe("SessionState", () => {
  it("starts without a persistent session or command error", () => {
    expect(initialSessionState).toEqual({ session: null, error: null });
  });

  it("loads a CurrentSession snapshot and clears the previous command error", () => {
    const loaded = sessionReducer(
      { session: null, error: "stale error" },
      { type: "LOAD_SESSION", session: session() },
    );

    expect(loaded.session?.schemaVersion).toBe(7);
    expect(loaded.session?.pageCount).toBe(2);
    expect(loaded.error).toBeNull();
  });

  it("updates persistent pages, measurements, calibrations, settings, and currentPage", () => {
    let state = sessionReducer(initialSessionState, {
      type: "LOAD_SESSION",
      session: session(),
    });
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Main plan",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
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
      type: "UPDATE_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
    });
    state = sessionReducer(state, {
      type: "UPDATE_SETTINGS",
      settings: { displayUnit: "cm", showLabels: false },
    });
    state = sessionReducer(state, { type: "UPDATE_PAGE", pageNumber: 2 });

    expect(state.session?.currentPage).toBe(2);
    expect(state.session?.settings).toMatchObject({ displayUnit: "cm", showLabels: false });
    expect(state.session?.pages[1]?.measurements[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ]);
    expect(state.session).not.toHaveProperty("selectedMeasurementId");
    expect(state.session).not.toHaveProperty("activeTool");
    expect(state.session?.schemaVersion).toBe(7);
  });

  it("keeps the authoritative measurement points when an update is invalid", () => {
    let state = sessionReducer(initialSessionState, {
      type: "LOAD_SESSION",
      session: session(),
    });
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Main plan",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
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
      type: "UPDATE_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    });

    expect(state.session?.pages[1]?.measurements[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("creates visible measurements and toggles only the requested measurement", () => {
    let state = sessionReducer(initialSessionState, {
      type: "LOAD_SESSION",
      session: session(),
    });
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Main plan",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
    for (const id of ["line-1", "line-2"]) {
      state = sessionReducer(state, {
        type: "ADD_MEASUREMENT",
        pageNumber: 1,
        id,
        measurementType: "line",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      });
    }

    expect(state.session?.pages[1]?.measurements.map((measurement) => measurement.visible)).toEqual(
      [true, true],
    );
    state = sessionReducer(state, {
      type: "SET_MEASUREMENT_VISIBILITY",
      pageNumber: 1,
      id: "line-1",
      visible: false,
    });
    expect(state.session?.pages[1]?.measurements.map((measurement) => measurement.visible)).toEqual(
      [false, true],
    );
    state = sessionReducer(state, {
      type: "SET_MEASUREMENT_VISIBILITY",
      pageNumber: 1,
      id: "line-1",
      visible: true,
    });
    expect(state.session?.pages[1]?.measurements.map((measurement) => measurement.visible)).toEqual(
      [true, true],
    );
  });

  it("updates a page's measurement visibility atomically in bulk", () => {
    let state = sessionReducer(initialSessionState, {
      type: "LOAD_SESSION",
      session: session(),
    });
    for (const pageNumber of [1, 2]) {
      state = sessionReducer(state, {
        type: "ADD_CALIBRATION",
        pageNumber,
        id: `scale-${pageNumber}`,
        name: `Scale ${pageNumber}`,
        calibration: {
          mode: "uniform",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          referenceDistanceMm: 1000,
        },
      });
    }
    for (const [pageNumber, id] of [
      [1, "line-1"],
      [1, "line-2"],
      [1, "line-3"],
      [2, "line-other-page"],
    ] as const) {
      state = sessionReducer(state, {
        type: "ADD_MEASUREMENT",
        pageNumber,
        id,
        measurementType: "line",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      });
    }
    const before = state.session;
    state = sessionReducer(state, {
      type: "SET_MEASUREMENTS_VISIBILITY",
      pageNumber: 1,
      measurementIds: ["line-1", "line-2", "line-1"],
      visible: false,
    });

    expect(state.error).toBeNull();
    expect(state.session?.pages[1]?.measurements.map((measurement) => measurement.visible)).toEqual(
      [false, false, true],
    );
    expect(state.session?.pages[2]?.measurements[0]?.visible).toBe(true);
    expect(state.session?.pages[1]?.measurements[0]).toMatchObject({
      points: before?.pages[1]?.measurements[0]?.points,
      calibrationId: before?.pages[1]?.measurements[0]?.calibrationId,
      classificationValueIds: before?.pages[1]?.measurements[0]?.classificationValueIds,
      name: before?.pages[1]?.measurements[0]?.name,
    });

    const shown = sessionReducer(state, {
      type: "SET_MEASUREMENTS_VISIBILITY",
      pageNumber: 1,
      measurementIds: ["line-1", "line-2"],
      visible: true,
    });
    expect(shown.session?.pages[1]?.measurements.map((measurement) => measurement.visible)).toEqual(
      [true, true, true],
    );

    const noOp = sessionReducer(shown, {
      type: "SET_MEASUREMENTS_VISIBILITY",
      pageNumber: 1,
      measurementIds: [],
      visible: false,
    });
    expect(noOp.session).toBe(shown.session);
    expect(noOp.error).toBeNull();

    const alreadyVisible = sessionReducer(shown, {
      type: "SET_MEASUREMENTS_VISIBILITY",
      pageNumber: 1,
      measurementIds: ["line-1", "line-2"],
      visible: true,
    });
    expect(alreadyVisible.session).toBe(shown.session);
    expect(alreadyVisible.error).toBeNull();

    const rejected = sessionReducer(shown, {
      type: "SET_MEASUREMENTS_VISIBILITY",
      pageNumber: 1,
      measurementIds: ["line-1", "line-missing"],
      visible: false,
    });
    expect(rejected.session).toBe(shown.session);
    expect(rejected.error).toBe("One or more selected measurements are no longer available.");
  });

  it("keeps individual visibility preferences when the global master changes", () => {
    let state = sessionReducer(initialSessionState, {
      type: "LOAD_SESSION",
      session: session(),
    });
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Main plan",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
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
      type: "SET_MEASUREMENT_VISIBILITY",
      pageNumber: 1,
      id: "line-1",
      visible: false,
    });
    state = sessionReducer(state, {
      type: "UPDATE_SETTINGS",
      settings: { showMeasurements: false },
    });
    state = sessionReducer(state, {
      type: "UPDATE_SETTINGS",
      settings: { showMeasurements: true },
    });

    expect(state.session?.settings.showMeasurements).toBe(true);
    expect(state.session?.pages[1]?.measurements[0]?.visible).toBe(false);
  });

  it("does not partially mutate when a visibility target is missing", () => {
    const state = sessionReducer(initialSessionState, {
      type: "LOAD_SESSION",
      session: session(),
    });
    const missingMeasurement = sessionReducer(state, {
      type: "SET_MEASUREMENT_VISIBILITY",
      pageNumber: 1,
      id: "missing",
      visible: false,
    });
    const missingPage = sessionReducer(state, {
      type: "SET_MEASUREMENT_VISIBILITY",
      pageNumber: 99,
      id: "missing",
      visible: false,
    });

    expect(missingMeasurement.session).toBe(state.session);
    expect(missingPage.session).toBe(state.session);
    expect(missingMeasurement.error).toContain("no longer available");
    expect(missingPage.error).toContain("no longer available");
  });

  it("clears the persistent session without restoring interaction state", () => {
    const state = sessionReducer(
      { session: session(), error: "a command error" },
      { type: "CLEAR_SESSION" },
    );

    expect(state).toEqual(initialSessionState);
  });

  it("rejects duplicate measurement IDs across different pages", () => {
    let state = sessionReducer(initialSessionState, { type: "LOAD_SESSION", session: session() });
    for (const pageNumber of [1, 2]) {
      state = sessionReducer(state, {
        type: "ADD_CALIBRATION",
        pageNumber,
        id: `scale-${pageNumber}`,
        name: `Scale ${pageNumber}`,
        calibration: {
          mode: "uniform",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          referenceDistanceMm: 1000,
        },
      });
    }
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "shared-id",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    const rejected = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 2,
      id: "shared-id",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });

    expect(rejected.session?.pages[2]?.measurements).toHaveLength(0);
    expect(rejected.error).toContain("unique across the session");
  });

  it("renames and reassigns existing calibrations by ID without changing geometry", () => {
    let state = sessionReducer(initialSessionState, {
      type: "LOAD_SESSION",
      session: session(),
    });
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Main plan",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-2",
      name: "Detail",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 20, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
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
    const originalCalibration = state.session?.pages[1]?.calibrations[0];

    state = sessionReducer(state, {
      type: "RENAME_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
      name: "Renamed",
    });
    state = sessionReducer(state, {
      type: "ASSIGN_MEASUREMENT_CALIBRATION",
      pageNumber: 1,
      measurementId: "line-1",
      calibrationId: "scale-2",
    });

    expect(state.session?.pages[1]?.calibrations[0]?.name).toBe("Renamed");
    expect(state.session?.pages[1]?.calibrations[0]).toMatchObject({
      start: originalCalibration?.mode === "uniform" ? originalCalibration.start : undefined,
      end: originalCalibration?.mode === "uniform" ? originalCalibration.end : undefined,
      referenceDistanceMm:
        originalCalibration?.mode === "uniform"
          ? originalCalibration.referenceDistanceMm
          : undefined,
    });
    expect(state.session?.pages[1]?.measurements[0]?.calibrationId).toBe("scale-2");
    expect(state.session?.pages[1]?.measurements[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("only deletes an unused calibration and keeps the active ID valid", () => {
    let state = sessionReducer(initialSessionState, {
      type: "LOAD_SESSION",
      session: session(),
    });
    for (const [id, name, endX] of [
      ["scale-1", "Main plan", 10],
      ["scale-2", "Detail", 20],
    ] as const) {
      state = sessionReducer(state, {
        type: "ADD_CALIBRATION",
        pageNumber: 1,
        id,
        name,
        calibration: {
          mode: "uniform",
          start: { x: 0, y: 0 },
          end: { x: endX, y: 0 },
          referenceDistanceMm: 1000,
        },
      });
    }

    const blocked = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    const refused = sessionReducer(blocked, {
      type: "DELETE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-2",
    });
    expect(refused.session?.pages[1]?.calibrations).toHaveLength(2);
    expect(refused.error).toContain("used by measurements");

    const deleted = sessionReducer(
      { ...refused, error: null },
      { type: "DELETE_CALIBRATION", pageNumber: 1, calibrationId: "scale-1" },
    );
    expect(deleted.session?.pages[1]?.calibrations.map((calibration) => calibration.id)).toEqual([
      "scale-2",
    ]);
    expect(deleted.session?.pages[1]?.activeCalibrationId).toBe("scale-2");
  });
});
