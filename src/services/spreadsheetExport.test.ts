// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { CFB, read, utils } from "xlsx";
import { createEmptySession } from "../app/sessionState";
import { strFromU8, unzipSync } from "fflate";
import type { CurrentSession, Measurement } from "../types/domain";
import {
  buildMeasurementTable,
  createCsvExportSettingsPreset,
  type ExportCell,
  type ExportTable,
} from "./csv";
import { buildSpreadsheet, buildSpreadsheetTables, downloadSpreadsheet } from "./spreadsheetExport";
import { downloadExportFile } from "./exportDownload";

vi.mock("./exportDownload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./exportDownload")>()),
  downloadExportFile: vi.fn(),
}));

function fixture() {
  const session = createEmptySession({ name: "Plán.pdf", size: 10, lastModified: 1 }, 2);
  session.settings.displayUnit = "m";
  session.pageLabelOverrides = { 1: "Custom α" };
  session.classificationCatalog.dimensions = [
    {
      id: "trade",
      name: "Trade",
      archived: true,
      values: [{ id: "value", name: "=SUM(1,2)", archived: true }],
    },
  ];
  const page = session.pages[1]!;
  page.calibrations = [
    {
      id: "uniform",
      name: "Uniform",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
    {
      id: "xy",
      name: "XY",
      mode: "xy",
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 5000 },
      yReference: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, referenceDistanceMm: 10000 },
    },
  ];
  page.activeCalibrationId = "xy";
  page.measurements = [
    {
      id: "000123",
      name: '=SUM(1,2)\n"ñ"',
      type: "line",
      calibrationId: "uniform",
      points: [
        { x: 0, y: 0 },
        { x: 25, y: 0 },
      ],
      classificationValueIds: ["value"],
      visible: false,
      note: 'Tab\there\nLine & < > " Ω 😀',
    },
    {
      id: "polygon",
      name: "Room",
      type: "polygon",
      calibrationId: "xy",
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
      id: "polyline",
      name: "Open",
      type: "polyline",
      calibrationId: "uniform",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      classificationValueIds: [],
      visible: true,
    },
  ];
  session.pages[2]!.calibrations = [page.calibrations[0]!];
  session.pages[2]!.measurements = [
    { ...page.measurements[0]!, id: "second", name: "Second page", classificationValueIds: [] },
  ];
  return session;
}

function rows(sheet: Parameters<typeof utils.sheet_to_json>[0]) {
  return utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null });
}

const literalText =
  ' _x0041_ _x000d_ _x005F_ _X0042_ _x005F_x0041_ _x0041_x0042_ & < > " Ω 😀\r\n A \n B\t ';

it("preserves literal OOXML escape sequences in XLSX text", async () => {
  const session = fixture();
  session.pages[1]!.measurements[0]!.name = literalText;
  const archive = CFB.read(await buildSpreadsheet("xlsx", session), { type: "array" });
  const strings = CFB.find(archive, "/xl/sharedStrings.xml")!;
  const document = new DOMParser().parseFromString(
    new TextDecoder().decode(strings.content as Uint8Array),
    "application/xml",
  );
  expect(document.querySelector("parsererror")).toBeNull();
  // Decode OOXML escapes once as specified; SheetJS's reader decodes some strings twice.
  const values = Array.from(document.getElementsByTagName("t"), (node) =>
    (node.textContent ?? "").replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    ),
  );
  expect(values).toContain(literalText);
});

it("writes compliant ODS packaging and exact XML string values and whitespace", async () => {
  const session = fixture();
  session.pages[1]!.measurements[0]!.name = literalText;
  const bytes = await buildSpreadsheet("ods", session);
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(header.getUint32(0, true)).toBe(0x04034b50);
  expect(header.getUint16(8, true)).toBe(0); // stored, not compressed
  expect(header.getUint16(28, true)).toBe(0); // no extra fields
  const decoder = new TextDecoder();
  expect(decoder.decode(bytes.slice(30, 30 + header.getUint16(26, true)))).toBe("mimetype");
  const archive = CFB.read(bytes, { type: "array" });
  const content = CFB.find(archive, "content.xml")!;
  const document = new DOMParser().parseFromString(
    decoder.decode(content.content as Uint8Array),
    "application/xml",
  );
  expect(document.querySelector("parsererror")).toBeNull();
  const office = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
  const table = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
  const cell = Array.from(document.getElementsByTagNameNS(table, "table-cell")).find(
    (item) => item.getAttributeNS(office, "string-value") === literalText,
  )!;
  expect(cell).toBeDefined();
  expect(cell.hasAttributeNS(table, "formula")).toBe(false);
  const textValue = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node instanceof Element) {
      if (node.localName === "s") return " ";
      if (node.localName === "tab") return "\t";
      if (node.localName === "line-break") return "\n";
    }
    return Array.from(node.childNodes).map(textValue).join("");
  };
  expect(textValue(cell)).toBe(literalText);
});

