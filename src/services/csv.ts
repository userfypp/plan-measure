import type { Measurement, PageState, SessionV3 } from "../types/domain";
import { getMeasurementCalibration } from "../utils/calibration";
import {
  calibrationScaleX,
  calibrationScaleY,
  distance,
  lineLengthMm,
  millimetresPerPageUnit,
  polygonResultsMm,
} from "../utils/geometry";
import { formatNumber } from "../utils/format";
import { fromMillimetres, fromSquareMillimetres } from "../utils/units";

const HEADER = [
  "page",
  "page_label",
  "measurement_id",
  "name",
  "type",
  "calibration_id",
  "calibration_name",
  "calibration_mode",
  "calibration_reference_mm",
  "calibration_page_distance",
  "calibration_mm_per_page_unit",
  "calibration_scale_x_mm_per_page_unit",
  "calibration_scale_y_mm_per_page_unit",
  "length",
  "perimeter",
  "area",
  "unit",
];

function escapeCsv(value: string | number): string {
  const stringValue = String(value);
  if (!/[",\r\n]/.test(stringValue)) return stringValue;
  return `"${stringValue.replaceAll('"', '""')}"`;
}

function measurementRow(
  pageNumber: number,
  pageLabel: string,
  measurement: Measurement,
  page: PageState,
  session: SessionV3,
): string[] {
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
  if (measurement.type === "line") {
    return [
      String(pageNumber),
      pageLabel,
      measurement.id,
      measurement.name,
      "Line",
      calibration.id,
      calibration.name,
      calibration.mode,
      calibrationReferenceMm,
      calibrationPageDistanceValue,
      calibrationMmPerPageUnitValue,
      String(scaleX),
      String(scaleY),
      formatNumber(fromMillimetres(lineLengthMm(measurement.points, calibration), unit)),
      "",
      "",
      unit,
    ];
  }
  const result = polygonResultsMm(measurement, calibration);
  return [
    String(pageNumber),
    pageLabel,
    measurement.id,
    measurement.name,
    "Polygon",
    calibration.id,
    calibration.name,
    calibration.mode,
    calibrationReferenceMm,
    calibrationPageDistanceValue,
    calibrationMmPerPageUnitValue,
    String(scaleX),
    String(scaleY),
    "",
    formatNumber(fromMillimetres(result.perimeterMm, unit)),
    formatNumber(fromSquareMillimetres(result.areaMm2, unit)),
    unit,
  ];
}

export class NoMeasurementsError extends Error {
  constructor() {
    super("There are no measurements to export.");
    this.name = "NoMeasurementsError";
  }
}

export function buildCsv(session: SessionV3, pageLabels: readonly string[] | null = null): string {
  const rows: string[][] = [];
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber];
    if (!page) continue;
    for (const measurement of page.measurements) {
      rows.push(
        measurementRow(pageNumber, pageLabels?.[pageNumber - 1] ?? "", measurement, page, session),
      );
    }
  }
  if (rows.length === 0) throw new NoMeasurementsError();
  const contents = [HEADER, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  return `\uFEFF${contents}\r\n`;
}

export function downloadCsv(session: SessionV3, pageLabels: readonly string[] | null = null): void {
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
