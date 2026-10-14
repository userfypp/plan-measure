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

  it("rejects duplicate sheet names regardless of case", () => {
    expect(() =>
      writeXlsx([
        ["Data", table],
        ["data", table],
      ]),
    ).toThrow("unique");
  });
});
