// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CFB, read, utils } from "xlsx";
import type { ExportTable } from "./csv";
import { writeXlsx } from "./xlsx";

function part(bytes: Uint8Array, path: string): Document {
  const archive = CFB.read(bytes, { type: "array" });
  const file = CFB.find(archive, path)!;
  const document = new DOMParser().parseFromString(
    new TextDecoder().decode(file.content as Uint8Array),
    "application/xml",
  );
  expect(document.querySelector("parsererror")).toBeNull();
  return document;
}

function sheet(headers: string[], rows: ExportTable["rows"] = []): ExportTable {
  return { headers, columnTypes: [], rows };
}

const table = sheet(
  ["id", "name", "length"],
  [
    ["001", "Wall", 2.5],
    ["002", null, -0.000001],
    ["001", "a much longer measurement name that exceeds the width cap", 1e21],
  ],
);

describe("writeXlsx", () => {
  it("round-trips typed cells, blanks and every sheet", () => {
    const workbook = read(
      writeXlsx([
        ["Data", table],
        ["Empty", sheet(["x"])],
      ]),
      {
        type: "array",
      },
    );
    expect(workbook.SheetNames).toEqual(["Data", "Empty"]);
    expect(utils.sheet_to_json(workbook.Sheets.Data!, { header: 1, defval: null })).toEqual([
      table.headers,
      ...table.rows,
    ]);
    expect(utils.sheet_to_json(workbook.Sheets.Empty!, { header: 1 })).toEqual([["x"]]);
  });

  it("deduplicates shared strings and counts every string cell", () => {
    const sst = part(writeXlsx([["Data", table]]), "/xl/sharedStrings.xml").documentElement;
    expect(sst.getAttribute("count")).toBe("8");
    expect(sst.getAttribute("uniqueCount")).toBe("7");
  });

  it("sizes columns from headers and the first rows within 12 to 40 characters", () => {
    const columns = Array.from(
      part(writeXlsx([["Data", table]]), "/xl/worksheets/sheet1.xml").getElementsByTagName("col"),
      (column) => Number(column.getAttribute("width")),
    );
    expect(columns).toHaveLength(3);
    expect(columns[0]).toBeCloseTo(12.83, 2);
    expect(columns[1]).toBeCloseTo(40.83, 2);
    expect(columns[2]).toBeCloseTo(12.83, 2);
  });

  it("names columns past Z", () => {
    const headers = Array.from({ length: 28 }, (_, index) => `h${index}`);
    const cells = part(
      writeXlsx([["Wide", sheet(headers)]]),
      "/xl/worksheets/sheet1.xml",
    ).getElementsByTagName("c");
    expect(cells[25]!.getAttribute("r")).toBe("Z1");
    expect(cells[26]!.getAttribute("r")).toBe("AA1");
    expect(cells[27]!.getAttribute("r")).toBe("AB1");
  });

  it.each(["", "a".repeat(32), "Bad/name", "Bad[name]"])(
    "rejects the invalid sheet name %j",
    (name) => {
      expect(() => writeXlsx([[name, table]])).toThrow("Invalid spreadsheet sheet name");
    },
  );

  it.each(["Q&A <\"x\"> 'y'", "a".repeat(31), "Sheet 1", "Ünï"])(
    "writes the valid sheet name %j escaped in the workbook",
    (name) => {
      const sheets = part(writeXlsx([[name, table]]), "/xl/workbook.xml").getElementsByTagName(
        "sheet",
      );
      expect(sheets).toHaveLength(1);
      expect(sheets[0]!.getAttribute("name")).toBe(name);
    },
  );

  it.each(["a\\b", "a?b", "a*b", "a]b", "a:b"])("rejects the sheet name %j", (name) => {
    expect(() => writeXlsx([[name, table]])).toThrow("Invalid spreadsheet sheet name");
  });

  it("stores formula-like text as shared strings, never as formulas", () => {
    const texts = ["=1+1", "+1", "-1", "@SUM(A1)", " =1"];
    const bytes = writeXlsx([
      [
        "Data",
        sheet(
          ["text"],
          texts.map((text) => [text]),
        ),
      ],
    ]);
    const cells = Array.from(part(bytes, "/xl/worksheets/sheet1.xml").getElementsByTagName("c"));
    expect(cells).toHaveLength(6);
    for (const cell of cells) {
      expect(cell.getAttribute("t")).toBe("s");
      expect(cell.getElementsByTagName("f")).toHaveLength(0);
    }
    const strings = Array.from(
      part(bytes, "/xl/sharedStrings.xml").getElementsByTagName("t"),
      (node) => node.textContent,
    );
    expect(strings).toEqual(["text", ...texts]);
  });

  it("omits null cells so they read back blank, not 0, and keeps numbers untyped", () => {
    const cells = Array.from(
      part(
        writeXlsx([["Data", sheet(["a", "b", "c"], [[1, null, 0]])]]),
        "/xl/worksheets/sheet1.xml",
      ).getElementsByTagName("c"),
    );
    expect(cells.map((cell) => cell.getAttribute("r"))).toEqual(["A1", "B1", "C1", "A2", "C2"]);
    const [a, c] = cells.slice(3);
    expect(a!.getAttribute("t")).toBeNull();
    expect(a!.getElementsByTagName("v")[0]!.textContent).toBe("1");
    // A real zero stays a 0 cell, unlike the blank between them.
    expect(c!.getElementsByTagName("v")[0]!.textContent).toBe("0");
  });

  it("rejects duplicate sheet names regardless of case", () => {
    expect(() =>
      writeXlsx([
        ["Data", table],
        ["data", table],
      ]),
    ).toThrow("unique");
  });
});
