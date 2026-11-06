import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { read } from "xlsx";
import { createEmptySession } from "../app/sessionState";
import { resetAppPreferences, setAppPreference } from "../utils/appPreferences";
import { buildCsv, serializeExportTableCsv, type ExportTable } from "./csv";
import { buildDataJson } from "./dataJson";
import { buildSpreadsheetTables } from "./spreadsheetExport";

afterEach(() => {
  resetAppPreferences();
});

const NOISY = 0.1 + 0.2; // 0.30000000000000004

const table: ExportTable = {
  headers: ["label", "value"],
  columnTypes: ["text", "number"],
  rows: [
    ["noise", NOISY],
    ["third", 2 / 3],
    ["large", 12345678901234567e3],
    ["exponent", 1e21],
    ["negative", -0],
    ["text", "0.30000000000000004"],
  ],
};

function sessionWithNoisyLine() {
  const session = createEmptySession({ name: "Plan.pdf", size: 1, lastModified: 1 }, 1);
  session.settings.displayUnit = "mm";
  const page = session.pages[1]!;
  page.calibrations = [
    {
      id: "scale",
      name: "Scale",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 10,
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
        { x: NOISY, y: 0 },
      ],
      classificationValueIds: [],
      visible: true,
    },
  ];
  return session;
}

describe("numbers in CSV, XLSX and ODS exports", () => {
  it("writes CSV numbers with 15 significant digits and leaves text alone", () => {
    expect(serializeExportTableCsv(table)).toBe(
      "﻿label,value\r\nnoise,0.3\r\nthird,0.666666666666667\r\nlarge,12345678901234600000\r\n" +
        "exponent,1e+21\r\nnegative,0\r\ntext,0.30000000000000004\r\n",
    );
  });

  it("ignores the app's number separators in CSV", () => {
    setAppPreference("thousandsSeparator", "point");
    setAppPreference("decimalSeparator", "comma");
    expect(serializeExportTableCsv(table)).toContain(
      "\r\nnoise,0.3\r\nthird,0.666666666666667\r\n",
    );
  });

  it("rounds the measurement CSV before padding to two decimals, and JSON keeps every digit", () => {
    const session = sessionWithNoisyLine();

    const csv = buildCsv(session);
    expect(csv).toContain(",0.30,");
    expect(csv).not.toContain("0.30000000000000004");

    const json = buildDataJson(session);
    expect(json).toMatch(/"x": 0\.30000000000000004\b/);
  });

  it("writes XLSX number cells with 15 significant digits and sizes the column for them", async () => {
    const files = unzipSync(await buildSpreadsheetTables("xlsx", [["Values", table]]));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);

    expect(sheet).toContain('<c r="B2"><v>0.3</v></c>');
    expect(sheet).toContain('<c r="B3"><v>0.666666666666667</v></c>');
    expect(sheet).toContain('<c r="B4"><v>12345678901234600000</v></c>');
    expect(sheet).toContain('<c r="B6"><v>0</v></c>');
    expect(sheet).not.toMatch(/<v>0\.30000000000000004<\/v>/);
    // The widest value is "12345678901234600000": 20 characters plus 2 of padding, at Excel's
    // 6 px digit width plus 5 px, in 1/256ths: round((22 * 6 + 5) / 6 * 256) / 256.
    expect(sheet).toContain('<col min="2" max="2" width="22.83203125" customWidth="1"/>');

    // Rounded, 0.1 + 0.2 is "0.3" and the column keeps its 12-character minimum; unrounded it
    // would take 19 characters plus 2.
    const noisy = unzipSync(
      await buildSpreadsheetTables("xlsx", [
        ["Noise", { headers: ["value"], columnTypes: ["number"], rows: [[NOISY]] }],
      ]),
    );
    expect(strFromU8(noisy["xl/worksheets/sheet1.xml"]!)).toContain(
      '<col min="1" max="1" width="12.83203125" customWidth="1"/>',
    );

    const workbook = read(await buildSpreadsheetTables("xlsx", [["Values", table]]), {
      type: "array",
    });
    expect(workbook.Sheets.Values!.B2).toMatchObject({ t: "n", v: 0.3 });
    expect(workbook.Sheets.Values!.B7).toMatchObject({ t: "s", v: "0.30000000000000004" });
  });

  it("writes ODS float cells with 15 significant digits in the value and the paragraph", async () => {
    const files = unzipSync(await buildSpreadsheetTables("ods", [["Values", table]]));
    const content = strFromU8(files["content.xml"]!);

    expect(content).toContain(
      '<table:table-cell office:value-type="float" office:value="0.3"><text:p>0.3</text:p></table:table-cell>',
    );
    expect(content).toContain(
      'office:value="0.666666666666667"><text:p>0.666666666666667</text:p>',
    );
    expect(content).toContain(
      'office:value="12345678901234600000"><text:p>12345678901234600000</text:p>',
    );
    expect(content).toContain('office:value="1e+21"><text:p>1e+21</text:p>');
    expect(content).not.toContain('office:value="0.30000000000000004"');
    expect(content).toContain("<text:p>0.30000000000000004</text:p>");
  });
});