for (const format of ["xlsx", "ods"] as const) {
  describe(`${format} export`, () => {
    it("writes both sheets with typed quantities, safe literal text, blank inapplicable values and all pages", async () => {
      const session = fixture();
      const before = JSON.stringify(session);
      const settings = createCsvExportSettingsPreset(session, "all");
      const workbook = read(
        await buildSpreadsheet(format, session, ["Source", "Second label"], settings),
        { type: "array", cellFormula: true },
      );
      expect(workbook.SheetNames).toEqual(["Measurements", "Classification assignments"]);
      const data = rows(workbook.Sheets.Measurements!);
      const column = (name: string) => data[0]!.indexOf(name);
      expect(data).toHaveLength(5);
      expect(data[1]![column("measurement_id")]).toBe("000123");
      expect(data[1]![column("name")]).toBe(session.pages[1]!.measurements[0]!.name);
      expect(data[1]![column("note")]).toBe(session.pages[1]!.measurements[0]!.note);
      expect(data[1]![column("length")]).toBe(2.5);
      expect(data[1]![column("area")]).toBeNull();
      expect(data[1]![column("calibration_id")]).toBe("uniform");
      expect(data[2]![column("perimeter")]).toBe(30);
      expect(data[2]![column("area")]).toBe(50);
      expect(data[3]![column("length")]).toBe(2);
      expect(data[1]![column("page_label")]).toBe("Custom α");
      expect(data[4]![column("page_label")]).toBe("Second label");
      expect(data[1]![column("classification:Trade")]).toBe("=SUM(1,2)");
      const assignments = rows(workbook.Sheets["Classification assignments"]!);
      expect(assignments).toHaveLength(2);
      expect(assignments[1]![assignments[0]!.indexOf("classification_status")]).toBe("archived");
      for (const sheet of Object.values(workbook.Sheets)) {
        for (const [key, cell] of Object.entries(sheet)) {
          if (!key.startsWith("!")) expect(cell.f).toBeUndefined();
        }
      }
      expect(JSON.stringify(session)).toBe(before);
    });

    it("respects column overrides and keeps required fields", async () => {
      const session = fixture();
      const workbook = read(
        await buildSpreadsheet(
          format,
          session,
          null,
          createCsvExportSettingsPreset(session, "required-only"),
        ),
        { type: "array" },
      );
      const headers = rows(workbook.Sheets.Measurements!)[0]!;
      expect(headers).toContain("measurement_id");
      expect(headers).not.toContain("name");
      expect(headers).not.toContain("length");
      expect(rows(workbook.Sheets["Classification assignments"]!)).toHaveLength(2);
    });

    it("preserves numeric precision independently of displayed decimal places and exports decimal feet", async () => {
      const session = fixture();
      session.settings.displayUnit = "ft-in";
      session.settings.measurementDecimalPlaces = 0;
      const workbook = read(await buildSpreadsheet(format, session), { type: "array" });
      const data = rows(workbook.Sheets.Measurements!);
      expect(data[1]![data[0]!.indexOf("length")]).toBeCloseTo(2500 / 304.8, 13);
      expect(data[1]![data[0]!.indexOf("unit")]).toBe("ft");
    });

    it("writes a header-only assignment sheet when no measurements are classified", async () => {
      const session = fixture();
      session.pages[1]!.measurements[0]!.classificationValueIds = [];
      const workbook = read(await buildSpreadsheet(format, session), { type: "array" });
      expect(rows(workbook.Sheets["Classification assignments"]!)).toHaveLength(1);
    });

    it("rejects empty measurements, missing scales, invalid polygons and overflowing quantities", async () => {
      await expect(
        buildSpreadsheet(
          format,
          createEmptySession({ name: "empty.pdf", size: 1, lastModified: 1 }, 1),
        ),
      ).rejects.toThrow("There are no measurements");
      const session = fixture();
      session.pages[1]!.measurements[0]!.calibrationId = "missing";
      await expect(buildSpreadsheet(format, session)).rejects.toThrow("missing calibration");
      const invalid = fixture();
      invalid.pages[1]!.measurements[1]!.points = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
      await expect(buildSpreadsheet(format, invalid)).rejects.toThrow("invalid Polygon");
      const overflow = fixture();
      overflow.pages[1]!.measurements[0]!.points[1]!.x = Number.MAX_VALUE;
      await expect(buildSpreadsheet(format, overflow)).rejects.toThrow(/finite/);
    });

    it.each([
      ["a".repeat(32_768), "text exceeds the 32,767-character limit"],
      ["invalid\u0000text", "text contains a character that XLSX and ODS cannot store"],
      ["lone\ud800surrogate", "text contains a character that XLSX and ODS cannot store"],
    ])("identifies unsupported cell text without truncating it", async (name, reason) => {
      const session = fixture();
      session.pages[1]!.measurements[1]!.name = name;
      const before = JSON.stringify(session);
      vi.mocked(downloadExportFile).mockClear();
      await expect(downloadSpreadsheet(format, session)).rejects.toThrow(
        `Sheet "Measurements", row 3, field "name": ${reason}. Edit this field or export CSV or JSON instead.`,
      );
      expect(JSON.stringify(session)).toBe(before);
      expect(downloadExportFile).not.toHaveBeenCalled();
    });

    it("identifies unsupported text in classification assignments with measurement columns disabled", async () => {
      const session = fixture();
      session.classificationCatalog.dimensions[0]!.name = "Invalid\u0000dimension";
      await expect(
        buildSpreadsheet(
          format,
          session,
          null,
          createCsvExportSettingsPreset(session, "required-only"),
        ),
      ).rejects.toThrow(
        'Sheet "Classification assignments", row 2, field "classification_dimension": text contains a character that XLSX and ODS cannot store.',
      );
    });

    it("identifies invalid header text without including the oversized header in the message", async () => {
      const session = fixture();
      session.classificationCatalog.dimensions[0]!.name = "a".repeat(32_768);
      const settings = createCsvExportSettingsPreset(session, "all");
      const columnIndex = buildMeasurementTable(session, null, settings).headers.findIndex(
        (header) => header.startsWith("classification:"),
      );
      await expect(buildSpreadsheet(format, session, null, settings)).rejects.toThrow(
        `Sheet "Measurements", row 1, field header in column ${columnIndex + 1}: text exceeds the 32,767-character limit. Edit this field or export CSV or JSON instead.`,
      );
    });

    it("preserves text at the supported length boundary", async () => {
      const session = fixture();
      const name = "a".repeat(32_767);
      session.pages[1]!.measurements[0]!.name = name;
      const workbook = read(await buildSpreadsheet(format, session), { type: "array" });
      const data = rows(workbook.Sheets.Measurements!);
      expect(data[1]![data[0]!.indexOf("name")]).toBe(name);
    });

    it("keeps diagnostics compact when a valid field header is long", async () => {
      const session = fixture();
      const dimension = session.classificationCatalog.dimensions[0]!;
      dimension.name = "a".repeat(200);
      dimension.values[0]!.name = "invalid\u0000value";
      const field = `${`classification:${dimension.name}`.slice(0, 80)}…`;
      const before = JSON.stringify(session);
      await expect(
        buildSpreadsheet(format, session, null, createCsvExportSettingsPreset(session, "all")),
      ).rejects.toThrow(
        `Sheet "Measurements", row 2, field "${field}": text contains a character that XLSX and ODS cannot store.`,
      );
      expect(JSON.stringify(session)).toBe(before);
    });

    it("rejects too many columns before the writer can truncate the data", async () => {
      const session = fixture();
      session.classificationCatalog.dimensions = Array.from({ length: 5_500 }, (_, index) => ({
        id: `dimension-${index}`,
        name: `Dimension ${index}`,
        archived: false,
        values: [],
      }));
      session.pages[1]!.measurements[0]!.classificationValueIds = [];
      await expect(
        buildSpreadsheet(format, session, null, createCsvExportSettingsPreset(session, "all")),
      ).rejects.toThrow("column limits");
    });

    it("downloads the correct filename, MIME type and nonempty binary content", async () => {
      vi.mocked(downloadExportFile).mockClear();
      await downloadSpreadsheet(format, fixture());
      expect(downloadExportFile).toHaveBeenCalledOnce();
      const [bytes, filename, mime] = vi.mocked(downloadExportFile).mock.calls[0]!;
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect((bytes as Uint8Array).length).toBeGreaterThan(0);
      expect(filename).toBe(`Plán-measurements.${format}`);
      expect(mime).toBe(
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/vnd.oasis.opendocument.spreadsheet",
      );
    });
  });
}

