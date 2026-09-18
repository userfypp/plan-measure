import type { LogicalPageBounds, MeasurementType, Point } from "../types/domain";
import { isAxisAlignedRectStrictlyInsidePolygon } from "./geometry";

export const LABEL_EDGE_MARGIN_SCREEN_PX = 4;

export interface LabelDimensions {
  width: number;
  height: number;
}

export interface LabelPlacement {
  /** The top-left corner of the label in page coordinates. */
  x: number;
  y: number;
}

export interface OccupiedLabelRect extends LabelPlacement, LabelDimensions {}

export interface LabelCollisionIndex {
  insert(rect: OccupiedLabelRect): void;
  somePotentialCollision(
    candidate: OccupiedLabelRect,
    gap: number,
    visit: (rect: OccupiedLabelRect) => boolean,
  ): boolean;
}

type OccupiedLabels = readonly OccupiedLabelRect[] | LabelCollisionIndex;

const MAX_GRID_CELLS_PER_RECT = 64;

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function safeZoom(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

interface GridCellRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function gridCellRange(
  rect: OccupiedLabelRect,
  gap: number,
  cellSize: number,
): GridCellRange | null {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(cellSize) ||
    cellSize <= 0
  ) {
    return null;
  }

  const width = finiteNonNegative(rect.width);
  const height = finiteNonNegative(rect.height);
  const safeGap = finiteNonNegative(gap);
  const minX = Math.floor((rect.x - safeGap) / cellSize);
  const maxX = Math.floor((rect.x + width + safeGap) / cellSize);
  const minY = Math.floor((rect.y - safeGap) / cellSize);
  const maxY = Math.floor((rect.y + height + safeGap) / cellSize);
  const columns = maxX - minX + 1;
  const rows = maxY - minY + 1;
  if (
    !Number.isFinite(columns) ||
    !Number.isFinite(rows) ||
    columns <= 0 ||
    rows <= 0 ||
    columns > MAX_GRID_CELLS_PER_RECT ||
    rows > MAX_GRID_CELLS_PER_RECT ||
    columns * rows > MAX_GRID_CELLS_PER_RECT
  ) {
    return null;
  }

  return { minX, maxX, minY, maxY };
}

function gridCellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

class UniformLabelCollisionIndex implements LabelCollisionIndex {
  private readonly all: Array<{ order: number; rect: OccupiedLabelRect }> = [];
  private readonly overflow: Array<{ order: number; rect: OccupiedLabelRect }> = [];
  private readonly buckets = new Map<
    string,
    Array<{ order: number; rect: OccupiedLabelRect }>
  >();
  private cellSize: number | null = null;

  insert(rect: OccupiedLabelRect): void {
    const entry = { order: this.all.length, rect };
    this.all.push(entry);

    // Labels are single-line UI text. Three actual label heights gives a cell
    // around 60 screen px with today's metrics, while automatically tracking
    // zoom because the measured rectangle is already in page coordinates.
    const labelHeight = finiteNonNegative(rect.height);
    if (this.cellSize === null && labelHeight > 0) this.cellSize = labelHeight * 3;
    if (this.cellSize === null) {
      this.overflow.push(entry);
      return;
    }
    const range = gridCellRange(rect, 0, this.cellSize);
    if (!range) {
      this.overflow.push(entry);
      return;
    }

    for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
      for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
        const key = gridCellKey(cellX, cellY);
        const bucket = this.buckets.get(key);
        if (bucket) bucket.push(entry);
        else this.buckets.set(key, [entry]);
      }
    }
  }

  somePotentialCollision(
    candidate: OccupiedLabelRect,
    gap: number,
    visit: (rect: OccupiedLabelRect) => boolean,
  ): boolean {
    if (this.all.length === 0) return false;
    if (this.cellSize === null) return this.all.some((entry) => visit(entry.rect));

    const range = gridCellRange(candidate, gap, this.cellSize);
    if (!range) return this.all.some((entry) => visit(entry.rect));

    const sources: Array<Array<{ order: number; rect: OccupiedLabelRect }>> = [];
    if (this.overflow.length > 0) sources.push(this.overflow);
    for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
      for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
        const bucket = this.buckets.get(gridCellKey(cellX, cellY));
        if (bucket && bucket.length > 0) sources.push(bucket);
      }
    }
    if (sources.length === 0) return false;

    // Every bucket is already ordered by insertion. Merge them lazily so exact
    // checks keep the legacy occupied-array order and can stop at the first hit.
    const positions = sources.map(() => 0);
    const seenOrders = new Set<number>();
    while (true) {
      let nextSource = -1;
      let nextOrder = Number.POSITIVE_INFINITY;
      for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
        const source = sources[sourceIndex]!;
        let position = positions[sourceIndex]!;
        while (position < source.length && seenOrders.has(source[position]!.order)) position += 1;
        positions[sourceIndex] = position;
        const entry = source[position];
        if (entry && entry.order < nextOrder) {
          nextSource = sourceIndex;
          nextOrder = entry.order;
        }
      }
      if (nextSource === -1) return false;

      const entry = sources[nextSource]![positions[nextSource]!]!;
      positions[nextSource] = positions[nextSource]! + 1;
      seenOrders.add(entry.order);
      if (visit(entry.rect)) return true;
    }
  }
}

