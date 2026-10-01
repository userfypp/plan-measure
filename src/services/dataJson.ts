import type { Calibration, CurrentSession, PageCalibration, Point } from "../types/domain";
import {
  calibrationScaleX,
  calibrationScaleY,
  hasValidMeasurementPoints,
  isMeasurementType,
  isValidPageCalibration,
  measurementResultsMm,
} from "../utils/geometry";
import { effectivePageLabel } from "../utils/pageLabels";
import { downloadExportFile, exportFileName } from "./exportDownload";

function finiteNumber(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("JSON export requires finite numbers.");
  return value;
}

function pointData(point: Point): Point {
  return { x: finiteNumber(point.x), y: finiteNumber(point.y) };
}

function referenceData(reference: Calibration): Calibration {
  return {
    start: pointData(reference.start),
    end: pointData(reference.end),
    referenceDistanceMm: finiteNumber(reference.referenceDistanceMm),
  };
}

function calibrationData(calibration: PageCalibration) {
  if (!isValidPageCalibration(calibration)) {
    throw new RangeError(`Calibration ${calibration.id} is invalid for JSON export.`);
  }
  const common = {
    id: calibration.id,
    name: calibration.name,
    mmPerPageUnitX: finiteNumber(calibrationScaleX(calibration)),
    mmPerPageUnitY: finiteNumber(calibrationScaleY(calibration)),
  };
  return calibration.mode === "uniform"
    ? { ...common, mode: "uniform" as const, ...referenceData(calibration) }
    : {
        ...common,
        mode: "xy" as const,
        xReference: referenceData(calibration.xReference),
        yReference: referenceData(calibration.yReference),
      };
}

function addUniqueId(ids: Set<string>, id: string, kind: string): void {
  if (!id || ids.has(id)) throw new Error(`JSON export has an invalid or duplicate ${kind} ID.`);
  ids.add(id);
}

/** Public data contract, versioned independently of recoverable project/session files. */
export function buildDataJson(
  session: CurrentSession,
  pageLabels: readonly string[] | null = null,
): string {
  if (!Number.isSafeInteger(session.pageCount) || session.pageCount < 1) {
    throw new RangeError("JSON export requires a positive integer page count.");
  }
  for (const [key, page] of Object.entries(session.pages)) {
    const pageNumber = Number(key);
    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > session.pageCount ||
      String(pageNumber) !== key ||
      page.pageNumber !== pageNumber
    ) {
      throw new Error("JSON export has invalid page numbering.");
    }
  }

  const catalogIds = new Set<string>();
  const valueDimensions = new Map<string, string>();
  const classificationCatalog = {
    dimensions: session.classificationCatalog.dimensions.map((dimension) => {
      addUniqueId(catalogIds, dimension.id, "classification");
      return {
        id: dimension.id,
        name: dimension.name,
        archived: dimension.archived,
        values: dimension.values.map((value) => {
          addUniqueId(catalogIds, value.id, "classification");
          valueDimensions.set(value.id, dimension.id);
          return { id: value.id, name: value.name, archived: value.archived };
        }),
      };
    }),
  };

  const measurementIds = new Set<string>();
  const pages = Array.from({ length: session.pageCount }, (_, index) => {
    const pageNumber = index + 1;
    const page = session.pages[pageNumber];
    const calibrationIds = new Set<string>();
    const calibrations = (page?.calibrations ?? []).map((calibration) => {
      addUniqueId(calibrationIds, calibration.id, "calibration");
      return calibrationData(calibration);
    });
    const measurements = (page?.measurements ?? []).map((measurement) => {
      addUniqueId(measurementIds, measurement.id, "measurement");
      if (
        !isMeasurementType(measurement.type) ||
        !hasValidMeasurementPoints(measurement.type, measurement.points)
      ) {
        throw new Error(`Measurement ${measurement.id} has invalid geometry for JSON export.`);
      }
      const calibration = page!.calibrations.find(
        (candidate) => candidate.id === measurement.calibrationId,
      );
      if (!calibration) {
        throw new Error(`Measurement ${measurement.id} has a missing calibration.`);
      }
      const assignedDimensions = new Set<string>();
      for (const valueId of measurement.classificationValueIds) {
        const dimensionId = valueDimensions.get(valueId);
        if (!dimensionId) {
          throw new Error(`Measurement ${measurement.id} has a missing classification value.`);
        }
        if (assignedDimensions.has(dimensionId)) {
          throw new Error(
            `Measurement ${measurement.id} has duplicate classification assignments.`,
          );
        }
        assignedDimensions.add(dimensionId);
      }
      const results = measurementResultsMm(measurement, calibration);
      for (const result of Object.values(results)) {
        if (result !== null) finiteNumber(result);
      }
      return {
        id: measurement.id,
        name: measurement.name,
        note: measurement.note ?? null,
        type: measurement.type,
        visible: measurement.visible,
        calibrationId: measurement.calibrationId,
        points: measurement.points.map(pointData),
        classificationValueIds: [...measurement.classificationValueIds],
        ...results,
      };
    });
    return {
      pageNumber,
      pageLabel: effectivePageLabel(pageNumber, session.pageLabelOverrides, pageLabels),
      calibrations,
      measurements,
    };
  });

  return JSON.stringify(
    {
      schemaVersion: 1,
      pdf: {
        name: session.pdf.name,
        size: finiteNumber(session.pdf.size),
        lastModified: finiteNumber(session.pdf.lastModified),
      },
      pageCount: session.pageCount,
      coordinateSystem: {
        space: "pdf-page",
        rotation: "intrinsic",
        logicalScale: 1,
        units: "page-unit",
        xAxis: "right",
        yAxis: "down",
      },
      pages,
      classificationCatalog,
    },
    null,
    2,
  );
}

export function downloadDataJson(
  session: CurrentSession,
  pageLabels: readonly string[] | null = null,
): void {
  downloadExportFile(
    buildDataJson(session, pageLabels),
    exportFileName(session.pdf.name, "data", "json"),
    "application/json;charset=utf-8",
  );
}
