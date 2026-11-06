// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { read, utils } from "xlsx";
import { unzipSync } from "fflate";
import { createEmptySession } from "../app/sessionState";
import {
  createMeasurementTotals,
  type TakeoffSelection,
} from "../features/measurements/measurementTotals";
import {
  buildCsv,
  buildClassificationAssignmentsCsv,
  serializeExportTableCsv,
  type ExportTable,
} from "./csv";
import { buildTakeoffTables, downloadCsvWithTakeoff, downloadTakeoff } from "./takeoffExport";
import { buildSpreadsheet, buildSpreadsheetTables } from "./spreadsheetExport";
import { downloadExportFile } from "./exportDownload";

vi.mock("./exportDownload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./exportDownload")>()),
  downloadExportFile: vi.fn(),
}));
const selection: TakeoffSelection = {
  breakdowns: [],
  classificationDimensionIds: ["trade"],
};
function fixture() {
  const session = createEmptySession({ name: "Plan.pdf", size: 10, lastModified: 1 }, 2);
  session.settings.displayUnit = "m";
  session.classificationCatalog.dimensions = [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [{ id: "old", name: '=SUM(1,2)\n"Old"', archived: true }],
    },
  ];
  session.pageLabelOverrides = { 1: "Ground floor" };
  const page = session.pages[1]!;
  page.calibrations = [
    {
      id: "scale",
      name: "Scale",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
  ];
  page.measurements = [
    {
      id: "line",
      name: "Line",
      type: "line",
      calibrationId: "scale",
      points: [
        { x: 0, y: 0 },
        { x: 12.3456789, y: 0 },
      ],
      classificationValueIds: ["old"],
      visible: false,
    },
    {
      id: "polygon",
      name: "Room",
      type: "polygon",
      calibrationId: "scale",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      classificationValueIds: [],
      visible: true,
    },
    {
      id: "invalid",
      name: "Missing scale",
      type: "line",
      calibrationId: "missing",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      classificationValueIds: ["old"],
      visible: true,
    },
    {
      id: "invalid-geometry",
      name: "Invalid geometry",
      type: "line",
      calibrationId: "scale",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      classificationValueIds: [],
      visible: true,
    },
  ];
  return session;
}
function objects(table: ExportTable) {
  return table.rows.map((row) =>
    Object.fromEntries(table.headers.map((header, index) => [header, row[index]])),
  );
}
describe("Takeoff exports", () => {
  it("adds clouds to the totals only when the project measures them and they have a scale", () => {
    const session = fixture();
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const cloud = {
      id: "cloud",
      name: "Cloud",
      type: "cloud" as const,
      points: square,
      classificationValueIds: [],
      visible: true,
    };
    session.pages[1]!.measurements.push(
      { ...cloud, calibrationId: "scale" },
      { ...cloud, id: "free-cloud", calibrationId: null },
    );
    const project = () => objects(buildTakeoffTables(session, selection).project)[0]!;

    expect(session.settings.measureClouds).toBe(false);
    expect(project()).toMatchObject({
      measurement_count: 6,
      excluded_count: 2,
      perimeter: 4,
      area: 1,
    });

    session.settings.measureClouds = true;
    expect(project()).toMatchObject({
      measurement_count: 6,
      excluded_count: 2,
      perimeter: 8,
      area: 2,
    });
  });

  it("matches Takeoff totals, includes hidden measurements and reports exclusions per group", () => {
    const session = fixture();
    const tables = buildTakeoffTables(session, selection);
    const totals = createMeasurementTotals({
      pages: session.pages,
      catalog: session.classificationCatalog,
      grouping: "overall",
      classificationDimensionId: null,
      pageLabelOverrides: {},
      sourcePageLabels: null,
    });
    const total = objects(tables.project)[0]!;
    expect(total).toMatchObject({
      measurement_count: 4,
      excluded_count: 2,
      length_status: "value",
      perimeter: 4,
      area: 1,
      linear_unit: "m",
      area_unit: "m²",
    });
    expect(total.length).toBe(
      totals.groups[0]!.length.kind === "value" ? totals.groups[0]!.length.value / 1000 : null,
    );
    expect(objects(tables.breakdowns[0]![1])).toEqual([
      expect.objectContaining({
        group: '=SUM(1,2)\n"Old"',
        archived: "true",
        measurement_count: 2,
        excluded_count: 1,
        perimeter: null,
        perimeter_status: "absent",
      }),
      expect.objectContaining({
        group: "Unclassified",
        archived: "false",
        measurement_count: 2,
        excluded_count: 1,
        length: null,
        length_status: "absent",
      }),
    ]);
  });
  it("exports decimal feet and acres without display rounding", () => {
    const session = fixture();
    session.settings.displayUnit = "ft-in";
    session.settings.areaDisplay = "ac";
    session.settings.measurementDecimalPlaces = 0;
    const tables = buildTakeoffTables(session, selection);
    expect(objects(tables.project)[0]).toMatchObject({ linear_unit: "ft", area_unit: "ac" });
    expect(Number(objects(tables.project)[0]!.length)).toBeCloseTo(1234.56789 / 304.8, 12);
    expect(Number(objects(tables.project)[0]!.area)).toBeCloseTo(1 / 4046.8564224, 15);
  });
  it("keeps page labels and type ordering, and omits breakdown when none is selected", () => {
    const session = fixture();
    expect(
      objects(
        buildTakeoffTables(session, { breakdowns: ["page"], classificationDimensionIds: [] }, [
          "Source",
        ]).breakdowns[0]![1],
      )[0]!.group,
    ).toBe("Ground floor");
    expect(
      objects(
        buildTakeoffTables(session, { breakdowns: ["type"], classificationDimensionIds: [] })
          .breakdowns[0]![1],
      ).map((row) => row.group),
    ).toEqual(["Line", "Polygon"]);
    expect(
      buildTakeoffTables(session, { breakdowns: [], classificationDimensionIds: [] }).breakdowns,
    ).toEqual([]);
    expect(() =>
      buildTakeoffTables(session, { ...selection, classificationDimensionIds: ["missing"] }),
    ).toThrow("Choose available");
    expect(() =>
      buildTakeoffTables(createEmptySession(session.pdf, 1), {
        breakdowns: [],
        classificationDimensionIds: [],
      }),
    ).toThrow();
  });
  it("keeps all-excluded and overflowing totals blank with accurate statuses", () => {
    const session = fixture();
    session.pages[1]!.measurements = [session.pages[1]!.measurements[2]!];
    expect(objects(buildTakeoffTables(session, selection).project)[0]).toMatchObject({
      length: null,
      length_status: "absent",
      excluded_count: 1,
    });
    const large = fixture();
    const calibration = large.pages[1]!.calibrations[0]!;
    if (calibration.mode !== "uniform") throw new Error("Expected uniform scale");
    calibration.referenceDistanceMm = 9e307;
    large.pages[1]!.measurements = [0, 1].map((index) => ({
      ...large.pages[1]!.measurements[0]!,
      id: String(index),
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    }));
    expect(objects(buildTakeoffTables(large, selection).project)[0]).toMatchObject({
      length: null,
      length_status: "unavailable",
      excluded_count: 0,
    });
  });
  it("neutralizes formula-like CSV labels, quotes newlines, and keeps numeric precision", () => {
    const tables = buildTakeoffTables(fixture(), selection);
    const csv = serializeExportTableCsv({
      ...tables.project,
      rows: [...tables.project.rows, ...tables.breakdowns[0]![1].rows],
    });
    expect(csv.startsWith("\ufeffsection,")).toBe(true);
    expect(csv).toContain('"\'=SUM(1,2)\n""Old"""');
    expect(csv).toContain("1.23456789");
    expect(csv).not.toContain("NaN");
  });
  it.each(["xlsx", "ods"] as const)(
    "writes numeric %s summary cells and preserves literal text",
    async (format) => {
      const tables = buildTakeoffTables(fixture(), selection);
      const bytes = await buildSpreadsheetTables(format, [
        ["Project totals", tables.project],
        ["Breakdown", tables.breakdowns[0]![1]],
      ]);
      const workbook = read(bytes, { type: "array" });
      expect(workbook.SheetNames).toEqual(["Project totals", "Breakdown"]);
      const project = workbook.Sheets["Project totals"]!;
      expect(project.J2).toMatchObject({ t: "n", v: tables.project.rows[0]![9] });
      const breakdown = workbook.Sheets.Breakdown!;
      expect(breakdown.F2).toMatchObject({ t: "s", v: '=SUM(1,2)\n"Old"' });
      expect(breakdown.F2!.f).toBeUndefined();
      expect(project.I2).toMatchObject({ t: "n", v: 2 });
      expect(breakdown.J3).toBeUndefined();
      expect(utils.sheet_to_json(project, { header: 1 })).toHaveLength(2);
    },
  );
  it("captures a stable snapshot before asynchronous workbook generation", async () => {
    const session = fixture();
    const expected = buildTakeoffTables(session, {
      breakdowns: [],
      classificationDimensionIds: [],
    });
    vi.mocked(downloadExportFile).mockClear();
    const pending = downloadTakeoff("xlsx", session, {
      breakdowns: [],
      classificationDimensionIds: [],
    });
    session.pages[1]!.measurements = [];
    session.pdf.name = "Changed.pdf";
    session.settings.displayUnit = "ft";
    await pending;
    const [contents, filename] = vi.mocked(downloadExportFile).mock.calls[0]!;
    const workbook = read(contents, { type: "array" });
    expect(filename).toBe("Plan-takeoff.xlsx");
    expect(workbook.SheetNames).toEqual(["Project totals"]);
    expect(workbook.Sheets["Project totals"]!.J2!.v).toBe(expected.project.rows[0]![9]);
    expect(workbook.Sheets["Project totals"]!.N2!.v).toBe("m");
  });
  it.each(["csv", "xlsx", "ods"] as const)(
    "downloads a distinct %s summary file",
    async (format) => {
      vi.mocked(downloadExportFile).mockClear();
      await downloadTakeoff(format, fixture(), { breakdowns: [], classificationDimensionIds: [] });
      expect(downloadExportFile).toHaveBeenCalledWith(
        expect.anything(),
        `Plan-takeoff.${format}`,
        expect.any(String),
      );
    },
  );
});

