import type {
  Calibration,
  LegacyMeasurement,
  Measurement,
  PageCalibration,
  Point,
  SessionV1,
  SessionV2,
  SessionV3,
} from "../types/domain";
import { isValidCalibration, isValidPageCalibration } from "../utils/geometry";

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
function hasCalibrationIdentity(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === "string" &&
    Boolean(value.id.trim()) &&
    typeof value.name === "string" &&
    Boolean(value.name.trim()) &&
    value.name === value.name.trim()
  );
}
function isPageCalibrationV2(value: unknown): boolean {
  return isObject(value) && hasCalibrationIdentity(value) && isCalibration(value);
}
function isPageCalibrationV3(value: unknown): value is PageCalibration {
  if (!isObject(value) || !hasCalibrationIdentity(value)) return false;
  if (value.mode === "uniform") {
    return (
      isCalibration(value) &&
      isValidPageCalibration({
        id: value.id as string,
        name: value.name as string,
        mode: "uniform",
        start: value.start,
        end: value.end,
        referenceDistanceMm: value.referenceDistanceMm,
      })
    );
  }
  if (value.mode === "xy") {
    return (
      isCalibration(value.xReference) &&
      isCalibration(value.yReference) &&
      isValidPageCalibration({
        id: value.id as string,
        name: value.name as string,
        mode: "xy",
        xReference: value.xReference,
        yReference: value.yReference,
      })
    );
  }
  return false;
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
  )
    return false;
  return value.type === "line"
    ? value.points.length === 2
    : value.type === "polygon" && value.points.length >= 3;
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
    )
      throw new Error(`The saved state for page ${pageNumber} is invalid.`);
    if (page.measurements.length > 0 && page.calibration === null)
      throw new Error(`Page ${pageNumber} has measurements without calibration.`);
  }
}
function assertValidModernSession(
  value: Record<string, unknown>,
  isCalibrationValue: (value: unknown) => boolean,
): void {
  if (!hasValidSessionHeader(value)) throw new Error("The saved session is invalid.");
  const pageCount = value.pageCount as number;
  const pages = value.pages as Record<string, unknown>;
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = pages[String(pageNumber)];
    if (
      !isObject(page) ||
      page.pageNumber !== pageNumber ||
      !Array.isArray(page.calibrations) ||
      !page.calibrations.every(isCalibrationValue) ||
      !Array.isArray(page.measurements) ||
      !page.measurements.every(isMeasurement) ||
      !Number.isInteger(page.nextCalibrationNumber) ||
      (page.nextCalibrationNumber as number) < 1 ||
      !Number.isInteger(page.nextLineNumber) ||
      (page.nextLineNumber as number) < 1 ||
      !Number.isInteger(page.nextPolygonNumber) ||
      (page.nextPolygonNumber as number) < 1
    )
      throw new Error(`The saved state for page ${pageNumber} is invalid.`);
    const calibrationIds = new Set(
      page.calibrations.map((calibration) => (calibration as { id: string }).id),
    );
    if (calibrationIds.size !== page.calibrations.length)
      throw new Error(`Page ${pageNumber} has duplicate calibration IDs.`);
    if (page.calibrations.length === 0 && page.activeCalibrationId !== null)
      throw new Error(`Page ${pageNumber} has an active calibration that does not exist.`);
    if (
      page.calibrations.length > 0 &&
      (typeof page.activeCalibrationId !== "string" ||
        !calibrationIds.has(page.activeCalibrationId))
    )
      throw new Error(`Page ${pageNumber} has an active calibration that does not exist.`);
    if (page.measurements.length > 0 && page.calibrations.length === 0)
      throw new Error(`Page ${pageNumber} has measurements without calibration.`);
    if (page.measurements.some((measurement) => !calibrationIds.has(measurement.calibrationId)))
      throw new Error(`Page ${pageNumber} has a measurement with a missing calibration.`);
  }
}
function legacyCalibrationId(pageNumber: number): string {
  return `legacy-page-${pageNumber}-scale-1`;
}
function migrateSessionV1(session: SessionV1): SessionV3 {
  const pages: SessionV3["pages"] = {};
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
        { id: calibrationId, name: "Scale 1", mode: "uniform", ...legacyPage.calibration },
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
  return { ...session, schemaVersion: 3, pages };
}
function migrateSessionV2(session: SessionV2): SessionV3 {
  const pages: SessionV3["pages"] = {};
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber]!;
    pages[pageNumber] = {
      ...page,
      calibrations: page.calibrations.map((calibration) => ({ ...calibration, mode: "uniform" })),
    };
  }
  return { ...session, schemaVersion: 3, pages };
}
export function serializeSession(session: SessionV3): string {
  return JSON.stringify(session);
}
export function deserializeSession(serialized: string): SessionV3 {
  const value: unknown = JSON.parse(serialized);
  if (!isObject(value)) throw new Error("The saved session uses an unsupported schema.");
  if (value.schemaVersion === 1) {
    assertValidLegacySession(value);
    return migrateSessionV1(value as unknown as SessionV1);
  }
  if (value.schemaVersion === 2) {
    assertValidModernSession(value, isPageCalibrationV2);
    return migrateSessionV2(value as unknown as SessionV2);
  }
  if (value.schemaVersion === 3) {
    assertValidModernSession(value, isPageCalibrationV3);
    return value as unknown as SessionV3;
  }
  throw new Error("The saved session uses an unsupported schema.");
}
