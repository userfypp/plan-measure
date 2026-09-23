import type {
  LogicalPageBounds,
  DrawingDraft,
  Measurement,
  MeasurementType,
  Point,
  Tool,
  ViewTransform,
} from "../../types/domain";
import {
  clampPointToPage,
  isPointInPage,
  pageToScreen,
  screenToPage,
} from "../../utils/coordinates";
import {
  areEffectivelyIdentical,
  constrainOrthogonal,
  isMeasurementType,
  measurementPathSpecs,
} from "../../utils/geometry";
import { shouldRenderMeasurement } from "../measurements/measurementViewModels";

export const SNAP_TOLERANCE_SCREEN_PX = 10;
export const POLYGON_CLOSE_TOLERANCE_SCREEN_PX = 10;

export type OrthogonalAxis = "horizontal" | "vertical";

interface SnapTargetBase {
  measurementId: string;
  measurementIndex: number;
  primitiveIndex: number;
}

export interface VertexSnapTarget extends SnapTargetBase {
  kind: "vertex";
  point: Point;
}

export interface SegmentSnapTarget extends SnapTargetBase {
  kind: "segment";
  start: Point;
  end: Point;
  endVertexIndex: number;
}

export type SnapTarget = VertexSnapTarget | SegmentSnapTarget;

interface TargetBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface TargetTreeNode extends TargetBounds {
  indices?: number[];
  left?: TargetTreeNode;
  right?: TargetTreeNode;
}

interface TargetIndex {
  root: TargetTreeNode;
  maxCoordinate: number;
}

// Only extraction-owned arrays are indexed. Public resolvers also accept arbitrary
// mutable target arrays; those continue through the exact linear path.
const extractedTargetIndices = new WeakMap<readonly SnapTarget[], TargetIndex | null | undefined>();
const MIN_INDEXED_TARGETS = 32;
const MAX_INDEXED_COORDINATE = 1e12;

function targetBounds(target: SnapTarget): TargetBounds {
  if (target.kind === "vertex") {
    return {
      minX: target.point.x,
      minY: target.point.y,
      maxX: target.point.x,
      maxY: target.point.y,
    };
  }
  return {
    minX: Math.min(target.start.x, target.end.x),
    minY: Math.min(target.start.y, target.end.y),
    maxX: Math.max(target.start.x, target.end.x),
    maxY: Math.max(target.start.y, target.end.y),
  };
}

