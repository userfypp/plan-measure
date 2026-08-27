import { describe, expect, it } from "vitest";
import type { ClassificationCatalog, Measurement } from "../../types/domain";
import { createMeasurementGroups } from "./measurementGrouping";

const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [
        { id: "electrical", name: "Electrical", archived: false },
        { id: "plumbing", name: "Plumbing", archived: true },
        { id: "unused", name: "Unused", archived: false },
      ],
    },
    {
      id: "status",
      name: "Status",
      archived: false,
      values: [{ id: "approved", name: "Approved", archived: false }],
    },
  ],
};

function measurement(id: string, classificationValueIds: string[], visible = true): Measurement {
  return {
    id,
    type: "line",
    name: id,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    calibrationId: "scale-1",
    classificationValueIds,
    visible,
  };
}

describe("createMeasurementGroups", () => {
  it("groups by the chosen dimension in catalog and page order, with Unclassified last", () => {
    const groups = createMeasurementGroups(
      [
        measurement("line-1", ["electrical", "approved"]),
        measurement("line-2", []),
        measurement("line-3", ["plumbing"]),
        measurement("line-4", ["electrical"]),
      ],
      catalog,
      "trade",
    );

    expect(groups.map((group) => group.label)).toEqual(["Electrical", "Plumbing", "Unclassified"]);
    expect(groups.map((group) => group.measurementIds)).toEqual([
      ["line-1", "line-4"],
      ["line-3"],
      ["line-2"],
    ]);
    expect(groups.flatMap((group) => group.measurementIds)).toEqual([
      "line-1",
      "line-4",
      "line-3",
      "line-2",
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "dimension:trade:value:electrical",
      "dimension:trade:value:plumbing",
      "dimension:trade:unclassified",
    ]);
  });

  it("places every measurement exactly once according to the selected dimension", () => {
    const measurements = [
      measurement("line-1", ["electrical", "approved"]),
      measurement("line-2", ["approved"]),
    ];

    expect(createMeasurementGroups(measurements, catalog, "trade")).toMatchObject([
      { label: "Electrical", measurementIds: ["line-1"] },
      { label: "Unclassified", measurementIds: ["line-2"] },
    ]);
    expect(createMeasurementGroups(measurements, catalog, "status")).toMatchObject([
      { label: "Approved", measurementIds: ["line-1", "line-2"] },
    ]);
  });

  it("derives archive state and visibility without treating Unclassified as historical", () => {
    const tradeDimension = catalog.dimensions[0]!;
    const archivedCatalog: ClassificationCatalog = {
      dimensions: [{ ...tradeDimension, archived: true }],
    };
    const groups = createMeasurementGroups(
      [
        measurement("visible", ["electrical"]),
        measurement("hidden", ["electrical"], false),
        measurement("other", []),
      ],
      archivedCatalog,
      "trade",
    );

    expect(groups).toMatchObject([
      { label: "Electrical", archived: true, visibility: "mixed" },
      { label: "Unclassified", archived: false, visibility: "visible" },
    ]);
    expect(
      createMeasurementGroups(
        [
          measurement("visible-1", ["electrical"]),
          measurement("visible-2", ["electrical"]),
        ],
        catalog,
        "trade",
      )[0]?.visibility,
    ).toBe("visible");
    expect(
      createMeasurementGroups(
        [
          measurement("hidden-1", ["electrical"], false),
          measurement("hidden-2", ["electrical"], false),
        ],
        catalog,
        "trade",
      )[0]?.visibility,
    ).toBe("hidden");
    expect(
      createMeasurementGroups([measurement("legacy", ["plumbing"])], catalog, "trade")[0],
    ).toMatchObject({ archived: true });
  });

  it("returns no groups for an unavailable dimension", () => {
    expect(createMeasurementGroups([measurement("line-1", [])], catalog, "missing")).toEqual([]);
  });
});
