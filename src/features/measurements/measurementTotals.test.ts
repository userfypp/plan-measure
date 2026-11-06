import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  PathMeasurement,
  ClassificationCatalog,
  ClassificationValueRates,
  Measurement,
  PageState,
} from "../../types/domain";
import { createMeasurementTotals } from "./measurementTotals";
import { TakeoffWorkspace } from "./TakeoffWorkspace";

const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "old", name: "Old value", archived: true },
      ],
    },
  ],
};

function measurement(
  id: string,
  type: PathMeasurement["type"],
  points: Measurement["points"],
  overrides: Partial<PathMeasurement> = {},
): PathMeasurement {
  return {
    id,
    type,
    name: id,
    points,
    calibrationId: "scale",
    classificationValueIds: [],
    visible: true,
    ...overrides,
  };
}

function page(
  pageNumber: number,
  measurements: Measurement[],
  referenceDistanceMm = 1000,
): PageState {
  return {
    pageNumber,
    calibrations: [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm,
      },
    ],
    activeCalibrationId: "scale",
    nextCalibrationNumber: 2,
    measurements,
    nextMeasurementNumber: {
      line: 1,
      polyline: 1,
      polygon: 1,
      rectangle: 1,
      ellipse: 1,
      cloud: 1,
      count: 1,
    },
  };
}

function totals(
  pages: Record<number, PageState>,
  grouping: "overall" | "page" | "type" | "classification" = "overall",
  classificationDimensionId: string | null = null,
) {
  return createMeasurementTotals({
    pages,
    catalog,
    grouping,
    classificationDimensionId,
    pageLabelOverrides: { 1: "A-101" },
    sourcePageLabels: ["1", "2"],
  });
}