export function createLabelCollisionIndex(): LabelCollisionIndex {
  return new UniformLabelCollisionIndex();
}

function clampLabelAxis(
  anchor: number,
  labelSize: number,
  pageSize: number,
  margin: number,
): number {
  const desired = finiteNonNegative(anchor) - labelSize / 2;
  const minimum = margin;
  const maximum = pageSize - margin - labelSize;

  // A label wider/taller than the page cannot satisfy both edges. Keep its
  // origin finite and on the safe side so it never produces NaN/Infinity.
  if (maximum < minimum) return minimum;
  return Math.min(maximum, Math.max(minimum, desired));
}

/**
 * Centers a label on its anchor, then clamps its complete bounding box to the
 * page. Width, height, anchor, and the returned position are all in page
 * coordinates; only the safety margin is supplied in screen pixels.
 */
export function placeLabelWithinBounds(
  anchor: Point,
  dimensions: LabelDimensions,
  page: Pick<LogicalPageBounds, "width" | "height">,
  zoom: number,
  marginScreenPx = LABEL_EDGE_MARGIN_SCREEN_PX,
): LabelPlacement {
  const pageWidth = finiteNonNegative(page.width);
  const pageHeight = finiteNonNegative(page.height);
  const labelWidth = finiteNonNegative(dimensions.width);
  const labelHeight = finiteNonNegative(dimensions.height);
  const marginPage = finiteNonNegative(marginScreenPx) / safeZoom(zoom);
  const horizontalMargin = Math.min(marginPage, pageWidth / 2);
  const verticalMargin = Math.min(marginPage, pageHeight / 2);

  return {
    x: clampLabelAxis(anchor.x, labelWidth, pageWidth, horizontalMargin),
    y: clampLabelAxis(anchor.y, labelHeight, pageHeight, verticalMargin),
  };
}

function centeredPlacementWithoutClamping(
  anchor: Point,
  dimensions: LabelDimensions,
  page: Pick<LogicalPageBounds, "width" | "height">,
  zoom: number,
  marginScreenPx: number,
): LabelPlacement | null {
  const placement = placeLabelWithinBounds(anchor, dimensions, page, zoom, marginScreenPx);
  const desired = {
    x: finiteNonNegative(anchor.x) - finiteNonNegative(dimensions.width) / 2,
    y: finiteNonNegative(anchor.y) - finiteNonNegative(dimensions.height) / 2,
  };
  return placement.x === desired.x && placement.y === desired.y ? placement : null;
}

interface SegmentLabelCandidate {
  start: Point;
  end: Point;
  center: Point;
  length: number;
}