describe("Multiple Takeoff breakdowns", () => {
  it("exports each selected breakdown once in stable order and distinguishes equal dimension names", () => {
    const session = fixture();
    session.classificationCatalog.dimensions.push({
      id: "zone",
      name: "Trade",
      archived: true,
      values: [],
    });
    const tables = buildTakeoffTables(session, {
      breakdowns: ["type", "page", "page"],
      classificationDimensionIds: ["zone", "trade", "trade"],
    });
    expect(tables.breakdowns.map(([name]) => name)).toEqual([
      "By page",
      "By type",
      "By classification 1",
      "By classification 2",
    ]);
    expect(tables.project.rows).toHaveLength(1);
    expect(objects(tables.breakdowns[2]![1])[0]).toMatchObject({
      dimension: "Trade",
      dimension_id: "trade",
    });
    expect(objects(tables.breakdowns[3]![1])[0]).toMatchObject({
      dimension: "Trade",
      dimension_id: "zone",
      archived: "false",
    });
    for (const [, table] of tables.breakdowns) {
      const rows = objects(table);
      expect(rows.reduce((sum, row) => sum + Number(row.measurement_count), 0)).toBe(4);
      expect(rows.reduce((sum, row) => sum + Number(row.excluded_count), 0)).toBe(2);
    }
  });
  it.each(["xlsx", "ods"] as const)(
    "adds summary sheets to the ordinary %s workbook without changing existing sheets",
    async (format) => {
      const session = fixture();
      session.pages[1]!.measurements = session.pages[1]!.measurements.slice(0, 2);
      const original = read(await buildSpreadsheet(format, session), { type: "array" });
      const tables = buildTakeoffTables(session, {
        breakdowns: ["page", "type"],
        classificationDimensionIds: ["trade"],
      });
      const combined = read(
        await buildSpreadsheet(format, session, null, undefined, [
          ["Project totals", tables.project],
          ...tables.breakdowns,
        ]),
        { type: "array" },
      );
      expect(combined.SheetNames).toEqual([
        "Measurements",
        "Classification assignments",
        "Project totals",
        "By page",
        "By type",
        "By classification 1",
      ]);
      for (const name of original.SheetNames)
        expect(utils.sheet_to_json(combined.Sheets[name]!, { header: 1, defval: null })).toEqual(
          utils.sheet_to_json(original.Sheets[name]!, { header: 1, defval: null }),
        );
      expect(combined.Sheets["Project totals"]!.J2).toMatchObject({
        t: "n",
        v: tables.project.rows[0]![9],
      });
    },
  );
  it("writes a CSV with one project row and independent breakdown sections", async () => {
    vi.mocked(downloadExportFile).mockClear();
    await downloadTakeoff("csv", fixture(), {
      breakdowns: ["page", "type"],
      classificationDimensionIds: ["trade"],
    });
    const [contents] = vi.mocked(downloadExportFile).mock.calls[0]!;
    const workbook = read(new TextEncoder().encode(contents as string), { type: "array" });
    const rows = utils.sheet_to_json<{ section: string; breakdown: string }>(
      workbook.Sheets[workbook.SheetNames[0]!]!,
    );
    expect(rows.filter((row) => row.section === "project")).toHaveLength(1);
    expect(
      new Set(rows.filter((row) => row.section === "breakdown").map((row) => row.breakdown)),
    ).toEqual(new Set(["page", "type", "classification"]));
  });
});

