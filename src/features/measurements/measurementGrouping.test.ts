import { describe, expect, it } from "vitest";
import type { ClassificationCatalog, Measurement } from "../../types/domain";
import {
  compactMeasurementGroups,
  createMeasurementGroups,
  type MeasurementGroup,
} from "./measurementGrouping";

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
        [measurement("visible-1", ["electrical"]), measurement("visible-2", ["electrical"])],
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
        label: "Unclassified",
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
    expect(groups.map((group) => group.label)).toEqual(["Electrical", "Plumbing", "Unclassified"]);
    expect(groups[0]).toMatchObject({ visibility: "mixed", measurementIds: ["first", "second"] });
    expect(groups[0]?.children).toMatchObject([
      { label: "Approved", measurementIds: ["first"], visibility: "visible" },
      { label: "Unclassified", measurementIds: ["second"], visibility: "hidden" },
    ]);
    expect(
      groups[0]?.children?.map(({ dimensionLabel, label }) => [dimensionLabel, label]),
    ).toEqual([
      ["Status", "Approved"],
      ["Status", "Unclassified"],
    ]);
    expect(groups[1]).toMatchObject({ archived: true, children: [{ archived: false }] });
    expect(groups[1]?.children?.[0]?.key).toBe(
      "dimension:trade:value:plumbing/dimension:status:value:approved",
    );
    expect(groups[2]?.children?.map((group) => group.label)).toEqual(["Approved", "Unclassified"]);
    expect(groups[2]?.children?.map((group) => group.dimensionLabel)).toEqual(["Status", "Status"]);
    expect(
      groups.flatMap((group) => group.children?.flatMap((child) => child.measurementIds) ?? []),
    ).toEqual(["first", "second", "third", "fourth", "fifth"]);

    const reversed = createMeasurementGroups(measurements, catalog, ["status", "trade"]);
    expect(reversed.map((group) => group.label)).toEqual(["Approved", "Unclassified"]);
    expect(reversed[0]?.children?.map((group) => group.label)).toEqual([
      "Electrical",
      "Plumbing",
      "Unclassified",
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

  it("keeps keys unique when classification IDs contain the key separators", () => {
    // Without encoding, the top-level value "v1/dimension:d2:value:v2" and the child "v2" beneath
    // "v1" both produce the key "dimension:d1:value:v1/dimension:d2:value:v2".
    const imported: ClassificationCatalog = {
      dimensions: [
        {
          id: "d1",
          name: "First",
          archived: false,
          values: [
            { id: "v1", name: "One", archived: false },
            { id: "v1/dimension:d2:value:v2", name: "Lookalike", archived: false },
          ],
        },
        {
          id: "d2",
          name: "Second",
          archived: false,
          values: [{ id: "v2", name: "Two", archived: false }],
        },
      ],
    };
    const groups = createMeasurementGroups(
      [measurement("nested", ["v1", "v2"]), measurement("lookalike", ["v1/dimension:d2:value:v2"])],
      imported,
      ["d1", "d2"],
    );

    const keys: string[] = [];
    const collect = (list: readonly MeasurementGroup[] | undefined) => {
      for (const item of list ?? []) {
        keys.push(item.key);
        collect(item.children);
      }
    };
    collect(groups);

    expect(groups.map((item) => item.label)).toEqual(["One", "Lookalike"]);
    expect(groups[0]?.children?.map((item) => item.label)).toEqual(["Two"]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(groups[1]?.key).toBe("dimension:d1:value:v1%2Fdimension%3Ad2%3Avalue%3Av2");
  });
});

function group(
  key: string,
  label: string,
  ids: string[],
  children?: MeasurementGroup[],
): MeasurementGroup {
  return {
    key,
    dimensionLabel: `D-${key}`,
    label,
    archived: false,
    unassigned: key.endsWith(":unclassified"),
    measurementIds: ids,
    visibility: "visible",
    children,
  };
}

describe("compactMeasurementGroups", () => {
  it("fuses a chain of same-scope Unclassified groups into one with all segments", () => {
    const chain = group(
      "a:unclassified",
      "Unclassified",
      ["m1", "m2"],
      [
        group(
          "a:unclassified/b:unclassified",
          "Unclassified",
          ["m2", "m1"],
          [group("a:unclassified/b:unclassified/c:unclassified", "Unclassified", ["m1", "m2"])],
        ),
      ],
    );
    const result = compactMeasurementGroups([chain]);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe("a:unclassified");
    expect(result[0]?.segments).toHaveLength(3);
    expect(result[0]?.segments?.every((segment) => segment.unassigned)).toBe(true);
    expect(result[0]?.children).toBeUndefined();
  });

  it("does not fuse a group with several children", () => {
    const parent = group(
      "p",
      "P",
      ["m1", "m2"],
      [group("p/a", "A", ["m1"]), group("p/b", "B", ["m2"])],
    );
    const result = compactMeasurementGroups([parent]);
    expect(result[0]?.segments).toBeUndefined();
    expect(result[0]?.children).toHaveLength(2);
  });

  it("keeps the tail's children and does not mutate the input", () => {
    const input = [
      group(
        "p",
        "P",
        ["m1", "m2"],
        [
          group(
            "p/q",
            "Q",
            ["m1", "m2"],
            [group("p/q/a", "A", ["m1"]), group("p/q/b", "B", ["m2"])],
          ),
        ],
      ),
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    const result = compactMeasurementGroups(input);
    expect(result[0]?.segments?.map((segment) => segment.label)).toEqual(["P", "Q"]);
    expect(result[0]?.children?.map((child) => child.key)).toEqual(["p/q/a", "p/q/b"]);
    expect(input).toEqual(snapshot);
    expect(result[0]).not.toBe(input[0]);
  });
});
