import { describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession } from "../types/domain";
import { buildDataJson, downloadDataJson } from "./dataJson";

function fixture(): CurrentSession {
  const session = createEmptySession({ name: "Plán.PDF", size: 123, lastModified: 42 }, 3);
  session.settings.displayUnit = "ft-in";
  session.settings.measurementDecimalPlaces = 0;
  session.pageLabelOverrides = { 1: "Custom α" };
  session.classificationCatalog.dimensions = [
    {
      id: "dimension",
      name: "Zone",
      archived: true,
      values: [{ id: "value", name: "Old", archived: true }],
    },
  ];
  const page = session.pages[1]!;
  page.calibrations = [
    {
      id: "uniform",
      name: "Uniform",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 3, y: 4 },
      referenceDistanceMm: 10,
    },
    {
      id: "xy",
      name: "XY",
      mode: "xy",
      xReference: {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 1 },
        referenceDistanceMm: 30,
      },
      yReference: {
        start: { x: 0, y: 0 },
        end: { x: 1, y: 10 },
        referenceDistanceMm: 50,
      },
    },
  ];
  page.activeCalibrationId = "xy";
  page.measurements = [
    {
      id: "line",
      name: '=SUM(α)\n"á"',
      type: "line",
      calibrationId: "uniform",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      classificationValueIds: ["value"],
      visible: false,
      note: "+Unicode ñ\nmultiline",
    },
    {
      id: "polyline",
      name: "Open",
      type: "polyline",
      calibrationId: "xy",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      classificationValueIds: [],
      visible: true,
    },
    {
      id: "polygon",
      name: "Closed",
      type: "polygon",
      calibrationId: "xy",
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 3 },
        { x: 0, y: 3 },
      ],
      classificationValueIds: [],
      visible: true,
    },
  ];
  return session;
}

