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
  const hasValidPath = hasValidMeasurementPointSequence(type, points);
  if (!hasValidPath || type !== "polygon") return hasValidPath;
  return (
    !areEffectivelyIdentical(points[0]!, points.at(-1)!) && hasSimplePolygonRing(points)
  );
}

export function hasValidMeasurementPointSequence(
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

const UNIT_ROUNDOFF = Number.EPSILON / 2;
const ORIENTATION_ERROR_BOUND = (3 + 16 * UNIT_ROUNDOFF) * UNIT_ROUNDOFF;
const FLOAT64_SIGN_BIT = 1n << 63n;
const FLOAT64_EXPONENT_MASK = 0x7ffn;
const FLOAT64_FRACTION_MASK = (1n << 52n) - 1n;
const FLOAT64_HIDDEN_BIT = 1n << 52n;
const exactFloat64View = new DataView(new ArrayBuffer(8));

interface ExactDyadic {
  coefficient: bigint;
  exponent: number;
}

function exactDyadic(value: number): ExactDyadic {
  exactFloat64View.setFloat64(0, value, false);
  const bits = exactFloat64View.getBigUint64(0, false);
  const negative = (bits & FLOAT64_SIGN_BIT) !== 0n;
  const rawExponent = Number((bits >> 52n) & FLOAT64_EXPONENT_MASK);
  const fraction = bits & FLOAT64_FRACTION_MASK;
  if (rawExponent === 0 && fraction === 0n) return { coefficient: 0n, exponent: 0 };

  let coefficient = rawExponent === 0 ? fraction : FLOAT64_HIDDEN_BIT | fraction;
  const exponent = rawExponent === 0 ? -1074 : rawExponent - 1023 - 52;
  if (negative) coefficient = -coefficient;
  return { coefficient, exponent };
}

function addExactDyadics(a: ExactDyadic, b: ExactDyadic): ExactDyadic {
  if (a.coefficient === 0n) return b;
  if (b.coefficient === 0n) return a;
  const exponent = Math.min(a.exponent, b.exponent);
  return {
    coefficient:
      (a.coefficient << BigInt(a.exponent - exponent)) +
      (b.coefficient << BigInt(b.exponent - exponent)),
    exponent,
  };
}

function subtractExactDyadics(a: ExactDyadic, b: ExactDyadic): ExactDyadic {
  return addExactDyadics(a, { coefficient: -b.coefficient, exponent: b.exponent });
}

function multiplyExactDyadics(a: ExactDyadic, b: ExactDyadic): ExactDyadic {
  return {
    coefficient: a.coefficient * b.coefficient,
    exponent: a.exponent + b.exponent,
  };
}

function exactOrientationDeterminant(a: Point, b: Point, c: Point): ExactDyadic {
  const abX = subtractExactDyadics(exactDyadic(b.x), exactDyadic(a.x));
  const abY = subtractExactDyadics(exactDyadic(b.y), exactDyadic(a.y));
  const acX = subtractExactDyadics(exactDyadic(c.x), exactDyadic(a.x));
  const acY = subtractExactDyadics(exactDyadic(c.y), exactDyadic(a.y));
  return subtractExactDyadics(
    multiplyExactDyadics(abX, acY),
    multiplyExactDyadics(abY, acX),
  );
}

function robustOrientationDeterminant(a: Point, b: Point, c: Point): number | ExactDyadic {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const acX = c.x - a.x;
  const acY = c.y - a.y;
  const left = abX * acY;
  const right = abY * acX;
  const determinant = left - right;
  const determinantSum = Math.abs(left) + Math.abs(right);
  const allFinite =
    Number.isFinite(a.x) &&
    Number.isFinite(a.y) &&
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(c.x) &&
    Number.isFinite(c.y);

  if (
    Number.isFinite(determinant) &&
    Number.isFinite(determinantSum) &&
    Math.abs(determinant) > ORIENTATION_ERROR_BOUND * determinantSum
  ) {
    return determinant;
  }
  return allFinite ? exactOrientationDeterminant(a, b, c) : determinant;
}

function orientation(a: Point, b: Point, c: Point): number {
  const determinant = robustOrientationDeterminant(a, b, c);
  if (typeof determinant === "number") return Math.sign(determinant);
  return determinant.coefficient === 0n ? 0 : determinant.coefficient > 0n ? 1 : -1;
}

function roundBigIntRightToEven(value: bigint, shift: number): bigint {
  if (shift <= 0) return value << BigInt(-shift);
  const bigintShift = BigInt(shift);
  const quotient = value >> bigintShift;
  const remainder = value - (quotient << bigintShift);
  const halfway = 1n << (bigintShift - 1n);
  return remainder > halfway || (remainder === halfway && (quotient & 1n) === 1n)
    ? quotient + 1n
    : quotient;
}

function exactDyadicToNumber(value: ExactDyadic): number {
  if (value.coefficient === 0n) return 0;
  const negative = value.coefficient < 0n;
  const coefficient = negative ? -value.coefficient : value.coefficient;
  const bitLength = coefficient.toString(2).length;
  const highestExponent = value.exponent + bitLength - 1;
  let magnitude: number;

  if (highestExponent < -1022) {
    const subnormalShift = value.exponent + 1074;
    const units =
      subnormalShift >= 0
        ? coefficient << BigInt(subnormalShift)
        : roundBigIntRightToEven(coefficient, -subnormalShift);
    magnitude = Number(units) * 2 ** -1074;
  } else {
    const shift = Math.max(0, bitLength - 53);
    let significand = roundBigIntRightToEven(coefficient, shift);
    let exponent = value.exponent + shift;
    if (significand >= 1n << 53n) {
      significand >>= 1n;
      exponent += 1;
    }
    magnitude = Number(significand) * 2 ** exponent;
  }
  return negative ? -magnitude : magnitude;
}

function exactPolygonDoubledArea(points: Point[]): number {
  const origin = points[0]!;
  let exactDoubledArea: ExactDyadic = { coefficient: 0n, exponent: 0 };
  for (let index = 1; index < points.length - 1; index += 1) {
    exactDoubledArea = addExactDyadics(
      exactDoubledArea,
      exactOrientationDeterminant(origin, points[index]!, points[index + 1]!),
    );
  }
  return exactDyadicToNumber(exactDoubledArea);
}

function isPointOnSegment(point: Point, start: Point, end: Point): boolean {
  return (
    orientation(start, end, point) === 0 &&
    point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y)
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  if (
    ((abc > 0 && abd < 0) || (abc < 0 && abd > 0)) &&
    ((cda > 0 && cdb < 0) || (cda < 0 && cdb > 0))
  ) {
    return true;
  }
  return (
    (abc === 0 && isPointOnSegment(c, a, b)) ||
    (abd === 0 && isPointOnSegment(d, a, b)) ||
    (cda === 0 && isPointOnSegment(a, c, d)) ||
    (cdb === 0 && isPointOnSegment(b, c, d))
  );
}

function adjacentEdgesOverlap(start: Point, shared: Point, end: Point): boolean {
  return (
    orientation(start, shared, end) === 0 &&
    (isPointOnSegment(start, shared, end) || isPointOnSegment(end, start, shared))
  );
}

function hasSimplePolygonRing(points: readonly Point[]): boolean {
  for (let firstEdge = 0; firstEdge < points.length; firstEdge += 1) {
    const firstStart = points[firstEdge]!;
    const firstEnd = points[(firstEdge + 1) % points.length]!;
    for (let secondEdge = firstEdge + 1; secondEdge < points.length; secondEdge += 1) {
      const secondStart = points[secondEdge]!;
      const secondEnd = points[(secondEdge + 1) % points.length]!;
      const consecutive = secondEdge === firstEdge + 1;
      const firstAndLast = firstEdge === 0 && secondEdge === points.length - 1;
      if (consecutive) {
        if (adjacentEdgesOverlap(firstStart, firstEnd, secondEnd)) return false;
      } else if (firstAndLast) {
        if (adjacentEdgesOverlap(firstEnd, firstStart, secondStart)) return false;
      } else if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        return false;
      }
    }
  }
  return true;
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

function areCalibrationPointsEffectivelyIdentical(a: Point, b: Point): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tolerance = calibrationPointTolerance(a, b);
  const squaredDistance = dx * dx + dy * dy;
  const squaredTolerance = tolerance * tolerance;
  return Number.isFinite(squaredDistance) && Number.isFinite(squaredTolerance)
    ? squaredDistance <= squaredTolerance
    : Math.hypot(dx, dy) <= tolerance;
}

