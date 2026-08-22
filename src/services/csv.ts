import type { Measurement, SessionV1 } from "../types/domain";
import {
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
  "calibration_reference_mm",
  "calibration_page_distance",
  "calibration_mm_per_page_unit",
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
  session: SessionV1,
): string[] {
  const calibration = session.pages[pageNumber]?.calibration;
  if (!calibration) {
    throw new Error(`Page ${pageNumber} has measurements without calibration.`);
  }
  const calibrationPageDistance = distance(calibration.start, calibration.end);
  const calibrationMmPerPageUnit = millimetresPerPageUnit(calibration);
  if (!Number.isFinite(calibrationPageDistance) || !Number.isFinite(calibrationMmPerPageUnit)) {
    throw new RangeError("Calibration must produce finite audit values.");
  }
  // Audit metadata uses String(number) for stable, locale-independent decimal serialization
  // without arbitrary display rounding.
  const calibrationReferenceMm = String(calibration.referenceDistanceMm);
  const calibrationPageDistanceValue = String(calibrationPageDistance);
  const calibrationMmPerPageUnitValue = String(calibrationMmPerPageUnit);
  const unit = session.settings.displayUnit;
  if (measurement.type === "line") {
    return [
      String(pageNumber),
      pageLabel,
      measurement.id,
      measurement.name,
      "Line",
      calibrationReferenceMm,
      calibrationPageDistanceValue,
      calibrationMmPerPageUnitValue,
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
    calibrationReferenceMm,
    calibrationPageDistanceValue,
    calibrationMmPerPageUnitValue,
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

export function buildCsv(session: SessionV1, pageLabels: readonly string[] | null = null): string {
  const rows: string[][] = [];
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber];
    if (!page) continue;
    for (const measurement of page.measurements) {
      rows.push(
        measurementRow(pageNumber, pageLabels?.[pageNumber - 1] ?? "", measurement, session),
      );
    }
  }
  if (rows.length === 0) throw new NoMeasurementsError();
  const contents = [HEADER, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  return `\uFEFF${contents}\r\n`;
}

export function downloadCsv(session: SessionV1, pageLabels: readonly string[] | null = null): void {
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
