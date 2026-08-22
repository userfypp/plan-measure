import type {
  Calibration,
  LegacyMeasurement,
  Measurement,
  PageCalibration,
  Point,
  SessionV1,
  SessionV2,
} from "../types/domain";
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

function isCalibration(value: unknown): value is Calibration {
  return (
    isObject(value) &&
    isPoint(value.start) &&
    isPoint(value.end) &&
    isFiniteNumber(value.referenceDistanceMm) &&
    isValidCalibration({
      start: value.start,
      end: value.end,
      referenceDistanceMm: value.referenceDistanceMm,
    })
  );
}

function isPageCalibration(value: unknown): value is PageCalibration {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    Boolean(value.id.trim()) &&
    typeof value.name === "string" &&
    Boolean(value.name.trim()) &&
    value.name === value.name.trim() &&
    isCalibration(value)
  );
}

function hasValidMeasurementShape(value: Record<string, unknown>): boolean {
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name !== value.name.trim() ||
    !Array.isArray(value.points) ||
    !value.points.every(isPoint)
  ) {
    return false;
  }
  if (value.type === "line") return value.points.length === 2;
  if (value.type === "polygon") return value.points.length >= 3;
  return false;
}

function isLegacyMeasurement(value: unknown): value is LegacyMeasurement {
  return isObject(value) && hasValidMeasurementShape(value);
}

function isMeasurement(value: unknown): value is Measurement {
  return (
    isObject(value) &&
    typeof value.calibrationId === "string" &&
    Boolean(value.calibrationId.trim()) &&
    hasValidMeasurementShape(value)
  );
}

function hasValidSessionHeader(value: Record<string, unknown>): boolean {
  return (
    isObject(value.pdf) &&
    typeof value.pdf.name === "string" &&
    isFiniteNumber(value.pdf.size) &&
    isFiniteNumber(value.pdf.lastModified) &&
    Number.isInteger(value.pageCount) &&
    (value.pageCount as number) >= 1 &&
    Number.isInteger(value.currentPage) &&
    (value.currentPage as number) >= 1 &&
    (value.currentPage as number) <= (value.pageCount as number) &&
    isObject(value.settings) &&
    ["mm", "cm", "m"].includes(String(value.settings.displayUnit)) &&
    typeof value.settings.showLabels === "boolean" &&
    typeof value.settings.showMeasurements === "boolean" &&
    typeof value.settings.showCalibration === "boolean" &&
    isObject(value.pages)
  );
}

function assertValidLegacySession(value: Record<string, unknown>): void {
  if (!hasValidSessionHeader(value)) throw new Error("The saved session is invalid.");
  const pageCount = value.pageCount as number;
  const pages = value.pages as Record<string, unknown>;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = pages[String(pageNumber)];
    if (
      !isObject(page) ||
      page.pageNumber !== pageNumber ||
      (page.calibration !== null && !isCalibration(page.calibration)) ||
      !Array.isArray(page.measurements) ||
      !page.measurements.every(isLegacyMeasurement) ||
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
}

function assertValidCurrentSession(value: Record<string, unknown>): void {
  if (!hasValidSessionHeader(value)) throw new Error("The saved session is invalid.");
  const pageCount = value.pageCount as number;
  const pages = value.pages as Record<string, unknown>;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = pages[String(pageNumber)];
    if (
      !isObject(page) ||
      page.pageNumber !== pageNumber ||
      !Array.isArray(page.calibrations) ||
      !page.calibrations.every(isPageCalibration) ||
      !Array.isArray(page.measurements) ||
      !page.measurements.every(isMeasurement) ||
      !Number.isInteger(page.nextCalibrationNumber) ||
      (page.nextCalibrationNumber as number) < 1 ||
      !Number.isInteger(page.nextLineNumber) ||
      (page.nextLineNumber as number) < 1 ||
      !Number.isInteger(page.nextPolygonNumber) ||
      (page.nextPolygonNumber as number) < 1
    ) {
      throw new Error(`The saved state for page ${pageNumber} is invalid.`);
    }

    const calibrationIds = new Set(page.calibrations.map((calibration) => calibration.id));
    if (calibrationIds.size !== page.calibrations.length) {
      throw new Error(`Page ${pageNumber} has duplicate calibration IDs.`);
    }
    if (page.calibrations.length === 0 && page.activeCalibrationId !== null) {
      throw new Error(`Page ${pageNumber} has an active calibration that does not exist.`);
    }
    if (
      page.calibrations.length > 0 &&
      (typeof page.activeCalibrationId !== "string" ||
        !calibrationIds.has(page.activeCalibrationId))
    ) {
      throw new Error(`Page ${pageNumber} has an active calibration that does not exist.`);
    }
    if (page.measurements.length > 0 && page.calibrations.length === 0) {
      throw new Error(`Page ${pageNumber} has measurements without calibration.`);
    }
    if (page.measurements.some((measurement) => !calibrationIds.has(measurement.calibrationId))) {
      throw new Error(`Page ${pageNumber} has a measurement with a missing calibration.`);
    }
  }
}

function legacyCalibrationId(pageNumber: number): string {
  return `legacy-page-${pageNumber}-scale-1`;
}

function migrateSessionV1(session: SessionV1): SessionV2 {
  const pages: SessionV2["pages"] = {};
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const legacyPage = session.pages[pageNumber]!;
    if (!legacyPage.calibration) {
      pages[pageNumber] = {
        pageNumber,
        calibrations: [],
        activeCalibrationId: null,
        nextCalibrationNumber: 1,
        measurements: [],
        nextLineNumber: legacyPage.nextLineNumber,
        nextPolygonNumber: legacyPage.nextPolygonNumber,
      };
      continue;
    }

    const calibrationId = legacyCalibrationId(pageNumber);
    pages[pageNumber] = {
      pageNumber,
      calibrations: [
        {
          id: calibrationId,
          name: "Scale 1",
          ...legacyPage.calibration,
        },
      ],
      activeCalibrationId: calibrationId,
      nextCalibrationNumber: 2,
      measurements: legacyPage.measurements.map((measurement) => ({
        ...measurement,
        calibrationId,
      })),
      nextLineNumber: legacyPage.nextLineNumber,
      nextPolygonNumber: legacyPage.nextPolygonNumber,
    };
  }
  return {
    schemaVersion: 2,
    pdf: session.pdf,
    pageCount: session.pageCount,
    currentPage: session.currentPage,
    pages,
    settings: session.settings,
  };
}

export function serializeSession(session: SessionV2): string {
  return JSON.stringify(session);
}

export function deserializeSession(serialized: string): SessionV2 {
  const value: unknown = JSON.parse(serialized);
  if (!isObject(value)) throw new Error("The saved session uses an unsupported schema.");
  if (value.schemaVersion === 1) {
    assertValidLegacySession(value);
    return migrateSessionV1(value as unknown as SessionV1);
  }
  if (value.schemaVersion === 2) {
    assertValidCurrentSession(value);
    return value as unknown as SessionV2;
  }
  throw new Error("The saved session uses an unsupported schema.");
}
