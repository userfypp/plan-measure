import type { CsvExportSettings, CurrentSession } from "../types/domain";
import {
  buildClassificationAssignmentsTable,
  buildMeasurementTable,
  type ExportTable,
} from "./csv";
import { downloadExportFile, exportFileName } from "./exportDownload";

export type SpreadsheetExportFormat = "xlsx" | "ods";

// Bound the export to the supported spreadsheet consumers; never let a writer truncate data.
const MAX_ROWS = 1_048_576;
const MAX_COLUMNS = 16_384;
const MAX_CELL_LENGTH = 32_767;
function hasInvalidXmlText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (
      (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint === 0xfffe ||
      codePoint === 0xffff
    )
      return true;
  }
  return false;
}

function validateTable(table: ExportTable): void {
  if (table.rows.length + 1 > MAX_ROWS || table.headers.length > MAX_COLUMNS) {
    throw new Error(
      "The data exceeds spreadsheet row or column limits. Export CSV or JSON instead.",
    );
  }
  for (const row of [table.headers, ...table.rows]) {
    for (const value of row) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error("Spreadsheet quantities must be finite numbers.");
      }
      if (
        typeof value === "string" &&
        (value.length > MAX_CELL_LENGTH || hasInvalidXmlText(value))
      ) {
        throw new Error(
          "A spreadsheet cell contains unsupported text. Export CSV or JSON instead.",
        );
      }
    }
  }
}

export async function buildSpreadsheet(
  format: SpreadsheetExportFormat,
  session: CurrentSession,
  pageLabels: readonly string[] | null = null,
  settings?: CsvExportSettings,
): Promise<Uint8Array<ArrayBuffer>> {
  const measurements = buildMeasurementTable(session, pageLabels, settings);
  const assignments = buildClassificationAssignmentsTable(session, pageLabels);
  validateTable(measurements);
  validateTable(assignments);
  const tables = [
    ["Measurements", measurements],
    ["Classification assignments", assignments],
  ] as const;
  if (format === "ods") {
    const { writeOds } = await import("./ods");
    return writeOds(tables);
  }
  const { utils, write } = await import("xlsx");
  const workbook = utils.book_new();
  for (const [name, table] of tables) {
    // Protect literal OOXML escape sequences before the XLSX writer escapes control characters.
    const worksheet = utils.aoa_to_sheet(
      [table.headers, ...table.rows].map((row) =>
        row.map((value) =>
          typeof value === "string" ? value.replace(/_(?=x[0-9a-f]{4}_)/gi, "_x005F_") : value,
        ),
      ),
    );
    worksheet["!cols"] = table.headers.map((header, index) => ({
      wch: Math.min(
        40,
        Math.max(
          12,
          header.length + 2,
          ...table.rows.slice(0, 100).map((row) => String(row[index] ?? "").length + 2),
        ),
      ),
    }));
    utils.book_append_sheet(workbook, worksheet, name);
  }
  return new Uint8Array(
    write(workbook, { bookType: "xlsx", type: "array", compression: true, bookSST: true }),
  );
}

export async function downloadSpreadsheet(
  format: SpreadsheetExportFormat,
  session: CurrentSession,
  pageLabels: readonly string[] | null = null,
  settings?: CsvExportSettings,
): Promise<void> {
  const bytes = await buildSpreadsheet(format, session, pageLabels, settings);
  downloadExportFile(
    bytes,
    exportFileName(session.pdf.name, "measurements", format),
    format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/vnd.oasis.opendocument.spreadsheet",
  );
}
