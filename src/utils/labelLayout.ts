import type { LogicalPageBounds, Point } from "../types/domain";

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

export interface LabelCollisionStats {
  broadPhaseCandidates: number;
  exactCollisionChecks: number;
}

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
  stats?: LabelCollisionStats,
): boolean {
  const visit = (rect: OccupiedLabelRect) => {
    if (stats) stats.broadPhaseCandidates += 1;
    if (stats) stats.exactCollisionChecks += 1;
    return overlapsWithGap(candidate, rect, gap);
  };
  if (!Array.isArray(occupied)) {
    return (occupied as LabelCollisionIndex).somePotentialCollision(candidate, gap, visit);
  }
  for (const rect of occupied) if (visit(rect)) return true;
  return false;
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
  stats?: LabelCollisionStats,
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
    if (!collidesWithOccupied(candidate, occupied, gap, stats)) return placement;
  }

  return centered ?? placeLabelWithinBounds(anchor, dimensions, page, zoom, marginScreenPx);
}