describe("CSV bundles with Takeoff", () => {
  it.each(["measurements", "classification-assignments"] as const)(
    "keeps the ordinary %s CSV intact and adds independent summary files",
    async (dataset) => {
      const session = fixture();
      session.pages[1]!.measurements = session.pages[1]!.measurements.slice(0, 2);
      vi.mocked(downloadExportFile).mockClear();
      await downloadCsvWithTakeoff(
        session,
        { breakdowns: ["page", "type"], classificationDimensionIds: ["trade"] },
        null,
        undefined,
        dataset,
      );
      const [contents, filename, mime] = vi.mocked(downloadExportFile).mock.calls[0]!;
      const files = unzipSync(contents as Uint8Array);
      const primary = dataset === "measurements" ? "measurements" : "classifications";
      expect(Object.keys(files)).toEqual([
        `${primary}.csv`,
        "project-totals.csv",
        "by-page.csv",
        "by-type.csv",
        "by-classification-1.csv",
      ]);
      expect(Array.from(files[`${primary}.csv`]!)).toEqual(
        Array.from(
          new TextEncoder().encode(
            dataset === "measurements"
              ? buildCsv(session)
              : buildClassificationAssignmentsCsv(session),
          ),
        ),
      );
      expect(filename).toBe(`Plan-${primary}.zip`);
      expect(mime).toBe("application/zip");
      const summary = read(files["project-totals.csv"]!, { type: "array" });
      const rows = utils.sheet_to_json<{ length: number }>(summary.Sheets[summary.SheetNames[0]!]!);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.length).toBeCloseTo(1.23456789, 12);
    },
  );
  it("does not create a partial bundle if measurement export rejects invalid data", async () => {
    vi.mocked(downloadExportFile).mockClear();
    await expect(
      downloadCsvWithTakeoff(fixture(), { breakdowns: [], classificationDimensionIds: [] }),
    ).rejects.toThrow();
    expect(downloadExportFile).not.toHaveBeenCalled();
  });
});

