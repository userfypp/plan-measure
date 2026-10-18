import type { MeasurementType, Point } from "../types/domain";
import { ellipseParams } from "./quickShapesCore";

export interface CloudArc {
  center: Point;
  radius: number;
  start: Point;
  end: Point;
  /** Signed sweep in radians (sign of the angular direction from start to end). */
  sweep: number;
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
const CLOUD_ARC_SEGMENTS_MAX = 128;
const CLOUD_ARCS_MAX = 4096;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}


const cloudArcsCache = new WeakMap<readonly Point[], CloudArc[]>();

/** Deterministic scalloped arcs along every edge of the control polygon, bulging outwards. */
export function cloudArcs(points: readonly Point[]): CloudArc[] {
  const cached = cloudArcsCache.get(points);
  if (cached) return cached;
  const count = points.length;
  let signedArea = 0;
  let perimeter = 0;
  // Measuring from the first vertex keeps the winding exact far from the origin.
  const origin = points[0]!;
  for (let index = 0; index < count; index += 1) {
    const p = points[index]!;
    const q = points[(index + 1) % count]!;
    signedArea += (p.x - origin.x) * (q.y - origin.y) - (q.x - origin.x) * (p.y - origin.y);
    perimeter += Math.hypot(q.x - p.x, q.y - p.y);
  }
  const orientation = signedArea < 0 ? -1 : 1;
  const targetChord = clamp(perimeter / CLOUD_CHORD_DIVISOR, CLOUD_CHORD_MIN, CLOUD_CHORD_MAX);
  // Oversized imported geometry must not expand into an unbounded decorative outline.
  let plannedArcs = 0;
  for (let index = 0; index < count; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % count]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(length > 0)) continue;
    plannedArcs += Math.max(1, Math.round(length / targetChord));
    if (!Number.isFinite(plannedArcs) || plannedArcs > CLOUD_ARCS_MAX) {
      const fallback: CloudArc[] = [];
      cloudArcsCache.set(points, fallback);
      return fallback;
    }
  }
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
    const arcs = cloudArcs(points);
    if (arcs.length === 0) return points as Point[];
    for (const arc of arcs) {
      const step = arc.radius > tolerance ? Math.acos(1 - tolerance / arc.radius) : Math.PI / 2;
      const segments = clamp(
        Math.ceil(Math.abs(arc.sweep) / step),
        CLOUD_ARC_SEGMENTS_MIN,
        CLOUD_ARC_SEGMENTS_MAX,
      );
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
    if (arcs.length > 0) {
      ctx.closePath();
      return;
    }
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
