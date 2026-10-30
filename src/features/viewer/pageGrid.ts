import type { PageGrid } from "../../utils/appPreferences";

/** Target screen spacing (px) of the page grid; the page-unit step snaps to 1/2/5 x 10^n. */
export const PAGE_GRID_TARGET_SCREEN_PX: Record<Exclude<PageGrid, "off">, number> = {
  fine: 24,
  coarse: 96,
};

/**
 * Hard cap on lines per axis so a tiny step can never flood the canvas. The viewer asks for three
 * viewports per axis, which stays under it even on a 4K screen with the fine grid (3 × 3840 / 24).
 */
const MAX_LINES_PER_AXIS = 500;

/** Page-unit rectangle the grid has to cover; lines outside it are left out. */
export interface PageGridRange {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function pageGridStep(grid: PageGrid, zoom: number): number | null {
  if (grid === "off" || !(zoom > 0)) return null;
  const raw = PAGE_GRID_TARGET_SCREEN_PX[grid] / zoom;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Interior multiples of `step` inside `[from, to)`, starting at the first one at or after `from`. */
function gridPositions(step: number, size: number, from: number, to: number): number[] {
  const positions: number[] = [];
  const end = Math.min(size, to);
  for (
    let index = Math.max(1, Math.ceil(Math.max(0, from) / step));
    index * step < end && positions.length < MAX_LINES_PER_AXIS;
    index += 1
  ) {
    positions.push(index * step);
  }
  return positions;
}

/**
 * Flat `[x1, y1, x2, y2, ...]` segments (page units) for vertical then horizontal lines. With a
 * `range`, only the lines inside it are generated, so the per-axis cap applies to what is on
 * screen rather than to the start of the page.
 */
export function pageGridLines(
  grid: PageGrid,
  zoom: number,
  width: number,
  height: number,
  range: PageGridRange = { left: 0, top: 0, right: width, bottom: height },
): { vertical: number[]; horizontal: number[] } {
  const step = pageGridStep(grid, zoom);
  if (!step || width <= 0 || height <= 0) return { vertical: [], horizontal: [] };
  return {
    vertical: gridPositions(step, width, range.left, range.right).flatMap((x) => [x, 0, x, height]),
    horizontal: gridPositions(step, height, range.top, range.bottom).flatMap((y) => [
      0,
      y,
      width,
      y,
    ]),
  };
}
