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
        group: "None assigned",
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
