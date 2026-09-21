import type {
  AreaDisplay,
  ClassificationValue,
  CsvExportSettings,
  CurrentSession,
  LinearUnit,
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
import { formatCsvNumber, resolveLinearUnit } from "../utils/format";
import {
  practicalScaleRatioDenominator,
  scaleRatioDenominatorFromMillimetresPerPageUnit,
} from "../utils/pdfUnits";
import { effectivePageLabel } from "../utils/pageLabels";
import {
  fromMillimetres,
  fromSquareMillimetres,
  fromSquareMillimetresToAcres,
} from "../utils/units";

interface CsvRowContext {
  pdfName: string;
  pageNumber: number;
  pageLabel: string;
  measurement: Measurement;
  calibration: PageCalibration;
  spec: MeasurementPathSpec;
  result: ReturnType<typeof measurementResultsMm>;
  unit: LinearUnit;
  areaDisplay: AreaDisplay;
  scaleX: number;
  scaleY: number;
  calibrationReferenceMm: string;
  calibrationPageDistance: string;
  calibrationMmPerPageUnit: string;
  calibrationRatioDenominator: string;
  calibrationRatioXDenominator: string;
  calibrationRatioYDenominator: string;
  calibrationXReferenceMm: string;
  calibrationXPageSpan: string;
  calibrationYReferenceMm: string;
  calibrationYPageSpan: string;
  classificationValues: ReadonlyMap<string, ClassificationValue | null>;
}

export type CsvColumnSection = "measurement" | "values" | "scale" | "additional" | "classification";
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
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationReferenceMm,
  },
  {
    id: "calibration_page_distance",
    header: "calibration_page_distance",
    label: "Page distance",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationPageDistance,
  },
  {
    id: "calibration_mm_per_page_unit",
    header: "calibration_mm_per_page_unit",
    label: "mm per page unit",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationMmPerPageUnit,
  },
  {
    id: "calibration_scale_x_mm_per_page_unit",
    header: "calibration_scale_x_mm_per_page_unit",
    label: "X scale (mm/page unit)",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => String(context.scaleX),
  },
  {
    id: "calibration_scale_y_mm_per_page_unit",
    header: "calibration_scale_y_mm_per_page_unit",
    label: "Y scale (mm/page unit)",
    section: "additional",
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
        ? formatCsvNumber(
            context.areaDisplay === "ac"
              ? fromSquareMillimetresToAcres(context.result.areaMm2 ?? 0)
              : fromSquareMillimetres(context.result.areaMm2 ?? 0, context.unit),
          )
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
    extract: (context) =>
      context.spec.closed ? (context.areaDisplay === "ac" ? "ac" : `${context.unit}²`) : "",
  },
  {
    id: "pdf_name",
    header: "pdf_name",
    label: "PDF name",
    section: "additional",
    type: "text",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.pdfName,
  },
  {
    id: "measurement_visible",
    header: "measurement_visible",
    label: "Measurement visible",
    section: "additional",
    type: "text",
    defaultEnabled: false,
    required: false,
    extract: (context) => String(context.measurement.visible),
  },
  {
    id: "measurement_point_count",
    header: "measurement_point_count",
    label: "Point count",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.measurement.points.length,
  },
  {
    id: "length_mm",
    header: "length_mm",
    label: "Length (mm)",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) =>
      context.result.lengthMm === null ? "" : formatCsvNumber(context.result.lengthMm),
  },
  {
    id: "perimeter_mm",
    header: "perimeter_mm",
    label: "Perimeter (mm)",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) =>
      context.result.perimeterMm === null ? "" : formatCsvNumber(context.result.perimeterMm),
  },
  {
    id: "area_mm2",
    header: "area_mm2",
    label: "Area (mm²)",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) =>
      context.result.areaMm2 === null ? "" : formatCsvNumber(context.result.areaMm2),
  },
  {
    id: "calibration_ratio_denominator",
    header: "calibration_ratio_denominator",
    label: "Ratio denominator",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationRatioDenominator,
  },
  {
    id: "calibration_ratio_x_denominator",
    header: "calibration_ratio_x_denominator",
    label: "X ratio denominator",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationRatioXDenominator,
  },
  {
    id: "calibration_ratio_y_denominator",
    header: "calibration_ratio_y_denominator",
    label: "Y ratio denominator",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationRatioYDenominator,
  },
  {
    id: "calibration_x_reference_mm",
    header: "calibration_x_reference_mm",
    label: "X reference (mm)",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationXReferenceMm,
  },
  {
    id: "calibration_x_page_span",
    header: "calibration_x_page_span",
    label: "X page span",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationXPageSpan,
  },
  {
    id: "calibration_y_reference_mm",
    header: "calibration_y_reference_mm",
    label: "Y reference (mm)",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationYReferenceMm,
  },
  {
    id: "calibration_y_page_span",
    header: "calibration_y_page_span",
    label: "Y page span",
    section: "additional",
    type: "number",
    defaultEnabled: false,
    required: false,
    extract: (context) => context.calibrationYPageSpan,
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

const SPREADSHEET_FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);

