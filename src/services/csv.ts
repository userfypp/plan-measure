import type {
  ClassificationValue,
  CsvExportSettings,
  CurrentSession,
  Measurement,
  PageCalibration,
  PageState,
} from "../types/domain";
import { getMeasurementCalibration } from "../utils/calibration";
import {
  calibrationScaleX,
  calibrationScaleY,
  distance,
  hasValidMeasurementPoints,
  type MeasurementPathSpec,
  measurementPathSpecs,
  measurementResultsMm,
  millimetresPerPageUnit,
} from "../utils/geometry";
import { formatCsvNumber } from "../utils/format";
import { fromMillimetres, fromSquareMillimetres } from "../utils/units";

interface CsvRowContext {
  pageNumber: number;
  pageLabel: string;
  measurement: Measurement;
  page: PageState;
  session: CurrentSession;
  calibration: PageCalibration;
  spec: MeasurementPathSpec;
  result: ReturnType<typeof measurementResultsMm>;
  unit: CurrentSession["settings"]["displayUnit"];
  scaleX: number;
  scaleY: number;
  calibrationReferenceMm: string;
  calibrationPageDistance: string;
  calibrationMmPerPageUnit: string;
  classificationValues: ReadonlyMap<string, ClassificationValue | null>;
}

export type CsvColumnSection = "measurement" | "values" | "scale" | "classification";
export type CsvColumnType = "text" | "number";
export type CsvClassificationField = "value" | "value_id" | "status";

export interface CsvClassificationMetadata {
  dimensionId: string;
  dimensionName: string;
  dimensionArchived: boolean;
  field: CsvClassificationField;
}

export interface CsvColumnDescriptor {
  id: string;
  header: string;
  label: string;
  section: CsvColumnSection;
  type: CsvColumnType;
  defaultEnabled: boolean;
  required: boolean;
  enabled: boolean;
  classification?: CsvClassificationMetadata;
}

interface CsvColumnDefinition {
  id: string;
  header: string;
  label: string;
  section: CsvColumnSection;
  type: CsvColumnType;
  defaultEnabled: boolean;
  required: boolean;
  classification?: CsvClassificationMetadata;
  extract: (context: CsvRowContext) => string | number;
}

const STATIC_CSV_COLUMNS: readonly CsvColumnDefinition[] = [
  {
    id: "page",
    header: "page",
    label: "Page",
    section: "measurement",
    type: "number",
    defaultEnabled: true,
    required: true,
    extract: (context) => context.pageNumber,
  },
  {
    id: "page_label",
    header: "page_label",
    label: "Page label",
    section: "measurement",
    type: "text",
    defaultEnabled: true,
    required: false,
    extract: (context) => context.pageLabel,
  },
  {
    id: "measurement_id",
    header: "measurement_id",
    label: "Measurement ID",
    section: "measurement",
    type: "text",
    defaultEnabled: true,
    required: true,
    extract: (context) => context.measurement.id,
  },
  {
    id: "name",
    header: "name",
    label: "Measurement name",
    section: "measurement",
    type: "text",
    defaultEnabled: true,
    required: false,
    extract: (context) => context.measurement.name,
  },
  {
    id: "type",
    header: "type",
    label: "Type",
    section: "measurement",
    type: "text",
    defaultEnabled: true,
    required: true,
    extract: (context) => context.spec.label,
  },
  {
    id: "calibration_id",
    header: "calibration_id",
    label: "Scale ID",
    section: "scale",
    type: "text",
    defaultEnabled: true,
    required: true,
    extract: (context) => context.calibration.id,
  },
  {
    id: "calibration_name",
    header: "calibration_name",
    label: "Scale name",
    section: "scale",
    type: "text",
    defaultEnabled: true,
    required: false,
    extract: (context) => context.calibration.name,
  },
  {
    id: "calibration_mode",
    header: "calibration_mode",
    label: "Scale mode",
    section: "scale",
    type: "text",
    defaultEnabled: true,
    required: false,
    extract: (context) => context.calibration.mode,
  },
  {
    id: "calibration_reference_mm",
    header: "calibration_reference_mm",
    label: "Reference distance (mm)",
    section: "scale",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationReferenceMm,
  },
  {
    id: "calibration_page_distance",
    header: "calibration_page_distance",
    label: "Page distance",
    section: "scale",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationPageDistance,
  },
  {
    id: "calibration_mm_per_page_unit",
    header: "calibration_mm_per_page_unit",
    label: "mm per page unit",
    section: "scale",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationMmPerPageUnit,
  },
  {
    id: "calibration_scale_x_mm_per_page_unit",
    header: "calibration_scale_x_mm_per_page_unit",
    label: "X scale (mm/page unit)",
    section: "scale",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => String(context.scaleX),
  },
  {
    id: "calibration_scale_y_mm_per_page_unit",
    header: "calibration_scale_y_mm_per_page_unit",
    label: "Y scale (mm/page unit)",
    section: "scale",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => String(context.scaleY),
  },
  {
    id: "length",
    header: "length",
    label: "Length",
    section: "values",
    type: "number",
    defaultEnabled: true,
    required: false,
    extract: (context) =>
      context.spec.closed
        ? ""
        : formatCsvNumber(fromMillimetres(context.result.lengthMm ?? 0, context.unit)),
  },
  {
    id: "perimeter",
    header: "perimeter",
    label: "Perimeter",
    section: "values",
    type: "number",
    defaultEnabled: true,
    required: false,
    extract: (context) =>
      context.spec.closed
        ? formatCsvNumber(fromMillimetres(context.result.perimeterMm ?? 0, context.unit))
        : "",
  },
  {
    id: "area",
    header: "area",
    label: "Area",
    section: "values",
    type: "number",
    defaultEnabled: true,
    required: false,
    extract: (context) =>
      context.spec.closed
        ? formatCsvNumber(fromSquareMillimetres(context.result.areaMm2 ?? 0, context.unit))
        : "",
  },
  {
    id: "unit",
    header: "unit",
    label: "Unit",
    section: "values",
    type: "text",
    defaultEnabled: true,
    required: true,
    extract: (context) => context.unit,
  },
  {
    id: "area_unit",
    header: "area_unit",
    label: "Area unit",
    section: "values",
    type: "text",
    defaultEnabled: true,
    required: true,
    extract: (context) => (context.spec.closed ? `${context.unit}²` : ""),
  },
];

