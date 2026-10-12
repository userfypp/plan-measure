import type { PageGrid } from "../../utils/appPreferences";

/** Target screen spacing (px) of the page grid; the page-unit step snaps to 1/2/5 x 10^n. */
export const PAGE_GRID_TARGET_SCREEN_PX: Record<Exclude<PageGrid, "off">, number> = {
  fine: 24,
  coarse: 96,
};

/** Hard cap on lines per axis so a tiny step can never flood the canvas. */
const MAX_LINES_PER_AXIS = 200;

export function pageGridStep(grid: PageGrid, zoom: number): number | null {
  if (grid === "off" || !(zoom > 0)) return null;
  const raw = PAGE_GRID_TARGET_SCREEN_PX[grid] / zoom;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Flat `[x1, y1, x2, y2, ...]` segments (page units) for vertical then horizontal lines. */
export function pageGridLines(
  grid: PageGrid,
  zoom: number,
  width: number,
  height: number,
): { vertical: number[]; horizontal: number[] } {
  const step = pageGridStep(grid, zoom);
  const vertical: number[] = [];
  const horizontal: number[] = [];
  if (!step || width <= 0 || height <= 0) return { vertical, horizontal };
  for (let x = step, n = 0; x < width && n < MAX_LINES_PER_AXIS; x += step, n += 1) {
    vertical.push(x, 0, x, height);
  }
  for (let y = step, n = 0; y < height && n < MAX_LINES_PER_AXIS; y += step, n += 1) {
    horizontal.push(0, y, width, y);
  }
  return { vertical, horizontal };
}
