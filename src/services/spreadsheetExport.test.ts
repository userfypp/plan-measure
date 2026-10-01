// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { CFB, read, utils } from "xlsx";
import { createEmptySession } from "../app/sessionState";
import { createCsvExportSettingsPreset } from "./csv";
import { buildSpreadsheet, downloadSpreadsheet } from "./spreadsheetExport";
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

    it.each(["a".repeat(32_768), "invalid\u0000text", "lone\ud800surrogate"])(
      "rejects unsupported cell text without truncating it",
      async (name) => {
        const session = fixture();
        session.pages[1]!.measurements[0]!.name = name;
        await expect(buildSpreadsheet(format, session)).rejects.toThrow("unsupported text");
      },
    );

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
