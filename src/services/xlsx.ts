import { strToU8, zipSync } from "fflate";
import type { ExportCell, ExportTable } from "./csv";

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAX_SHEET_NAME_LENGTH = 31;
// Excel's default maximum digit width for Calibri 11, as used by its column-width formula.
const MAX_DIGIT_WIDTH = 6;

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sharedStringXml(value: string): string {
  // Escape literal OOXML _xHHHH_ sequences, and store CR as a character reference because
  // XML parsers normalize a raw CR to LF.
  const text = xmlEscape(value.replace(/_(?=x[0-9a-f]{4}_)/gi, "_x005F_")).replaceAll(
    "\r",
    "&#13;",
  );
  return `<si><t xml:space="preserve">${text}</t></si>`;
}

function columnName(index: number): string {
  let name = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}

function columnWidth(table: ExportTable, index: number): number {
  let characters = Math.max(12, table.headers[index]!.length + 2);
  for (const row of table.rows.slice(0, 100)) {
    characters = Math.max(characters, String(row[index] ?? "").length + 2);
  }
  characters = Math.min(40, characters);
  return Math.round(((characters * MAX_DIGIT_WIDTH + 5) / MAX_DIGIT_WIDTH) * 256) / 256;
}

function validateSheetName(name: string): void {
  if (!name || name.length > MAX_SHEET_NAME_LENGTH || /[\\/?*[\]:]/.test(name)) {
    throw new Error(`Invalid spreadsheet sheet name: ${JSON.stringify(name)}.`);
  }
}

function sheetXml(table: ExportTable, sharedString: (value: string) => number): string {
  const columns = table.headers.map((_, index) => columnName(index));
  const rows = [table.headers, ...table.rows].map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    let cells = "";
    row.forEach((value: ExportCell, columnIndex) => {
      if (value === null) return;
      const reference = `${columns[columnIndex] ?? columnName(columnIndex)}${rowNumber}`;
      cells +=
        typeof value === "number"
          ? `<c r="${reference}"><v>${value}</v></c>`
          : `<c r="${reference}" t="s"><v>${sharedString(value)}</v></c>`;
    });
    return `<row r="${rowNumber}">${cells}</row>`;
  });
  const cols = table.headers.length
    ? `<cols>${table.headers
        .map(
          (_, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${columnWidth(table, index)}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";
  return `${XML_DECLARATION}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">${cols}<sheetData>${rows.join("")}</sheetData></worksheet>`;
}

/** Minimal Office Open XML workbook: typed cells, shared strings, no formulas. */
export function writeXlsx(
  tables: readonly (readonly [string, ExportTable])[],
): Uint8Array<ArrayBuffer> {
  const sharedStrings = new Map<string, number>();
  let stringCellCount = 0;
  const sharedString = (value: string): number => {
    stringCellCount += 1;
    let index = sharedStrings.get(value);
    if (index === undefined) {
      index = sharedStrings.size;
      sharedStrings.set(value, index);
    }
    return index;
  };

  const files: Record<string, Uint8Array> = {};
  const sheetEntries = tables.map(([name, table], index) => {
    validateSheetName(name);
    const sheetNumber = index + 1;
    files[`xl/worksheets/sheet${sheetNumber}.xml`] = strToU8(sheetXml(table, sharedString));
    return { name, sheetNumber };
  });
  if (new Set(sheetEntries.map(({ name }) => name.toLowerCase())).size !== sheetEntries.length) {
    throw new Error("Spreadsheet sheet names must be unique.");
  }
  const stylesId = `rId${sheetEntries.length + 1}`;
  const sharedStringsId = `rId${sheetEntries.length + 2}`;

  files["[Content_Types].xml"] = strToU8(
    `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetEntries
      .map(
        ({ sheetNumber }) =>
          `<Override PartName="/xl/worksheets/sheet${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join(
        "",
      )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
  );
  files["_rels/.rels"] = strToU8(
    `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  files["xl/workbook.xml"] = strToU8(
    `${XML_DECLARATION}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>${sheetEntries
      .map(
        ({ name, sheetNumber }) =>
          `<sheet name="${xmlEscape(name)}" sheetId="${sheetNumber}" r:id="rId${sheetNumber}"/>`,
      )
      .join("")}</sheets></workbook>`,
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `${XML_DECLARATION}<Relationships xmlns="${PACKAGE_REL_NS}">${sheetEntries
      .map(
        ({ sheetNumber }) =>
          `<Relationship Id="rId${sheetNumber}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${sheetNumber}.xml"/>`,
      )
      .join(
        "",
      )}<Relationship Id="${stylesId}" Type="${REL_NS}/styles" Target="styles.xml"/><Relationship Id="${sharedStringsId}" Type="${REL_NS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  files["xl/styles.xml"] = strToU8(
    `${XML_DECLARATION}<styleSheet xmlns="${MAIN_NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
  let strings = "";
  for (const value of sharedStrings.keys()) strings += sharedStringXml(value);
  files["xl/sharedStrings.xml"] = strToU8(
    `${XML_DECLARATION}<sst xmlns="${MAIN_NS}" count="${stringCellCount}" uniqueCount="${sharedStrings.size}">${strings}</sst>`,
  );
  return zipSync(files);
}