describe("public JSON data export", () => {
  it("serializes complete canonical data with full precision independently of UI settings", () => {
    const session = fixture();
    const before = structuredClone(session);
    const serialized = buildDataJson(session, ["PDF label", "PDF β", ""]);
    const data = JSON.parse(serialized);
    expect(data.schemaVersion).toBe(1);
    expect(data.pdf).toEqual(session.pdf);
    expect(data.pageCount).toBe(3);
    expect(data.coordinateSystem).toEqual({
      space: "pdf-page",
      rotation: "intrinsic",
      logicalScale: 1,
      units: "page-unit",
      xAxis: "right",
      yAxis: "down",
    });
    expect(data.classificationCatalog).toEqual(session.classificationCatalog);
    expect(data.pages.map((page: { pageLabel: string }) => page.pageLabel)).toEqual([
      "Custom α",
      "PDF β",
      "",
    ]);
    expect(data.pages[0].calibrations[0]).toEqual({
      ...session.pages[1]!.calibrations[0],
      mmPerPageUnitX: 2,
      mmPerPageUnitY: 2,
    });
    expect(data.pages[0].calibrations[1]).toEqual({
      ...session.pages[1]!.calibrations[1],
      mmPerPageUnitX: 3,
      mmPerPageUnitY: 5,
    });
    const [line, polyline, polygon] = data.pages[0].measurements;
    expect(line).toEqual({
      ...session.pages[1]!.measurements[0],
      lengthMm: Math.sqrt(2) * 2,
      perimeterMm: null,
      areaMm2: null,
    });
    expect(serialized).toContain(String(Math.sqrt(2) * 2));
    expect(polyline).toEqual({
      ...session.pages[1]!.measurements[1],
      note: null,
      lengthMm: 8,
      perimeterMm: null,
      areaMm2: null,
    });
    expect(polygon).toEqual({
      ...session.pages[1]!.measurements[2],
      note: null,
      lengthMm: null,
      perimeterMm: 42,
      areaMm2: 90,
    });
    expect(data.pages[1]).toEqual({
      pageNumber: 2,
      pageLabel: "PDF β",
      calibrations: [],
      measurements: [],
    });
    expect(Object.keys(data)).toEqual([
      "schemaVersion",
      "pdf",
      "pageCount",
      "coordinateSystem",
      "pages",
      "classificationCatalog",
    ]);
    expect(session).toEqual(before);
    session.settings.displayUnit = "mm";
    session.settings.csvExport.columnOverrides = { measurement_name: false };
    expect(buildDataJson(session, ["PDF label", "PDF β", ""])).toBe(serialized);
  });

  it("uses schema version 4 and exports the four bounding box corners of an ellipse", () => {
    const session = createEmptySession({ name: "e.pdf", size: 1, lastModified: 1 }, 1);
    const page = session.pages[1]!;
    page.calibrations = [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        referenceDistanceMm: 1,
      },
    ];
    page.activeCalibrationId = "scale";
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ];
    page.measurements = [
      {
        id: "ellipse",
        name: "Ellipse 1",
        type: "ellipse",
        calibrationId: "scale",
        points,
        classificationValueIds: [],
        visible: true,
      },
    ];

    const parsed = JSON.parse(buildDataJson(session));

    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.pages[0].measurements[0]).toMatchObject({ type: "ellipse", points });
    expect(parsed.pages[0].measurements[0].areaMm2).toBeCloseTo(Math.PI * 2 * 1, 10);
  });

  it("exports cloud results only when the project measures clouds and the cloud has a scale", () => {
    const session = createEmptySession({ name: "m.pdf", size: 1, lastModified: 1 }, 1);
    const page = session.pages[1]!;
    page.calibrations = [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        referenceDistanceMm: 1,
      },
    ];
    page.activeCalibrationId = "scale";
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
    ];
    const base = { type: "cloud" as const, points, classificationValueIds: [], visible: true };
    page.measurements = [
      { ...base, id: "scaled", name: "Cloud 1", calibrationId: "scale" },
      { ...base, id: "free", name: "Cloud 2", calibrationId: null },
    ];
    const clouds = () => JSON.parse(buildDataJson(session));

    expect(session.settings.measureClouds).toBe(false);
    let parsed = clouds();
    expect(parsed.schemaVersion).toBe(5);
    expect(parsed.pages[0].measurements).toEqual([
      expect.objectContaining({
        id: "scaled",
        calibrationId: "scale",
        lengthMm: null,
        perimeterMm: null,
        areaMm2: null,
      }),
      expect.objectContaining({
        id: "free",
        calibrationId: null,
        lengthMm: null,
        perimeterMm: null,
        areaMm2: null,
      }),
    ]);

    session.settings.measureClouds = true;
    parsed = clouds();
    expect(parsed.schemaVersion).toBe(5);
    expect(parsed.pages[0].measurements).toEqual([
      expect.objectContaining({ id: "scaled", lengthMm: null, perimeterMm: 12, areaMm2: 8 }),
      expect.objectContaining({
        id: "free",
        calibrationId: null,
        lengthMm: null,
        perimeterMm: null,
        areaMm2: null,
      }),
    ]);
  });

  it("keeps schema version 4 for rectangles and ellipses without clouds", () => {
    const session = createEmptySession({ name: "r.pdf", size: 1, lastModified: 1 }, 1);
    const page = session.pages[1]!;
    page.calibrations = [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        referenceDistanceMm: 1,
      },
    ];
    page.measurements = [
      {
        id: "rect",
        name: "Rectangle 1",
        type: "rectangle",
        calibrationId: "scale",
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 2 },
          { x: 0, y: 2 },
        ],
        classificationValueIds: [],
        visible: true,
      },
    ];

    expect(JSON.parse(buildDataJson(session)).schemaVersion).toBe(4);
  });

  it("exports the color of a cloud only when it has one", () => {
    const session = createEmptySession({ name: "c.pdf", size: 1, lastModified: 1 }, 1);
    const page = session.pages[1]!;
    page.calibrations = [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        referenceDistanceMm: 1,
      },
    ];
    page.activeCalibrationId = "scale";
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 2 },
    ];
    const base = { calibrationId: "scale", points, classificationValueIds: [], visible: true };
    page.measurements = [
      { ...base, id: "plain", name: "Cloud 1", type: "cloud" },
      { ...base, id: "blue", name: "Cloud 2", type: "cloud", color: "#2465c7" },
      { ...base, id: "polygon", name: "Polygon 1", type: "polygon" },
    ];

    const [plain, blue, polygon] = JSON.parse(buildDataJson(session)).pages[0].measurements;

    expect(plain).not.toHaveProperty("color");
    expect(blue.color).toBe("#2465c7");
    expect(polygon).not.toHaveProperty("color");
  });

  it("exports a cloud without a scale with a null calibration and no results", () => {
    const session = createEmptySession({ name: "n.pdf", size: 1, lastModified: 1 }, 1);
    const page = session.pages[1]!;
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 2 },
    ];
    page.measurements = [
      {
        id: "free",
        name: "Cloud 1",
        type: "cloud",
        calibrationId: null,
        points,
        classificationValueIds: [],
        visible: true,
      },
    ];

    const parsed = JSON.parse(buildDataJson(session));

    expect(parsed.schemaVersion).toBe(5);
    expect(parsed.pages[0].calibrations).toEqual([]);
    expect(parsed.pages[0].measurements).toEqual([
      {
        id: "free",
        name: "Cloud 1",
        note: null,
        type: "cloud",
        visible: true,
        calibrationId: null,
        points,
        classificationValueIds: [],
        lengthMm: null,
        perimeterMm: null,
        areaMm2: null,
      },
    ]);

    page.measurements = [
      {
        ...page.measurements[0]!,
        id: "line",
        name: "Line 1",
        type: "line",
        points: points.slice(0, 2),
      },
    ];
    expect(() => buildDataJson(session)).toThrow(/missing calibration/);
  });

  it("exports empty and uninitialized pages and catalogs without measurements", () => {
    const session = createEmptySession({ name: "empty.pdf", size: 0, lastModified: 0 }, 2);
    delete session.pages[2];
    expect(JSON.parse(buildDataJson(session)).pages).toEqual([
      { pageNumber: 1, pageLabel: "", calibrations: [], measurements: [] },
      { pageNumber: 2, pageLabel: "", calibrations: [], measurements: [] },
    ]);
    session.classificationCatalog = fixture().classificationCatalog;
    expect(JSON.parse(buildDataJson(session)).classificationCatalog).toEqual(
      session.classificationCatalog,
    );
  });

  it.each([NaN, Infinity, -Infinity])("rejects nonfinite input %s", (invalid) => {
    const mutations: ((session: CurrentSession) => void)[] = [
      (session) => {
        session.pdf.size = invalid;
      },
      (session) => {
        session.pdf.lastModified = invalid;
      },
      (session) => {
        session.pageCount = invalid;
      },
      (session) => {
        session.pages[1]!.measurements[0]!.points[0]!.x = invalid;
      },
      (session) => {
        const calibration = session.pages[1]!.calibrations[0]!;
        if (calibration.mode === "uniform") calibration.referenceDistanceMm = invalid;
      },
      (session) => {
        const calibration = session.pages[1]!.calibrations[1]!;
        if (calibration.mode === "xy") calibration.yReference.start.y = invalid;
      },
    ];
    for (const mutate of mutations) {
      const session = fixture();
      mutate(session);
      expect(() => buildDataJson(session)).toThrow();
    }
  });

  it("rejects finite geometry whose derived result overflows", () => {
    const session = fixture();
    const calibration = session.pages[1]!.calibrations[0]!;
    if (calibration.mode === "uniform") calibration.referenceDistanceMm = 1e308;
    session.pages[1]!.measurements[0]!.points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(() => buildDataJson(session)).toThrow(/finite/);
  });

  it.each([
    "missing calibration",
    "missing value",
    "missing dimension",
    "duplicate dimension",
    "duplicate value",
    "duplicate measurement",
    "duplicate calibration",
    "duplicate assignment",
    "multiple values in dimension",
    "invalid geometry",
    "invalid calibration",
    "invalid page",
  ])("rejects invalid domain references or geometry: %s", (kind) => {
    const session = fixture();
    const page = session.pages[1]!;
    const dimension = session.classificationCatalog.dimensions[0]!;
    switch (kind) {
      case "missing calibration":
        page.measurements[0]!.calibrationId = "missing";
        break;
      case "missing value":
        page.measurements[0]!.classificationValueIds = ["missing"];
        break;
      case "missing dimension":
        session.classificationCatalog.dimensions = [];
        break;
      case "duplicate dimension":
        session.classificationCatalog.dimensions.push(structuredClone(dimension));
        break;
      case "duplicate value":
        dimension.values.push(structuredClone(dimension.values[0]!));
        break;
      case "duplicate measurement":
        page.measurements.push(structuredClone(page.measurements[0]!));
        break;
      case "duplicate calibration":
        page.calibrations.push(structuredClone(page.calibrations[0]!));
        break;
      case "duplicate assignment":
        page.measurements[0]!.classificationValueIds.push("value");
        break;
      case "multiple values in dimension":
        dimension.values.push({ id: "second", name: "Other", archived: false });
        page.measurements[0]!.classificationValueIds.push("second");
        break;
      case "invalid geometry":
        page.measurements[2]!.points.reverse();
        page.measurements[2]!.points[2] = { x: 0, y: 0 };
        break;
      case "invalid calibration":
        if (page.calibrations[0]!.mode === "uniform") page.calibrations[0]!.referenceDistanceMm = 0;
        break;
      case "invalid page":
        session.pageCount = 0;
        break;
    }
    expect(() => buildDataJson(session)).toThrow();
  });

  it("does not silently omit out-of-range or mismatched page state", () => {
    const session = fixture();
    session.pages[4] = { ...session.pages[1]!, pageNumber: 4 };
    expect(() => buildDataJson(session)).toThrow(/page numbering/);
    delete session.pages[4];
    session.pages[1]!.pageNumber = 2;
    expect(() => buildDataJson(session)).toThrow(/page numbering/);
  });

  it("downloads JSON with its MIME type and cleans up the anchor and object URL", async () => {
    const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:json");
    const revokeObjectURL = vi.fn();
    let revoke: (() => void) | undefined;
    const setTimeout = vi.fn((callback: () => void) => {
      revoke = callback;
      return 1;
    });
    vi.stubGlobal("document", { body: { append }, createElement: vi.fn(() => anchor) });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("window", { setTimeout });
    try {
      const session = fixture();
      downloadDataJson(session);
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob | undefined;
      expect(blob?.type).toBe("application/json;charset=utf-8");
      expect(await blob?.text()).toBe(buildDataJson(session));
      expect(anchor.download).toBe("Plán-data.json");
      expect(anchor.href).toBe("blob:json");
      expect(append).toHaveBeenCalledWith(anchor);
      expect(anchor.click).toHaveBeenCalledOnce();
      expect(anchor.remove).toHaveBeenCalledOnce();
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 250);
      expect(revokeObjectURL).not.toHaveBeenCalled();
      revoke?.();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:json");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("JSON Takeoff extension", () => {
  it("preserves version 1 by default and adds a canonical version 2 summary on request", () => {
    const session = fixture();
    const original = JSON.parse(buildDataJson(session));
    expect(original.schemaVersion).toBe(1);
    expect(original.takeoff).toBeUndefined();
    const extended = JSON.parse(
      buildDataJson(session, null, {
        breakdowns: ["page", "type"],
        classificationDimensionIds: ["dimension"],
      }),
    );
    expect(extended.schemaVersion).toBe(2);
    expect(extended.pages).toEqual(original.pages);
    expect(extended.classificationCatalog).toEqual(original.classificationCatalog);
    expect(extended.takeoff).toMatchObject({
      linearUnit: "mm",
      areaUnit: "mm²",
      allPages: true,
      includesHidden: true,
    });
    expect(extended.takeoff.breakdowns.map((item: { type: string }) => item.type)).toEqual([
      "page",
      "type",
      "classification",
    ]);
    const expectedLength = original.pages
      .flatMap((page: { measurements: { lengthMm: number | null }[] }) => page.measurements)
      .reduce(
        (sum: number, measurement: { lengthMm: number | null }) =>
          sum + (measurement.lengthMm ?? 0),
        0,
      );
    expect(extended.takeoff.projectTotals.length).toEqual({ kind: "value", value: expectedLength });
    expect(extended.takeoff.breakdowns[2].dimension).toEqual({
      id: "dimension",
      name: "Zone",
      archived: true,
    });
  });
  it("exports empty summaries and marks aggregate overflow explicitly without nonfinite JSON values", () => {
    const empty = createEmptySession({ name: "Empty.pdf", size: 0, lastModified: 0 }, 1);
    const selection = { breakdowns: [] as const, classificationDimensionIds: [] };
    const report = JSON.parse(buildDataJson(empty, null, selection));
    expect(report.takeoff.projectTotals).toMatchObject({
      measurementCount: 0,
      excludedCount: 0,
      length: { kind: "absent" },
    });
    const large = fixture();
    const page = large.pages[1]!;
    page.calibrations = [
      {
        id: "large",
        name: "Large",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 9e307,
      },
    ];
    page.measurements = [0, 1].map((index) => ({
      ...page.measurements[0]!,
      id: String(index),
      type: "line" as const,
      calibrationId: "large",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    }));
    for (const other of Object.values(large.pages)) if (other !== page) other.measurements = [];
    const contents = buildDataJson(large, null, selection);
    expect(JSON.parse(contents).takeoff.projectTotals.length).toEqual({ kind: "unavailable" });
    expect(contents).not.toContain("Infinity");
  });
});

