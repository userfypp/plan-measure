import type {
  Calibration,
  LegacyMeasurement,
  Measurement,
  MeasurementV5,
  MeasurementV4,
  MeasurementV3,
  PageCalibration,
  Point,
  SessionV1,
  SessionV2,
  SessionV3,
  SessionV4,
  SessionV5,
  SessionV6,
  SessionV7,
  CurrentSession,
} from "../types/domain";
import {
  hasValidMeasurementPoints,
  isMeasurementType,
  isValidCalibration,
  isValidPageCalibration,
} from "../utils/geometry";

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
    value.id === value.id.trim() &&
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

function hasValidMeasurementIdentity(value: Record<string, unknown>): boolean {
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.id !== value.id.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name !== value.name.trim() ||
    !Array.isArray(value.points) ||
    !value.points.every(isPoint)
  )
    return false;
  return true;
}
function hasValidMeasurementShapeV3(value: Record<string, unknown>): boolean {
  if (!hasValidMeasurementIdentity(value)) return false;
  const points = value.points as unknown[];
  return value.type === "line"
    ? points.length === 2
    : value.type === "polygon" && points.length >= 3;
}
function isLegacyMeasurement(value: unknown): value is LegacyMeasurement {
  return isObject(value) && hasValidMeasurementShapeV3(value);
}
function isMeasurementV3(value: unknown): value is MeasurementV3 {
  return (
    isObject(value) &&
    typeof value.calibrationId === "string" &&
    Boolean(value.calibrationId.trim()) &&
    value.calibrationId === value.calibrationId.trim() &&
    hasValidMeasurementShapeV3(value)
  );
}
function isMeasurementV4(value: unknown): value is MeasurementV4 {
  if (
    !isObject(value) ||
    typeof value.calibrationId !== "string" ||
    !value.calibrationId.trim() ||
    value.calibrationId !== value.calibrationId.trim()
  )
    return false;
  const measurementType = value.type;
  if (typeof measurementType !== "string" || !isMeasurementType(measurementType)) return false;
  if (!hasValidMeasurementIdentity(value)) return false;
  return hasValidMeasurementPoints(measurementType, value.points as Point[]);
}
function hasValidClassificationValueIds(value: Record<string, unknown>): boolean {
  const classificationValueIds = value.classificationValueIds;
  return (
    Array.isArray(classificationValueIds) &&
    classificationValueIds.every(
      (id) => typeof id === "string" && Boolean(id.trim()) && id === id.trim(),
    ) &&
    new Set(classificationValueIds).size === classificationValueIds.length
  );
}
function isMeasurementV5(value: unknown): value is MeasurementV5 {
  if (!isMeasurementV4(value) || !isObject(value)) return false;
  return hasValidClassificationValueIds(value);
}
function isMeasurement(value: unknown): value is Measurement {
  return isObject(value) && typeof value.visible === "boolean" && isMeasurementV5(value);
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
  const measurementIds = new Set<string>();
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
    for (const measurement of page.measurements) {
      const id = (measurement as { id: string }).id;
      if (measurementIds.has(id))
        throw new Error("The saved session has duplicate measurement IDs.");
      measurementIds.add(id);
    }
  }
}
function assertValidSessionV3(
  value: Record<string, unknown>,
  isCalibrationValue: (value: unknown) => boolean,
): void {
  if (!hasValidSessionHeader(value)) throw new Error("The saved session is invalid.");
  const pageCount = value.pageCount as number;
  const pages = value.pages as Record<string, unknown>;
  const measurementIds = new Set<string>();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = pages[String(pageNumber)];
    if (
      !isObject(page) ||
      page.pageNumber !== pageNumber ||
      !Array.isArray(page.calibrations) ||
      !page.calibrations.every(isCalibrationValue) ||
      !Array.isArray(page.measurements) ||
      !page.measurements.every(isMeasurementV3) ||
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
    for (const measurement of page.measurements) {
      const id = (measurement as { id: string }).id;
      if (measurementIds.has(id))
        throw new Error("The saved session has duplicate measurement IDs.");
      measurementIds.add(id);
    }
  }
}
function hasValidMeasurementCounters(value: unknown): boolean {
  if (!isObject(value)) return false;
  return ["line", "polyline", "polygon"].every(
    (type) => Number.isInteger(value[type]) && (value[type] as number) >= 1,
  );
}
function assertValidSessionV4(value: Record<string, unknown>): void {
  if (!hasValidSessionHeader(value)) throw new Error("The saved session is invalid.");
  const pageCount = value.pageCount as number;
  const pages = value.pages as Record<string, unknown>;
  const measurementIds = new Set<string>();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = pages[String(pageNumber)];
    if (
      !isObject(page) ||
      page.pageNumber !== pageNumber ||
      !Array.isArray(page.calibrations) ||
      !page.calibrations.every(isPageCalibrationV3) ||
      !Array.isArray(page.measurements) ||
      !page.measurements.every(isMeasurementV4) ||
      !Number.isInteger(page.nextCalibrationNumber) ||
      (page.nextCalibrationNumber as number) < 1 ||
      !hasValidMeasurementCounters(page.nextMeasurementNumber)
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
    for (const measurement of page.measurements) {
      const id = (measurement as { id: string }).id;
      if (measurementIds.has(id))
        throw new Error("The saved session has duplicate measurement IDs.");
      measurementIds.add(id);
    }
  }
}
function assertValidClassificationCatalog(
  value: unknown,
  requireDimensionArchived = false,
): Map<string, string> {
  if (!isObject(value) || !Array.isArray(value.dimensions))
    throw new Error("The saved classification catalog is invalid.");
  const ids = new Set<string>();
  const valueDimensions = new Map<string, string>();
  const dimensionNames = new Set<string>();
  for (const dimension of value.dimensions) {
    if (
      !isObject(dimension) ||
      typeof dimension.id !== "string" ||
      !dimension.id.trim() ||
      dimension.id !== dimension.id.trim() ||
      typeof dimension.name !== "string" ||
      !dimension.name.trim() ||
      dimension.name !== dimension.name.trim() ||
      (requireDimensionArchived && typeof dimension.archived !== "boolean") ||
      !Array.isArray(dimension.values) ||
      ids.has(dimension.id) ||
      dimensionNames.has(dimension.name.toLocaleLowerCase())
    )
      throw new Error("The saved classification catalog is invalid.");
    ids.add(dimension.id);
    dimensionNames.add(dimension.name.toLocaleLowerCase());
    const valueNames = new Set<string>();
    for (const classificationValue of dimension.values) {
      if (
        !isObject(classificationValue) ||
        typeof classificationValue.id !== "string" ||
        !classificationValue.id.trim() ||
        classificationValue.id !== classificationValue.id.trim() ||
        typeof classificationValue.name !== "string" ||
        !classificationValue.name.trim() ||
        classificationValue.name !== classificationValue.name.trim() ||
        typeof classificationValue.archived !== "boolean" ||
        ids.has(classificationValue.id) ||
        valueNames.has(classificationValue.name.toLocaleLowerCase())
      )
        throw new Error("The saved classification catalog is invalid.");
      ids.add(classificationValue.id);
      valueDimensions.set(classificationValue.id, dimension.id);
      valueNames.add(classificationValue.name.toLocaleLowerCase());
    }
  }
  return valueDimensions;
}