it.each(["csv", "xlsx", "ods"] as const)(
  "exports only the selected breakdown in %s without project totals",
  async (format) => {
    vi.mocked(downloadExportFile).mockClear();
    await downloadTakeoff(format, fixture(), {
      includeProjectTotals: false,
      breakdowns: ["page"],
      classificationDimensionIds: [],
    });
    const bytes = vi.mocked(downloadExportFile).mock.calls[0]![0];
    if (format === "csv") {
      const csv = String(bytes);
      expect(csv).toContain("breakdown,page,");
      expect(csv).not.toContain("Project totals");
    } else {
      expect(read(bytes, { type: "array" }).SheetNames).toEqual(["By page"]);
    }
  },
);

it("omits the unselected project totals CSV and rejects an empty selection", async () => {
  const session = fixture();
  session.pages[1]!.measurements = session.pages[1]!.measurements.slice(0, 2);
  vi.mocked(downloadExportFile).mockClear();
  await downloadCsvWithTakeoff(
    session,
    { includeProjectTotals: false, breakdowns: ["type"], classificationDimensionIds: [] },
    null,
    session.settings.csvExport,
    "measurements",
  );
  const files = unzipSync(vi.mocked(downloadExportFile).mock.calls[0]![0] as Uint8Array);
  expect(Object.keys(files)).toEqual(["measurements.csv", "by-type.csv"]);
  expect(() =>
    buildTakeoffTables(session, {
      includeProjectTotals: false,
      breakdowns: [],
      classificationDimensionIds: [],
    }),
  ).toThrow("Select at least one summary");
});

