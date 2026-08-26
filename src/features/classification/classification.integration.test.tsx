import { describe, expect, it } from "vitest";
import { createEmptySession, initialSessionState, sessionReducer } from "../../app/sessionState";

function measuredState() {
  let state = sessionReducer(initialSessionState, {
    type: "LOAD_SESSION",
    session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1),
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
    type: "ADD_CLASSIFICATION_DIMENSION",
    id: "trade",
    name: "Trade",
  });
  state = sessionReducer(state, {
    type: "ADD_CLASSIFICATION_VALUE",
    dimensionId: "trade",
    id: "electrical",
    name: "Electrical",
  });
  state = sessionReducer(state, {
    type: "ADD_CLASSIFICATION_VALUE",
    dimensionId: "trade",
    id: "plumbing",
    name: "Plumbing",
  });
  return state;
}

describe("classification domain integration", () => {
  it("assigns stable value IDs without changing calibration or geometry", () => {
    const before = measuredState();
    const measurement = before.session!.pages[1]!.measurements[0]!;
    const after = sessionReducer(before, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: measurement.id,
      dimensionId: "trade",
      valueId: "electrical",
    });
    expect(after.session!.pages[1]!.measurements[0]).toMatchObject({
      calibrationId: "scale-1",
      points: measurement.points,
      classificationValueIds: ["electrical"],
      visible: true,
    });
  });

  it("replaces the value from the same dimension and keeps archived historical IDs", () => {
    let state = measuredState();
    state = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });
    state = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "plumbing",
    });
    expect(state.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual(["plumbing"]);

    state = sessionReducer(state, {
      type: "ARCHIVE_CLASSIFICATION_VALUE",
      dimensionId: "trade",
      id: "plumbing",
    });
    expect(state.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual(["plumbing"]);
    expect(state.session!.classificationCatalog.dimensions[0]!.values[1]!.archived).toBe(true);

    state = sessionReducer(state, {
      type: "RESTORE_CLASSIFICATION_VALUE",
      dimensionId: "trade",
      id: "plumbing",
    });
    expect(state.session!.classificationCatalog.dimensions[0]!.values[1]!.archived).toBe(false);
  });

  it("rejects assigning an archived value", () => {
    let state = measuredState();
    state = sessionReducer(state, {
      type: "ARCHIVE_CLASSIFICATION_VALUE",
      dimensionId: "trade",
      id: "electrical",
    });
    const rejected = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });
    expect(rejected.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual([]);
    expect(rejected.error).toContain("no longer available");
  });

  it("rejects a value paired with the wrong dimension", () => {
    const state = measuredState();
    const rejected = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "missing-dimension",
      valueId: "electrical",
    });

    expect(rejected.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual([]);
    expect(rejected.error).toContain("no longer available");
  });

  it("removes only the selected dimension and preserves other assignments", () => {
    let state = measuredState();
    state = sessionReducer(state, {
      type: "ADD_CLASSIFICATION_DIMENSION",
      id: "status",
      name: "Status",
    });
    state = sessionReducer(state, {
      type: "ADD_CLASSIFICATION_VALUE",
      dimensionId: "status",
      id: "approved",
      name: "Approved",
    });
    state = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });
    state = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "status",
      valueId: "approved",
    });
    state = sessionReducer(state, {
      type: "REMOVE_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });

    expect(state.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual(["approved"]);
  });
});
