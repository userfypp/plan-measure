import { describe, expect, it } from "vitest";
import { createEmptySession, sessionReducer, type BulkMeasurementCommand } from "./sessionState";

function fixture() {
  const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
  session.classificationCatalog.dimensions = [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [
        { id: "old", name: "Old", archived: true },
        { id: "new", name: "New", archived: false },
      ],
    },
    {
      id: "floor",
      name: "Floor",
      archived: false,
      values: [{ id: "ground", name: "Ground", archived: false }],
    },
  ];
  for (const page of Object.values(session.pages)) {
    page.measurements = [
      {
        id: `line-${page.pageNumber}`,
        name: "Line",
        type: "line",
        calibrationId: "scale",
        points: [
          { x: 1, y: 2 },
          { x: 10, y: 20 },
        ],
        visible: page.pageNumber === 1,
        note: "Keep",
        classificationValueIds: page.pageNumber === 1 ? ["old", "ground"] : ["ground"],
      },
    ];
  }
  session.pages[1]!.measurements.push({ ...session.pages[1]!.measurements[0]!, id: "unselected" });
  return { session, error: null };
}

function bulk(
  state: ReturnType<typeof fixture>,
  operation: BulkMeasurementCommand["operation"],
  measurementIds = ["line-1", "line-2"],
) {
  return sessionReducer(state, { type: "EDIT_MEASUREMENTS", measurementIds, operation });
}

describe("bulk measurement edits", () => {
  it("changes visibility across pages, preserving unselected measurements and geometry", () => {
    const state = fixture();
    const result = bulk(state, { type: "visibility", visible: false });
    expect(result.error).toBeNull();
    for (const page of Object.values(result.session!.pages)) {
      expect(page.measurements[0]).toEqual({
        ...state.session.pages[page.pageNumber]!.measurements[0],
        visible: false,
      });
    }
    expect(result.session!.pages[1]!.measurements[1]).toBe(state.session.pages[1]!.measurements[1]);
    expect(
      bulk({ session: result.session!, error: null }, { type: "visibility", visible: false })
        .session,
    ).toBe(result.session);
  });

  it("replaces only the chosen dimension and removes mixed or archived assignments", () => {
    const state = fixture();
    const assigned = bulk(state, { type: "classification", dimensionId: "trade", valueId: "new" });
    for (const page of Object.values(assigned.session!.pages))
      expect(page.measurements[0]!.classificationValueIds).toEqual(["ground", "new"]);
    const removed = bulk(state, { type: "classification", dimensionId: "trade", valueId: null });
    for (const page of Object.values(removed.session!.pages))
      expect(page.measurements[0]!.classificationValueIds).toEqual(["ground"]);
    state.session.classificationCatalog.dimensions[0]!.archived = true;
    expect(
      bulk(state, { type: "classification", dimensionId: "trade", valueId: null }).error,
    ).toBeNull();
  });

  it("deletes selected measurements across pages, preserving scales and other measurements", () => {
    const state = fixture();
    const result = bulk(state, { type: "delete" });
    expect(result.session!.pages[1]!.measurements.map((measurement) => measurement.id)).toEqual([
      "unselected",
    ]);
    expect(result.session!.pages[2]!.measurements).toEqual([]);
    expect(result.session!.pages[1]!.calibrations).toBe(state.session.pages[1]!.calibrations);
  });

  it.each([
    { type: "classification", dimensionId: "trade", valueId: "old" },
    { type: "classification", dimensionId: "missing", valueId: null },
  ] as const)("rejects invalid classification edits atomically", (operation) => {
    const state = fixture();
    const result = bulk(state, operation);
    expect(result.error).toBeTruthy();
    expect(result.session).toBe(state.session);
  });

  it("rejects stale selections without partial edits and treats empty selections as no-ops", () => {
    const state = fixture();
    const result = bulk(state, { type: "delete" }, ["line-1", "missing"]);
    expect(result.error).toBeTruthy();
    expect(result.session).toBe(state.session);
    expect(bulk(state, { type: "delete" }, []).session).toBe(state.session);
  });
});

describe("atomic measurement geometry batches", () => {
  it("updates all points together, preserves metadata, and rejects invalid or missing members", () => {
    const state = fixture();
    const original = state.session.pages[1]!.measurements;
    const commands = original.map((measurement) => ({ pageNumber: 1, id: measurement.id,
      points: measurement.points.map((point) => ({ x: point.x + 5, y: point.y + 8 })) }));
    const moved = sessionReducer(state, { type: "UPDATE_MEASUREMENTS", commands });
    expect(moved.error).toBeNull();
    moved.session!.pages[1]!.measurements.forEach((measurement, index) => {
      expect(measurement).toEqual({ ...original[index], points: commands[index]!.points });
    });
    expect(moved.session!.pages[2]).toBe(state.session.pages[2]);
    for (const invalid of [
      { ...commands[1]!, id: "missing" },
      { ...commands[1]!, pageNumber: 2 },
      { ...commands[1]!, points: [{ x: NaN, y: 0 }, { x: 2, y: 3 }] },
      { ...commands[1]!, id: commands[0]!.id },
    ]) {
      const rejected = sessionReducer(state, { type: "UPDATE_MEASUREMENTS", commands: [commands[0]!, invalid] });
      expect(rejected.session).toBe(state.session);
      expect(rejected.error).not.toBeNull();
    }
    expect(sessionReducer(moved, { type: "UPDATE_MEASUREMENTS", commands }).session).toBe(moved.session);
  });

  it("pastes the entire batch or none and preserves the per-measurement scales", () => {
    const state = fixture();
    state.session.pages[1]!.calibrations = [{ id: "scale", name: "Scale", mode: "uniform", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 }];
    const commands = state.session.pages[1]!.measurements.map((measurement, index) => ({ pageNumber: 1,
      sourcePageNumber: 1, id: `copy-${index}`, measurement }));
    const pasted = sessionReducer(state, { type: "PASTE_MEASUREMENTS", commands });
    expect(pasted.error).toBeNull();
    expect(pasted.session!.pages[1]!.measurements).toHaveLength(4);
    expect(pasted.session!.pages[1]!.measurements.slice(2).map((measurement) => measurement.calibrationId)).toEqual(["scale", "scale"]);
    for (const invalid of [
      { ...commands[1]!, id: commands[0]!.id },
      { ...commands[1]!, measurement: { ...commands[1]!.measurement, calibrationId: "missing" } },
      { ...commands[1]!, sourcePageNumber: 2 },
    ]) {
      const rejected = sessionReducer(state, { type: "PASTE_MEASUREMENTS", commands: [commands[0]!, invalid] });
      expect(rejected.session).toBe(state.session);
      expect(rejected.error).not.toBeNull();
    }
  });
});