interface RawCell {
  kind: "string" | "number";
  value: string;
  formula: boolean;
}
type RawGrid = (RawCell | undefined)[][];

/** Reads the stored cells straight from the package XML: type, value and any formula. */
function rawSheets(format: "xlsx" | "ods", bytes: Uint8Array): Record<string, RawGrid> {
  const files = unzipSync(bytes);
  const parse = (path: string) =>
    new DOMParser().parseFromString(strFromU8(files[path]!), "application/xml");
  const sheets: Record<string, RawGrid> = {};
  if (format === "xlsx") {
    const strings = Array.from(
      parse("xl/sharedStrings.xml").getElementsByTagName("si"),
      (item) => item.textContent ?? "",
    );
    Array.from(parse("xl/workbook.xml").getElementsByTagName("sheet")).forEach((sheet, index) => {
      const grid: RawGrid = [];
      for (const cell of Array.from(
        parse(`xl/worksheets/sheet${index + 1}.xml`).getElementsByTagName("c"),
      )) {
        const { r, c } = utils.decode_cell(cell.getAttribute("r")!);
        const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
        const isString = cell.getAttribute("t") === "s";
        (grid[r] ??= [])[c] = {
          kind: isString ? "string" : "number",
          value: isString ? strings[Number(raw)]! : raw,
          formula: cell.getElementsByTagName("f").length > 0,
        };
      }
      sheets[sheet.getAttribute("name")!] = grid;
    });
    return sheets;
  }
  const office = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
  const tableNs = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
  for (const table of Array.from(parse("content.xml").getElementsByTagNameNS(tableNs, "table"))) {
    sheets[table.getAttributeNS(tableNs, "name")!] = Array.from(
      table.getElementsByTagNameNS(tableNs, "table-row"),
      (row) =>
        Array.from(row.getElementsByTagNameNS(tableNs, "table-cell"), (cell) => {
          const type = cell.getAttributeNS(office, "value-type");
          if (!type) return undefined;
          return {
            kind: type === "string" ? "string" : "number",
            value: cell.getAttributeNS(office, type === "string" ? "string-value" : "value")!,
            formula: cell.hasAttributeNS(tableNs, "formula"),
          } satisfies RawCell;
        }),
    );
  }
  return sheets;
}

