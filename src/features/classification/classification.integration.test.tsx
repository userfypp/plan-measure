import { describe, expect, it } from "vitest";
import { createEmptySession, initialSessionState, sessionReducer } from "../../app/sessionState";
import { classificationNameKey } from "../../utils/classificationNames";

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
  function withLocaleDefault(locale: "en-US" | "tr-TR", callback: () => void) {
    const original = Object.getOwnPropertyDescriptor(String.prototype, "toLocaleLowerCase")!;
    Object.defineProperty(String.prototype, "toLocaleLowerCase", {
      configurable: true,
      value: function (this: string) {
        return locale === "tr-TR"
          ? this.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase()
          : this.toLowerCase();
      },
    });
    try {
      callback();
    } finally {
      Object.defineProperty(String.prototype, "toLocaleLowerCase", original);
    }
  }

  it("uses deterministic dimension and value uniqueness independent of locale", () => {
    for (const locale of ["en-US", "tr-TR"] as const) {
      withLocaleDefault(locale, () => {
        let state = sessionReducer(initialSessionState, {
          type: "LOAD_SESSION",
          session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1),
        });
        state = sessionReducer(state, {
          type: "ADD_CLASSIFICATION_DIMENSION",
          id: "d1",
          name: "İ",
        });
        const secondDimension = sessionReducer(state, {
          type: "ADD_CLASSIFICATION_DIMENSION",
          id: "d2",
          name: "i",
        });
        expect(secondDimension.error).toBeNull();
        state = sessionReducer(secondDimension, {
          type: "ADD_CLASSIFICATION_VALUE",
          dimensionId: "d1",
          id: "v1",
          name: "İ",
        });
        const secondValue = sessionReducer(state, {
          type: "ADD_CLASSIFICATION_VALUE",
          dimensionId: "d1",
          id: "v2",
          name: "i",
        });
        expect(secondValue.error).toBeNull();
        state = secondValue;
        expect(classificationNameKey("İ")).toBe("İ".toLowerCase());
        expect(state.session!.classificationCatalog.dimensions.map(({ name }) => name)).toEqual([
          "İ",
          "i",
        ]);
        expect(
          state.session!.classificationCatalog.dimensions[0]!.values.map(({ name }) => name),
        ).toEqual(["İ", "i"]);
      });
    }
  });

  it("keeps archived dimension and value names reserved", () => {
    let state = measuredState();
    state = sessionReducer(state, { type: "ARCHIVE_CLASSIFICATION_DIMENSION", id: "trade" });
    const duplicateDimension = sessionReducer(state, {
      type: "ADD_CLASSIFICATION_DIMENSION",
      id: "trade-copy",
      name: "trade",
    });
    expect(duplicateDimension.error).toBe("Classification dimensions need unique IDs and names.");

    state = sessionReducer(measuredState(), {
      type: "ARCHIVE_CLASSIFICATION_VALUE",
      dimensionId: "trade",
      id: "electrical",
    });
    const duplicateValue = sessionReducer(state, {
      type: "ADD_CLASSIFICATION_VALUE",
      dimensionId: "trade",
      id: "electrical-copy",
      name: "electrical",
    });
    expect(duplicateValue.error).toBe(
      "Classification values need unique IDs and names within a dimension.",
    );
    expect(duplicateValue.session!.classificationCatalog.dimensions[0]!.values[0]).toEqual({
      id: "electrical",
      name: "Electrical",
      archived: true,
    });
  });

  it("creates new dimensions active by default", () => {
    const state = measuredState();

    expect(state.session!.classificationCatalog.dimensions[0]).toMatchObject({
      id: "trade",
      name: "Trade",
      archived: false,
    });
  });

  it("archives a dimension without changing values, assignments, or measurement data", () => {
    let state = measuredState();
    state = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });
    state = sessionReducer(state, {
      type: "ARCHIVE_CLASSIFICATION_VALUE",
      dimensionId: "trade",
      id: "plumbing",
    });
    const beforeMeasurement = state.session!.pages[1]!.measurements[0]!;

    const archived = sessionReducer(state, {
      type: "ARCHIVE_CLASSIFICATION_DIMENSION",
      id: "trade",
    });
    const dimension = archived.session!.classificationCatalog.dimensions[0]!;
    const measurement = archived.session!.pages[1]!.measurements[0]!;

    expect(dimension.archived).toBe(true);
    expect(dimension.values).toEqual([
      { id: "electrical", name: "Electrical", archived: false },
      { id: "plumbing", name: "Plumbing", archived: true },
    ]);
    expect(measurement.classificationValueIds).toEqual(["electrical"]);
    expect(measurement.calibrationId).toBe(beforeMeasurement.calibrationId);
    expect(measurement.points).toEqual(beforeMeasurement.points);
    expect(measurement.visible).toBe(beforeMeasurement.visible);
  });

  it("restores a dimension without changing its values or historical assignments", () => {
    let state = measuredState();
    state = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });
    state = sessionReducer(state, { type: "ARCHIVE_CLASSIFICATION_DIMENSION", id: "trade" });
    const restored = sessionReducer(state, {
      type: "RESTORE_CLASSIFICATION_DIMENSION",
      id: "trade",
    });

    expect(restored.session!.classificationCatalog.dimensions[0]!.archived).toBe(false);
    expect(restored.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual([
      "electrical",
    ]);
  });

  it("does not change individual value archive flags when a dimension is archived", () => {
    let state = measuredState();
    state = sessionReducer(state, {
      type: "ARCHIVE_CLASSIFICATION_VALUE",
      dimensionId: "trade",
      id: "plumbing",
    });
    state = sessionReducer(state, { type: "ARCHIVE_CLASSIFICATION_DIMENSION", id: "trade" });
    state = sessionReducer(state, { type: "RESTORE_CLASSIFICATION_DIMENSION", id: "trade" });

    expect(state.session!.classificationCatalog.dimensions[0]!.values).toEqual([
      { id: "electrical", name: "Electrical", archived: false },
      { id: "plumbing", name: "Plumbing", archived: true },
    ]);
  });

  it("rejects new assignments from an archived dimension without changing history", () => {
    let state = measuredState();
    state = sessionReducer(state, { type: "ARCHIVE_CLASSIFICATION_DIMENSION", id: "trade" });
    const rejected = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });

    expect(rejected.session).toBe(state.session);
    expect(rejected.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual([]);
    expect(rejected.error).toBe("Restore the classification dimension before assigning values.");
  });

  it("allows removing a historical assignment from an archived dimension", () => {
    let state = measuredState();
    state = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });
    state = sessionReducer(state, { type: "ARCHIVE_CLASSIFICATION_DIMENSION", id: "trade" });
    const removed = sessionReducer(state, {
      type: "REMOVE_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });

    expect(removed.error).toBeNull();
    expect(removed.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual([]);
  });

  it("allows active values to be assigned again after restoring a dimension", () => {
    let state = measuredState();
    state = sessionReducer(state, { type: "ARCHIVE_CLASSIFICATION_DIMENSION", id: "trade" });
    state = sessionReducer(state, { type: "RESTORE_CLASSIFICATION_DIMENSION", id: "trade" });
    const assigned = sessionReducer(state, {
      type: "ASSIGN_CLASSIFICATION_VALUE",
      pageNumber: 1,
      measurementId: "line-1",
      dimensionId: "trade",
      valueId: "electrical",
    });

    expect(assigned.error).toBeNull();
    expect(assigned.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual([
      "electrical",
    ]);
  });

  it("rejects every dimension and value edit while the parent dimension is archived", () => {
    let state = measuredState();
    state = sessionReducer(state, { type: "ARCHIVE_CLASSIFICATION_DIMENSION", id: "trade" });
    const actions = [
      { type: "RENAME_CLASSIFICATION_DIMENSION", id: "trade", name: "Renamed" } as const,
      { type: "ADD_CLASSIFICATION_VALUE", dimensionId: "trade", id: "new", name: "New" } as const,
      {
        type: "RENAME_CLASSIFICATION_VALUE",
        dimensionId: "trade",
        id: "electrical",
        name: "Renamed",
      } as const,
      { type: "ARCHIVE_CLASSIFICATION_VALUE", dimensionId: "trade", id: "electrical" } as const,
      { type: "RESTORE_CLASSIFICATION_VALUE", dimensionId: "trade", id: "electrical" } as const,
    ];

    for (const action of actions) {
      const rejected = sessionReducer(state, action);
      expect(rejected.session).toBe(state.session);
      expect(rejected.error).toBe("Restore the classification dimension before editing it.");
    }
  });

  it("rejects renaming an archived value in an active dimension", () => {
    let state = measuredState();
    state = sessionReducer(state, {
      type: "ARCHIVE_CLASSIFICATION_VALUE",
      dimensionId: "trade",
      id: "electrical",
    });
    const rejected = sessionReducer(state, {
      type: "RENAME_CLASSIFICATION_VALUE",
      dimensionId: "trade",
      id: "electrical",
      name: "Renamed",
    });

    expect(rejected.session).toBe(state.session);
    expect(rejected.session!.classificationCatalog.dimensions[0]!.archived).toBe(false);
    expect(rejected.session!.classificationCatalog.dimensions[0]!.values[0]).toEqual({
      id: "electrical",
      name: "Electrical",
      archived: true,
    });
    expect(rejected.error).toBe("Restore the classification value before editing it.");
  });

  it("keeps archived dimension names reserved", () => {
    let state = measuredState();
    state = sessionReducer(state, { type: "ARCHIVE_CLASSIFICATION_DIMENSION", id: "trade" });
    const rejected = sessionReducer(state, {
      type: "ADD_CLASSIFICATION_DIMENSION",
      id: "trade-copy",
      name: " trade ",
    });

    expect(rejected.session).toBe(state.session);
    expect(rejected.error).toBe("Classification dimensions need unique IDs and names.");
  });

  it("does not alter assignments from other dimensions when one dimension is archived", () => {
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
    state = sessionReducer(state, { type: "ARCHIVE_CLASSIFICATION_DIMENSION", id: "trade" });

    expect(state.session!.pages[1]!.measurements[0]!.classificationValueIds).toEqual([
      "electrical",
      "approved",
    ]);
  });

  it("reports the stable error for missing dimension archive targets", () => {
    const state = measuredState();
    const archiveResult = sessionReducer(state, {
      type: "ARCHIVE_CLASSIFICATION_DIMENSION",
      id: "missing",
    });
    const restoreResult = sessionReducer(state, {
      type: "RESTORE_CLASSIFICATION_DIMENSION",
      id: "missing",
    });

    expect(archiveResult.error).toBe("The classification dimension is no longer available.");
    expect(restoreResult.error).toBe("The classification dimension is no longer available.");
  });

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