function uniformCalibrationScale(calibration: Calibration): number {
  const dx = calibration.end.x - calibration.start.x;
  const dy = calibration.end.y - calibration.start.y;
  const pageDistance = Math.hypot(dx, dy);
  if (Number.isFinite(pageDistance)) {
    return calibration.referenceDistanceMm / pageDistance;
  }
  if (
    !Number.isFinite(calibration.start.x) ||
    !Number.isFinite(calibration.start.y) ||
    !Number.isFinite(calibration.end.x) ||
    !Number.isFinite(calibration.end.y)
  ) {
    return Number.NaN;
  }
  const halfDx = Number.isFinite(dx) ? dx / 2 : calibration.end.x / 2 - calibration.start.x / 2;
  const halfDy = Number.isFinite(dy) ? dy / 2 : calibration.end.y / 2 - calibration.start.y / 2;
  return calibration.referenceDistanceMm / Math.hypot(halfDx, halfDy) / 2;
}

function axisCalibrationScale(calibration: Calibration, axis: "x" | "y"): number {
  const start = calibration.start[axis];
  const end = calibration.end[axis];
  const span = Math.abs(end - start);
  if (Number.isFinite(span)) return calibration.referenceDistanceMm / span;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.NaN;
  return calibration.referenceDistanceMm / Math.abs(end / 2 - start / 2) / 2;
}