describe("createMeasurementTotals", () => {
  it("separates line and polyline length from polygon perimeter and area, including hidden measurements", () => {
    const result = totals({
      1: page(1, [
        measurement("line-a", "line", [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]),
        measurement(
          "line-b",
          "line",
          [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
          ],
          { visible: false },
        ),
        measurement("polyline", "polyline", [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ]),
        measurement("polygon-a", "polygon", [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ]),
        measurement("polygon-b", "polygon", [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ]),
      ]),
    });
    expect(result.excludedCount).toBe(0);
    expect(result.groups[0]).toMatchObject({
      measurementCount: 5,
      length: { kind: "value", value: 5000 },
      // Two right triangles with 1 m legs: 2 × (1 m + 1 m + √2 m).
      perimeter: { kind: "value", value: expect.closeTo(4000 + 2000 * Math.SQRT2, 9) },
      area: { kind: "value", value: 1000000 },
    });
  });

  it("sums multiple polylines and separately resolved calibrations on one page", () => {
    const secondary = {
      id: "secondary",
      name: "Secondary",
      mode: "uniform" as const,
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 2000,
    };
    const result = totals({
      1: {
        ...page(1, [
          measurement("polyline-a", "polyline", [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ]),
          measurement("polyline-b", "polyline", [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 20, y: 0 },
          ]),
          measurement(
            "secondary-line",
            "line",
            [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
            { calibrationId: "secondary" },
          ),
        ]),
        calibrations: [...page(1, []).calibrations, secondary],
      },
    });
    expect(result.groups[0]?.length).toEqual({ kind: "value", value: 6000 });
  });

  it("uses each page calibration and groups only pages with measurements with effective labels", () => {
    const result = totals(
      {
        1: page(1, [
          measurement("one", "line", [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ]),
        ]),
        2: page(
          2,
          [
            measurement("two", "line", [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ]),
          ],
          2000,
        ),
        3: page(3, []),
      },
      "page",
    );
    expect(result.groups.map((group) => [group.label, group.length])).toEqual([
      ["A-101", { kind: "value", value: 1000 }],
      ["2", { kind: "value", value: 2000 }],
    ]);
  });

  it("groups types in display order and only supplies applicable quantities", () => {
    const result = totals(
      {
        1: page(1, [
          measurement("polygon", "polygon", [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ]),
          measurement("polyline", "polyline", [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ]),
          measurement("line", "line", [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ]),
        ]),
      },
      "type",
    );
    expect(result.groups.map((group) => group.label)).toEqual(["Line", "Polyline", "Polygon"]);
    expect(result.groups[0]?.area).toEqual({ kind: "absent" });
    expect(result.groups[2]?.length).toEqual({ kind: "absent" });
  });

  it("uses catalog ordering, archived status, first matching value, and Unclassified for classification grouping", () => {
    const result = totals(
      {
        1: page(1, [
          measurement("none", "line", [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ]),
          measurement(
            "archived",
            "line",
            [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
            { classificationValueIds: ["old"] },
          ),
          measurement(
            "first",
            "line",
            [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
            { classificationValueIds: ["old", "electrical"] },
          ),
        ]),
      },
      "classification",
      "trade",
    );
    expect(
      result.groups.map((group) => [group.label, group.archived, group.measurementCount]),
    ).toEqual([
      ["Old value", true, 2],
      ["Unclassified", false, 1],
    ]);
  });

  it("marks groups archived when their classification dimension is archived", () => {
    const archivedCatalog: ClassificationCatalog = {
      dimensions: [{ ...catalog.dimensions[0]!, archived: true }],
    };
    const result = createMeasurementTotals({
      pages: {
        1: page(1, [
          measurement(
            "classified",
            "line",
            [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
            { classificationValueIds: ["electrical"] },
          ),
        ]),
      },
      catalog: archivedCatalog,
      grouping: "classification",
      classificationDimensionId: "trade",
      pageLabelOverrides: {},
      sourcePageLabels: null,
    });
    expect(result.groups[0]).toMatchObject({ label: "Electrical", archived: true });
  });

  it("excludes missing calibration and uncalculable geometry without turning totals into zero", () => {
    const invalid = measurement("invalid", "polygon", [
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
    ]);
    const missing = measurement(
      "missing",
      "line",
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { calibrationId: "gone" },
    );
    const result = totals({
      1: page(1, [
        measurement("valid", "line", [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]),
        missing,
        invalid,
      ]),
    });
    expect(result.excludedCount).toBe(2);
    expect(result.groups[0]?.length).toEqual({ kind: "value", value: 1000 });
    expect(result.groups[0]?.perimeter).toEqual({ kind: "absent" });
  });

  it("has an empty result for a project with no measurements", () => {
    expect(totals({ 1: page(1, []) })).toMatchObject({
      measurementCount: 0,
      excludedCount: 0,
      groups: [{ measurementCount: 0, length: { kind: "absent" } }],
    });
  });

  it("marks a non-finite aggregate as unavailable", () => {
    const result = totals({
      1: page(
        1,
        [
          measurement("large-a", "line", [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ]),
          measurement("large-b", "line", [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ]),
        ],
        9e307,
      ),
    });
    expect(result.groups[0]?.length).toEqual({ kind: "unavailable" });
  });

  it("formats takeoff totals with shared unit, area, and precision preferences", () => {
    const pages = {
      1: page(1, [
        measurement("line", "line", [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]),
        measurement("polygon", "polygon", [
          { x: 0, y: 0 },
          { x: 660, y: 0 },
          { x: 660, y: 660 },
          { x: 0, y: 660 },
        ]),
      ]),
    };
    const base = {
      pages,
      catalog,
      pageLabelOverrides: {},
      sourcePageLabels: null,
    };
    expect(
      renderToStaticMarkup(
        createElement(TakeoffWorkspace, {
          ...base,
          displayUnit: "m",
          decimalPlaces: 3,
          areaDisplay: "auto",
        }),
      ),
    ).toContain("1.000 m");
    expect(
      renderToStaticMarkup(
        createElement(TakeoffWorkspace, {
          ...base,
          displayUnit: "ft",
          decimalPlaces: 1,
          areaDisplay: "auto",
        }),
      ),
    ).toContain("3.3 ft");
    expect(
      renderToStaticMarkup(
        createElement(TakeoffWorkspace, {
          ...base,
          displayUnit: "ft-in",
          decimalPlaces: 2,
          areaDisplay: "auto",
        }),
      ),
    ).toContain("3&#x27; 3 3/8&quot;");
    expect(
      renderToStaticMarkup(
        createElement(TakeoffWorkspace, {
          ...base,
          displayUnit: "ft",
          decimalPlaces: 2,
          areaDisplay: "ac",
        }),
      ),
    ).toContain("ac");
  });
});

describe("exclusions and mixed inputs", () => {
  it("reports exclusion causes without changing calculation or grouping semantics", () => {
    const missing = measurement(
      "missing",
      "line",
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { calibrationId: "gone" },
    );
    const invalid = measurement("invalid", "line", [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    const badScale = page(
      2,
      [
        measurement("bad-scale", "line", [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]),
      ],
      0,
    );
    const huge = page(
      3,
      [
        measurement("overflow", "line", [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ]),
      ],
      1e308,
    );
    const result = totals({ 1: page(1, [missing, invalid]), 2: badScale, 3: huge });
    expect(
      result.excludedMeasurements.map((source) => [
        source.pageNumber,
        source.measurement.id,
        source.exclusionReason,
      ]),
    ).toEqual([
      [1, "missing", "missing-scale"],
      [1, "invalid", "invalid-geometry"],
      [2, "bad-scale", "invalid-scale"],
      [3, "overflow", "nonfinite-result"],
    ]);
    expect(result.sourcesByGroup.get("overall")).toHaveLength(4);
    expect(result.groups[0]!.length).toEqual({ kind: "absent" });
    expect(result.excludedCount).toBe(4);
  });

  it("sums uniform and X/Y scales on the same page with each measurement's own scale", () => {
    const xy = {
      id: "xy",
      name: "X/Y",
      mode: "xy" as const,
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 },
      yReference: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, referenceDistanceMm: 3000 },
    };
    const base = page(1, [
      // Uniform, 100 mm per unit: 2 m × 1 m.
      measurement("uniform-rectangle", "rectangle", [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
      ]),
      // X/Y, 100 mm across and 300 mm down per unit: the same box is 2 m × 3 m.
      measurement(
        "xy-rectangle",
        "rectangle",
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 10 },
          { x: 0, y: 10 },
        ],
        { calibrationId: "xy" },
      ),
      // X/Y, 10 units down: 3 m.
      measurement(
        "xy-line",
        "line",
        [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ],
        { calibrationId: "xy" },
      ),
    ]);
    const result = totals({ 1: { ...base, calibrations: [...base.calibrations, xy] } }, "type");

    expect(
      result.groups.map((group) => [group.label, group.length, group.perimeter, group.area]),
    ).toEqual([
      ["Line", { kind: "value", value: 3000 }, { kind: "absent" }, { kind: "absent" }],
      [
        "Rectangle",
        { kind: "absent" },
        { kind: "value", value: 6000 + 10000 },
        { kind: "value", value: 2_000_000 + 6_000_000 },
      ],
    ]);
  });

  it("counts hidden Count markers and excludes a Count without points", () => {
    const count = (id: string, points: Measurement["points"], visible = true): Measurement => ({
      id,
      name: id,
      type: "count",
      points,
      calibrationId: null,
      classificationValueIds: [],
      visible,
    });
    const result = totals({
      1: page(1, [
        count("visible", [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ]),
        count("hidden", [{ x: 3, y: 3 }], false),
        count("empty", []),
      ]),
    });

    expect(result.groups[0]).toMatchObject({
      measurementCount: 3,
      excludedCount: 1,
      count: { kind: "value", value: 3 },
      length: { kind: "absent" },
    });
    expect(result.excludedMeasurements.map((source) => source.exclusionReason)).toEqual([
      "invalid-geometry",
    ]);
  });

  it("excludes a Count with a non-finite marker and counts stacked markers one by one", () => {
    const count = (id: string, points: Measurement["points"]): Measurement => ({
      id,
      name: id,
      type: "count",
      points,
      calibrationId: null,
      classificationValueIds: [],
      visible: true,
    });
    const result = totals({
      1: page(1, [
        // Three markers on the same spot are three items.
        count("stacked", [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ]),
        count("nan", [
          { x: 1, y: 1 },
          { x: Number.NaN, y: 2 },
        ]),
        count("infinite", [
          { x: 1, y: 1 },
          { x: 2, y: Number.POSITIVE_INFINITY },
          { x: 3, y: 3 },
        ]),
      ]),
    });

    // Only the stacked Count adds items: 3, not 3 + 2 + 3 = 8.
    expect(result.groups[0]).toMatchObject({
      measurementCount: 3,
      excludedCount: 2,
      count: { kind: "value", value: 3 },
    });
    expect(
      result.excludedMeasurements.map(({ measurement, exclusionReason }) => [
        measurement.id,
        exclusionReason,
      ]),
    ).toEqual([
      ["nan", "invalid-geometry"],
      ["infinite", "invalid-geometry"],
    ]);
  });
});

describe("revision clouds in totals", () => {
  const triangle = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  const scaledCloud = measurement("cloud-scaled", "cloud", triangle);
  const freeCloud = measurement("cloud-free", "cloud", triangle, { calibrationId: null });
  const polygon = measurement("polygon", "polygon", triangle);
  const pages = { 1: page(1, [scaledCloud, freeCloud, polygon]) };
  const compute = (measureClouds: boolean, grouping: "overall" | "type" = "overall") =>
    createMeasurementTotals({
      pages,
      catalog,
      grouping,
      classificationDimensionId: null,
      pageLabelOverrides: {},
      sourcePageLabels: null,
      measureClouds,
    });

  it("adds nothing for clouds when the project does not measure them, without excluding them", () => {
    const result = compute(false);
    expect(result.excludedCount).toBe(0);
    expect(result.groups[0]).toMatchObject({
      measurementCount: 3,
      excludedCount: 0,
      area: { kind: "value", value: 500000 },
    });
  });

  it("does not make a group of unmeasured clouds look like zero", () => {
    const result = createMeasurementTotals({
      pages: { 1: page(1, [scaledCloud, freeCloud]) },
      catalog,
      grouping: "type",
      classificationDimensionId: null,
      pageLabelOverrides: {},
      sourcePageLabels: null,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      key: "type:cloud",
      measurementCount: 2,
      excludedCount: 0,
      length: { kind: "absent" },
      perimeter: { kind: "absent" },
      area: { kind: "absent" },
      count: { kind: "absent" },
    });
  });

  it("includes measured clouds, but a cloud without a scale stays unmeasured", () => {
    const result = compute(true);
    expect(result.excludedCount).toBe(0);
    expect(result.groups[0]).toMatchObject({
      measurementCount: 3,
      excludedCount: 0,
      area: { kind: "value", value: 1000000 },
    });
    const clouds = compute(true, "type").groups.find((group) => group.key === "type:cloud");
    expect(clouds).toMatchObject({ area: { kind: "value", value: 500000 } });
  });
});

describe("derived quantities", () => {
  const derivedCatalog: ClassificationCatalog = {
    dimensions: [
      {
        id: "element",
        name: "Element",
        archived: false,
        values: [
          { id: "wall", name: "Wall", archived: false },
          { id: "slab", name: "Slab", archived: false },
        ],
      },
      {
        id: "finish",
        name: "Finish",
        archived: false,
        values: [{ id: "paint", name: "Paint", archived: false }],
      },
      {
        id: "fixture",
        name: "Fixture",
        archived: false,
        values: [{ id: "socket", name: "Socket", archived: false }],
      },
    ],
  };
  const factor = (
    valueId: string,
    source: "length" | "perimeter" | "area",
    factorMm: number,
  ): ClassificationValueRates => ({
    valueId,
    derivation: { source, factorMm },
    price: null,
  });
  const wallHeight = factor("wall", "length", 2700);
  const slabThickness = factor("slab", "area", 150);
  const line = (units: number, overrides: Partial<PathMeasurement> = {}) =>
    measurement(
      `line-${units}`,
      "line",
      [
        { x: 0, y: 0 },
        { x: units, y: 0 },
      ],
      overrides,
    );
  const box = (width: number, height: number): Measurement["points"] => [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  function derived(
    pages: Record<number, PageState>,
    rates: readonly ClassificationValueRates[],
    grouping: "overall" | "page" | "type" | "classification" = "overall",
    classificationDimensionId: string | null = null,
  ) {
    return createMeasurementTotals({
      pages,
      catalog: derivedCatalog,
      grouping,
      classificationDimensionId,
      pageLabelOverrides: {},
      sourcePageLabels: null,
      rates,
    });
  }
  const value = (amount: number) => ({ kind: "value", value: amount });
  const absent = { kind: "absent" };

  it("derives an area from a length once the value's lengths are summed, with the factor applied exactly", () => {
    // 125 units at 100 mm per unit are 12 500 mm; 12 500 mm × 2700 mm = 33 750 000 mm² (33.75 m²).
    const group = derived({ 1: page(1, [line(125, { classificationValueIds: ["wall"] })]) }, [
      wallHeight,
    ]).groups[0]!;
    expect(group.length).toEqual(value(12500));
    expect(group.derivedArea).toEqual(value(33_750_000));
    expect(group.derivedVolume).toEqual(absent);
    expect(Object.is((group.derivedArea as { value: number }).value, 12500 * 2700)).toBe(true);
  });

  it("derives a volume from an area and leaves the derived area untouched", () => {
    // 40 × 50 units are 4000 × 5000 mm = 20 m²; 20 000 000 mm² × 150 mm = 3 000 000 000 mm³ (3 m³).
    const group = derived(
      {
        1: page(1, [
          measurement("slab", "polygon", box(40, 50), { classificationValueIds: ["slab"] }),
        ]),
      },
      [slabThickness],
    ).groups[0]!;
    expect(group.area).toEqual(value(20_000_000));
    expect(group.derivedVolume).toEqual(value(3_000_000_000));
    expect(group.derivedArea).toEqual(absent);
  });

  it("derives an area from a perimeter and ignores the length and area bases", () => {
    // A 3000 × 4000 mm rectangle has a 14 000 mm perimeter; × 2700 mm = 37 800 000 mm².
    const result = derived(
      {
        1: page(1, [
          measurement("room", "polygon", box(30, 40), { classificationValueIds: ["wall"] }),
        ]),
      },
      [factor("wall", "perimeter", 2700)],
    ).groups[0]!;
    expect(result.derivedArea).toEqual(value(37_800_000));
    expect(result.derivedVolume).toEqual(absent);
  });

  it("includes hidden measurements but not those that cannot be calculated", () => {
    const base = line(125, { classificationValueIds: ["wall"] });
    const pages = (extra: Measurement[]) => ({ 1: page(1, [base, ...extra]) });
    // A hidden 1000 mm wall adds 1000 × 2700 = 2 700 000 mm².
    const hidden = derived(
      pages([line(10, { id: "hidden", visible: false, classificationValueIds: ["wall"] })]),
      [wallHeight],
    );
    expect(hidden.groups[0]!.derivedArea).toEqual(value(36_450_000));
    // A wall without a scale contributes nothing and is counted as excluded, not as zero.
    const unscaled = derived(
      pages([line(10, { id: "no-scale", calibrationId: null, classificationValueIds: ["wall"] })]),
      [wallHeight],
    );
    expect(unscaled.groups[0]!.derivedArea).toEqual(value(33_750_000));
    expect(unscaled.excludedCount).toBe(1);
    expect(unscaled.groups[0]!.excludedCount).toBe(1);
  });

  it("includes values and groups that are archived", () => {
    const archived: ClassificationCatalog = {
      dimensions: [
        {
          ...derivedCatalog.dimensions[0]!,
          archived: true,
          values: [{ id: "wall", name: "Wall", archived: true }],
        },
      ],
    };
    const result = createMeasurementTotals({
      pages: { 1: page(1, [line(125, { classificationValueIds: ["wall"] })]) },
      catalog: archived,
      grouping: "classification",
      classificationDimensionId: "element",
      pageLabelOverrides: {},
      sourcePageLabels: null,
      rates: [wallHeight],
    });
    expect(result.groups[0]).toMatchObject({
      archived: true,
      derivedArea: value(33_750_000),
    });
  });

  it("sums a value's bases first and multiplies once", () => {
    // Scale 0.1 mm per unit: lines of 0.1 mm and 0.2 mm sum to 0.30000000000000004 mm, and
    // 2.7 × that is 0.8100000000000002 (multiplying each line first would give 0.81).
    const tiny = (units: number) =>
      line(units, { id: `tiny-${units}`, classificationValueIds: ["wall"] });
    const group = derived({ 1: page(1, [tiny(1), tiny(2)], 1) }, [factor("wall", "length", 2.7)])
      .groups[0]!;
    expect(group.length).toEqual(value(0.30000000000000004));
    expect(group.derivedArea).toEqual(value(0.8100000000000002));
  });

  it("adds the rates of values from different dimensions on the same measurement", () => {
    // Wall ×2700 and Paint ×100 both apply to one 12 500 mm line:
    // 33 750 000 + 1 250 000 = 35 000 000 mm².
    const group = derived(
      { 1: page(1, [line(125, { classificationValueIds: ["wall", "paint"] })]) },
      [wallHeight, factor("paint", "length", 100)],
    ).groups[0]!;
    expect(group.derivedArea).toEqual(value(35_000_000));
  });

  it("derives nothing without rates, without a factor, or for markup and counts", () => {
    const pages = {
      1: page(1, [
        line(125, { classificationValueIds: ["wall"] }),
        {
          id: "count",
          name: "count",
          type: "count",
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
          calibrationId: null,
          classificationValueIds: ["slab"],
          visible: true,
        },
      ]),
    };
    const quantities = (rates?: readonly ClassificationValueRates[]) => {
      const group = createMeasurementTotals({
        pages,
        catalog: derivedCatalog,
        grouping: "overall",
        classificationDimensionId: null,
        pageLabelOverrides: {},
        sourcePageLabels: null,
        rates,
      }).groups[0]!;
      return [group.derivedArea, group.derivedVolume];
    };
    expect(quantities()).toEqual([absent, absent]);
    expect(quantities([])).toEqual([absent, absent]);
    // A price-only entry has no factor.
    expect(
      quantities([
        { valueId: "wall", derivation: null, price: { amount: 5, basis: "length", unit: "m" } },
      ]),
    ).toEqual([absent, absent]);
    // A count has no length, perimeter or area, and a line has neither perimeter nor area.
    expect(quantities([factor("slab", "area", 150), factor("wall", "perimeter", 2700)])).toEqual([
      absent,
      absent,
    ]);
    // A value that no measurement carries leaves the quantities absent.
    expect(quantities([factor("paint", "length", 100)])).toEqual([absent, absent]);
  });

  it("derives from a revision cloud only when the project measures clouds", () => {
    const cloudPages = {
      1: page(1, [
        measurement("cloud", "cloud", box(10, 10), { classificationValueIds: ["wall"] }),
      ]),
    };
    const cloudArea = (measureClouds: boolean) =>
      createMeasurementTotals({
        pages: cloudPages,
        catalog: derivedCatalog,
        grouping: "overall",
        classificationDimensionId: null,
        pageLabelOverrides: {},
        sourcePageLabels: null,
        measureClouds,
        rates: [factor("wall", "perimeter", 2700)],
      }).groups[0]!.derivedArea;
    expect(cloudArea(false)).toEqual(absent);
    // A 1000 × 1000 mm cloud has a 4000 mm perimeter; × 2700 mm = 10 800 000 mm².
    expect(cloudArea(true)).toEqual(value(10_800_000));
  });

  it("reports an overflowing factor or base as unavailable, and it wins over valid values", () => {
    const wallLine = line(10, { classificationValueIds: ["wall", "paint"] });
    // 1e308 × 1000 mm overflows.
    const overflow = derived({ 1: page(1, [wallLine]) }, [factor("wall", "length", 1e308)]);
    expect(overflow.groups[0]!.derivedArea).toEqual({ kind: "unavailable" });
    // Paint alone is fine (1000 × 100 = 100 000 mm²), but the unavailable Wall makes the sum so.
    const mixed = derived({ 1: page(1, [wallLine]) }, [
      factor("wall", "length", 1e308),
      factor("paint", "length", 100),
    ]);
    expect(mixed.groups[0]!.derivedArea).toEqual({ kind: "unavailable" });
    const paintOnly = derived({ 1: page(1, [wallLine]) }, [factor("paint", "length", 100)]);
    expect(paintOnly.groups[0]!.derivedArea).toEqual(value(100_000));
    // An unavailable base (9e307 mm twice) cannot be multiplied.
    const large = [0, 1].map((index) =>
      line(10, { id: `large-${index}`, classificationValueIds: ["wall"] }),
    );
    expect(derived({ 1: page(1, large, 9e307) }, [wallHeight]).groups[0]!.derivedArea).toEqual({
      kind: "unavailable",
    });
  });

  it("splits derived quantities across any breakdown so the rows add up to the project total", () => {
    const pages = {
      1: page(1, [
        line(125, { id: "wall-line", classificationValueIds: ["wall", "paint"] }),
        measurement("slab", "polygon", box(40, 50), { classificationValueIds: ["slab"] }),
      ]),
      2: page(2, [
        line(10, { id: "hidden-wall", visible: false, classificationValueIds: ["wall"] }),
        line(30, { id: "bare" }),
      ]),
    };
    const rates = [wallHeight, slabThickness, factor("paint", "length", 100)];
    const quantities = (
      grouping: "overall" | "page" | "type" | "classification",
      dimensionId: string | null = null,
    ) =>
      derived(pages, rates, grouping, dimensionId).groups.map((group) => [
        group.label,
        group.derivedArea,
        group.derivedVolume,
      ]);
    // Walls: (12 500 + 1000) × 2700 = 36 450 000; Paint: 12 500 × 100 = 1 250 000.
    expect(quantities("overall")).toEqual([
      ["All measurements", value(37_700_000), value(3_000_000_000)],
    ]);
    expect(quantities("page")).toEqual([
      ["Page 1", value(35_000_000), value(3_000_000_000)],
      ["Page 2", value(2_700_000), absent],
    ]);
    expect(quantities("type")).toEqual([
      ["Line", value(37_700_000), absent],
      ["Polygon", absent, value(3_000_000_000)],
    ]);
    // The Wall row carries both the wall and paint of its lines; the bare line contributes nothing.
    expect(quantities("classification", "element")).toEqual([
      ["Wall", value(37_700_000), absent],
      ["Slab", absent, value(3_000_000_000)],
      ["Unclassified", absent, absent],
    ]);
    expect(quantities("classification", "finish")).toEqual([
      ["Paint", value(35_000_000), absent],
      ["Unclassified", value(2_700_000), value(3_000_000_000)],
    ]);
  });

  describe("cost", () => {
    type Basis = "length" | "perimeter" | "area" | "count" | "derived";
    const priced = (
      valueId: string,
      amount: number,
      basis: Basis,
      unit: string,
      derivation: ClassificationValueRates["derivation"] = null,
    ): ClassificationValueRates => ({
      valueId,
      derivation,
      price: { amount, basis, unit } as ClassificationValueRates["price"],
    });
    // Wall 25 per m² of its derived area; Slab 110 per m³ of its derived volume.
    const wallPrice = priced("wall", 25, "derived", "m²", wallHeight.derivation);
    const slabPrice = priced("slab", 110, "derived", "m³", slabThickness.derivation);
    const wallLine = (extra: Partial<PathMeasurement> = {}) =>
      line(125, { classificationValueIds: ["wall"], ...extra });
    const slab = () =>
      measurement("slab", "polygon", box(40, 50), { classificationValueIds: ["slab"] });
    const count = (id: string, points: number, valueIds: string[]): Measurement => ({
      id,
      name: id,
      type: "count",
      points: Array.from({ length: points }, (_, index) => ({ x: index, y: index })),
      calibrationId: null,
      classificationValueIds: valueIds,
      visible: true,
    });
    const projectCost = (
      pages: Record<number, PageState>,
      rates: readonly ClassificationValueRates[],
    ) => derived(pages, rates).groups[0]!.cost;
    const costs = (
      pages: Record<number, PageState>,
      rates: readonly ClassificationValueRates[],
      grouping: "overall" | "page" | "type" | "classification",
      dimensionId: string | null = null,
    ) =>
      derived(pages, rates, grouping, dimensionId).groups.map((group) => [group.label, group.cost]);

    it("prices the derived area and volume: 33.75 m² at 25 and 3 m³ at 110 are 843.75 and 330", () => {
      // Wall: 12 500 mm × 2700 mm = 33.75 m². Slab: 4000 × 5000 mm = 20 m² × 150 mm = 3 m³.
      const pages = { 1: page(1, [wallLine(), slab()]) };
      const rates = [wallPrice, slabPrice];
      expect(costs(pages, rates, "classification", "element")).toEqual([
        ["Wall", value(843.75)],
        ["Slab", value(330)],
      ]);
      expect(projectCost(pages, rates)).toEqual(value(1173.75));
    });

    it("prices a count per item", () => {
      const pages = { 1: page(1, [count("outlets", 3, ["socket"])]) };
      expect(projectCost(pages, [priced("socket", 12.5, "count", "each")])).toEqual(value(37.5));
    });

    it("prices lengths, perimeters and areas directly", () => {
      // The box is 1000 × 2000 mm: 6000 mm of perimeter and 2 m² of area.
      const pages = {
        1: page(1, [
          wallLine(),
          measurement("floor", "polygon", box(10, 20), { classificationValueIds: ["slab"] }),
        ]),
      };
      expect(projectCost(pages, [priced("wall", 4, "length", "m")])).toEqual(value(50));
      expect(projectCost(pages, [priced("slab", 4, "perimeter", "m")])).toEqual(value(24));
      expect(projectCost(pages, [priced("slab", 4, "area", "m²")])).toEqual(value(8));
    });

    it.each([
      // [unit, mm covered by 10 page units, amount, cost of that 10-unit line]
      ["mm", 2500, 4, 10_000],
      ["cm", 2500, 4, 1000],
      ["m", 2500, 4, 10],
      ["in", 254, 4, 40],
      ["ft", 3048, 4, 40],
    ] as const)("converts a length to %s before applying the price", (unit, mm, amount, cost) => {
      const pages = { 1: page(1, [line(10, { classificationValueIds: ["wall"] })], mm) };
      expect(projectCost(pages, [priced("wall", amount, "length", unit)])).toEqual(value(cost));
    });

    it.each([
      // A square of 10 units covers (mm)² mm², where 10 units are mm millimetres.
      ["mm²", 100, 3, 30_000],
      ["cm²", 100, 3, 300],
      ["in²", 254, 3, 300],
      ["ft²", 3048, 4, 400],
    ] as const)("converts an area to %s before applying the price", (unit, mm, amount, cost) => {
      const pages = {
        1: page(
          1,
          [measurement("area", "polygon", box(10, 10), { classificationValueIds: ["wall"] })],
          mm,
        ),
      };
      expect(projectCost(pages, [priced("wall", amount, "area", unit)])).toEqual(value(cost));
    });

    it("converts square millimetres to m² and to acres without rounding", () => {
      // 100 ft × 100 ft = 9 290 304 mm² = 9.290304 m².
      const square = {
        1: page(
          1,
          [measurement("area", "polygon", box(10, 10), { classificationValueIds: ["wall"] })],
          3048,
        ),
      };
      const squareMetres = projectCost(square, [priced("wall", 4, "area", "m²")]) as {
        value: number;
      };
      expect(squareMetres.value).toBeCloseTo(37.161216, 9);
      // 330 ft × 132 ft = 43 560 ft² is exactly one acre.
      const acre = {
        1: page(
          1,
          [measurement("area", "polygon", box(330, 132), { classificationValueIds: ["wall"] })],
          3048,
        ),
      };
      const acres = projectCost(acre, [priced("wall", 1000, "area", "ac")]) as { value: number };
      expect(acres.value).toBeCloseTo(1000, 6);
    });

    it("converts the derived area to cm² and the derived volume to ft³", () => {
      // 33 750 000 mm² = 337 500 cm². 3e9 mm³ is 3e9 / 28 316 846.592 = 105.944 ft³.
      expect(
        projectCost({ 1: page(1, [wallLine()]) }, [
          priced("wall", 0.5, "derived", "cm²", wallHeight.derivation),
        ]),
      ).toEqual(value(168_750));
      const cubicFeet = projectCost({ 1: page(1, [slab()]) }, [
        priced("slab", 2, "derived", "ft³", slabThickness.derivation),
      ]) as { value: number };
      expect(cubicFeet.value).toBeCloseTo(211.888, 3);
    });

    it("sums a value's quantities first and multiplies by the price once", () => {
      // 0.1 mm + 0.2 mm = 0.30000000000000004 mm; × 7 gives 2.1000000000000005, while pricing
      // each line first would give 2.1.
      const tiny = (units: number) =>
        line(units, { id: `tiny-${units}`, classificationValueIds: ["wall"] });
      expect(
        projectCost({ 1: page(1, [tiny(1), tiny(2)], 1) }, [priced("wall", 7, "length", "mm")]),
      ).toEqual(value(2.1000000000000005));
    });

    it("keeps the full precision of the cost instead of rounding it", () => {
      // The 12.5 m line at 0.3333 per m costs 4.16625, not 4.17; at 0.0123 per mm it costs 153.75.
      const pages = { 1: page(1, [wallLine()]) };
      const cost = projectCost(pages, [priced("wall", 0.3333, "length", "m")]);
      expect((cost as { value: number }).value).toBeCloseTo(4.16625, 12);
      const perMillimetre = projectCost(pages, [priced("wall", 0.0123, "length", "mm")]);
      expect((perMillimetre as { value: number }).value).toBeCloseTo(153.75, 10);
    });

    it("adds the prices of all the values of a measurement", () => {
      // The 12.5 m line is a Wall at 4 per m and Paint at 1 per m: 50 + 12.5.
      const pages = { 1: page(1, [wallLine({ classificationValueIds: ["wall", "paint"] })]) };
      expect(
        projectCost(pages, [priced("wall", 4, "length", "m"), priced("paint", 1, "length", "m")]),
      ).toEqual(value(62.5));
    });

    it("applies the price of a second dimension to the same wall: Paint 4 per m² adds 135", () => {
      // Paint uses the same 2700 mm: 33.75 m² × 4 = 135, on top of the Wall 843.75.
      const pages = { 1: page(1, [wallLine({ classificationValueIds: ["wall", "paint"] })]) };
      const rates = [
        wallPrice,
        priced("paint", 4, "derived", "m²", factor("paint", "length", 2700).derivation),
      ];
      expect(projectCost(pages, rates)).toEqual(value(978.75));
      expect(costs(pages, rates, "classification", "element")).toEqual([["Wall", value(978.75)]]);
      expect(costs(pages, [rates[1]!], "overall")).toEqual([["All measurements", value(135)]]);
    });

    it("makes the rows of every breakdown add up to the project total", () => {
      // Page 1: Wall 843.75 + Paint 135 + Slab 330; page 2: a hidden 1000 mm wall, 2.7 m² × 25 = 67.5.
      const pages = {
        1: page(1, [
          wallLine({ id: "wall-line", classificationValueIds: ["wall", "paint"] }),
          slab(),
        ]),
        2: page(2, [
          line(10, { id: "hidden-wall", visible: false, classificationValueIds: ["wall"] }),
          line(30, { id: "bare" }),
        ]),
      };
      const rates = [
        wallPrice,
        slabPrice,
        priced("paint", 4, "derived", "m²", factor("paint", "length", 2700).derivation),
      ];
      expect(costs(pages, rates, "overall")).toEqual([["All measurements", value(1376.25)]]);
      expect(costs(pages, rates, "page")).toEqual([
        ["Page 1", value(1308.75)],
        ["Page 2", value(67.5)],
      ]);
      expect(costs(pages, rates, "type")).toEqual([
        ["Line", value(1046.25)],
        ["Polygon", value(330)],
      ]);
      expect(costs(pages, rates, "classification", "element")).toEqual([
        ["Wall", value(1046.25)],
        ["Slab", value(330)],
        ["Unclassified", absent],
      ]);
      expect(costs(pages, rates, "classification", "finish")).toEqual([
        ["Paint", value(978.75)],
        ["Unclassified", value(397.5)],
      ]);
    });

    it("has a zero price cost nothing and no price leave the cost absent", () => {
      const pages = { 1: page(1, [wallLine()]) };
      expect(projectCost(pages, [priced("wall", 0, "length", "m")])).toEqual(value(0));
      expect(projectCost(pages, [wallHeight])).toEqual(absent);
      expect(projectCost(pages, [])).toEqual(absent);
      // A priced value that no measurement carries leaves it absent, even at price zero.
      expect(projectCost(pages, [priced("slab", 0, "area", "m²")])).toEqual(absent);
      // Pricing something the measurement does not have (an area for a line) is absent too.
      expect(projectCost(pages, [priced("wall", 5, "area", "m²")])).toEqual(absent);
    });

    it("includes hidden and archived measurements", () => {
      const hidden = {
        1: page(1, [
          wallLine(),
          line(10, { id: "hidden", visible: false, classificationValueIds: ["wall"] }),
        ]),
      };
      // 12 500 + 1000 mm × 2700 mm = 36.45 m² at 25 (the hidden wall adds 67.5).
      expect((projectCost(hidden, [wallPrice]) as { value: number }).value).toBeCloseTo(911.25, 9);
      const archived: ClassificationCatalog = {
        dimensions: [
          {
            ...derivedCatalog.dimensions[0]!,
            archived: true,
            values: [{ id: "wall", name: "Wall", archived: true }],
          },
        ],
      };
      const result = createMeasurementTotals({
        pages: { 1: page(1, [wallLine()]) },
        catalog: archived,
        grouping: "classification",
        classificationDimensionId: "element",
        pageLabelOverrides: {},
        sourcePageLabels: null,
        rates: [wallPrice],
      });
      expect(result.groups[0]).toMatchObject({ archived: true, cost: value(843.75) });
    });

    it("leaves out measurements that cannot be calculated without changing the excluded count", () => {
      const pages = {
        1: page(1, [
          wallLine(),
          line(10, { id: "no-scale", calibrationId: null, classificationValueIds: ["wall"] }),
        ]),
      };
      const result = derived(pages, [wallPrice]);
      expect(result.groups[0]!.cost).toEqual(value(843.75));
      expect(result.groups[0]!.excludedCount).toBe(1);
      expect(result.excludedCount).toBe(1);
    });

    it("reports a price that overflows as unavailable, and it wins over the valid prices", () => {
      // 1e308 per mm² on 1000 mm² overflows.
      const small = {
        1: page(
          1,
          [
            measurement("small", "polygon", box(100, 10), {
              classificationValueIds: ["wall", "paint"],
            }),
          ],
          10,
        ),
      };
      expect(projectCost(small, [priced("wall", 1e308, "area", "mm²")])).toEqual({
        kind: "unavailable",
      });
      expect(
        projectCost(small, [
          priced("wall", 1e308, "area", "mm²"),
          priced("paint", 1, "area", "mm²"),
        ]),
      ).toEqual({ kind: "unavailable" });
      expect(projectCost(small, [priced("paint", 1, "area", "mm²")])).toEqual(value(1000));
    });

    it("reports an unavailable quantity as unavailable", () => {
      const large = [0, 1].map((index) =>
        line(10, { id: `large-${index}`, classificationValueIds: ["wall"] }),
      );
      const pages = { 1: page(1, large, 9e307) };
      expect(projectCost(pages, [priced("wall", 1, "length", "mm")])).toEqual({
        kind: "unavailable",
      });
      expect(projectCost(pages, [wallPrice])).toEqual({ kind: "unavailable" });
    });

    it("reports a price by derived quantity without a derivation as unavailable", () => {
      const pages = { 1: page(1, [wallLine()]) };
      expect(projectCost(pages, [priced("wall", 25, "derived", "m²")])).toEqual({
        kind: "unavailable",
      });
    });
  });
});