it("omits unselected project totals from JSON while preserving requested breakdowns", () => {
  const data = JSON.parse(
    buildDataJson(fixture(), null, {
      includeProjectTotals: false,
      breakdowns: ["page"],
      classificationDimensionIds: [],
    }),
  );
  expect(data.schemaVersion).toBe(2);
  expect(data.takeoff).not.toHaveProperty("projectTotals");
  expect(data.takeoff.breakdowns.map((view: { type: string }) => view.type)).toEqual(["page"]);
});

describe("JSON derived quantities", () => {
  const point = (x: number, y: number) => ({ x, y });
  const rect = { x: 40, y: 50 };
  // Scale: 100 mm per unit. Wall: a 12 500 mm line, 2700 mm high (33 750 000 mm²). Slab: a
  // 4000 × 5000 mm rectangle (20 000 000 mm²), 150 mm thick (3 000 000 000 mm³).
  function ratedFixture(): CurrentSession {
    const session = createEmptySession({ name: "Rated.pdf", size: 1, lastModified: 1 }, 1);
    session.classificationCatalog.dimensions = [
      {
        id: "element",
        name: "Element",
        archived: false,
        values: [
          { id: "wall", name: "Wall", archived: false },
          { id: "slab", name: "Slab", archived: false },
        ],
      },
    ];
    const page = session.pages[1]!;
    page.calibrations = [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: point(0, 0),
        end: point(10, 0),
        referenceDistanceMm: 1000,
      },
    ];
    page.measurements = [
      {
        id: "wall",
        name: "Wall",
        type: "line",
        calibrationId: "scale",
        points: [point(0, 0), point(125, 0)],
        classificationValueIds: ["wall"],
        visible: true,
      },
      {
        id: "slab",
        name: "Slab",
        type: "rectangle",
        calibrationId: "scale",
        points: [point(0, 0), point(rect.x, 0), point(rect.x, rect.y), point(0, rect.y)],
        classificationValueIds: ["slab"],
        visible: true,
      },
    ];
    session.settings.currency = "EUR";
    session.classificationRates = [
      {
        valueId: "wall",
        derivation: { source: "length", factorMm: 2700 },
        price: { amount: 25, basis: "derived", unit: "m²" },
      },
      { valueId: "slab", derivation: { source: "area", factorMm: 150 }, price: null },
    ];
    return session;
  }
  const selection = { breakdowns: [] as const, classificationDimensionIds: ["element"] };

  it("uses schema version 6 over every other version and exports the currency and rates", () => {
    const session = ratedFixture();
    expect(JSON.parse(buildDataJson(session)).schemaVersion).toBe(6);
    const data = JSON.parse(buildDataJson(session, null, selection));
    expect(data.schemaVersion).toBe(6);
    expect(data.currency).toBe("EUR");
    expect(data.classificationRates).toEqual([
      {
        valueId: "wall",
        derivation: { source: "length", factorMm: 2700 },
        price: { amount: 25, basis: "derived", unit: "m²" },
      },
      { valueId: "slab", derivation: { source: "area", factorMm: 150 }, price: null },
    ]);
    // Without rates the same project is version 4 (it has a rectangle) and has none of the fields.
    session.classificationRates = [];
    expect(JSON.parse(buildDataJson(session)).schemaVersion).toBe(4);
  });

  it("exports a null currency and the derived quantities per Takeoff group in millimetres", () => {
    const session = ratedFixture();
    session.settings.currency = null;
    const data = JSON.parse(buildDataJson(session, null, selection));
    expect(data.currency).toBeNull();
    expect(data.takeoff).toMatchObject({ volumeUnit: "mm³", currency: null });
    expect(data.takeoff.projectTotals).toMatchObject({
      derivedArea: { kind: "value", value: 33_750_000 },
      derivedVolume: { kind: "value", value: 3_000_000_000 },
    });
    expect(
      data.takeoff.breakdowns[0].groups.map(
        (group: { label: string; derivedArea: unknown; derivedVolume: unknown }) => [
          group.label,
          group.derivedArea,
          group.derivedVolume,
        ],
      ),
    ).toEqual([
      ["Wall", { kind: "value", value: 33_750_000 }, { kind: "absent" }],
      ["Slab", { kind: "absent" }, { kind: "value", value: 3_000_000_000 }],
    ]);
  });

  it("exports the unrounded cost per Takeoff group in the project currency", () => {
    // The 12 500 mm wall is 33.75 m² of derived area at 25 per m²; the slab has no price.
    const data = JSON.parse(buildDataJson(ratedFixture(), null, selection));
    expect(data.takeoff.currency).toBe("EUR");
    expect(data.takeoff.projectTotals.cost).toEqual({ kind: "value", value: 843.75 });
    expect(
      data.takeoff.breakdowns[0].groups.map((group: { label: string; cost: unknown }) => [
        group.label,
        group.cost,
      ]),
    ).toEqual([
      ["Wall", { kind: "value", value: 843.75 }],
      ["Slab", { kind: "absent" }],
    ]);
  });

  it("marks an overflowing cost as unavailable without nonfinite numbers", () => {
    const session = ratedFixture();
    session.classificationRates[0]!.price!.amount = 1e308;
    const contents = buildDataJson(session, null, selection);
    expect(JSON.parse(contents).takeoff.projectTotals.cost).toEqual({ kind: "unavailable" });
    expect(contents).not.toContain("Infinity");
  });

  it("keeps the derived quantities of the breakdowns when the project totals are omitted", () => {
    const data = JSON.parse(
      buildDataJson(ratedFixture(), null, { ...selection, includeProjectTotals: false }),
    );
    expect(data.takeoff).not.toHaveProperty("projectTotals");
    expect(data.takeoff.breakdowns[0].groups[0].derivedArea).toEqual({
      kind: "value",
      value: 33_750_000,
    });
  });

  it("marks an overflowing derived quantity as unavailable without nonfinite numbers", () => {
    const session = ratedFixture();
    session.classificationRates[0]!.derivation!.factorMm = 1e308;
    const contents = buildDataJson(session, null, selection);
    expect(JSON.parse(contents).takeoff.projectTotals.derivedArea).toEqual({
      kind: "unavailable",
    });
    expect(contents).not.toContain("Infinity");
  });

  it("rejects rates of unknown values and non-finite numbers", () => {
    const orphan = ratedFixture();
    orphan.classificationRates[0]!.valueId = "gone";
    expect(() => buildDataJson(orphan)).toThrow("missing value");
    const dimension = ratedFixture();
    dimension.classificationRates[0]!.valueId = "element";
    expect(() => buildDataJson(dimension)).toThrow("missing value");
    const infiniteFactor = ratedFixture();
    infiniteFactor.classificationRates[0]!.derivation!.factorMm = Infinity;
    expect(() => buildDataJson(infiniteFactor)).toThrow(RangeError);
    const infinitePrice = ratedFixture();
    infinitePrice.classificationRates[0]!.price!.amount = Infinity;
    expect(() => buildDataJson(infinitePrice)).toThrow(RangeError);
  });

  it("leaves the output without rates exactly as in versions 1 to 5", () => {
    const session = ratedFixture();
    session.classificationRates = [];
    session.settings.currency = "EUR";
    const group = [
      "key",
      "label",
      "archived",
      "measurementCount",
      "excludedCount",
      "length",
      "perimeter",
      "area",
      "count",
    ];
    const plain = JSON.parse(buildDataJson(session));
    expect(Object.keys(plain)).toEqual([
      "schemaVersion",
      "pdf",
      "pageCount",
      "coordinateSystem",
      "pages",
      "classificationCatalog",
    ]);
    const data = JSON.parse(buildDataJson(session, null, { ...selection, breakdowns: ["type"] }));
    expect(Object.keys(data)).toEqual([...Object.keys(plain), "takeoff"]);
    expect(Object.keys(data.takeoff)).toEqual([
      "linearUnit",
      "areaUnit",
      "allPages",
      "includesHidden",
      "projectTotals",
      "breakdowns",
    ]);
    expect(Object.keys(data.takeoff.projectTotals)).toEqual(group);
    for (const breakdown of data.takeoff.breakdowns)
      for (const item of breakdown.groups) expect(Object.keys(item)).toEqual(group);
  });
});