function segmentLabelCandidate(
  start: Point,
  end: Point,
  dimensions: LabelDimensions,
  zoom: number,
  clearanceScreenPx: number,
): SegmentLabelCandidate | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0) return null;

  const unitX = dx / length;
  const unitY = dy / length;
  const projectedLabelLength =
    Math.abs(unitX) * finiteNonNegative(dimensions.width) +
    Math.abs(unitY) * finiteNonNegative(dimensions.height);
  const endpointClearance = (2 * finiteNonNegative(clearanceScreenPx)) / safeZoom(zoom);
  if (length < projectedLabelLength + endpointClearance) return null;

  return {
    start,
    end,
    center: { x: start.x + dx / 2, y: start.y + dy / 2 },
    length,
  };
}

function compareSegmentCandidates(
  left: SegmentLabelCandidate,
  right: SegmentLabelCandidate,
): number {
  const scale = Math.max(1, left.length, right.length);
  const tieTolerance = 32 * Number.EPSILON * scale;
  if (Math.abs(left.length - right.length) > tieTolerance) return right.length - left.length;

  if (left.center.x !== right.center.x) return left.center.x - right.center.x;
  if (left.center.y !== right.center.y) return left.center.y - right.center.y;
  const leftFirst =
    left.start.x < left.end.x || (left.start.x === left.end.x && left.start.y <= left.end.y)
      ? left.start
      : left.end;
  const rightFirst =
    right.start.x < right.end.x || (right.start.x === right.end.x && right.start.y <= right.end.y)
      ? right.start
      : right.end;
  if (leftFirst.x !== rightFirst.x) return leftFirst.x - rightFirst.x;
  return leftFirst.y - rightFirst.y;
}

function polygonBounds(points: readonly Point[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} | null {
  const first = points[0];
  if (!first) return null;
  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY };
}

function averagePoint(points: readonly Point[]): Point | null {
  if (points.length === 0) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function polygonAreaCentroid(points: readonly Point[]): Point | null {
  if (points.length < 3) return null;
  const origin = points[0]!;
  let doubledArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const ax = a.x - origin.x;
    const ay = a.y - origin.y;
    const bx = b.x - origin.x;
    const by = b.y - origin.y;
    const cross = ax * by - ay * bx;
    doubledArea += cross;
    weightedX += (ax + bx) * cross;
    weightedY += (ay + by) * cross;
  }
  if (!Number.isFinite(doubledArea) || doubledArea === 0) return null;
  const centroid = {
    x: origin.x + weightedX / (3 * doubledArea),
    y: origin.y + weightedY / (3 * doubledArea),
  };
  return Number.isFinite(centroid.x) && Number.isFinite(centroid.y) ? centroid : null;
}