function assertValidSessionV5(value: Record<string, unknown>): void {
  assertValidSessionV4(value);
  const valueDimensions = assertValidClassificationCatalog(value.classificationCatalog);
  const pages = value.pages as Record<string, { measurements: unknown[] }>;
  for (const page of Object.values(pages)) {
    if (!page.measurements.every(isMeasurementV5))
      throw new Error("The saved session has an invalid measurement classification.");
    for (const measurement of page.measurements as MeasurementV5[]) {
      if (measurement.classificationValueIds.some((id) => !valueDimensions.has(id)))
        throw new Error("The saved session has a measurement with a missing classification value.");
      const assignedDimensions = measurement.classificationValueIds.map((id) =>
        valueDimensions.get(id)!,
      );
      if (new Set(assignedDimensions).size !== assignedDimensions.length)
        throw new Error(
          "The saved session assigns multiple values from one classification dimension.",
        );
    }
  }
}
function assertValidSessionV6(value: Record<string, unknown>): void {
  assertValidSessionV4(value);
  const valueDimensions = assertValidClassificationCatalog(value.classificationCatalog);
  const pages = value.pages as Record<string, { measurements: unknown[] }>;
  for (const page of Object.values(pages)) {
    if (!page.measurements.every(isMeasurement))
      throw new Error("The saved session has an invalid measurement classification or visibility.");
    for (const measurement of page.measurements as Measurement[]) {
      if (measurement.classificationValueIds.some((id) => !valueDimensions.has(id)))
        throw new Error("The saved session has a measurement with a missing classification value.");
      const assignedDimensions = measurement.classificationValueIds.map((id) =>
        valueDimensions.get(id)!,
      );
      if (new Set(assignedDimensions).size !== assignedDimensions.length)
        throw new Error(
          "The saved session assigns multiple values from one classification dimension.",
        );
    }
  }
}
function assertValidSessionV7(value: Record<string, unknown>): void {
  if (value.schemaVersion !== 7) throw new Error("The saved session is invalid.");
  assertValidSessionV4(value);
  const valueDimensions = assertValidClassificationCatalog(value.classificationCatalog, true);
  const pages = value.pages as Record<string, { measurements: unknown[] }>;
  for (const page of Object.values(pages)) {
    if (!page.measurements.every(isMeasurement))
      throw new Error("The saved session has an invalid measurement classification or visibility.");
    for (const measurement of page.measurements as Measurement[]) {
      if (measurement.classificationValueIds.some((id) => !valueDimensions.has(id)))
        throw new Error("The saved session has a measurement with a missing classification value.");
      const assignedDimensions = measurement.classificationValueIds.map((id) =>
        valueDimensions.get(id)!,
      );
      if (new Set(assignedDimensions).size !== assignedDimensions.length)
        throw new Error(
          "The saved session assigns multiple values from one classification dimension.",
        );
    }
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
function migrateSessionV3(session: SessionV3): SessionV4 {
  const pages: SessionV4["pages"] = {};
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber]!;
    pages[pageNumber] = {
      pageNumber: page.pageNumber,
      calibrations: page.calibrations,
      activeCalibrationId: page.activeCalibrationId,
      nextCalibrationNumber: page.nextCalibrationNumber,
      measurements: page.measurements,
      nextMeasurementNumber: {
        line: page.nextLineNumber,
        polyline: 1,
        polygon: page.nextPolygonNumber,
      },
    };
  }
  return { ...session, schemaVersion: 4, pages };
}