function hasValidCalibrationInputs(calibration: Calibration): boolean {
  return (
    Number.isFinite(calibration.referenceDistanceMm) &&
    calibration.referenceDistanceMm > 0 &&
    !areCalibrationPointsEffectivelyIdentical(calibration.start, calibration.end)
  );
}

export function isValidCalibration(calibration: Calibration): boolean {
  if (!hasValidCalibrationInputs(calibration)) return false;
  const scale = uniformCalibrationScale(calibration);
  return Number.isFinite(scale) && scale > 0;
}

function hasValidAxisComponent(start: Point, end: Point, axis: "x" | "y"): boolean {
  const component = Math.abs(end[axis] - start[axis]);
  return component > calibrationPointTolerance(start, end);
}

export function isPredominantlyHorizontal(start: Point, end: Point): boolean {
  if (!hasValidAxisComponent(start, end, "x")) return false;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return Number.isFinite(dx) && Number.isFinite(dy)
    ? dx > dy
    : Math.abs(end.x / 2 - start.x / 2) > Math.abs(end.y / 2 - start.y / 2);
}

export function isPredominantlyVertical(start: Point, end: Point): boolean {
  if (!hasValidAxisComponent(start, end, "y")) return false;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return Number.isFinite(dx) && Number.isFinite(dy)
    ? dy > dx
    : Math.abs(end.y / 2 - start.y / 2) > Math.abs(end.x / 2 - start.x / 2);
}

