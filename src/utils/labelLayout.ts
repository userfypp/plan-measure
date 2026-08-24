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

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function safeZoom(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
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
  occupied: readonly OccupiedLabelRect[],
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
    if (!occupied.some((rect) => overlapsWithGap(candidate, rect, gap))) return placement;
  }

  return centered ?? placeLabelWithinBounds(anchor, dimensions, page, zoom, marginScreenPx);
}