describe("JSON identifier namespaces", () => {
  it("rejects a measurement ID reused on another page", () => {
    const session = fixture();
    const copy = structuredClone(session.pages[1]!.measurements[0]!);
    session.pages[2]!.measurements = [copy];
    session.pages[2]!.calibrations = structuredClone(session.pages[1]!.calibrations);
    expect(() => buildDataJson(session)).toThrow(/duplicate measurement ID/);
    // Once renamed the same session is valid, so only the cross-page clash made it fail.
    copy.id = "other-page-line";
    expect(
      JSON.parse(buildDataJson(session)).pages[1].measurements.map((m: { id: string }) => m.id),
    ).toEqual(["other-page-line"]);
  });

  it("allows the same calibration ID on different pages but not twice on one page", () => {
    const session = fixture();
    session.pages[2]!.calibrations = structuredClone(session.pages[1]!.calibrations);
    const data = JSON.parse(buildDataJson(session));
    expect(data.pages[1].calibrations.map((c: { id: string }) => c.id)).toEqual(["uniform", "xy"]);
    session.pages[2]!.calibrations.push(structuredClone(session.pages[2]!.calibrations[0]!));
    expect(() => buildDataJson(session)).toThrow(/duplicate calibration ID/);
  });

  it("shares one namespace between dimension and value IDs", () => {
    const valueAsDimension = fixture();
    valueAsDimension.classificationCatalog.dimensions.push({
      id: "second",
      name: "Second",
      archived: false,
      values: [{ id: "dimension", name: "Clash", archived: false }],
    });
    expect(() => buildDataJson(valueAsDimension)).toThrow(/duplicate classification ID/);

    const sameValue = fixture();
    sameValue.classificationCatalog.dimensions.push({
      id: "second",
      name: "Second",
      archived: false,
      values: [{ id: "value", name: "Clash", archived: false }],
    });
    expect(() => buildDataJson(sameValue)).toThrow(/duplicate classification ID/);

    const distinct = fixture();
    distinct.classificationCatalog.dimensions.push({
      id: "second",
      name: "Second",
      archived: false,
      values: [{ id: "other", name: "Fine", archived: false }],
    });
    expect(() => buildDataJson(distinct)).not.toThrow();
  });
});

