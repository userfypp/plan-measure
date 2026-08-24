import type {
  Calibration,
  Measurement,
  MeasurementType,
  PageCalibration,
  Point,
  PolygonMeasurement,
} from "../types/domain";

export interface MeasurementPathSpec {
  label: string;
  minVertices: number;
  maxVertices: number | null;
  closed: boolean;
}

export const measurementPathSpecs: Record<MeasurementType, MeasurementPathSpec> = {
  line: { label: "Line", minVertices: 2, maxVertices: 2, closed: false },
  polyline: { label: "Polyline", minVertices: 2, maxVertices: null, closed: false },
  polygon: { label: "Polygon", minVertices: 3, maxVertices: null, closed: true },
};

export function isMeasurementType(value: string): value is MeasurementType {
  return value === "line" || value === "polyline" || value === "polygon";
}

export function hasValidMeasurementPoints(
  type: MeasurementType,
  points: readonly Point[],
): boolean {
  const spec = measurementPathSpecs[type];
  return (
    points.length >= spec.minVertices &&
    (spec.maxVertices === null || points.length <= spec.maxVertices) &&
    points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) &&
    points.every(
      (point, index) => index === 0 || !areEffectivelyIdentical(points[index - 1]!, point),
    )
  );
}

export function constrainOrthogonal(anchor: Point, candidate: Point): Point {
  const dx = candidate.x - anchor.x;
  const dy = candidate.y - anchor.y;
  return Math.abs(dx) >= Math.abs(dy)
    ? { x: candidate.x, y: anchor.y }
    : { x: anchor.x, y: candidate.y };
}

export function isOrthogonalSegment(start: Point, end: Point): boolean {
  const tolerance = calibrationPointTolerance(start, end);
  return Math.abs(end.x - start.x) <= tolerance || Math.abs(end.y - start.y) <= tolerance;
}

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

export function pathLengthMm(
  points: readonly Point[],
  calibration: Calibration | PageCalibration,
  closed: boolean,
): number {
  if (points.length < 2) return 0;
  const segmentCount = closed ? points.length : points.length - 1;
  return Array.from({ length: segmentCount }, (_, index) => {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    return lineLengthMm([start, end], calibration);
  }).reduce((total, length) => total + length, 0);
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
  const perimeterMm = pathLengthMm(points, calibration, true);
  return {
    perimeterMm,
    areaMm2: polygonAreaPageUnitsSquared(points) * scaleX * scaleY,
  };
}

export function measurementResultsMm(
  measurement: Pick<Measurement, "type" | "points">,
  calibration: Calibration | PageCalibration,
): { lengthMm: number | null; perimeterMm: number | null; areaMm2: number | null } {
  const spec = measurementPathSpecs[measurement.type];
  if (!spec.closed) {
    return {
      lengthMm: pathLengthMm(measurement.points, calibration, false),
      perimeterMm: null,
      areaMm2: null,
    };
  }
  const polygon = polygonResultsMm(measurement, calibration);
  return { lengthMm: null, perimeterMm: polygon.perimeterMm, areaMm2: polygon.areaMm2 };
}