function buildTargetIndex(targets: readonly SnapTarget[]): TargetIndex | null {
  if (targets.length < MIN_INDEXED_TARGETS) return null;
  const boxes = targets.map(targetBounds);
  let maxCoordinate = 0;
  for (const box of boxes) {
    maxCoordinate = Math.max(
      maxCoordinate,
      Math.abs(box.minX), Math.abs(box.minY), Math.abs(box.maxX), Math.abs(box.maxY),
    );
  }
  if (!Number.isFinite(maxCoordinate) || maxCoordinate > MAX_INDEXED_COORDINATE) return null;

  function build(indices: number[]): TargetTreeNode {
    const box = indices.reduce<TargetBounds>(
      (bounds, index) => ({
        minX: Math.min(bounds.minX, boxes[index]!.minX),
        minY: Math.min(bounds.minY, boxes[index]!.minY),
        maxX: Math.max(bounds.maxX, boxes[index]!.maxX),
        maxY: Math.max(bounds.maxY, boxes[index]!.maxY),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    if (indices.length <= 16) return { ...box, indices };
    const axis = box.maxX - box.minX >= box.maxY - box.minY ? "x" : "y";
    indices.sort((a, b) => {
      const centerA = axis === "x"
        ? boxes[a]!.minX / 2 + boxes[a]!.maxX / 2
        : boxes[a]!.minY / 2 + boxes[a]!.maxY / 2;
      const centerB = axis === "x"
        ? boxes[b]!.minX / 2 + boxes[b]!.maxX / 2
        : boxes[b]!.minY / 2 + boxes[b]!.maxY / 2;
      return centerA - centerB || a - b;
    });
    const middle = Math.floor(indices.length / 2);
    return {
      ...box,
      left: build(indices.slice(0, middle)),
      right: build(indices.slice(middle)),
    };
  }

  return { root: build(targets.map((_, index) => index)), maxCoordinate };
}

function intersects(a: TargetBounds, b: TargetBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY;
}

function queryTargetIndex(
  node: TargetTreeNode,
  area: TargetBounds,
  result: number[],
  candidateLimit: number,
): boolean {
  if (!intersects(node, area)) return true;
  if (node.indices) {
    result.push(...node.indices);
    return result.length <= candidateLimit;
  }
  if (node.left && !queryTargetIndex(node.left, area, result, candidateLimit)) return false;
  if (node.right && !queryTargetIndex(node.right, area, result, candidateLimit)) return false;
  return true;
}

function candidateTargetIndices(
  targets: readonly SnapTarget[],
  rawPoint: Point,
  zoom: number,
  screenDistanceContext?: ScreenDistanceContext,
): number[] | null {
  if (!extractedTargetIndices.has(targets)) return null;
  let index = extractedTargetIndices.get(targets);
  if (index === undefined) {
    index = buildTargetIndex(targets);
    extractedTargetIndices.set(targets, index);
  }
  if (!index || !Number.isFinite(zoom) || zoom < 0.1 || zoom > 8) return null;

  const coordinates = [rawPoint.x, rawPoint.y];
  if (screenDistanceContext) {
    coordinates.push(
      screenDistanceContext.rawPointerScreen.x,
      screenDistanceContext.rawPointerScreen.y,
      screenDistanceContext.transform.panX,
      screenDistanceContext.transform.panY,
    );
  }
  const queryScale = Math.max(index.maxCoordinate, 1, ...coordinates.map(Math.abs));
  if (!Number.isFinite(queryScale) || queryScale > MAX_INDEXED_COORDINATE) return null;

  // Exact eligibility remains in resolveCandidates. In Ortho, a vertex must
  // already lie on the anchor axis, while a segment's returned intersection
  // (or collinear projection) lies within its endpoint bounds. Thus any Ortho
  // candidate near the pointer also has a bounding box intersecting this area.
  // The extra room covers screen/page rounding and projected segment points;
  // extreme ranges use the linear path instead of risking a false rejection.
  const radius = SNAP_TOLERANCE_SCREEN_PX / zoom +
    1024 * Number.EPSILON * queryScale / Math.min(zoom, 1);
  if (!Number.isFinite(radius)) return null;
  const area = {
    minX: rawPoint.x - radius,
    minY: rawPoint.y - radius,
    maxX: rawPoint.x + radius,
    maxY: rawPoint.y + radius,
  };
  const indices: number[] = [];
  // Dense or highly overlapping targets make an index query more expensive
  // than the stable linear pass. Fall back early and preserve tie ordering.
  if (!queryTargetIndex(index.root, area, indices, Math.floor(targets.length / 2))) return null;
  indices.sort((a, b) => a - b);
  return indices;
}

export interface SnapMatch {
  point: Point;
  target: SnapTarget;
  distanceScreenPx: number;
}

export interface DrawingPointResolution {
  point: Point;
  snapMatch: SnapMatch | null;
  closesPolygon: boolean;
}

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

const SPLITTER = 134_217_729;
const MAX_SPLIT_OPERAND = Number.MAX_VALUE / SPLITTER;

/** Returns a * b - c * d with the rounding error of each product restored. */
function differenceOfProducts(a: number, b: number, c: number, d: number): number {
  const productError = (left: number, right: number, product: number): number => {
    const leftSplit = SPLITTER * left;
    const leftHigh = leftSplit - (leftSplit - left);
    const leftLow = left - leftHigh;
    const rightSplit = SPLITTER * right;
    const rightHigh = rightSplit - (rightSplit - right);
    const rightLow = right - rightHigh;
    return (
      ((leftHigh * rightHigh - product) + leftHigh * rightLow + leftLow * rightHigh) +
      leftLow * rightLow
    );
  };

  const first = a * b;
  const second = c * d;
  const difference = first - second;
  return difference + ((first - difference) - second + productError(a, b, first) - productError(c, d, second));
}

export function clipSegmentToPage(
  start: Point,
  end: Point,
  bounds: LogicalPageBounds,
): { start: Point; end: Point } | null {
  if (!finitePoint(start) || !finitePoint(end)) return null;

  if (start.y === end.y) {
    if (start.y < 0 || start.y > bounds.height) return null;
    if ((start.x < 0 && end.x < 0) || (start.x > bounds.width && end.x > bounds.width)) {
      return null;
    }
    return {
      start: { x: Math.min(bounds.width, Math.max(0, start.x)), y: start.y },
      end: { x: Math.min(bounds.width, Math.max(0, end.x)), y: end.y },
    };
  }
  if (start.x === end.x) {
    if (start.x < 0 || start.x > bounds.width) return null;
    if ((start.y < 0 && end.y < 0) || (start.y > bounds.height && end.y > bounds.height)) {
      return null;
    }
    return {
      start: { x: start.x, y: Math.min(bounds.height, Math.max(0, start.y)) },
      end: { x: end.x, y: Math.min(bounds.height, Math.max(0, end.y)) },
    };
  }

  // Normalize first so differences and line coefficients stay finite even for
  // very large historical coordinates. Boundary intersections are then solved
  // from the implicit line equation instead of reconstructing start + t * delta,
  // which avoids catastrophic cancellation near t ~= 0.5.
  const scale = Math.max(
    1,
    Math.abs(start.x),
    Math.abs(start.y),
    Math.abs(end.x),
    Math.abs(end.y),
    Math.abs(bounds.width),
    Math.abs(bounds.height),
  );
  const normalizedStart = { x: start.x / scale, y: start.y / scale };
  const normalizedEnd = { x: end.x / scale, y: end.y / scale };
  const normalizedWidth = bounds.width / scale;
  const normalizedHeight = bounds.height / scale;
  const dx = normalizedEnd.x - normalizedStart.x;
  const dy = normalizedEnd.y - normalizedStart.y;

  if (dx === 0 && dy === 0) {
    return isPointInPage(start, bounds) ? { start: { ...start }, end: { ...end } } : null;
  }

  let lineA = dy;
  let lineB = -dx;
  let lineC = lineA * normalizedStart.x + lineB * normalizedStart.y;
  let usesRawLine = false;

  // The normalized determinant above keeps products finite, but can discard a
  // page-sized offset from an otherwise enormous line before its two terms are
  // subtracted. When the original products are safe, recover their rounding
  // errors instead so the implicit line retains that offset. Keep the normalized
  // form as the fallback for ranges whose original arithmetic could overflow.
  const rawDx = end.x - start.x;
  const rawDy = end.y - start.y;
  const canUseCompensatedLine =
    Number.isFinite(rawDx) &&
    Number.isFinite(rawDy) &&
    [rawDx, rawDy, start.x, start.y].every(
      (value) => Math.abs(value) <= MAX_SPLIT_OPERAND,
    ) &&
    Number.isFinite(rawDy * start.x) &&
    Number.isFinite(rawDx * start.y);
  if (canUseCompensatedLine) {
    const compensatedLineC = differenceOfProducts(rawDy, start.x, rawDx, start.y);
    if (Number.isFinite(compensatedLineC)) {
      lineA = rawDy;
      lineB = -rawDx;
      lineC = compensatedLineC;
      usesRawLine = true;
    }
  }
  const useXForOrder = Math.abs(dx) >= Math.abs(dy);
  const orderDirection = Math.sign(useXForOrder ? dx : dy);
  const candidates: Array<{ point: Point; order: number }> = [];

  function addCandidate(point: Point, t: number): void {
    if (t < 0 || t > 1 || !finitePoint(point) || !isPointInPage(point, bounds)) return;
    const clippedPoint = clampPointToPage(point, bounds);
    if (
      candidates.some(
        (candidate) =>
          candidate.point.x === clippedPoint.x && candidate.point.y === clippedPoint.y,
      )
    ) {
      return;
    }
    candidates.push({
      point: clippedPoint,
      order: orderDirection * (useXForOrder ? clippedPoint.x : clippedPoint.y),
    });
  }

  if (isPointInPage(start, bounds)) addCandidate(start, 0);
  if (isPointInPage(end, bounds)) addCandidate(end, 1);

  if (dx !== 0) {
    for (const [x, normalizedX] of [
      [0, 0],
      [bounds.width, normalizedWidth],
    ] as const) {
      const t = (normalizedX - normalizedStart.x) / dx;
      const y = usesRawLine
        ? (lineC - lineA * x) / lineB
        : ((lineC - lineA * normalizedX) / lineB) * scale;
      addCandidate({ x, y }, t);
    }
  }

  if (dy !== 0) {
    for (const [y, normalizedY] of [
      [0, 0],
      [bounds.height, normalizedHeight],
    ] as const) {
      const t = (normalizedY - normalizedStart.y) / dy;
      const x = usesRawLine
        ? (lineC - lineB * y) / lineA
        : ((lineC - lineB * normalizedY) / lineA) * scale;
      addCandidate({ x, y }, t);
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.order - b.order);
  return {
    start: candidates[0]!.point,
    end: candidates[candidates.length - 1]!.point,
  };
}

/** Extracts only geometry that is currently rendered for snapping. */
export function extractSnapTargets(
  measurements: readonly Measurement[],
  showMeasurements: boolean,
  bounds?: LogicalPageBounds,
  buildSpatialIndex = true,
): SnapTarget[] {
  const targets: SnapTarget[] = [];

  measurements.forEach((measurement, measurementIndex) => {
    if (!shouldRenderMeasurement(measurement, showMeasurements)) return;

    measurement.points.forEach((point, primitiveIndex) => {
      if (!finitePoint(point)) return;
      if (bounds && !isPointInPage(point, bounds)) return;
      targets.push({
        kind: "vertex",
        measurementId: measurement.id,
        measurementIndex,
        primitiveIndex,
        point,
      });
    });

    const segmentCount = measurementPathSpecs[measurement.type].closed
      ? measurement.points.length
      : Math.max(0, measurement.points.length - 1);
    for (let primitiveIndex = 0; primitiveIndex < segmentCount; primitiveIndex += 1) {
      const start = measurement.points[primitiveIndex];
      const end = measurement.points[(primitiveIndex + 1) % measurement.points.length];
      if (!start || !end || !finitePoint(start) || !finitePoint(end)) continue;
      if (start.x === end.x && start.y === end.y) continue;
      const visibleSegment = bounds ? clipSegmentToPage(start, end, bounds) : { start, end };
      if (!visibleSegment) continue;
      targets.push({
        kind: "segment",
        measurementId: measurement.id,
        measurementIndex,
        primitiveIndex,
        start: visibleSegment.start,
        end: visibleSegment.end,
        endVertexIndex: (primitiveIndex + 1) % measurement.points.length,
      });
    }
  });

  // Build outside the pointer-move path so the first preview cannot pay the
  // one-time tree construction cost for a dense page. Callers can skip this
  // while snapping is disabled to keep page rendering free of index work.
  if (buildSpatialIndex) extractedTargetIndices.set(targets, buildTargetIndex(targets));
  return targets;
}

export function nearestPointOnSegment(rawPoint: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { ...start };
  const projection =
    ((rawPoint.x - start.x) * dx + (rawPoint.y - start.y) * dy) / lengthSquared;
  if (projection <= 0) return { ...start };
  if (projection >= 1) return { ...end };
  return { x: start.x + dx * projection, y: start.y + dy * projection };
}

export function getOrthogonalAxis(anchor: Point, rawPoint: Point): OrthogonalAxis {
  return Math.abs(rawPoint.x - anchor.x) >= Math.abs(rawPoint.y - anchor.y)
    ? "horizontal"
    : "vertical";
}

function pointOnOrthogonalAxis(
  target: VertexSnapTarget,
  anchor: Point,
  axis: OrthogonalAxis,
): Point | null {
  if (axis === "horizontal") {
    return target.point.y === anchor.y ? target.point : null;
  }
  return target.point.x === anchor.x ? target.point : null;
}

function segmentPointOnOrthogonalAxis(
  target: SegmentSnapTarget,
  anchor: Point,
  rawPoint: Point,
  axis: OrthogonalAxis,
): Point | null {
  const { start, end } = target;

  if (axis === "horizontal") {
    if (start.y === end.y) {
      if (start.y !== anchor.y) return null;
      return nearestPointOnSegment({ x: rawPoint.x, y: anchor.y }, start, end);
    }
    const t = (anchor.y - start.y) / (end.y - start.y);
    if (t < 0 || t > 1) return null;
    if (t === 0) return { x: start.x, y: anchor.y };
    if (t === 1) return { x: end.x, y: anchor.y };
    return { x: start.x + (end.x - start.x) * t, y: anchor.y };
  }

  if (start.x === end.x) {
    if (start.x !== anchor.x) return null;
    return nearestPointOnSegment({ x: anchor.x, y: rawPoint.y }, start, end);
  }
  const t = (anchor.x - start.x) / (end.x - start.x);
  if (t < 0 || t > 1) return null;
  if (t === 0) return { x: anchor.x, y: start.y };
  if (t === 1) return { x: anchor.x, y: end.y };
  return { x: anchor.x, y: start.y + (end.y - start.y) * t };
}

function targetPriority(target: SnapTarget): number {
  return target.kind === "vertex" ? 0 : 1;
}

function winsTie(candidate: SnapTarget, current: SnapTarget): boolean {
  const kindDelta = targetPriority(candidate) - targetPriority(current);
  if (kindDelta !== 0) return kindDelta < 0;
  if (candidate.measurementIndex !== current.measurementIndex) {
    return candidate.measurementIndex < current.measurementIndex;
  }
  return candidate.primitiveIndex < current.primitiveIndex;
}

function measurementTargetKey(target: SnapTarget): string {
  return JSON.stringify([target.measurementIndex, target.measurementId]);
}

function hasEligibleIncidentVertex(
  segment: SegmentSnapTarget,
  eligibleVertices: ReadonlyMap<string, ReadonlyMap<number, VertexSnapTarget>>,
): boolean {
  const vertices = eligibleVertices.get(measurementTargetKey(segment));
  if (!vertices) return false;
  return vertices.has(segment.primitiveIndex) || vertices.has(segment.endVertexIndex);
}

interface ScreenDistanceContext {
  rawPointerScreen: Point;
  transform: ViewTransform;
}

function screenDeltaFromPagePoint(
  point: Point,
  { rawPointerScreen, transform }: ScreenDistanceContext,
): { dx: number; dy: number; alternateDx: number; alternateDy: number } {
  const scaledX = point.x * transform.zoom;
  const scaledY = point.y * transform.zoom;
  const rawWithoutPanX = rawPointerScreen.x - transform.panX;
  const rawWithoutPanY = rawPointerScreen.y - transform.panY;
  const dx = transform.panX + scaledX - rawPointerScreen.x;
  const dy = transform.panY + scaledY - rawPointerScreen.y;
  const alternateDx = scaledX - rawWithoutPanX;
  const alternateDy = scaledY - rawWithoutPanY;
  return { dx, dy, alternateDx, alternateDy };
}

function withinInclusivePageTolerance(
  dxPage: number,
  dyPage: number,
  zoom: number,
  toleranceScreenPx: number,
): boolean {
  const distancePage = Math.hypot(dxPage, dyPage);
  const limitPage = toleranceScreenPx / zoom;
  if (distancePage <= limitPage) return true;

  // The page-space fallback is only for an otherwise exact boundary that was
  // perturbed by screen/page division and subtraction. Its allowance is the
  // representational scale of the two values being compared, not a shared
  // proximity rule; nearest-candidate ordering and ties never use it.
  const roundingAllowance =
    Number.EPSILON * (Math.abs(distancePage) + Math.abs(limitPage));
  return distancePage - limitPage <= roundingAllowance;
}

function resolveCandidates(
  rawPoint: Point,
  zoom: number,
  targets: readonly SnapTarget[],
  candidatePoint: (target: SnapTarget) => Point | null,
  bounds?: LogicalPageBounds,
  excludedPoint?: Point,
  screenDistanceContext?: ScreenDistanceContext,
): SnapMatch | null {
  const candidates: Array<{
    point: Point;
    target: SnapTarget;
    distanceSquaredScreen: number;
  }> = [];

  const targetIndices = candidateTargetIndices(targets, rawPoint, zoom, screenDistanceContext);
  for (const index of targetIndices ?? targets.keys()) {
    const target = targets[index]!;
    const point = candidatePoint(target);
    if (!point || !finitePoint(point)) continue;
    if (bounds && !isPointInPage(point, bounds)) continue;
    if (excludedPoint && areEffectivelyIdentical(point, excludedPoint)) continue;
    const dxPage = point.x - rawPoint.x;
    const dyPage = point.y - rawPoint.y;
    const screenDelta = screenDistanceContext
      ? screenDeltaFromPagePoint(point, screenDistanceContext)
      : null;
    const dxScreen = screenDelta ? screenDelta.dx : dxPage * zoom;
    const dyScreen = screenDelta ? screenDelta.dy : dyPage * zoom;
    const distanceSquaredScreen = dxScreen * dxScreen + dyScreen * dyScreen;
    const distanceScreen = Math.hypot(dxScreen, dyScreen);
    const alternateDistanceScreen = screenDelta
      ? Math.hypot(screenDelta.alternateDx, screenDelta.alternateDy)
      : distanceScreen;
    const insideTolerance = screenDelta
      ? distanceScreen <= SNAP_TOLERANCE_SCREEN_PX ||
        alternateDistanceScreen <= SNAP_TOLERANCE_SCREEN_PX ||
        withinInclusivePageTolerance(dxPage, dyPage, zoom, SNAP_TOLERANCE_SCREEN_PX)
      : withinInclusivePageTolerance(dxPage, dyPage, zoom, SNAP_TOLERANCE_SCREEN_PX);
    if (!insideTolerance) continue;
    candidates.push({ point, target, distanceSquaredScreen });
  }

  const eligibleVertices = new Map<string, Map<number, VertexSnapTarget>>();
  for (const candidate of candidates) {
    if (candidate.target.kind !== "vertex") continue;
    const key = measurementTargetKey(candidate.target);
    let vertices = eligibleVertices.get(key);
    if (!vertices) {
      vertices = new Map();
      eligibleVertices.set(key, vertices);
    }
    vertices.set(candidate.target.primitiveIndex, candidate.target);
  }

  let best: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    if (
      candidate.target.kind === "segment" &&
      hasEligibleIncidentVertex(candidate.target, eligibleVertices)
    ) {
      continue;
    }
    const { target, distanceSquaredScreen } = candidate;
    const tiesBest = best ? distanceSquaredScreen === best.distanceSquaredScreen : false;
    if (
      !best ||
      distanceSquaredScreen < best.distanceSquaredScreen ||
      (tiesBest && winsTie(target, best.target))
    ) {
      best = candidate;
    }
  }

  return best
    ? {
        point: best.point,
        target: best.target,
        distanceScreenPx: Math.sqrt(best.distanceSquaredScreen),
      }
    : null;
}

/** Resolves ordinary Snap candidates from the raw page-space pointer. */
export function resolveSnapCandidate(
  rawPoint: Point,
  zoom: number,
  targets: readonly SnapTarget[],
  bounds?: LogicalPageBounds,
  excludedPoint?: Point,
): SnapMatch | null {
  return resolveSnapCandidateWithScreenDistance(
    rawPoint,
    zoom,
    targets,
    bounds,
    excludedPoint,
  );
}

function resolveSnapCandidateWithScreenDistance(
  rawPoint: Point,
  zoom: number,
  targets: readonly SnapTarget[],
  bounds?: LogicalPageBounds,
  excludedPoint?: Point,
  screenDistanceContext?: ScreenDistanceContext,
): SnapMatch | null {
  return resolveCandidates(
    rawPoint,
    zoom,
    targets,
    (target) =>
      target.kind === "vertex"
        ? target.point
        : nearestPointOnSegment(rawPoint, target.start, target.end),
    bounds,
    excludedPoint,
    screenDistanceContext,
  );
}

/** Resolves Snap only on the axis selected by the existing Ortho rule. */
export function resolveSnapWithOrtho(
  anchor: Point,
  rawPoint: Point,
  zoom: number,
  targets: readonly SnapTarget[],
  bounds?: LogicalPageBounds,
  excludedPoint?: Point,
): SnapMatch | null {
  return resolveSnapWithOrthoScreenDistance(
    anchor,
    rawPoint,
    zoom,
    targets,
    bounds,
    excludedPoint,
  );
}

function resolveSnapWithOrthoScreenDistance(
  anchor: Point,
  rawPoint: Point,
  zoom: number,
  targets: readonly SnapTarget[],
  bounds?: LogicalPageBounds,
  excludedPoint?: Point,
  screenDistanceContext?: ScreenDistanceContext,
): SnapMatch | null {
  const axis = getOrthogonalAxis(anchor, rawPoint);
  return resolveCandidates(
    rawPoint,
    zoom,
    targets,
    (target) =>
      target.kind === "vertex"
        ? pointOnOrthogonalAxis(target, anchor, axis)
        : segmentPointOnOrthogonalAxis(target, anchor, rawPoint, axis),
    bounds,
    excludedPoint,
    screenDistanceContext,
  );
}

export function isScreenPointInPage(
  point: Point,
  transform: ViewTransform,
  bounds: LogicalPageBounds,
): boolean {
  const pageStart = pageToScreen({ x: 0, y: 0 }, transform);
  const pageEnd = pageToScreen({ x: bounds.width, y: bounds.height }, transform);
  return (
    point.x >= Math.min(pageStart.x, pageEnd.x) &&
    point.x <= Math.max(pageStart.x, pageEnd.x) &&
    point.y >= Math.min(pageStart.y, pageEnd.y) &&
    point.y <= Math.max(pageStart.y, pageEnd.y)
  );
}

export function isSnapPointPlacementActive(
  tool: Tool,
  spacePan: boolean,
  isPanning: boolean,
  calibrationReferenceEditActive: boolean,
  measurementEditActive: boolean,
): tool is MeasurementType {
  return (
    isMeasurementType(tool) &&
    !spacePan &&
    !isPanning &&
    !calibrationReferenceEditActive &&
    !measurementEditActive
  );
}

function polygonCloseWillOccur(
  measurementType: MeasurementType,
  confirmedPoints: readonly Point[],
  rawPoint: Point,
  rawPointerScreen: Point,
  transform: ViewTransform,
): boolean {
  const spec = measurementPathSpecs[measurementType];
  const first = confirmedPoints[0];
  if (!spec.closed || confirmedPoints.length < spec.minVertices || !first) return false;
  const screenDelta = screenDeltaFromPagePoint(first, { rawPointerScreen, transform });
  const distanceScreen = Math.hypot(screenDelta.dx, screenDelta.dy);
  const alternateDistanceScreen = Math.hypot(
    screenDelta.alternateDx,
    screenDelta.alternateDy,
  );
  return (
    distanceScreen <= POLYGON_CLOSE_TOLERANCE_SCREEN_PX ||
    alternateDistanceScreen <= POLYGON_CLOSE_TOLERANCE_SCREEN_PX ||
    withinInclusivePageTolerance(
      first.x - rawPoint.x,
      first.y - rawPoint.y,
      transform.zoom,
      POLYGON_CLOSE_TOLERANCE_SCREEN_PX,
    )
  );
}

/**
 * Single pure placement resolver used by both hover preview and committed clicks.
 * `rawPointerScreen` is never clamped, so an outside-page pointer cannot be pulled inward.
 */
export function resolveDrawingPoint({
  measurementType,
  confirmedPoints,
  rawPointerScreen,
  transform,
  bounds,
  snapEnabled,
  orthogonal,
  targets,
}: {
  measurementType: MeasurementType;
  confirmedPoints: readonly Point[];
  rawPointerScreen: Point;
  transform: ViewTransform;
  bounds: LogicalPageBounds;
  snapEnabled: boolean;
  orthogonal: boolean;
  targets: readonly SnapTarget[];
}): DrawingPointResolution | null {
  if (!isScreenPointInPage(rawPointerScreen, transform, bounds)) return null;
  const rawPoint = clampPointToPage(screenToPage(rawPointerScreen, transform), bounds);

  const anchor = confirmedPoints.at(-1);
  const closesPolygon = polygonCloseWillOccur(
    measurementType,
    confirmedPoints,
    rawPoint,
    rawPointerScreen,
    transform,
  );
  const normalPoint = anchor && orthogonal ? constrainOrthogonal(anchor, rawPoint) : rawPoint;
  if (closesPolygon) {
    return { point: confirmedPoints[0]!, snapMatch: null, closesPolygon: true };
  }

  if (!snapEnabled) {
    return { point: normalPoint, snapMatch: null, closesPolygon: false };
  }

  const snapMatch =
    anchor && orthogonal
      ? resolveSnapWithOrthoScreenDistance(
          anchor,
          rawPoint,
          transform.zoom,
          targets,
          bounds,
          anchor,
          { rawPointerScreen, transform },
        )
      : resolveSnapCandidateWithScreenDistance(
          rawPoint,
          transform.zoom,
          targets,
          bounds,
          anchor,
          { rawPointerScreen, transform },
        );
  return {
    point: snapMatch?.point ?? normalPoint,
    snapMatch,
    closesPolygon: false,
  };
}

/**
 * Production preview policy for new measurement points. Keeping this pure makes
 * first-point feedback and interaction blocking testable without a DOM/Konva harness.
 */
export function resolveDrawingPreview({
  tool,
  draft,
  rawPointerScreen,
  transform,
  bounds,
  snapEnabled,
  orthogonal,
  targets,
  spacePan,
  isPanning,
  calibrationReferenceEditActive,
  measurementEditActive,
}: {
  tool: Tool;
  draft: DrawingDraft | null;
  rawPointerScreen: Point | null;
  transform: ViewTransform;
  bounds: LogicalPageBounds | null;
  snapEnabled: boolean;
  orthogonal: boolean;
  targets: readonly SnapTarget[];
  spacePan: boolean;
  isPanning: boolean;
  calibrationReferenceEditActive: boolean;
  measurementEditActive: boolean;
}): DrawingPointResolution | null {
  if (
    !bounds ||
    !rawPointerScreen ||
    !isSnapPointPlacementActive(
      tool,
      spacePan,
      isPanning,
      calibrationReferenceEditActive,
      measurementEditActive,
    )
  ) {
    return null;
  }

  const pathDraft = draft?.type === "path" && draft.measurementType === tool ? draft : null;
  return resolveDrawingPoint({
    measurementType: tool,
    confirmedPoints: pathDraft?.points ?? [],
    rawPointerScreen,
    transform,
    bounds,
    snapEnabled,
    orthogonal,
    targets,
  });
}