describe("Derived quantities in Takeoff exports", () => {
  const point = (x: number, y: number) => ({ x, y });
  const base = {
    classificationValueIds: [],
    calibrationId: "scale",
    visible: true,
  };
  // Scale: 100 mm per unit. Walls: a 12 500 mm line and a hidden 1000 mm line, 2700 mm high, so
  // 13 500 × 2700 = 36 450 000 mm² (36.45 m²). Slab: 4000 × 5000 mm, 150 mm thick, so
  // 20 000 000 × 150 = 3 000 000 000 mm³ (3 m³).
  function derivedFixture() {
    const session = fixture();
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
    session.pages[1]!.measurements = [
      {
        ...base,
        id: "wall",
        name: "Wall",
        type: "line",
        points: [point(0, 0), point(125, 0)],
        classificationValueIds: ["wall"],
      },
      {
        ...base,
        id: "hidden-wall",
        name: "Hidden wall",
        type: "line",
        points: [point(0, 0), point(10, 0)],
        classificationValueIds: ["wall"],
        visible: false,
      },
      {
        ...base,
        id: "slab",
        name: "Slab",
        type: "polygon",
        points: [point(0, 0), point(40, 0), point(40, 50), point(0, 50)],
        classificationValueIds: ["slab"],
      },
    ];
    session.classificationRates = [
      { valueId: "wall", derivation: { source: "length", factorMm: 2700 }, price: null },
      { valueId: "slab", derivation: { source: "area", factorMm: 150 }, price: null },
    ];
    return session;
  }
  const derivedSelection: TakeoffSelection = {
    breakdowns: [],
    classificationDimensionIds: ["element"],
  };
  const projectRow = (session: ReturnType<typeof derivedFixture>) =>
    objects(buildTakeoffTables(session, derivedSelection).project)[0]!;

  it("appends the derived columns after the 19 existing ones, with derived areas in the area unit", () => {
    const { project } = buildTakeoffTables(derivedFixture(), derivedSelection);
    expect(project.headers.slice(0, 19)).toEqual([
      "section",
      "breakdown",
      "dimension",
      "dimension_id",
      "group_id",
      "group",
      "archived",
      "measurement_count",
      "excluded_count",
      "length",
      "length_status",
      "perimeter",
      "perimeter_status",
      "linear_unit",
      "area",
      "area_status",
      "area_unit",
      "count",
      "count_status",
    ]);
    expect(project.headers.slice(19)).toEqual([
      "derived_area",
      "derived_area_status",
      "derived_volume",
      "derived_volume_status",
      "volume_unit",
      "cost",
      "cost_status",
      "currency",
    ]);
    expect(project.columnTypes.slice(19)).toEqual([
      "number",
      "text",
      "number",
      "text",
      "text",
      "number",
      "text",
      "text",
    ]);
    expect(projectRow(derivedFixture())).toMatchObject({
      derived_area: 36.45,
      derived_area_status: "value",
      derived_volume: 3,
      derived_volume_status: "value",
      area_unit: "m²",
      volume_unit: "m³",
      cost: null,
      cost_status: "absent",
      currency: null,
    });
  });

  it("converts derived areas and volumes to the display unit", () => {
    const feet = derivedFixture();
    feet.settings.displayUnit = "ft-in";
    // 36 450 000 mm² / 304.8² = 392.3445… ft²; 3 000 000 000 mm³ / 304.8³ = 105.9440… ft³.
    const row = projectRow(feet);
    expect(row.derived_area).toBeCloseTo(392.34453468906935, 9);
    expect(row.derived_volume).toBeCloseTo(105.94400016446576, 9);
    expect(row).toMatchObject({ area_unit: "ft²", volume_unit: "ft³" });

    // Exactly one cubic foot: a 1 m² cloud-free polygon, 28.316846592 mm thick.
    const cubicFoot = derivedFixture();
    cubicFoot.settings.displayUnit = "ft";
    cubicFoot.pages[1]!.measurements = [
      {
        ...base,
        id: "slab",
        name: "Slab",
        type: "polygon",
        points: [point(0, 0), point(10, 0), point(10, 10), point(0, 10)],
        classificationValueIds: ["slab"],
      },
    ];
    cubicFoot.classificationRates = [
      { valueId: "slab", derivation: { source: "area", factorMm: 28.316846592 }, price: null },
    ];
    expect(projectRow(cubicFoot).derived_volume).toBeCloseTo(1, 12);
  });

  it("keeps the volume in cubic linear units when the area is shown in acres", () => {
    const session = derivedFixture();
    session.settings.areaDisplay = "ac";
    // 36 450 000 mm² / 4 046 856 422.4 mm² per acre.
    const row = projectRow(session);
    expect(row.derived_area).toBeCloseTo(0.009006991154478176, 15);
    expect(row).toMatchObject({ area_unit: "ac", volume_unit: "m³", derived_volume: 3 });
  });

  it("leaves absent and unavailable derived cells empty with their status", () => {
    const none = derivedFixture();
    none.classificationRates = [];
    expect(buildTakeoffTables(none, derivedSelection).hasUnavailable).toBe(false);
    expect(projectRow(none)).toMatchObject({
      derived_area: null,
      derived_area_status: "absent",
      derived_volume: null,
      derived_volume_status: "absent",
      volume_unit: "m³",
    });

    const overflow = derivedFixture();
    overflow.classificationRates = [
      { valueId: "wall", derivation: { source: "length", factorMm: 1e308 }, price: null },
      { valueId: "slab", derivation: { source: "area", factorMm: 150 }, price: null },
    ];
    expect(projectRow(overflow)).toMatchObject({
      derived_area: null,
      derived_area_status: "unavailable",
      derived_volume: 3,
      derived_volume_status: "value",
    });
    expect(buildTakeoffTables(overflow, derivedSelection).hasUnavailable).toBe(true);

    // A result that rounds to zero on conversion is not a value (5e-324 mm × 13 500 mm).
    const underflow = derivedFixture();
    underflow.classificationRates = [
      { valueId: "wall", derivation: { source: "length", factorMm: 5e-324 }, price: null },
    ];
    expect(projectRow(underflow)).toMatchObject({
      derived_area: null,
      derived_area_status: "unavailable",
    });
  });

  it("reports the derived columns per breakdown row, each value in its own row", () => {
    const tables = buildTakeoffTables(derivedFixture(), derivedSelection);
    expect(
      objects(tables.breakdowns[0]![1]).map((row) => [
        row.group,
        row.derived_area,
        row.derived_area_status,
        row.derived_volume,
        row.derived_volume_status,
      ]),
    ).toEqual([
      ["Wall", 36.45, "value", null, "absent"],
      ["Slab", null, "absent", 3, "value"],
    ]);
  });

  it("writes the derived columns as literal CSV text", () => {
    const tables = buildTakeoffTables(derivedFixture(), derivedSelection);
    const [header, row] = serializeExportTableCsv(tables.project).replace("﻿", "").split(/\r?\n/);
    expect(
      header!.endsWith(
        ",count_status,derived_area,derived_area_status,derived_volume,derived_volume_status,volume_unit,cost,cost_status,currency",
      ),
    ).toBe(true);
    expect(row!.endsWith(",36.45,value,3,value,m³,,absent,")).toBe(true);
  });

  it.each(["xlsx", "ods"] as const)(
    "writes numeric derived %s cells and text statuses",
    async (format) => {
      const tables = buildTakeoffTables(derivedFixture(), derivedSelection);
      const workbook = read(
        await buildSpreadsheetTables(format, [["Project totals", tables.project]]),
        {
          type: "array",
        },
      );
      const sheet = workbook.Sheets["Project totals"]!;
      expect(sheet.T1).toMatchObject({ t: "s", v: "derived_area" });
      expect(sheet.X1).toMatchObject({ t: "s", v: "volume_unit" });
      expect(sheet.T2).toMatchObject({ t: "n", v: 36.45 });
      expect(sheet.U2).toMatchObject({ t: "s", v: "value" });
      expect(sheet.V2).toMatchObject({ t: "n", v: 3 });
      expect(sheet.W2).toMatchObject({ t: "s", v: "value" });
      expect(sheet.X2).toMatchObject({ t: "s", v: "m³" });
    },
  );

  describe("cost columns", () => {
    // Walls: 13 500 mm = 13.5 m at 4 per m = 54. Slab: 3 m³ at 110 per m³ = 330. Total 384.
    function pricedFixture() {
      const session = derivedFixture();
      session.settings.currency = "EUR";
      session.classificationRates = [
        {
          valueId: "wall",
          derivation: { source: "length", factorMm: 2700 },
          price: { amount: 4, basis: "length", unit: "m" },
        },
        {
          valueId: "slab",
          derivation: { source: "area", factorMm: 150 },
          price: { amount: 110, basis: "derived", unit: "m³" },
        },
      ];
      return session;
    }

    it("exports the unrounded cost, its status and the project currency", () => {
      expect(projectRow(pricedFixture())).toMatchObject({
        cost: 384,
        cost_status: "value",
        currency: "EUR",
      });
      const tables = buildTakeoffTables(pricedFixture(), derivedSelection);
      expect(
        objects(tables.breakdowns[0]![1]).map((row) => [row.group, row.cost, row.cost_status]),
      ).toEqual([
        ["Wall", 54, "value"],
        ["Slab", 330, "value"],
      ]);
      expect(tables.hasUnavailable).toBe(false);

      // Nothing is rounded: 13.5 m at 0.3333 per m is 4.49955.
      const fractional = pricedFixture();
      fractional.classificationRates[0]!.price!.amount = 0.3333;
      expect(projectRow(fractional).cost).toBeCloseTo(334.49955, 9);
    });

    it("leaves the currency empty without one, and the cost does not depend on the display unit", () => {
      const session = pricedFixture();
      session.settings.currency = null;
      session.settings.displayUnit = "ft-in";
      expect(projectRow(session)).toMatchObject({
        cost: 384,
        cost_status: "value",
        currency: null,
      });
    });

    it("exports a zero price as a zero cost and an overflowing one as unavailable", () => {
      const free = pricedFixture();
      free.classificationRates[0]!.price!.amount = 0;
      expect(projectRow(free)).toMatchObject({ cost: 330, cost_status: "value" });
      const onlyFree = pricedFixture();
      onlyFree.classificationRates = [{ ...free.classificationRates[0]! }];
      expect(projectRow(onlyFree)).toMatchObject({ cost: 0, cost_status: "value" });

      const overflow = pricedFixture();
      overflow.classificationRates[0]!.price!.amount = 1e308;
      expect(projectRow(overflow)).toMatchObject({ cost: null, cost_status: "unavailable" });
      expect(buildTakeoffTables(overflow, derivedSelection).hasUnavailable).toBe(true);
    });

    it("writes the cost columns as CSV text", () => {
      const tables = buildTakeoffTables(pricedFixture(), derivedSelection);
      const [, row] = serializeExportTableCsv(tables.project).replace("﻿", "").split(/\r?\n/);
      expect(row!.endsWith(",36.45,value,3,value,m³,384,value,EUR")).toBe(true);
    });

    it.each(["xlsx", "ods"] as const)("writes a numeric cost cell in %s", async (format) => {
      const tables = buildTakeoffTables(pricedFixture(), derivedSelection);
      const workbook = read(
        await buildSpreadsheetTables(format, [["Project totals", tables.project]]),
        { type: "array" },
      );
      const sheet = workbook.Sheets["Project totals"]!;
      expect(sheet.Y1).toMatchObject({ t: "s", v: "cost" });
      expect(sheet.AA1).toMatchObject({ t: "s", v: "currency" });
      expect(sheet.Y2).toMatchObject({ t: "n", v: 384 });
      expect(sheet.Z2).toMatchObject({ t: "s", v: "value" });
      expect(sheet.AA2).toMatchObject({ t: "s", v: "EUR" });
    });
  });
});