function neutralizeSpreadsheetText(value: string): string {
  let prefixIndex = 0;
  while (prefixIndex < value.length && value.charCodeAt(prefixIndex) <= 0x20) {
    prefixIndex += 1;
  }
  const prefix = value[prefixIndex];
  return prefix !== undefined && SPREADSHEET_FORMULA_PREFIXES.has(prefix) ? `'${value}` : value;
}

function serializeCsvCell(value: string | number, type: CsvColumnType): string {
  const stringValue = String(value);
  const safeValue = type === "text" ? neutralizeSpreadsheetText(stringValue) : stringValue;
  return escapeCsv(safeValue);
}

function serializeCsv(
  headers: readonly string[],
  columnTypes: readonly CsvColumnType[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const serializedHeader = headers.map((header) => serializeCsvCell(header, "text"));
  const serializedRows = rows.map((row) =>
    row.map((value, index) => serializeCsvCell(value, columnTypes[index]!)),
  );
  const contents = [serializedHeader, ...serializedRows].map((row) => row.join(",")).join("\r\n");
  return `\uFEFF${contents}\r\n`;
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
  const ratioDenominator = (scale: number) =>
    String(practicalScaleRatioDenominator(scaleRatioDenominatorFromMillimetresPerPageUnit(scale)));
  const calibrationRatioDenominator =
    calibration.mode === "uniform" ? ratioDenominator(scaleX) : "";
  const calibrationRatioXDenominator = calibration.mode === "xy" ? ratioDenominator(scaleX) : "";
  const calibrationRatioYDenominator = calibration.mode === "xy" ? ratioDenominator(scaleY) : "";
  const calibrationXReferenceMm =
    calibration.mode === "xy" ? String(calibration.xReference.referenceDistanceMm) : "";
  const calibrationXPageSpan =
    calibration.mode === "xy"
      ? String(Math.abs(calibration.xReference.end.x - calibration.xReference.start.x))
      : "";
  const calibrationYReferenceMm =
    calibration.mode === "xy" ? String(calibration.yReference.referenceDistanceMm) : "";
  const calibrationYPageSpan =
    calibration.mode === "xy"
      ? String(Math.abs(calibration.yReference.end.y - calibration.yReference.start.y))
      : "";
  const unit = resolveLinearUnit(session.settings.displayUnit);
  const areaDisplay = session.settings.areaDisplay;
  const spec = measurementPathSpecs[measurement.type];
  let result: ReturnType<typeof measurementResultsMm>;
  try {
    result = measurementResultsMm(measurement, calibration);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new RangeError(
        `Measurement ${measurement.id} must produce finite results before exporting CSV.`,
        { cause: error },
      );
    }
    throw error;
  }
  if (
    [result.lengthMm, result.perimeterMm, result.areaMm2].some(
      (value) => value !== null && !Number.isFinite(value),
    )
  ) {
    throw new RangeError(
      `Measurement ${measurement.id} must produce finite results before exporting CSV.`,
    );
  }
  const classificationValues = new Map<string, ClassificationValue | null>();
  for (const dimension of session.classificationCatalog.dimensions) {
    classificationValues.set(
      dimension.id,
      dimension.values.find((value) => measurement.classificationValueIds.includes(value.id)) ??
        null,
    );
  }
  return {
    pdfName: session.pdf.name,
    pageNumber,
    pageLabel,
    measurement,
    calibration,
    spec,
    result,
    unit,
    areaDisplay,
    scaleX,
    scaleY,
    calibrationReferenceMm,
    calibrationPageDistance: calibrationPageDistanceValue,
    calibrationMmPerPageUnit: calibrationMmPerPageUnitValue,
    calibrationRatioDenominator,
    calibrationRatioXDenominator,
    calibrationRatioYDenominator,
    calibrationXReferenceMm,
    calibrationXPageSpan,
    calibrationYReferenceMm,
    calibrationYPageSpan,
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
  const rows: (string | number)[][] = [];
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
        effectivePageLabel(pageNumber, session.pageLabelOverrides, pageLabels),
        measurement,
        page,
        session,
      );
      rows.push(columns.map((column) => column.extract(context)));
    }
  }
  if (rows.length === 0) throw new NoMeasurementsError();
  return serializeCsv(
    columns.map((column) => column.header),
    columns.map((column) => column.type),
    rows,
  );
}