function createClassificationColumns(
  dimension: CurrentSession["classificationCatalog"]["dimensions"][number],
): CsvColumnDefinition[] {
  const valueForDimension = (context: CsvRowContext): ClassificationValue | null =>
    context.classificationValues.get(dimension.id) ?? null;

  return [
    {
      id: `classification:${dimension.id}:value`,
      header: `classification:${dimension.name}`,
      label: "Value",
      section: "classification",
      type: "text",
      defaultEnabled: true,
      required: false,
      classification: {
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        dimensionArchived: dimension.archived,
        field: "value",
      },
      extract: (context) => valueForDimension(context)?.name ?? "",
    },
    {
      id: `classification:${dimension.id}:value_id`,
      header: `classification_value_id:${dimension.name}`,
      label: "Value ID",
      section: "classification",
      type: "text",
      defaultEnabled: false,
      required: false,
      classification: {
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        dimensionArchived: dimension.archived,
        field: "value_id",
      },
      extract: (context) => valueForDimension(context)?.id ?? "",
    },
    {
      id: `classification:${dimension.id}:status`,
      header: `classification_status:${dimension.name}`,
      label: "Status",
      section: "classification",
      type: "text",
      defaultEnabled: false,
      required: false,
      classification: {
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        dimensionArchived: dimension.archived,
        field: "status",
      },
      extract: (context) => {
        const value = valueForDimension(context);
        if (!value) return "";
        return value.archived || dimension.archived ? "archived" : "active";
      },
    },
  ];
}

function createCsvColumns(session: CurrentSession): CsvColumnDefinition[] {
  return [
    ...STATIC_CSV_COLUMNS,
    ...session.classificationCatalog.dimensions.flatMap(createClassificationColumns),
  ];
}

type CsvColumnSelection = Pick<CsvColumnDefinition, "id" | "defaultEnabled" | "required">;

export function isCsvColumnEnabled(
  column: CsvColumnSelection,
  settings: CsvExportSettings,
): boolean {
  if (column.required) return true;
  return settings.columnOverrides[column.id] ?? column.defaultEnabled;
}

export function normalizeCsvExportSettings(
  session: CurrentSession,
  settings: CsvExportSettings,
): CsvExportSettings {
  const columnOverrides: Record<string, boolean> = {};
  for (const column of createCsvColumns(session)) {
    if (column.required) continue;
    const override = settings.columnOverrides[column.id];
    if (typeof override === "boolean" && override !== column.defaultEnabled) {
      columnOverrides[column.id] = override;
    }
  }
  return { columnOverrides };
}

export type CsvExportPreset = "defaults" | "all" | "required-only";

export function createCsvExportSettingsPreset(
  session: CurrentSession,
  preset: CsvExportPreset,
): CsvExportSettings {
  const columnOverrides: Record<string, boolean> = {};
  for (const column of createCsvColumns(session)) {
    if (column.required || preset === "defaults") continue;
    const enabled = preset === "all";
    if (enabled !== column.defaultEnabled) columnOverrides[column.id] = enabled;
  }
  return { columnOverrides };
}