export function isValidXyCalibration(
  calibration: Extract<PageCalibration, { mode: "xy" }>,
): boolean {
  const { xReference, yReference } = calibration;
  const scaleX = axisCalibrationScale(xReference, "x");
  const scaleY = axisCalibrationScale(yReference, "y");
  return (
    hasValidCalibrationInputs(xReference) &&
    hasValidCalibrationInputs(yReference) &&
    hasValidAxisComponent(xReference.start, xReference.end, "x") &&
    hasValidAxisComponent(yReference.start, yReference.end, "y") &&
    isPredominantlyHorizontal(xReference.start, xReference.end) &&
    isPredominantlyVertical(yReference.start, yReference.end) &&
    Number.isFinite(scaleX) &&
    scaleX > 0 &&
    Number.isFinite(scaleY) &&
    scaleY > 0
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
  return uniformCalibrationScale(calibration);
}

export function calibrationScaleX(calibration: Calibration | PageCalibration): number {
  if (!("mode" in calibration) || calibration.mode === "uniform") {
    return millimetresPerPageUnit(calibration);
  }
  if (!isValidXyCalibration(calibration)) {
    throw new RangeError("X/Y calibration must have valid horizontal and vertical references.");
  }
  return axisCalibrationScale(calibration.xReference, "x");
}

export function calibrationScaleY(calibration: Calibration | PageCalibration): number {
  if (!("mode" in calibration) || calibration.mode === "uniform") {
    return millimetresPerPageUnit(calibration);
  }
  if (!isValidXyCalibration(calibration)) {
    throw new RangeError("X/Y calibration must have valid horizontal and vertical references.");
  }
  return axisCalibrationScale(calibration.yReference, "y");
}

function scaledAxisDelta(start: number, end: number, scale: number): number {
  const scaledDelta = (end - start) * scale;
  if (Number.isFinite(scaledDelta)) return scaledDelta;
  const fallback = end * scale - start * scale;
  if (Number.isFinite(fallback)) return fallback;
  throw new RangeError("Measurement result must be finite.");
}

export function lineLengthMm(
  points: readonly Point[],
  calibration: Calibration | PageCalibration,
): number {
  if (points.length !== 2) throw new RangeError("A line measurement must have exactly two points.");
  const start = points[0]!;
  const end = points[1]!;
  const dxMm = scaledAxisDelta(start.x, end.x, calibrationScaleX(calibration));
  const dyMm = scaledAxisDelta(start.y, end.y, calibrationScaleY(calibration));
  const lengthMm = Math.hypot(dxMm, dyMm);
  if (!Number.isFinite(lengthMm)) throw new RangeError("Measurement result must be finite.");
  return lengthMm;
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
  }).reduce((total, length) => {
    const nextTotal = total + length;
    if (!Number.isFinite(nextTotal)) throw new RangeError("Measurement result must be finite.");
    return nextTotal;
  }, 0);
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
  const origin = points[0]!;
  let doubledArea = 0;
  let absoluteDeterminantSum = 0;
  let determinantErrorBoundSum = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const next = points[index + 1]!;
    const determinant = robustOrientationDeterminant(origin, point, next);
    if (typeof determinant !== "number") {
      return Math.abs(exactPolygonDoubledArea(points)) / 2;
    }
    doubledArea += determinant;
    absoluteDeterminantSum += Math.abs(determinant);
    const left = (point.x - origin.x) * (next.y - origin.y);
    const right = (point.y - origin.y) * (next.x - origin.x);
    determinantErrorBoundSum += ORIENTATION_ERROR_BOUND * (Math.abs(left) + Math.abs(right));
  }

  const additionCount = Math.max(0, points.length - 3);
  const accumulatedRoundoff = additionCount * UNIT_ROUNDOFF;
  const accumulationErrorBound =
    accumulatedRoundoff < 1
      ? (accumulatedRoundoff / (1 - accumulatedRoundoff)) * absoluteDeterminantSum
      : Number.POSITIVE_INFINITY;
  if (Math.abs(doubledArea) <= determinantErrorBoundSum + accumulationErrorBound) {
    return Math.abs(exactPolygonDoubledArea(points)) / 2;
  }
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
  const pageArea = polygonAreaPageUnitsSquared(points);
  let areaMm2 = pageArea * scaleX * scaleY;
  if (!Number.isFinite(areaMm2)) areaMm2 = pageArea * scaleY * scaleX;
  if (!Number.isFinite(areaMm2)) {
    const origin = points[0];
    if (origin) {
      const doubledAreaMm2 = points.reduce((total, point, index) => {
        const next = points[(index + 1) % points.length];
        if (!next) return total;
        const pointX = scaledAxisDelta(origin.x, point.x, scaleX);
        const pointY = scaledAxisDelta(origin.y, point.y, scaleY);
        const nextX = scaledAxisDelta(origin.x, next.x, scaleX);
        const nextY = scaledAxisDelta(origin.y, next.y, scaleY);
        const nextTotal = total + pointX * nextY - nextX * pointY;
        if (!Number.isFinite(nextTotal)) {
          throw new RangeError("Measurement result must be finite.");
        }
        return nextTotal;
      }, 0);
      areaMm2 = Math.abs(doubledAreaMm2) / 2;
    }
  }
  if (!Number.isFinite(areaMm2)) throw new RangeError("Measurement result must be finite.");
  return {
    perimeterMm,
    areaMm2,
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