const CLASSIFICATION_ASSIGNMENT_HEADERS = [
  "pdf_name",
  "page",
  "page_label",
  "measurement_id",
  "measurement_name",
  "measurement_type",
  "measurement_visible",
  "classification_dimension",
  "classification_dimension_id",
  "classification_dimension_status",
  "classification_value",
  "classification_value_id",
  "classification_value_status",
  "classification_status",
] as const;

const CLASSIFICATION_ASSIGNMENT_COLUMN_TYPES: readonly CsvColumnType[] = [
  "text",
  "number",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
];

export function buildClassificationAssignmentsCsv(
  session: CurrentSession,
  pageLabels: readonly string[] | null = null,
): string {
  const rows: (string | number)[][] = [];
  let measurementCount = 0;

  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber];
    if (!page) continue;
    for (const measurement of page.measurements) {
      measurementCount += 1;
      for (const dimension of session.classificationCatalog.dimensions) {
        const value = dimension.values.find((candidate) =>
          measurement.classificationValueIds.includes(candidate.id),
        );
        if (!value) continue;
        rows.push([
          session.pdf.name,
          pageNumber,
          effectivePageLabel(pageNumber, session.pageLabelOverrides, pageLabels),
          measurement.id,
          measurement.name,
          measurementPathSpecs[measurement.type].label,
          String(measurement.visible),
          dimension.name,
          dimension.id,
          dimension.archived ? "archived" : "active",
          value.name,
          value.id,
          value.archived ? "archived" : "active",
          dimension.archived || value.archived ? "archived" : "active",
        ]);
      }
    }
  }

  if (measurementCount === 0) throw new NoMeasurementsError();
  return serializeCsv(
    CLASSIFICATION_ASSIGNMENT_HEADERS,
    CLASSIFICATION_ASSIGNMENT_COLUMN_TYPES,
    rows,
  );
}

function downloadCsvFile(csv: string, fileName: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 250);
}

export function downloadCsv(
  session: CurrentSession,
  pageLabels: readonly string[] | null = null,
  csvSettings?: CsvExportSettings,
): void {
  const csv = buildCsv(session, pageLabels, csvSettings);
  const baseName = session.pdf.name.replace(/\.pdf$/i, "");
  downloadCsvFile(csv, `${baseName}-measurements.csv`);
}

export function downloadClassificationAssignmentsCsv(
  session: CurrentSession,
  pageLabels: readonly string[] | null = null,
): void {
  const csv = buildClassificationAssignmentsCsv(session, pageLabels);
  const baseName = session.pdf.name.replace(/\.pdf$/i, "");
  downloadCsvFile(csv, `${baseName}-classifications.csv`);
}
