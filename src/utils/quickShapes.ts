import type { Calibration, MeasurementType, PageCalibration, Point } from "../types/domain";
import { areEffectivelyIdentical, calibrationScaleX, calibrationScaleY } from "./geometry";

export interface PageBoundsLike {
  width: number;
  height: number;
}

export interface CloudArc {
  center: Point;
  radius: number;
  start: Point;
  end: Point;
  /** Signed sweep in radians (sign of the angular direction from start to end). */
  sweep: number;
}

export interface EllipseParams {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface OutlineContext {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ): void;
  closePath(): void;
}

export const CLOUD_CHORD_MIN = 4;
export const CLOUD_CHORD_MAX = 24;
export const CLOUD_ARC_ANGLE = (150 * Math.PI) / 180;
const CLOUD_CHORD_DIVISOR = 30;
const ELLIPSE_SEGMENTS_MIN = 32;
const ELLIPSE_SEGMENTS_MAX = 2048;
const CLOUD_ARC_SEGMENTS_MIN = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export function applyMeasurementVertexEdit(
  type: MeasurementType,
  points: readonly Point[],
  index: number,
  point: Point,
): Point[] {
  if (type === "rectangle" || type === "ellipse") return moveBoxVertex(points, index, point);
  return points.map((existing, existingIndex) =>
    existingIndex === index ? { ...point } : existing,
  );
}

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

export function ellipseResultsMm(
  points: readonly Point[],
  calibration: Calibration | PageCalibration,
): { perimeterMm: number; areaMm2: number } {
  const { rx, ry } = ellipseParams(points);
  const a = rx * calibrationScaleX(calibration);
  const b = ry * calibrationScaleY(calibration);
  const areaMm2 = Math.PI * a * b;
  const sum = a + b;
  const h = sum === 0 ? 0 : ((a - b) / sum) ** 2;
  const perimeterMm = Math.PI * sum * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  if (!Number.isFinite(areaMm2) || !Number.isFinite(perimeterMm)) {
    throw new RangeError("Measurement result must be finite.");
  }
  return { perimeterMm, areaMm2 };
}

const cloudArcsCache = new WeakMap<readonly Point[], CloudArc[]>();

/** Deterministic scalloped arcs along every edge of the control polygon, bulging outwards. */
export function cloudArcs(points: readonly Point[]): CloudArc[] {
  const cached = cloudArcsCache.get(points);
  if (cached) return cached;
  const count = points.length;
  let signedArea = 0;
  let perimeter = 0;
  for (let index = 0; index < count; index += 1) {
    const p = points[index]!;
    const q = points[(index + 1) % count]!;
    signedArea += p.x * q.y - q.x * p.y;
    perimeter += Math.hypot(q.x - p.x, q.y - p.y);
  }
  const orientation = signedArea < 0 ? -1 : 1;
  const targetChord = clamp(perimeter / CLOUD_CHORD_DIVISOR, CLOUD_CHORD_MIN, CLOUD_CHORD_MAX);
  const halfAngle = CLOUD_ARC_ANGLE / 2;
  const arcs: CloudArc[] = [];
  for (let index = 0; index < count; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % count]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) continue;
    const chordCount = Math.max(1, Math.round(length / targetChord));
    const chord = length / chordCount;
    const nx = (orientation * dy) / length;
    const ny = (-orientation * dx) / length;
    const radius = chord / (2 * Math.sin(halfAngle));
    const offset = radius * Math.cos(halfAngle);
    for (let step = 0; step < chordCount; step += 1) {
      const start = { x: a.x + (dx * step) / chordCount, y: a.y + (dy * step) / chordCount };
      const end = {
        x: a.x + (dx * (step + 1)) / chordCount,
        y: a.y + (dy * (step + 1)) / chordCount,
      };
      const center = {
        x: (start.x + end.x) / 2 - nx * offset,
        y: (start.y + end.y) / 2 - ny * offset,
      };
      const ux = start.x - center.x;
      const uy = start.y - center.y;
      const vx = end.x - center.x;
      const vy = end.y - center.y;
      const sweep = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      arcs.push({ center, radius, start, end, sweep });
    }
  }
  cloudArcsCache.set(points, arcs);
  return arcs;
}

/** Flattened closed outline (without repeating the first point) used for hit tests, labels and export. */
export function measurementOutlinePoints(
  type: MeasurementType,
  points: readonly Point[],
  tolerance = 0.25,
): Point[] {
  if (type === "ellipse") {
    const { cx, cy, rx, ry } = ellipseParams(points);
    const radius = Math.max(rx, ry);
    const step = radius > tolerance ? Math.acos(1 - tolerance / radius) : Math.PI / 2;
    const segments = clamp(Math.ceil((2 * Math.PI) / step), ELLIPSE_SEGMENTS_MIN, ELLIPSE_SEGMENTS_MAX);
    return Array.from({ length: segments }, (_, index) => {
      const angle = (2 * Math.PI * index) / segments;
      return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    });
  }
  if (type === "cloud") {
    const outline: Point[] = [];
    for (const arc of cloudArcs(points)) {
      const step = arc.radius > tolerance ? Math.acos(1 - tolerance / arc.radius) : Math.PI / 2;
      const segments = Math.max(CLOUD_ARC_SEGMENTS_MIN, Math.ceil(Math.abs(arc.sweep) / step));
      const ux = arc.start.x - arc.center.x;
      const uy = arc.start.y - arc.center.y;
      for (let index = 0; index < segments; index += 1) {
        const angle = (arc.sweep * index) / segments;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        outline.push({
          x: arc.center.x + ux * cos - uy * sin,
          y: arc.center.y + ux * sin + uy * cos,
        });
      }
    }
    return outline;
  }
  return points as Point[];
}

/** Traces the measurement outline on a canvas-like context (without filling or stroking). */
export function traceMeasurementOutline(
  ctx: OutlineContext,
  type: MeasurementType,
  points: readonly Point[],
): void {
  ctx.beginPath();
  if (type === "ellipse") {
    const { cx, cy, rx, ry } = ellipseParams(points);
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.closePath();
    return;
  }
  if (type === "cloud") {
    const arcs = cloudArcs(points);
    arcs.forEach((arc, index) => {
      if (index === 0) ctx.moveTo(arc.start.x, arc.start.y);
      ctx.arc(
        arc.center.x,
        arc.center.y,
        arc.radius,
        Math.atan2(arc.start.y - arc.center.y, arc.start.x - arc.center.x),
        Math.atan2(arc.end.y - arc.center.y, arc.end.x - arc.center.x),
        arc.sweep < 0,
      );
    });
    ctx.closePath();
    return;
  }
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

export function measurementOutlineBounds(
  type: MeasurementType,
  points: readonly Point[],
): { minX: number; minY: number; maxX: number; maxY: number } {
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
  if (type === "cloud") {
    const sagitta = cloudArcs(points).reduce(
      (max, arc) => Math.max(max, arc.radius * (1 - Math.cos(CLOUD_ARC_ANGLE / 2))),
      0,
    );
    minX -= sagitta;
    minY -= sagitta;
    maxX += sagitta;
    maxY += sagitta;
  }
  return { minX, minY, maxX, maxY };
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
