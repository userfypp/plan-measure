// @vitest-environment jsdom
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { ExportTable } from "./csv";
import { writeOds } from "./ods";

const OFFICE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const TABLE = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";

function content(bytes: Uint8Array): Document {
  const document = new DOMParser().parseFromString(
    strFromU8(unzipSync(bytes)["content.xml"]!),
    "application/xml",
  );
  expect(document.querySelector("parsererror")).toBeNull();
  return document;
}

function sheet(headers: string[], rows: ExportTable["rows"] = []): ExportTable {
  return { headers, columnTypes: [], rows };
}

function cellsOf(document: Document): Element[] {
  return Array.from(document.getElementsByTagNameNS(TABLE, "table-cell"));
}

describe("writeOds", () => {
  it("stores formula-like text as string cells, never as formulas", () => {
    const texts = ["=1+1", "+1", "-1", "@SUM(A1)", " =1", "\t=1"];
    const cells = cellsOf(
      content(
        writeOds([
          [
            "Data",
            sheet(
              ["text"],
              texts.map((text) => [text]),
            ),
          ],
        ]),
      ),
    );
    expect(cells).toHaveLength(7);
    for (const cell of cells) {
      expect(cell.getAttributeNS(OFFICE, "value-type")).toBe("string");
      expect(cell.hasAttributeNS(TABLE, "formula")).toBe(false);
    }
    expect(cells.map((cell) => cell.getAttributeNS(OFFICE, "string-value"))).toEqual([
      "text",
      ...texts,
    ]);
  });

  it("writes null as an empty cell with no type or value, and a real 0 as a float", () => {
    const [header, row] = Array.from(
      content(writeOds([["Data", sheet(["a", "b", "c"], [[1, null, 0]])]])).getElementsByTagNameNS(
        TABLE,
        "table-row",
      ),
    );
    expect(header!.getElementsByTagNameNS(TABLE, "table-cell")).toHaveLength(3);
    const [one, blank, zero] = Array.from(row!.getElementsByTagNameNS(TABLE, "table-cell"));
    expect(one!.getAttributeNS(OFFICE, "value-type")).toBe("float");
    expect(one!.getAttributeNS(OFFICE, "value")).toBe("1");
    expect(blank!.attributes).toHaveLength(0);
    expect(blank!.textContent).toBe("");
    expect(zero!.getAttributeNS(OFFICE, "value-type")).toBe("float");
    expect(zero!.getAttributeNS(OFFICE, "value")).toBe("0");
  });

  it("writes every sheet in order with its name escaped", () => {
    const names = ["Q&A <\"x\"> 'y'", "Second"];
    const tables = Array.from(
      content(writeOds(names.map((name) => [name, sheet(["x"])] as const))).getElementsByTagNameNS(
        TABLE,
        "table",
      ),
      (table) => table.getAttributeNS(TABLE, "name"),
    );
    expect(tables).toEqual(names);
  });

  it("declares one column per header", () => {
    const column = content(
      writeOds([["Data", sheet(["a", "b", "c", "d"])]]),
    ).getElementsByTagNameNS(TABLE, "table-column")[0]!;
    expect(column.getAttributeNS(TABLE, "number-columns-repeated")).toBe("4");
  });

  it("stores the mimetype first and uncompressed so readers can sniff the package", () => {
    const bytes = writeOds([["Data", sheet(["x"])]]);
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(header.getUint16(8, true)).toBe(0);
    expect(strFromU8(bytes.slice(30, 38))).toBe("mimetype");
    expect(strFromU8(unzipSync(bytes)["mimetype"]!)).toBe(
      "application/vnd.oasis.opendocument.spreadsheet",
    );
  });
});
