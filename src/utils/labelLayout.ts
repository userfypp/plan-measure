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
