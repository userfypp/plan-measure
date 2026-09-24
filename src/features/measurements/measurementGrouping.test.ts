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
  it("groups by the chosen dimension in catalog and page order, with None assigned last", () => {
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

    expect(groups.map((group) => group.label)).toEqual(["Electrical", "Plumbing", "None assigned"]);
    expect(groups.map((group) => group.dimensionLabel)).toEqual(["Trade", "Trade", "Trade"]);
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
      { label: "None assigned", measurementIds: ["line-2"] },
    ]);
    expect(createMeasurementGroups(measurements, catalog, "status")).toMatchObject([
      { label: "Approved", measurementIds: ["line-1", "line-2"] },
    ]);
  });

  it("derives archive state and visibility without treating None assigned as historical", () => {
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
      { label: "None assigned", archived: false, visibility: "visible" },
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

  it("distinguishes a real Unclassified value from the synthetic unassigned group", () => {
    const collisionCatalog: ClassificationCatalog = {
      dimensions: [
        {
          id: "status",
          name: "Status",
          archived: false,
          values: [{ id: "unclassified", name: "Unclassified", archived: false }],
        },
      ],
    };

    const groups = createMeasurementGroups(
      [measurement("assigned", ["unclassified"]), measurement("unassigned", [])],
      collisionCatalog,
      "status",
    );

    expect(groups).toMatchObject([
      {
        key: "dimension:status:value:unclassified",
        label: "Unclassified",
        measurementIds: ["assigned"],
      },
      {
        key: "dimension:status:unclassified",
        label: "None assigned",
        measurementIds: ["unassigned"],
      },
    ]);
    expect(collisionCatalog.dimensions[0]!.values[0]!.name).toBe("Unclassified");
  });

  it("returns no groups for an unavailable dimension", () => {
    expect(createMeasurementGroups([measurement("line-1", [])], catalog, "missing")).toEqual([]);
  });

  it("nests selected dimensions in order with unique paths and one leaf per measurement", () => {
    const measurements = [
      measurement("first", ["electrical", "approved"]),
      measurement("second", ["electrical"], false),
      measurement("third", ["plumbing", "approved"]),
      measurement("fourth", ["approved"]),
      measurement("fifth", []),
    ];

    const groups = createMeasurementGroups(measurements, catalog, ["trade", "status"]);
    expect(groups.map((group) => group.label)).toEqual(["Electrical", "Plumbing", "None assigned"]);
    expect(groups[0]).toMatchObject({ visibility: "mixed", measurementIds: ["first", "second"] });
    expect(groups[0]?.children).toMatchObject([
      { label: "Approved", measurementIds: ["first"], visibility: "visible" },
      { label: "None assigned", measurementIds: ["second"], visibility: "hidden" },
    ]);
    expect(groups[0]?.children?.map(({ dimensionLabel, label }) => [dimensionLabel, label])).toEqual([
      ["Status", "Approved"],
      ["Status", "None assigned"],
    ]);
    expect(groups[1]).toMatchObject({ archived: true, children: [{ archived: false }] });
    expect(groups[1]?.children?.[0]?.key).toBe(
      "dimension:trade:value:plumbing/dimension:status:value:approved",
    );
    expect(groups[2]?.children?.map((group) => group.label)).toEqual(["Approved", "None assigned"]);
    expect(groups[2]?.children?.map((group) => group.dimensionLabel)).toEqual(["Status", "Status"]);
    expect(groups.flatMap((group) => group.children?.flatMap((child) => child.measurementIds) ?? [])).toEqual([
      "first", "second", "third", "fourth", "fifth",
    ]);

    const reversed = createMeasurementGroups(measurements, catalog, ["status", "trade"]);
    expect(reversed.map((group) => group.label)).toEqual(["Approved", "None assigned"]);
    expect(reversed[0]?.children?.map((group) => group.label)).toEqual([
      "Electrical", "Plumbing", "None assigned",
    ]);
  });

  it("keeps third-level keys unique beneath different second-level values", () => {
    const threeDimensions: ClassificationCatalog = {
      dimensions: [
        ...catalog.dimensions,
        {
          id: "phase",
          name: "Phase",
          archived: false,
          values: [{ id: "planned", name: "Planned", archived: false }],
        },
      ],
    };
    const groups = createMeasurementGroups(
      [
        measurement("electrical-approved", ["electrical", "approved", "planned"]),
        measurement("electrical-none", ["electrical", "planned"]),
      ],
      threeDimensions,
      ["trade", "status", "phase"],
    );

    const approvedKey = groups[0]?.children?.[0]?.children?.[0]?.key;
    const unassignedKey = groups[0]?.children?.[1]?.children?.[0]?.key;
    expect(approvedKey).toBe(
      "dimension:trade:value:electrical/dimension:status:value:approved/dimension:phase:value:planned",
    );
    expect(unassignedKey).toBe(
      "dimension:trade:value:electrical/dimension:status:unclassified/dimension:phase:value:planned",
    );
    expect(approvedKey).not.toBe(unassignedKey);
    expect(groups[0]?.children?.[1]?.children?.[0]).toMatchObject({
      dimensionLabel: "Phase",
      label: "Planned",
    });
  });
});