function polygonInteriorAnchors(
  points: readonly Point[],
  dimensions: LabelDimensions,
  clearance: number,
): Point[] {
  const bounds = polygonBounds(points);
  if (!bounds) return [];
  const halfWidth = finiteNonNegative(dimensions.width) / 2 + clearance;
  const halfHeight = finiteNonNegative(dimensions.height) / 2 + clearance;
  const minCenterX = bounds.minX + halfWidth;
  const maxCenterX = bounds.maxX - halfWidth;
  const minCenterY = bounds.minY + halfHeight;
  const maxCenterY = bounds.maxY - halfHeight;
  if (minCenterX >= maxCenterX || minCenterY >= maxCenterY) return [];

  const candidates: Point[] = [];
  const seen = new Set<string>();
  function add(point: Point | null) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const key = `${point.x}:${point.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(point);
  }

  add(polygonAreaCentroid(points));
  add({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 });
  add(averagePoint(points));

  // Long edges expose useful room in architectural shapes such as C/L-shaped
  // areas. Limit the expensive containment stage instead of testing interior
  // offsets for every edge.
  const edgeCandidates = points
    .map((start, index) => {
      const end = points[(index + 1) % points.length]!;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      const startFirst = start.x < end.x || (start.x === end.x && start.y <= end.y) ? start : end;
      const endSecond = startFirst === start ? end : start;
      return {
        start: startFirst,
        end: endSecond,
        length,
        center: { x: start.x + dx / 2, y: start.y + dy / 2 },
      };
    })
    .filter((edge) => Number.isFinite(edge.length) && edge.length > 0)
    .sort((left, right) => {
      const scale = Math.max(1, left.length, right.length);
      const tieTolerance = 32 * Number.EPSILON * scale;
      if (Math.abs(left.length - right.length) > tieTolerance) return right.length - left.length;
      if (left.start.x !== right.start.x) return left.start.x - right.start.x;
      if (left.start.y !== right.start.y) return left.start.y - right.start.y;
      if (left.end.x !== right.end.x) return left.end.x - right.end.x;
      return left.end.y - right.end.y;
    })
    .slice(0, 8);
  for (const edge of edgeCandidates) {
    const unitX = (edge.end.x - edge.start.x) / edge.length;
    const unitY = (edge.end.y - edge.start.y) / edge.length;
    const normalX = -unitY;
    const normalY = unitX;
    const support = Math.abs(normalX) * halfWidth + Math.abs(normalY) * halfHeight;
    const numericClearance =
      32 * Number.EPSILON * Math.max(1, Math.abs(edge.center.x), Math.abs(edge.center.y), support);
    const strictOffset = support + Math.max(clearance / 8, numericClearance);
    add({
      x: edge.center.x + normalX * strictOffset,
      y: edge.center.y + normalY * strictOffset,
    });
    add({
      x: edge.center.x - normalX * strictOffset,
      y: edge.center.y - normalY * strictOffset,
    });
  }

  // The final fallback is intentionally a small, fixed grid. It improves
  // coverage of irregular concave interiors without turning layout into an
  // unbounded search or compromising the label-collision broad phase.
  const fractions = [0.5, 0.25, 0.75, 0.125, 0.875] as const;
  const grid = fractions
    .flatMap((xFraction) =>
      fractions.map((yFraction) => ({
        xFraction,
        yFraction,
        distanceFromCenter:
          (xFraction - 0.5) * (xFraction - 0.5) + (yFraction - 0.5) * (yFraction - 0.5),
      })),
    )
    .sort(
      (left, right) =>
        left.distanceFromCenter - right.distanceFromCenter ||
        left.yFraction - right.yFraction ||
        left.xFraction - right.xFraction,
    );
  for (const { xFraction, yFraction } of grid) {
    add({
      x: minCenterX + (maxCenterX - minCenterX) * xFraction,
      y: minCenterY + (maxCenterY - minCenterY) * yFraction,
    });
  }

  return candidates;
}

function overlapsWithGap(
  candidate: OccupiedLabelRect,
  occupied: OccupiedLabelRect,
  gap: number,
): boolean {
  return !(
    candidate.x + candidate.width + gap <= occupied.x ||
    occupied.x + occupied.width + gap <= candidate.x ||
    candidate.y + candidate.height + gap <= occupied.y ||
    occupied.y + occupied.height + gap <= candidate.y
  );
}

function collidesWithOccupied(
  candidate: OccupiedLabelRect,
  occupied: OccupiedLabels,
  gap: number,
  ignoreOccupied?: OccupiedLabelRect | null,
): boolean {
  const visit = (rect: OccupiedLabelRect) => {
    if (rect === ignoreOccupied) return false;
    return overlapsWithGap(candidate, rect, gap);
  };
  if (!Array.isArray(occupied)) {
    return (occupied as LabelCollisionIndex).somePotentialCollision(candidate, gap, visit);
  }
  for (const rect of occupied) if (visit(rect)) return true;
  return false;
}

/**
 * Returns one automatic inside placement when the rendered label genuinely fits
 * the measurement geometry. Returning null is deliberate: callers must then use
 * the pre-existing placement sequence unchanged.
 */
export function placeLabelInsideMeasurementGeometry(
  type: MeasurementType,
  points: readonly Point[],
  dimensions: LabelDimensions,
  page: Pick<LogicalPageBounds, "width" | "height">,
  zoom: number,
  occupied: OccupiedLabels,
  marginScreenPx = LABEL_EDGE_MARGIN_SCREEN_PX,
  gapScreenPx = 4,
  ignoreOccupied?: OccupiedLabelRect | null,
): LabelPlacement | null {
  const safeScale = safeZoom(zoom);
  const gap = finiteNonNegative(gapScreenPx) / safeScale;
  let placement: LabelPlacement | null = null;

  if (type === "line" || type === "polyline") {
    const segmentCandidates: SegmentLabelCandidate[] = [];
    const segmentCount = type === "line" ? Math.min(1, points.length - 1) : points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const candidate = segmentLabelCandidate(
        points[index]!,
        points[index + 1]!,
        dimensions,
        zoom,
        gapScreenPx,
      );
      if (candidate) segmentCandidates.push(candidate);
    }
    segmentCandidates.sort(compareSegmentCandidates);
    for (const segment of segmentCandidates) {
      const candidatePlacement = centeredPlacementWithoutClamping(
        segment.center,
        dimensions,
        page,
        zoom,
        marginScreenPx,
      );
      if (!candidatePlacement) continue;
      placement = candidatePlacement;
      break;
    }
  } else if (type === "polygon") {
    const clearance = finiteNonNegative(gapScreenPx) / safeScale;
    for (const anchor of polygonInteriorAnchors(points, dimensions, clearance)) {
      const candidatePlacement = centeredPlacementWithoutClamping(
        anchor,
        dimensions,
        page,
        zoom,
        marginScreenPx,
      );
      if (!candidatePlacement) continue;
      const expanded = {
        x: candidatePlacement.x - clearance,
        y: candidatePlacement.y - clearance,
        width: finiteNonNegative(dimensions.width) + clearance * 2,
        height: finiteNonNegative(dimensions.height) + clearance * 2,
      };
      if (!isAxisAlignedRectStrictlyInsidePolygon(expanded, points)) continue;
      placement = candidatePlacement;
      break;
    }
  }

  if (!placement) return null;
  const candidate = { ...placement, ...dimensions };
  return collidesWithOccupied(candidate, occupied, gap, ignoreOccupied) ? null : placement;
}

/**
 * Finds the first deterministic nearby placement that stays on the page and
 * does not collide with a previously placed label. The centered placement is
 * retained whenever it is already clear.
 */
export function placeLabelAvoidingOverlaps(
  anchor: Point,
  dimensions: LabelDimensions,
  page: Pick<LogicalPageBounds, "width" | "height">,
  zoom: number,
  occupied: OccupiedLabels,
  marginScreenPx = LABEL_EDGE_MARGIN_SCREEN_PX,
  gapScreenPx = 4,
): LabelPlacement {
  const safeScale = safeZoom(zoom);
  const verticalStep = finiteNonNegative(dimensions.height) + finiteNonNegative(gapScreenPx) / safeScale;
  const horizontalStep = finiteNonNegative(dimensions.width) * 0.65 + finiteNonNegative(gapScreenPx) / safeScale;
  const offsets: readonly Point[] = [
    { x: 0, y: 0 },
    { x: 0, y: -verticalStep },
    { x: 0, y: verticalStep },
    { x: horizontalStep, y: 0 },
    { x: -horizontalStep, y: 0 },
    { x: horizontalStep, y: -verticalStep },
    { x: -horizontalStep, y: -verticalStep },
    { x: horizontalStep, y: verticalStep },
    { x: -horizontalStep, y: verticalStep },
    { x: 0, y: -2 * verticalStep },
    { x: 0, y: 2 * verticalStep },
  ];
  const gap = finiteNonNegative(gapScreenPx) / safeScale;
  let centered: LabelPlacement | null = null;

  for (const offset of offsets) {
    const placement = placeLabelWithinBounds(
      { x: anchor.x + offset.x, y: anchor.y + offset.y },
      dimensions,
      page,
      zoom,
      marginScreenPx,
    );
    centered ??= placement;
    const candidate = { ...placement, ...dimensions };
    if (!collidesWithOccupied(candidate, occupied, gap)) return placement;
  }

  return centered ?? placeLabelWithinBounds(anchor, dimensions, page, zoom, marginScreenPx);
}