function migrateSessionV4(session: SessionV4): SessionV5 {
  const pages: SessionV5["pages"] = {};
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber]!;
    pages[pageNumber] = {
      ...page,
      measurements: page.measurements.map((measurement) => ({
        ...measurement,
        classificationValueIds: [],
      })),
    };
  }
  return { ...session, schemaVersion: 5, pages, classificationCatalog: { dimensions: [] } };
}

function migrateSessionV5(session: SessionV5): SessionV6 {
  const pages: SessionV6["pages"] = {};
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber]!;
    pages[pageNumber] = {
      ...page,
      measurements: page.measurements.map((measurement) => ({
        ...measurement,
        visible: true,
      })),
    };
  }
  return { ...session, schemaVersion: 6, pages };
}

function migrateSessionV6(session: SessionV6): SessionV7 {
  return {
    ...session,
    schemaVersion: 7,
    classificationCatalog: {
      dimensions: session.classificationCatalog.dimensions.map((dimension) => ({
        id: dimension.id,
        name: dimension.name,
        archived: false,
        values: dimension.values.map((classificationValue) => ({ ...classificationValue })),
      })),
    },
  };
}

function canonicalizeSessionV7(session: SessionV7): SessionV7 {
  const pages: SessionV7["pages"] = {};
  for (let pageNumber = 1; pageNumber <= session.pageCount; pageNumber += 1) {
    const page = session.pages[pageNumber]!;
    pages[pageNumber] = {
      pageNumber,
      calibrations: page.calibrations.map((calibration) =>
        calibration.mode === "uniform"
          ? { ...calibration, start: { ...calibration.start }, end: { ...calibration.end } }
          : {
              ...calibration,
              xReference: {
                ...calibration.xReference,
                start: { ...calibration.xReference.start },
                end: { ...calibration.xReference.end },
              },
              yReference: {
                ...calibration.yReference,
                start: { ...calibration.yReference.start },
                end: { ...calibration.yReference.end },
              },
            },
      ),
      activeCalibrationId: page.activeCalibrationId,
      nextCalibrationNumber: page.nextCalibrationNumber,
      measurements: page.measurements.map((measurement) => ({
        id: measurement.id,
        type: measurement.type,
        name: measurement.name,
        calibrationId: measurement.calibrationId,
        points: measurement.points.map((point) => ({ ...point })),
        classificationValueIds: [...measurement.classificationValueIds],
        visible: measurement.visible,
      })),
      nextMeasurementNumber: { ...page.nextMeasurementNumber },
    };
  }
  return {
    schemaVersion: 7,
    pdf: { ...session.pdf },
    pageCount: session.pageCount,
    currentPage: session.currentPage,
    pages,
    settings: { ...session.settings },
    classificationCatalog: {
      dimensions: session.classificationCatalog.dimensions.map((dimension) => ({
        id: dimension.id,
        name: dimension.name,
        archived: dimension.archived,
        values: dimension.values.map((classificationValue) => ({ ...classificationValue })),
      })),
    },
  };
}
export function serializeSession(session: CurrentSession): string {
  assertValidSessionV7(session as unknown as Record<string, unknown>);
  return JSON.stringify(session);
}
export function deserializeSession(serialized: string): CurrentSession {
  const value: unknown = JSON.parse(serialized);
  if (!isObject(value)) throw new Error("The saved session uses an unsupported schema.");
  if (value.schemaVersion === 1) {
    assertValidLegacySession(value);
    return canonicalizeSessionV7(
      migrateSessionV6(
        migrateSessionV5(
          migrateSessionV4(migrateSessionV3(migrateSessionV1(value as unknown as SessionV1))),
        ),
      ),
    );
  }
  if (value.schemaVersion === 2) {
    assertValidSessionV3(value, isPageCalibrationV2);
    return canonicalizeSessionV7(
      migrateSessionV6(
        migrateSessionV5(
          migrateSessionV4(migrateSessionV3(migrateSessionV2(value as unknown as SessionV2))),
        ),
      ),
    );
  }
  if (value.schemaVersion === 3) {
    assertValidSessionV3(value, isPageCalibrationV3);
    return canonicalizeSessionV7(
      migrateSessionV6(
        migrateSessionV5(migrateSessionV4(migrateSessionV3(value as unknown as SessionV3))),
      ),
    );
  }
  if (value.schemaVersion === 4) {
    assertValidSessionV4(value);
    return canonicalizeSessionV7(
      migrateSessionV6(migrateSessionV5(migrateSessionV4(value as unknown as SessionV4))),
    );
  }
  if (value.schemaVersion === 5) {
    assertValidSessionV5(value);
    return canonicalizeSessionV7(
      migrateSessionV6(migrateSessionV5(value as unknown as SessionV5)),
    );
  }
  if (value.schemaVersion === 6) {
    assertValidSessionV6(value);
    return canonicalizeSessionV7(migrateSessionV6(value as unknown as SessionV6));
  }
  if (value.schemaVersion === 7) {
    assertValidSessionV7(value);
    return canonicalizeSessionV7(value as unknown as SessionV7);
  }
  throw new Error("The saved session uses an unsupported schema.");
}
