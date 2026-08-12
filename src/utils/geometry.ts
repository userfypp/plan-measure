import type { Calibration, Point, PolygonMeasurement } from "../types/domain";

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

export function millimetresPerPageUnit(calibration: Calibration): number {
  if (!isValidCalibration(calibration)) {
    throw new RangeError("Calibration must have distinct points and a finite positive distance.");
  }
  const pageDistance = distance(calibration.start, calibration.end);
  return calibration.referenceDistanceMm / pageDistance;
}

export function lineLengthMm(points: [Point, Point], calibration: Calibration): number {
  return distance(points[0], points[1]) * millimetresPerPageUnit(calibration);
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
  calibration: Calibration,
): { perimeterMm: number; areaMm2: number } {
  const scale = millimetresPerPageUnit(calibration);
  return {
    perimeterMm: polygonPerimeterPageUnits(measurement.points) * scale,
    areaMm2: polygonAreaPageUnitsSquared(measurement.points) * scale * scale,
  };
}