function oneColumn(rows: ExportCell[][]): ExportTable {
  return { headers: ["id", "note"], columnTypes: ["text", "text"], rows };
}

const emptyRow: ExportCell[] = [];

for (const format of ["xlsx", "ods"] as const) {
  describe(`${format} shapes, limits and injection`, () => {
    // X/Y scale: 100 mm per unit across, 200 mm per unit down, so a 30 x 10 unit box is 3 m x 2 m.
    function shapeSession(types: readonly ("rectangle" | "ellipse")[]): CurrentSession {
      const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1);
      session.settings.displayUnit = "m";
      const page = session.pages[1]!;
      page.calibrations = [
        {
          id: "xy",
          name: "XY",
          mode: "xy",
          xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 },
          yReference: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, referenceDistanceMm: 2000 },
        },
      ];
      page.measurements = types.map((type, index) => ({
        id: `${type}-${index}`,
        name: type,
        type,
        points: [
          { x: 0, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 10 },
          { x: 0, y: 10 },
        ],
        calibrationId: "xy",
        classificationValueIds: [],
        visible: true,
      }));
      return session;
    }

    it("writes hand-computed rectangle and X/Y ellipse perimeter and area in metres", async () => {
      const workbook = read(
        await buildSpreadsheet(format, shapeSession(["rectangle", "ellipse"])),
        { type: "array" },
      );
      const data = rows(workbook.Sheets.Measurements!);
      const column = (name: string) => data[0]!.indexOf(name);
      const [rectangle, ellipse] = [data[1]!, data[2]!];

      // Rectangle: 3 m x 2 m -> perimeter 2 * (3 + 2) = 10 m, area 3 * 2 = 6 m2.
      expect(rectangle[column("type")]).toBe("Rectangle");
      expect(rectangle[column("length")]).toBeNull();
      expect(rectangle[column("perimeter")]).toBe(10);
      expect(rectangle[column("area")]).toBe(6);
      expect(rectangle[column("unit")]).toBe("m");
      expect(rectangle[column("area_unit")]).toBe("m²");
      // Ellipse in the same box: semi-axes a = 1.5 m, b = 1 m.
      // Area = pi * 1.5 * 1 = 4.71238898038469 m2.
      // Perimeter (Ramanujan II): h = ((1.5 - 1) / 2.5)^2 = 0.04, so
      // pi * 2.5 * (1 + 0.12 / (10 + sqrt(3.88))) = 7.9327197946256 m.
      expect(ellipse[column("type")]).toBe("Ellipse");
      expect(ellipse[column("length")]).toBeNull();
      expect(ellipse[column("perimeter")]).toBeCloseTo(7.9327197946256, 11);
      expect(ellipse[column("area")]).toBeCloseTo(4.71238898038469, 12);
      expect(ellipse[column("unit")]).toBe("m");
      expect(ellipse[column("area_unit")]).toBe("m²");
    });

    it("writes a circle on a uniform scale as 2 pi r and pi r squared", async () => {
      // 20 x 20 unit box at 100 mm per unit is 2 m x 2 m: radius 1 m.
      const session = shapeSession(["ellipse"]);
      const page = session.pages[1]!;
      page.calibrations = [
        {
          id: "uniform",
          name: "Uniform",
          mode: "uniform",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          referenceDistanceMm: 1000,
        },
      ];
      page.measurements[0]!.calibrationId = "uniform";
      page.measurements[0]!.points = [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ];
      const data = rows(
        read(await buildSpreadsheet(format, session), { type: "array" }).Sheets.Measurements!,
      );
      // Perimeter 2 * pi * 1 = 6.283185307179586 m, area pi * 1 * 1 = 3.141592653589793 m2.
      expect(data[1]![data[0]!.indexOf("perimeter")]).toBeCloseTo(6.283185307179586, 12);
      expect(data[1]![data[0]!.indexOf("area")]).toBeCloseTo(3.141592653589793, 12);
    });

    it("leaves counts and unmeasured revision clouds blank rather than 0", async () => {
      const session = fixture();
      session.settings.measureClouds = false;
      const page = session.pages[2]!;
      const square = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ];
      const count: Measurement = {
        id: "count",
        name: "Count",
        type: "count",
        calibrationId: null,
        points: square.slice(0, 3),
        classificationValueIds: [],
        visible: true,
      };
      const cloud: Measurement = {
        id: "cloud",
        name: "Cloud",
        type: "cloud",
        calibrationId: "uniform",
        points: square,
        classificationValueIds: [],
        visible: true,
      };
      page.measurements.push(count, cloud);
      const settings = createCsvExportSettingsPreset(session, "all");
      const bytes = await buildSpreadsheet(format, session, null, settings);
      const header = rows(read(bytes, { type: "array" }).Sheets.Measurements!)[0]! as string[];
      const grid = rawSheets(format, bytes).Measurements!;
      // Data rows: 3 on page 1, then "second" (4), the count (5) and the cloud (6); row 1 is the header.
      const countRow = grid[5]!;
      const cloudRow = grid[6]!;
      const blank = [
        "length",
        "perimeter",
        "area",
        "length_mm",
        "perimeter_mm",
        "area_mm2",
        "calibration_id",
        "calibration_name",
        "calibration_reference_mm",
      ];
      for (const name of blank) {
        expect(header).toContain(name);
        expect(countRow[header.indexOf(name)], `count ${name}`).toBeUndefined();
        expect(cloudRow[header.indexOf(name)], `cloud ${name}`).toBeUndefined();
      }
      expect(countRow[header.indexOf("count")]).toMatchObject({ kind: "number", value: "3" });
      expect(cloudRow[header.indexOf("count")]).toBeUndefined();
      // A measured line in the same sheet keeps its numbers, so the blanks are not an empty sheet.
      expect(grid[1]![header.indexOf("length")]).toMatchObject({ kind: "number", value: "2.5" });
    });

    it("rejects one row beyond the 1,048,576-row limit, counting the header, before writing", async () => {
      const rowsTooMany = new Array<ExportCell[]>(1_048_576).fill(emptyRow);
      await expect(
        buildSpreadsheetTables(format, [["Big", { ...oneColumn(rowsTooMany) }]]),
      ).rejects.toThrow(
        "The data exceeds spreadsheet row or column limits. Export CSV or JSON instead.",
      );
    });

    it("accepts exactly 1,048,576 rows including the header", { timeout: 60_000 }, async () => {
      const full = new Array<ExportCell[]>(1_048_575).fill(emptyRow);
      const bytes = await buildSpreadsheetTables(format, [["Big", oneColumn(full)]]);
      const files = unzipSync(bytes);
      if (format === "xlsx") {
        const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
        expect(sheet).toContain('<row r="1048576">');
        expect(sheet).not.toContain('<row r="1048577">');
      } else {
        const content = strFromU8(files["content.xml"]!);
        expect(content.split("<table:table-row>").length - 1).toBe(1_048_576);
      }
    });

    it.each([
      ["U+FFFE", "a￾b"],
      ["U+FFFF", "a￿b"],
      ["a lone high surrogate", "a\ud83db"],
      ["a lone low surrogate", "a\ude00b"],
      ["a reversed surrogate pair", "\ude00\ud83d"],
      ["a trailing high surrogate", "x\ud83d"],
      ["U+0000", "a\u0000b"],
      ["U+0001", "a\u0001b"],
      ["U+000B", "a\u000bb"],
      ["U+000C", "a\u000cb"],
      ["U+001F", "a\u001fb"],
    ])("rejects %s with the sheet, row and field", async (_label, text) => {
      await expect(
        buildSpreadsheetTables(format, [
          [
            "Test",
            oneColumn([
              ["fine", "ok"],
              ["row 3", text],
            ]),
          ],
        ]),
      ).rejects.toThrow(
        'Sheet "Test", row 3, field "note": text contains a character that XLSX and ODS cannot store. Edit this field or export CSV or JSON instead.',
      );
    });

    it("accepts and preserves tab, LF, CR, valid surrogate pairs, U+FFFD and DEL", async () => {
      const texts = ["a\tb", "a\nb", "a\rb", "a\r\nb\t\n\r", "😀", "�", "\u007f", "\u{10000}"];
      const bytes = await buildSpreadsheetTables(format, [
        ["Test", oneColumn(texts.map((text, index) => [`id${index}`, text]))],
      ]);
      const grid = rawSheets(format, bytes).Test!;
      expect(grid.slice(1).map((row) => row[1]!.value)).toEqual(texts);
    });

    it("names the sheet that holds the offending value", async () => {
      await expect(
        buildSpreadsheetTables(format, [
          ["First", oneColumn([["a", "b"]])],
          ["Second", oneColumn([["a", "b\u0001"]])],
        ]),
      ).rejects.toThrow('Sheet "Second", row 2, field "note":');
    });

    it.each(["=1+1", "+1", "-1", "@SUM(A1)", " =1", "\t=1", '=HYPERLINK("http://x","y")'])(
      "stores the formula-like text %j as a string cell in every text column",
      async (payload) => {
        const session = createEmptySession({ name: payload, size: 1, lastModified: 1 }, 1);
        const page = session.pages[1]!;
        page.calibrations = [
          {
            id: payload,
            name: payload,
            mode: "uniform",
            start: { x: 0, y: 0 },
            end: { x: 10, y: 0 },
            referenceDistanceMm: 1000,
          },
        ];
        page.measurements = [
          {
            id: payload,
            name: payload,
            type: "line",
            calibrationId: payload,
            points: [
              { x: 0, y: 0 },
              { x: 25, y: 0 },
            ],
            classificationValueIds: [payload],
            visible: true,
            note: payload,
          },
        ];
        session.classificationCatalog.dimensions = [
          {
            id: payload,
            name: payload,
            archived: false,
            values: [{ id: payload, name: payload, archived: false }],
          },
        ];
        const bytes = await buildSpreadsheet(
          format,
          session,
          [payload],
          createCsvExportSettingsPreset(session, "all"),
        );
        const sheets = rawSheets(format, bytes);

        const expectedTextCells = { Measurements: 9, "Classification assignments": 8 };
        for (const [name, grid] of Object.entries(sheets)) {
          const cells = grid.flat().filter((cell): cell is RawCell => cell !== undefined);
          expect(
            cells.filter((cell) => cell.formula),
            `${name} formulas`,
          ).toEqual([]);
          const payloadCells = cells.filter((cell) => cell.value === payload);
          // Measurements: pdf_name, page_label, measurement_id, name, calibration_id,
          // calibration_name, note, classification value and value ID.
          // Assignments: pdf_name, page_label, measurement_id, measurement_name, dimension,
          // dimension_id, value and value_id.
          expect(payloadCells, `${name} payload cells`).toHaveLength(
            expectedTextCells[name as keyof typeof expectedTextCells]!,
          );
          expect(payloadCells.every((cell) => cell.kind === "string")).toBe(true);
        }
      },
    );
  });
}
