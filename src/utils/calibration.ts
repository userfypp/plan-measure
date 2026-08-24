import type {
  Calibration,
  CalibrationReferenceKey,
  Measurement,
  PageCalibration,
  PageState,
  Point,
} from "../types/domain";

export function findPageCalibration(
  page: Pick<PageState, "calibrations">,
  calibrationId: string | null,
): PageCalibration | null {
  if (!calibrationId) return null;
  return page.calibrations.find((calibration) => calibration.id === calibrationId) ?? null;
}

export function getActiveCalibration(page: PageState): PageCalibration | null {
  return findPageCalibration(page, page.activeCalibrationId);
}

export function getMeasurementCalibration(
  page: Pick<PageState, "calibrations">,
  measurement: Pick<Measurement, "calibrationId">,
): PageCalibration | null {
  return findPageCalibration(page, measurement.calibrationId);
}

export function getCalibrationReference(
  calibration: PageCalibration,
  reference: CalibrationReferenceKey,
): Calibration | null {
  if (calibration.mode === "uniform") {
    return reference === "uniform" ? calibration : null;
  }
  if (reference === "x") return calibration.xReference;
  if (reference === "y") return calibration.yReference;
  return null;
}

export function replaceCalibrationReferencePoints(
  calibration: PageCalibration,
  reference: CalibrationReferenceKey,
  points: readonly [Point, Point],
): PageCalibration | null {
  const [start, end] = points;
  const nextPoints = { start: { ...start }, end: { ...end } };
  if (calibration.mode === "uniform") {
    return reference === "uniform" ? { ...calibration, ...nextPoints } : null;
  }
  if (reference === "x") {
    return {
      ...calibration,
      xReference: { ...calibration.xReference, ...nextPoints },
    };
  }
  if (reference === "y") {
    return {
      ...calibration,
      yReference: { ...calibration.yReference, ...nextPoints },
    };
  }
  return null;
}