describe("JSON schema version precedence", () => {
  const features = [2, 3, 4, 5, 6] as const;
  type Feature = (typeof features)[number];
  const point = (x: number, y: number) => ({ x, y });

  function session(active: readonly Feature[]) {
    const result = createEmptySession({ name: "v.pdf", size: 1, lastModified: 1 }, 1);
    result.classificationCatalog.dimensions = [
      { id: "d", name: "D", archived: false, values: [{ id: "v", name: "V", archived: false }] },
    ];
    const page = result.pages[1]!;
    page.calibrations = [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: point(0, 0),
        end: point(10, 0),
        referenceDistanceMm: 10,
      },
    ];
    const base = { name: "m", classificationValueIds: [], visible: true };
    const kinds: Partial<Record<Feature, (typeof page.measurements)[number]>> = {
      3: { ...base, id: "count", type: "count", calibrationId: null, points: [point(1, 1)] },
      4: {
        ...base,
        id: "rect",
        type: "rectangle",
        calibrationId: "scale",
        points: [point(0, 0), point(2, 0), point(2, 2), point(0, 2)],
      },
      5: {
        ...base,
        id: "cloud",
        type: "cloud",
        calibrationId: null,
        points: [point(0, 0), point(4, 0), point(0, 2)],
      },
    };
    page.measurements = active.flatMap((feature) => kinds[feature] ?? []);
    if (active.includes(6)) {
      result.classificationRates = [
        { valueId: "v", derivation: null, price: { amount: 1, basis: "count", unit: "each" } },
      ];
    }
    return result;
  }
  const version = (active: readonly Feature[]) =>
    JSON.parse(
      buildDataJson(
        session(active),
        null,
        active.includes(2) ? { breakdowns: [], classificationDimensionIds: [] } : undefined,
      ),
    ).schemaVersion;

  it("is 1 without any versioned feature and the feature's own version when alone", () => {
    expect(version([])).toBe(1);
    expect(features.map((feature) => version([feature]))).toEqual([2, 3, 4, 5, 6]);
  });

  // Doc: 2 Takeoff, 3 Count, 4 rectangle/ellipse, 5 cloud, 6 rates; the highest applicable wins.
  it.each([
    [[2, 3], 3],
    [[2, 4], 4],
    [[2, 5], 5],
    [[2, 6], 6],
    [[3, 4], 4],
    [[3, 5], 5],
    [[3, 6], 6],
    [[4, 5], 5],
    [[4, 6], 6],
    [[5, 6], 6],
    [[2, 3, 4, 5, 6], 6],
  ] as const)("uses the highest version when features %j combine", (active, expected) => {
    expect(version(active)).toBe(expected);
  });
});

