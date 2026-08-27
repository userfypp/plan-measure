import type {
  ClassificationValue,
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

interface CsvColumnDefinition {
  id: string;
  header: string;
  type: "text" | "number";
  defaultEnabled: boolean;
  extract: (context: CsvRowContext) => string | number;
}

const STATIC_CSV_COLUMNS: readonly CsvColumnDefinition[] = [
  {
    id: "page",
    header: "page",
    type: "number",
    defaultEnabled: true,
    extract: (context) => context.pageNumber,
  },
  {
    id: "page_label",
    header: "page_label",
    type: "text",
    defaultEnabled: true,
    extract: (context) => context.pageLabel,
  },
  {
    id: "measurement_id",
    header: "measurement_id",
    type: "text",
    defaultEnabled: true,
    extract: (context) => context.measurement.id,
  },
  {
    id: "name",
    header: "name",
    type: "text",
    defaultEnabled: true,
    extract: (context) => context.measurement.name,
  },
  {
    id: "type",
    header: "type",
    type: "text",
    defaultEnabled: true,
    extract: (context) => context.spec.label,
  },
  {
    id: "calibration_id",
    header: "calibration_id",
    type: "text",
    defaultEnabled: true,
    extract: (context) => context.calibration.id,
  },
  {
    id: "calibration_name",
    header: "calibration_name",
    type: "text",
    defaultEnabled: true,
    extract: (context) => context.calibration.name,
  },
  {
    id: "calibration_mode",
    header: "calibration_mode",
    type: "text",
    defaultEnabled: true,
    extract: (context) => context.calibration.mode,
  },
  {
    id: "calibration_reference_mm",
    header: "calibration_reference_mm",
    type: "number",
    defaultEnabled: true,
    extract: (context) => context.calibrationReferenceMm,
  },
  {
    id: "calibration_page_distance",
    header: "calibration_page_distance",
    type: "number",
    defaultEnabled: true,
    extract: (context) => context.calibrationPageDistance,
  },
  {
    id: "calibration_mm_per_page_unit",
    header: "calibration_mm_per_page_unit",
    type: "number",
    defaultEnabled: true,
    extract: (context) => context.calibrationMmPerPageUnit,
  },
  {
    id: "calibration_scale_x_mm_per_page_unit",
    header: "calibration_scale_x_mm_per_page_unit",
    type: "number",
    defaultEnabled: true,
    extract: (context) => String(context.scaleX),
  },
  {
    id: "calibration_scale_y_mm_per_page_unit",
    header: "calibration_scale_y_mm_per_page_unit",
    type: "number",
    defaultEnabled: true,
    extract: (context) => String(context.scaleY),
  },
  {
    id: "length",
    header: "length",
    type: "number",
    defaultEnabled: true,
    extract: (context) =>
      context.spec.closed
        ? ""
        : formatCsvNumber(fromMillimetres(context.result.lengthMm ?? 0, context.unit)),
  },
  {
    id: "perimeter",
    header: "perimeter",
    type: "number",
    defaultEnabled: true,
    extract: (context) =>
      context.spec.closed
        ? formatCsvNumber(fromMillimetres(context.result.perimeterMm ?? 0, context.unit))
        : "",
  },
  {
    id: "area",
    header: "area",
    type: "number",
    defaultEnabled: true,
    extract: (context) =>
      context.spec.closed
        ? formatCsvNumber(fromSquareMillimetres(context.result.areaMm2 ?? 0, context.unit))
        : "",
  },
  {
    id: "unit",
    header: "unit",
    type: "text",
    defaultEnabled: true,
    extract: (context) => context.unit,
  },
  {
    id: "area_unit",
    header: "area_unit",
    type: "text",
    defaultEnabled: true,
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
      type: "text",
      defaultEnabled: true,
      extract: (context) => valueForDimension(context)?.name ?? "",
    },
    {
      id: `classification:${dimension.id}:value_id`,
      header: `classification_value_id:${dimension.name}`,
      type: "text",
      defaultEnabled: true,
      extract: (context) => valueForDimension(context)?.id ?? "",
    },
    {
      id: `classification:${dimension.id}:status`,
      header: `classification_status:${dimension.name}`,
      type: "text",
      defaultEnabled: true,
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
): string {
  const columns = createCsvColumns(session).filter((column) => column.defaultEnabled);
  const rows: Array<Array<string | number>> = [];
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber];
    if (!page) continue;
    for (const measurement of page.measurements) {
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
): void {
  const csv = buildCsv(session, pageLabels);
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
