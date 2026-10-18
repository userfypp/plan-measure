import type { Calibration, MeasurementType, PageCalibration, Point } from "../types/domain";
import { areEffectivelyIdentical, calibrationScaleX, calibrationScaleY } from "./geometry";

export interface PageBoundsLike {
  width: number;
  height: number;
}


export interface EllipseParams {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Builds the four-corner ring of an axis-aligned box from two opposite corners.
 * With `square`, the side is the larger axis delta (keeping each axis sign) and is
 * clipped so the box stays inside `bounds`. Returns null for a degenerate box.
 */
export function boxFromCorners(
  a: Point,
  b: Point,
  square = false,
  bounds?: PageBoundsLike,
): Point[] | null {
  let target = b;
  if (square) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let side = Math.max(Math.abs(dx), Math.abs(dy));
    const signX = dx < 0 ? -1 : 1;
    const signY = dy < 0 ? -1 : 1;
    if (bounds) {
      const roomX = signX > 0 ? bounds.width - a.x : a.x;
      const roomY = signY > 0 ? bounds.height - a.y : a.y;
      side = Math.max(0, Math.min(side, roomX, roomY));
    }
    target = { x: a.x + signX * side, y: a.y + signY * side };
  }
  if (
    areEffectivelyIdentical({ x: a.x, y: 0 }, { x: target.x, y: 0 }) ||
    areEffectivelyIdentical({ x: 0, y: a.y }, { x: 0, y: target.y })
  ) {
    return null;
  }
  return [{ ...a }, { x: target.x, y: a.y }, { ...target }, { x: a.x, y: target.y }];
}

export function isAxisAlignedBoxRing(points: readonly Point[]): boolean {
  if (points.length !== 4) return false;
  if (!points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    return false;
  }
  for (let index = 0; index < 4; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % 4]!;
    const horizontal = index % 2 === 0;
    if (horizontal ? start.y !== end.y : start.x !== end.x) return false;
    if (areEffectivelyIdentical(start, end)) return false;
  }
  return true;
}

/** Moves one corner of a box ring, dragging its two neighbours so the box stays axis-aligned. */
export function moveBoxVertex(points: readonly Point[], index: number, target: Point): Point[] {
  if (points.length !== 4 || index < 0 || index > 3) return points.map((point) => ({ ...point }));
  const moved = points[index]!;
  const next = points.map((point) => ({ ...point }));
  next[index] = { ...target };
  for (const neighbourIndex of [(index + 1) % 4, (index + 3) % 4]) {
    const neighbour = points[neighbourIndex]!;
    next[neighbourIndex] = {
      x: neighbour.x === moved.x ? target.x : neighbour.x,
      y: neighbour.y === moved.y ? target.y : neighbour.y,
    };
  }
  return next;
}

/**
 * Box shapes (rectangle, ellipse) expose their sides as edit targets after their four corners:
 * target `BOX_SIDE_TARGET_OFFSET + side` is the side from corner `side` to corner `side + 1`.
 */
export const BOX_SIDE_TARGET_OFFSET = 4;

function isBoxType(type: MeasurementType): boolean {
  return type === "rectangle" || type === "ellipse";
}

/** Moves one side of a box ring across its length; the opposite side stays where it is. */
export function moveBoxSide(points: readonly Point[], side: number, target: Point): Point[] {
  const next = points.map((point) => ({ ...point }));
  if (points.length !== 4 || side < 0 || side > 3) return next;
  const start = points[side]!;
  const end = points[(side + 1) % 4]!;
  const horizontal = start.y === end.y;
  for (const index of [side, (side + 1) % 4]) {
    if (horizontal) next[index]!.y = target.y;
    else next[index]!.x = target.x;
  }
  return next;
}

/** Number of edit targets (vertices, plus the four sides of a box) a measurement offers. */
export function measurementEditTargetCount(
  type: MeasurementType,
  points: readonly Point[],
): number {
  return isBoxType(type) && points.length === 4 ? 8 : points.length;
}

/** Where the handle of an edit target sits: its vertex, or the middle of a box side. */
export function measurementEditTargetPoint(
  type: MeasurementType,
  points: readonly Point[],
  index: number,
): Point | undefined {
  if (index < BOX_SIDE_TARGET_OFFSET || !isBoxType(type) || points.length !== 4) {
    return points[index];
  }
  const side = index - BOX_SIDE_TARGET_OFFSET;
  if (side > 3) return undefined;
  const start = points[side]!;
  const end = points[(side + 1) % 4]!;
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

export function applyMeasurementVertexEdit(
  type: MeasurementType,
  points: readonly Point[],
  index: number,
  point: Point,
): Point[] {
  if (isBoxType(type)) {
    return index >= BOX_SIDE_TARGET_OFFSET
      ? moveBoxSide(points, index - BOX_SIDE_TARGET_OFFSET, point)
      : moveBoxVertex(points, index, point);
  }
  return points.map((existing, existingIndex) =>
    existingIndex === index ? { ...point } : existing,
  );
}

const SMALLEST_NORMAL_NUMBER = 2 ** -1022;

const ellipseParamsCache = new WeakMap<readonly Point[], EllipseParams>();

export function ellipseParams(points: readonly Point[]): EllipseParams {
  const cached = ellipseParamsCache.get(points);
  if (cached) return cached;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const params = {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: (maxX - minX) / 2,
    ry: (maxY - minY) / 2,
  };
  ellipseParamsCache.set(points, params);
  return params;
}

/** Multiplies in an order that keeps the running product near 1, so no intermediate underflows or overflows. */
function productKeepingRange(factors: readonly number[]): number {
  const sorted = [...factors].sort((left, right) => Math.abs(left) - Math.abs(right));
  let low = 0;
  let high = sorted.length - 1;
  let product = 1;
  while (low <= high) product *= Math.abs(product) >= 1 ? sorted[low++]! : sorted[high--]!;
  return product;
}

export function ellipseResultsMm(
  points: readonly Point[],
  calibration: Calibration | PageCalibration,
): { perimeterMm: number; areaMm2: number } {
  const { rx, ry } = ellipseParams(points);
  const a = rx * calibrationScaleX(calibration);
  const b = ry * calibrationScaleY(calibration);
  let areaMm2 = Math.PI * a * b;
  if (!(areaMm2 >= SMALLEST_NORMAL_NUMBER)) {
    // A radius times its scale can underflow although the area itself is representable.
    areaMm2 = productKeepingRange([
      Math.PI,
      rx,
      ry,
      calibrationScaleX(calibration),
      calibrationScaleY(calibration),
    ]);
  }
  const sum = a + b;
  const h = sum === 0 ? 0 : ((a - b) / sum) ** 2;
  const perimeterMm = Math.PI * sum * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  if (!Number.isFinite(areaMm2) || !Number.isFinite(perimeterMm)) {
    throw new RangeError("Measurement result must be finite.");
  }
  return { perimeterMm, areaMm2 };
}

/** Valid-shaped stand-in geometry used to mark a persisted measurement whose geometry was invalid. */
export function placeholderPointsFor(type: MeasurementType): Point[] {
  if (type === "count" || type === "line" || type === "polyline") {
    return [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
  }
  if (type === "polygon" || type === "cloud") {
    return [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
  }
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}
