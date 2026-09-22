import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClassificationCatalog, Measurement, PageState } from "../../types/domain";
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
  type: Measurement["type"],
  points: Measurement["points"],
  overrides: Partial<Measurement> = {},
): Measurement {
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
    nextMeasurementNumber: { line: 1, polyline: 1, polygon: 1 },
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
      perimeter: { kind: "value", value: expect.any(Number) },
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

  it("uses catalog ordering, archived status, first matching value, and None assigned for classification grouping", () => {
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
      ["None assigned", false, 1],
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
