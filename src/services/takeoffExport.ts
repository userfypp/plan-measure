import type { CsvExportSettings, CurrentSession } from "../types/domain";
import {
  type MeasurementTotalGroup,
  type TakeoffSelection,
  type TotalQuantity,
} from "../features/measurements/measurementTotals";
import { buildTakeoffSummary, type TakeoffSummary } from "./takeoffSummary";
import { resolveLinearUnit } from "../utils/format";
import {
  fromMillimetres,
  fromSquareMillimetres,
  fromSquareMillimetresToAcres,
} from "../utils/units";
import {
  buildCsv,
  buildClassificationAssignmentsCsv,
  NoMeasurementsError,
  serializeExportTableCsv,
  type ExportCell,
  type ExportTable,
} from "./csv";
import { buildSpreadsheetTables, type SpreadsheetExportFormat } from "./spreadsheetExport";
import { downloadExportFile, exportFileName } from "./exportDownload";

export type TakeoffExportFormat = "csv" | SpreadsheetExportFormat;

function convertQuantity(
  quantity: TotalQuantity,
  convert: (value: number) => number,
): [ExportCell, string] {
  if (quantity.kind !== "value") return [null, quantity.kind];
  const value = convert(quantity.value);
  if (!Number.isFinite(value) || (value === 0 && quantity.value !== 0))
    return [null, "unavailable"];
  return [value, "value"];
}

export function buildTakeoffTables(
  session: CurrentSession,
  selection: TakeoffSelection,
  pageLabels: readonly string[] | null = null,
): {
  project: ExportTable;
  breakdowns: (readonly [string, ExportTable])[];
  linearUnit: string;
  areaUnit: string;
  excludedCount: number;
  hasUnavailable: boolean;
} {
  const summary = buildTakeoffSummary(session, selection, pageLabels);
  if (summary.projectTotals.measurementCount === 0) throw new NoMeasurementsError();
  const linearUnit = resolveLinearUnit(session.settings.displayUnit);
  const areaUnit = session.settings.areaDisplay === "ac" ? "ac" : `${linearUnit}²`;
  const headers = [
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
  ];
  const table = (
    groups: readonly MeasurementTotalGroup[],
    breakdown: TakeoffSummary["breakdowns"][number] | null,
  ): ExportTable => ({
    headers: [...headers],
    columnTypes: headers.map((header) =>
      ["measurement_count", "excluded_count", "length", "perimeter", "area", "count"].includes(header)
        ? "number"
        : "text",
    ),
    rows: groups.map((group) => [
      breakdown ? "breakdown" : "project",
      breakdown?.type ?? "overall",
      breakdown?.dimension?.name ?? null,
      breakdown?.dimension?.id ?? null,
      group.key,
      breakdown ? group.label : "Project totals",
      String(group.archived),
      group.measurementCount,
      group.excludedCount,
      ...convertQuantity(group.length, (value) => fromMillimetres(value, linearUnit)),
      ...convertQuantity(group.perimeter, (value) => fromMillimetres(value, linearUnit)),
      linearUnit,
      ...convertQuantity(group.area, (value) =>
        session.settings.areaDisplay === "ac"
          ? fromSquareMillimetresToAcres(value)
          : fromSquareMillimetres(value, linearUnit),
      ),
      areaUnit,
      ...convertQuantity(group.count, (value) => value),
    ]),
  });
  const project = table(
    selection.includeProjectTotals === false ? [] : [summary.projectTotals],
    null,
  );
  let classificationIndex = 0;
  const breakdowns = summary.breakdowns.map(
    (breakdown) =>
      [
        breakdown.type === "page"
          ? "By page"
          : breakdown.type === "type"
            ? "By type"
            : `By classification ${++classificationIndex}`,
        table(breakdown.groups, breakdown),
      ] as const,
  );
  if (project.rows.length === 0 && breakdowns.length === 0)
    throw new Error("Select at least one summary.");
  const statusColumns = headers.flatMap((header, index) =>
    header.endsWith("_status") ? [index] : [],
  );
  return {
    project,
    breakdowns,
    linearUnit,
    areaUnit,
    excludedCount: summary.projectTotals.excludedCount,
    hasUnavailable: [project, ...breakdowns.map(([, table]) => table)].some((table) =>
      table?.rows.some((row) => statusColumns.some((index) => row[index] === "unavailable")),
    ),
  };
}

export async function downloadTakeoff(
  format: TakeoffExportFormat,
  session: CurrentSession,
  selection: TakeoffSelection,
  pageLabels: readonly string[] | null = null,
): Promise<void> {
  const { project, breakdowns } = buildTakeoffTables(session, selection, pageLabels);
  const filename = exportFileName(session.pdf.name, "takeoff", format);
  const contents =
    format === "csv"
      ? serializeExportTableCsv({
          ...project,
          rows: [...project.rows, ...breakdowns.flatMap(([, table]) => table.rows)],
        })
      : await buildSpreadsheetTables(format, [
          ...(project.rows.length ? [["Project totals", project] as const] : []),
          ...breakdowns,
        ]);
  downloadExportFile(
    contents,
    filename,
    format === "csv"
      ? "text/csv;charset=utf-8"
      : format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/vnd.oasis.opendocument.spreadsheet",
  );
}

export async function downloadCsvWithTakeoff(
  session: CurrentSession,
  selection: TakeoffSelection,
  pageLabels: readonly string[] | null = null,
  settings?: CsvExportSettings,
  dataset: "measurements" | "classification-assignments" = "measurements",
): Promise<void> {
  const { project, breakdowns } = buildTakeoffTables(session, selection, pageLabels);
  const primaryName = dataset === "measurements" ? "measurements" : "classifications";
  const filename = exportFileName(session.pdf.name, primaryName, "zip");
  const contents = new Map<string, string>([
    [
      `${primaryName}.csv`,
      dataset === "measurements"
        ? buildCsv(session, pageLabels, settings)
        : buildClassificationAssignmentsCsv(session, pageLabels),
    ],
    ...(project.rows.length
      ? [["project-totals.csv", serializeExportTableCsv(project)] as const]
      : []),
    ...breakdowns.map(
      ([name, table]) =>
        [name.toLowerCase().replaceAll(" ", "-") + ".csv", serializeExportTableCsv(table)] as const,
    ),
  ]);
  const { zipSync, strToU8 } = await import("fflate");
  const files = Object.fromEntries([...contents].map(([name, csv]) => [name, strToU8(csv)]));
  downloadExportFile(zipSync(files), filename, "application/zip");
}