describe("JSON documented example", () => {
  it("exports the line of docs/export-json.md exactly", () => {
    const session = createEmptySession({ name: "Doc.pdf", size: 1, lastModified: 1 }, 1);
    session.classificationCatalog.dimensions = [
      {
        id: "dimension-1",
        name: "Trade",
        archived: false,
        values: [{ id: "value-1", name: "Walls", archived: false }],
      },
    ];
    const page = session.pages[1]!;
    // A 3-4-5 triangle: 5 page units span 10 mm, so 2 mm per page unit.
    page.calibrations = [
      {
        id: "scale-1",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 3, y: 4 },
        referenceDistanceMm: 10,
      },
    ];
    page.measurements = [
      {
        id: "measurement-1",
        name: "Wall",
        type: "line",
        visible: false,
        calibrationId: "scale-1",
        points: [
          { x: 0, y: 0 },
          { x: 3, y: 4 },
        ],
        classificationValueIds: ["value-1"],
      },
    ];
    const exported = JSON.parse(buildDataJson(session)).pages[0].measurements[0];
    expect(exported).toEqual({
      id: "measurement-1",
      name: "Wall",
      note: null,
      type: "line",
      visible: false,
      calibrationId: "scale-1",
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
      classificationValueIds: ["value-1"],
      lengthMm: 10,
      perimeterMm: null,
      areaMm2: null,
    });
    // Field order as printed in the document.
    expect(Object.keys(exported)).toEqual([
      "id",
      "name",
      "note",
      "type",
      "visible",
      "calibrationId",
      "points",
      "classificationValueIds",
      "lengthMm",
      "perimeterMm",
      "areaMm2",
    ]);
  });
});
