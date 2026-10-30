import { describe, expect, it } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type {
  ClassificationCatalog,
  CurrentSession,
  Measurement,
  PageCalibration,
  Point,
} from "../types/domain";
import { buildTakeoffSummary } from "./takeoffSummary";

// Page 1: 10 page units are 1 m, so one unit is 100 mm. Page 2: X/Y scale with 100 mm per unit
// across and 200 mm per unit down.
const UNIFORM: PageCalibration = {
  id: "uniform",
  name: "Uniform",
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },
  referenceDistanceMm: 1000,
};
const XY: PageCalibration = {
  id: "xy",
  name: "X/Y",
  mode: "xy",
  xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 },
  yReference: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, referenceDistanceMm: 2000 },
};

const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "plumbing", name: "Plumbing", archived: true },
      ],
    },
    {
      id: "phase",
      name: "Phase",
      archived: true,
      values: [{ id: "planned", name: "Planned", archived: false }],
    },
  ],
};

function box(width: number, height: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

function path(
  id: string,
  type: Exclude<Measurement["type"], "count">,
  points: Point[],
  calibrationId: string,
  overrides: Partial<Measurement> = {},
): Measurement {
  return {
    id,
    name: id,
    type,
    points,
    calibrationId,
    classificationValueIds: [],
    visible: true,
    ...overrides,
  } as Measurement;
}

function project(): CurrentSession {
  const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
  session.classificationCatalog = catalog;
  session.pageLabelOverrides = { 2: "A-201" };
  session.pages[1] = {
    ...session.pages[1]!,
    calibrations: [UNIFORM],
    activeCalibrationId: "uniform",
    measurements: [
      // 66 m square: 4356 m² and 264 m.
      path("square", "polygon", box(660, 660), "uniform", {
        classificationValueIds: ["electrical", "planned"],
      }),
      // 3 m × 4 m: 12 m² and 14 m.
      path("rectangle", "rectangle", box(30, 40), "uniform", {
        classificationValueIds: ["plumbing"],
      }),
      // 5 m diagonal.
      path(
        "line",
        "line",
        [
          { x: 0, y: 0 },
          { x: 30, y: 40 },
        ],
        "uniform",
        { classificationValueIds: ["electrical"] },
      ),
      // Hidden, still counted: 2 m.
      path(
        "hidden",
        "polyline",
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        "uniform",
        { visible: false },
      ),
      {
        id: "count",
        name: "count",
        type: "count",
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
        calibrationId: null,
        classificationValueIds: ["electrical"],
        visible: true,
      },
    ],
  };
  session.pages[2] = {
    ...session.pages[2]!,
    calibrations: [XY],
    activeCalibrationId: "xy",
    measurements: [
      // Bounding box 20 × 10 units: semi-axes 10 × 100 mm and 5 × 200 mm, a 1 m radius circle.
      path("ellipse", "ellipse", box(20, 10), "xy"),
      // 10 units down at 200 mm per unit: 2 m.
      path(
        "vertical",
        "line",
        [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ],
        "xy",
      ),
      // Its scale was deleted: excluded, not zero.
      path(
        "orphan",
        "line",
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        "deleted",
      ),
    ],
  };
  return session;
}

const value = (amount: number) => ({ kind: "value", value: amount });
const absent = { kind: "absent" };

describe("buildTakeoffSummary", () => {
  it("totals every page in millimetres, hidden measurements included, with hand-computed values", () => {
    const summary = buildTakeoffSummary(project(), {
      breakdowns: [],
      classificationDimensionIds: [],
    });

    expect(summary).toMatchObject({
      linearUnit: "mm",
      areaUnit: "mm²",
      allPages: true,
      includesHidden: true,
      breakdowns: [],
    });
    const totals = summary.projectTotals;
    expect(totals).toMatchObject({
      measurementCount: 8,
      excludedCount: 1,
      length: value(9000),
      count: value(3),
    });
    expect(totals.perimeter.kind).toBe("value");
    expect(totals.area.kind).toBe("value");
    if (totals.perimeter.kind !== "value" || totals.area.kind !== "value") return;
    expect(totals.perimeter.value).toBeCloseTo(264_000 + 14_000 + 2000 * Math.PI, 6);
    expect(totals.area.value).toBeCloseTo(4_356_000_000 + 12_000_000 + 1_000_000 * Math.PI, 3);
  });

  it("breaks totals down by page and by type with exact per-group quantities", () => {
    const summary = buildTakeoffSummary(project(), {
      breakdowns: ["type", "page"],
      classificationDimensionIds: [],
    });

    // Page before type, whatever the selection order.
    expect(summary.breakdowns.map((breakdown) => breakdown.type)).toEqual(["page", "type"]);
    const [pages, types] = summary.breakdowns;
    expect(pages!.dimension).toBeNull();
    expect(pages!.groups.map(({ key, label }) => [key, label])).toEqual([
      ["page:1", "Page 1"],
      ["page:2", "A-201"],
    ]);
    expect(pages!.groups[0]).toMatchObject({
      measurementCount: 5,
      excludedCount: 0,
      length: value(7000),
      perimeter: value(278_000),
      area: value(4_368_000_000),
      count: value(3),
    });
    expect(pages!.groups[1]).toMatchObject({
      measurementCount: 3,
      excludedCount: 1,
      length: value(2000),
      count: absent,
    });

    expect(types!.groups.map(({ label }) => label)).toEqual([
      "Line",
      "Polyline",
      "Polygon",
      "Rectangle",
      "Ellipse",
      "Count",
    ]);
    const byLabel = new Map(types!.groups.map((group) => [group.label, group]));
    expect(byLabel.get("Line")).toMatchObject({
      measurementCount: 3,
      excludedCount: 1,
      length: value(7000),
      perimeter: absent,
      area: absent,
    });
    expect(byLabel.get("Polyline")).toMatchObject({ length: value(2000) });
    expect(byLabel.get("Polygon")).toMatchObject({
      length: absent,
      perimeter: value(264_000),
      area: value(4_356_000_000),
    });
    expect(byLabel.get("Rectangle")).toMatchObject({
      perimeter: value(14_000),
      area: value(12_000_000),
    });
    const ellipse = byLabel.get("Ellipse")!;
    expect(ellipse.perimeter.kind === "value" && ellipse.perimeter.value).toBeCloseTo(
      2000 * Math.PI,
      9,
    );
    expect(ellipse.area.kind === "value" && ellipse.area.value).toBeCloseTo(1_000_000 * Math.PI, 6);
    expect(byLabel.get("Count")).toMatchObject({
      count: value(3),
      length: absent,
      perimeter: absent,
      area: absent,
    });
  });

  it("lists classification breakdowns once each, in catalog order, with archived flags", () => {
    const summary = buildTakeoffSummary(project(), {
      breakdowns: [],
      classificationDimensionIds: ["phase", "trade", "phase"],
    });

    expect(summary.breakdowns.map((breakdown) => breakdown.dimension)).toEqual([
      { id: "trade", name: "Trade", archived: false },
      { id: "phase", name: "Phase", archived: true },
    ]);
    const [trade, phase] = summary.breakdowns;
    expect(
      trade!.groups.map(({ label, archived, measurementCount }) => [
        label,
        archived,
        measurementCount,
      ]),
    ).toEqual([
      ["Electrical", false, 3],
      ["Plumbing", true, 1],
      ["Unclassified", false, 4],
    ]);
    expect(trade!.groups[0]).toMatchObject({
      length: value(5000),
      perimeter: value(264_000),
      area: value(4_356_000_000),
      count: value(3),
    });
    expect(phase!.groups.map(({ label, archived }) => [label, archived])).toEqual([
      ["Planned", true],
      ["Unclassified", false],
    ]);
  });

  it("rejects a classification dimension that is not in the catalog", () => {
    expect(() =>
      buildTakeoffSummary(project(), {
        breakdowns: ["page"],
        classificationDimensionIds: ["gone"],
      }),
    ).toThrow("Choose available classification dimensions before exporting the summary.");
  });

  it("returns absent project totals and empty breakdowns for a project without measurements", () => {
    const session = createEmptySession({ name: "empty.pdf", size: 1, lastModified: 1 }, 3);
    session.classificationCatalog = catalog;

    const summary = buildTakeoffSummary(session, {
      breakdowns: ["page", "type"],
      classificationDimensionIds: ["trade"],
    });

    expect(summary.projectTotals).toEqual({
      key: "overall",
      label: "All measurements",
      archived: false,
      measurementCount: 0,
      excludedCount: 0,
      length: absent,
      perimeter: absent,
      area: absent,
      count: absent,
    });
    expect(summary.breakdowns).toEqual([
      { type: "page", dimension: null, groups: [] },
      { type: "type", dimension: null, groups: [] },
      {
        type: "classification",
        dimension: { id: "trade", name: "Trade", archived: false },
        groups: [],
      },
    ]);
  });

  it("uses source page labels when no override names the page", () => {
    const summary = buildTakeoffSummary(
      project(),
      { breakdowns: ["page"], classificationDimensionIds: [] },
      ["Cover", "Plans"],
    );

    expect(summary.breakdowns[0]!.groups.map(({ label }) => label)).toEqual(["Cover", "A-201"]);
  });
});
