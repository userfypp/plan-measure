import type { Calibration, Measurement, Point, SessionV1 } from "../types/domain";
import { isValidCalibration } from "../utils/geometry";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPoint(value: unknown): value is Point {
  return isObject(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isCalibration(value: unknown): value is Calibration | null {
  return (
    value === null ||
    (isObject(value) &&
      isPoint(value.start) &&
      isPoint(value.end) &&
      isFiniteNumber(value.referenceDistanceMm) &&
      isValidCalibration({
        start: value.start,
        end: value.end,
        referenceDistanceMm: value.referenceDistanceMm,
      }))
  );
}

function isMeasurement(value: unknown): value is Measurement {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return false;
  }
  if (
    !value.id ||
    !value.name.trim() ||
    value.name !== value.name.trim() ||
    !Array.isArray(value.points) ||
    !value.points.every(isPoint)
  )
    return false;
  if (value.type === "line") return value.points.length === 2;
  if (value.type === "polygon") return value.points.length >= 3;
  return false;
}

export function serializeSession(session: SessionV1): string {
  return JSON.stringify(session);
}

export function deserializeSession(serialized: string): SessionV1 {
  const value: unknown = JSON.parse(serialized);
  if (!isObject(value) || value.schemaVersion !== 1) {
    throw new Error("The saved session uses an unsupported schema.");
  }
  if (
    !isObject(value.pdf) ||
    typeof value.pdf.name !== "string" ||
    !isFiniteNumber(value.pdf.size) ||
    !isFiniteNumber(value.pdf.lastModified) ||
    !Number.isInteger(value.pageCount) ||
    (value.pageCount as number) < 1 ||
    !Number.isInteger(value.currentPage) ||
    (value.currentPage as number) < 1 ||
    (value.currentPage as number) > (value.pageCount as number) ||
    !isObject(value.settings) ||
    !["mm", "cm", "m"].includes(String(value.settings.displayUnit)) ||
    typeof value.settings.showLabels !== "boolean" ||
    typeof value.settings.showMeasurements !== "boolean" ||
    typeof value.settings.showCalibration !== "boolean" ||
    !isObject(value.pages)
  ) {
    throw new Error("The saved session is invalid.");
  }

  for (let pageNumber = 1; pageNumber <= (value.pageCount as number); pageNumber += 1) {
    const page = value.pages[String(pageNumber)];
    if (
      !isObject(page) ||
      page.pageNumber !== pageNumber ||
      !isCalibration(page.calibration) ||
      !Array.isArray(page.measurements) ||
      !page.measurements.every(isMeasurement) ||
      !Number.isInteger(page.nextLineNumber) ||
      (page.nextLineNumber as number) < 1 ||
      !Number.isInteger(page.nextPolygonNumber) ||
      (page.nextPolygonNumber as number) < 1
    ) {
      throw new Error(`The saved state for page ${pageNumber} is invalid.`);
    }
    if (page.measurements.length > 0 && page.calibration === null) {
      throw new Error(`Page ${pageNumber} has measurements without calibration.`);
    }
  }
  return value as unknown as SessionV1;
}
