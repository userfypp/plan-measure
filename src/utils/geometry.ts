import type { Calibration, PageCalibration, Point, PolygonMeasurement } from "../types/domain";

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function calibrationPointTolerance(a: Point, b: Point): number {
  const magnitude = Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y));
  return 32 * Number.EPSILON * magnitude;
}

export function areEffectivelyIdentical(a: Point, b: Point): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tolerance = calibrationPointTolerance(a, b);
  return dx * dx + dy * dy <= tolerance * tolerance;
}

export function isValidCalibration(calibration: Calibration): boolean {
  return (
    Number.isFinite(calibration.referenceDistanceMm) &&
    calibration.referenceDistanceMm > 0 &&
    !areEffectivelyIdentical(calibration.start, calibration.end)
  );
}

function hasValidAxisComponent(start: Point, end: Point, axis: "x" | "y"): boolean {
  const component = Math.abs(end[axis] - start[axis]);
  return component > calibrationPointTolerance(start, end);
}

export function isPredominantlyHorizontal(start: Point, end: Point): boolean {
  return (
    hasValidAxisComponent(start, end, "x") && Math.abs(end.x - start.x) > Math.abs(end.y - start.y)
  );
}

export function isPredominantlyVertical(start: Point, end: Point): boolean {
  return (
    hasValidAxisComponent(start, end, "y") && Math.abs(end.y - start.y) > Math.abs(end.x - start.x)
  );
}

export function isValidXyCalibration(
  calibration: Extract<PageCalibration, { mode: "xy" }>,
): boolean {
  const { xReference, yReference } = calibration;
  return (
    isValidCalibration(xReference) &&
    isValidCalibration(yReference) &&
    hasValidAxisComponent(xReference.start, xReference.end, "x") &&
    hasValidAxisComponent(yReference.start, yReference.end, "y") &&
    isPredominantlyHorizontal(xReference.start, xReference.end) &&
    isPredominantlyVertical(yReference.start, yReference.end)
  );
}

export function isValidPageCalibration(calibration: PageCalibration): boolean {
  return calibration.mode === "uniform"
    ? isValidCalibration(calibration)
    : isValidXyCalibration(calibration);
}

export function millimetresPerPageUnit(calibration: Calibration): number {
  if (!isValidCalibration(calibration)) {
    throw new RangeError("Calibration must have distinct points and a finite positive distance.");
  }
  const pageDistance = distance(calibration.start, calibration.end);
  return calibration.referenceDistanceMm / pageDistance;
}

export function calibrationScaleX(calibration: Calibration | PageCalibration): number {
  if (!("mode" in calibration) || calibration.mode === "uniform") {
    return millimetresPerPageUnit(calibration);
  }
  if (!isValidXyCalibration(calibration)) {
    throw new RangeError("X/Y calibration must have valid horizontal and vertical references.");
  }
  return (
    calibration.xReference.referenceDistanceMm /
    Math.abs(calibration.xReference.end.x - calibration.xReference.start.x)
  );
}

export function calibrationScaleY(calibration: Calibration | PageCalibration): number {
  if (!("mode" in calibration) || calibration.mode === "uniform") {
    return millimetresPerPageUnit(calibration);
  }
  if (!isValidXyCalibration(calibration)) {
    throw new RangeError("X/Y calibration must have valid horizontal and vertical references.");
  }
  return (
    calibration.yReference.referenceDistanceMm /
    Math.abs(calibration.yReference.end.y - calibration.yReference.start.y)
  );
}

export function lineLengthMm(
  points: readonly Point[],
  calibration: Calibration | PageCalibration,
): number {
  if (points.length !== 2) throw new RangeError("A line measurement must have exactly two points.");
  const start = points[0]!;
  const end = points[1]!;
  const dxMm = (end.x - start.x) * calibrationScaleX(calibration);
  const dyMm = (end.y - start.y) * calibrationScaleY(calibration);
  return Math.hypot(dxMm, dyMm);
}

export function polygonPerimeterPageUnits(points: Point[]): number {
  if (points.length < 2) return 0;
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return next ? total + distance(point, next) : total;
  }, 0);
}

export function polygonAreaPageUnitsSquared(points: Point[]): number {
  if (points.length < 3) return 0;
  const doubledArea = points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return next ? total + point.x * next.y - next.x * point.y : total;
  }, 0);
  return Math.abs(doubledArea) / 2;
}

export function polygonResultsMm(
  measurement: Pick<PolygonMeasurement, "points">,
  calibration: Calibration | PageCalibration,
): { perimeterMm: number; areaMm2: number } {
  const scaleX = calibrationScaleX(calibration);
  const scaleY = calibrationScaleY(calibration);
  const points = measurement.points;
  const perimeterMm =
    points.length < 2
      ? 0
      : points.reduce((total, point, index) => {
          const next = points[(index + 1) % points.length];
          return next ? total + lineLengthMm([point, next], calibration) : total;
        }, 0);
  return {
    perimeterMm,
    areaMm2: polygonAreaPageUnitsSquared(points) * scaleX * scaleY,
  };
}