export function setCsvColumnEnabled(
  session: CurrentSession,
  settings: CsvExportSettings,
  columnId: string,
  enabled: boolean,
): CsvExportSettings {
  const column = createCsvColumns(session).find((candidate) => candidate.id === columnId);
  if (!column || column.required) return normalizeCsvExportSettings(session, settings);
  const columnOverrides = { ...settings.columnOverrides };
  if (enabled === column.defaultEnabled) delete columnOverrides[column.id];
  else columnOverrides[column.id] = enabled;
  return normalizeCsvExportSettings(session, { columnOverrides });
}

export function getCsvColumnDescriptors(
  session: CurrentSession,
  settings: CsvExportSettings = session.settings.csvExport,
): CsvColumnDescriptor[] {
  return createCsvColumns(session).map((column) => ({
    id: column.id,
    header: column.header,
    label: column.label,
    section: column.section,
    type: column.type,
    defaultEnabled: column.defaultEnabled,
    required: column.required,
    enabled: isCsvColumnEnabled(column, settings),
    ...(column.classification ? { classification: { ...column.classification } } : {}),
  }));
}

function escapeCsv(value: string | number): string {
  const stringValue = String(value);
  if (!/[",\r\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replaceAll('"', '""')}"`;
}

function createCsvRowContext(
  pageNumber: number,
  pageLabel: string,
  measurement: Measurement,
  page: PageState,
  session: CurrentSession,
): CsvRowContext {
  const calibration = getMeasurementCalibration(page, measurement);
  if (!calibration) {
    throw new Error(`Measurement ${measurement.id} has a missing calibration.`);
  }
  const scaleX = calibrationScaleX(calibration);
  const scaleY = calibrationScaleY(calibration);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
    throw new RangeError("Calibration must produce finite audit values.");
  }
  // Audit metadata uses String(number) for stable, locale-independent decimal serialization
  // without arbitrary display rounding.
  const calibrationReferenceMm =
    calibration.mode === "uniform" ? String(calibration.referenceDistanceMm) : "";
  const calibrationPageDistanceValue =
    calibration.mode === "uniform" ? String(distance(calibration.start, calibration.end)) : "";
  const calibrationMmPerPageUnitValue =
    calibration.mode === "uniform" ? String(millimetresPerPageUnit(calibration)) : "";
  const unit = session.settings.displayUnit;
  const spec = measurementPathSpecs[measurement.type];
  const result = measurementResultsMm(measurement, calibration);
  const classificationValues = new Map<string, ClassificationValue | null>();
  for (const dimension of session.classificationCatalog.dimensions) {
    classificationValues.set(
      dimension.id,
      dimension.values.find((value) => measurement.classificationValueIds.includes(value.id)) ??
        null,
    );
  }
  return {
    pageNumber,
    pageLabel,
    measurement,
    page,
    session,
    calibration,
    spec,
    result,
    unit,
    scaleX,
    scaleY,
    calibrationReferenceMm,
    calibrationPageDistance: calibrationPageDistanceValue,
    calibrationMmPerPageUnit: calibrationMmPerPageUnitValue,
    classificationValues,
  };
}

export class NoMeasurementsError extends Error {
  constructor() {
    super("There are no measurements to export.");
    this.name = "NoMeasurementsError";
  }
}

export function buildCsv(
  session: CurrentSession,
  pageLabels: readonly string[] | null = null,
  csvSettings?: CsvExportSettings,
): string {
  const settings = csvSettings ?? session.settings.csvExport;
  const columns = createCsvColumns(session).filter((column) =>
    isCsvColumnEnabled(column, settings),
  );
  const rows: Array<Array<string | number>> = [];
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber];
    if (!page) continue;
    for (const measurement of page.measurements) {
      if (
        measurement.type === "polygon" &&
        !hasValidMeasurementPoints(measurement.type, measurement.points)
      ) {
        throw new Error("Repair invalid Polygon measurements before exporting CSV.");
      }
      const context = createCsvRowContext(
        pageNumber,
        pageLabels?.[pageNumber - 1] ?? "",
        measurement,
        page,
        session,
      );
      rows.push(columns.map((column) => column.extract(context)));
    }
  }
  if (rows.length === 0) throw new NoMeasurementsError();
  const header = columns.map((column) => column.header);
  const contents = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  return `\uFEFF${contents}\r\n`;
}

export function downloadCsv(
  session: CurrentSession,
  pageLabels: readonly string[] | null = null,
  csvSettings?: CsvExportSettings,
): void {
  const csv = buildCsv(session, pageLabels, csvSettings);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const baseName = session.pdf.name.replace(/\.pdf$/i, "");
  anchor.href = url;
  anchor.download = `${baseName}-measurements.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 250);
}
