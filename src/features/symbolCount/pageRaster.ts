import type { PDFPageProxy } from "pdfjs-dist";
import type { LogicalPageBounds } from "../../types/domain";
import type { GrayImage } from "./templateMatch";

/** The boxed symbol is rendered at least this many pixels on its long side. */
const TARGET_SYMBOL_PIXELS = 40;
const MIN_SCALE = 1;
const MAX_SCALE = 4;
export const MAX_RASTER_PIXELS = 12_000_000;
const BAND_ROWS = 256;

/**
 * Pixels per page unit for the search raster: big enough for a small symbol to keep its detail,
 * reduced so the whole page stays within `MAX_RASTER_PIXELS`.
 */
export function chooseRasterScale(
  boxLongSide: number,
  pageWidth: number,
  pageHeight: number,
): number {
  const wanted =
    boxLongSide > 0
      ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, TARGET_SYMBOL_PIXELS / boxLongSide))
      : MIN_SCALE;
  const area = pageWidth * pageHeight;
  if (area <= 0) return wanted;
  return Math.min(wanted, Math.sqrt(MAX_RASTER_PIXELS / area));
}

/** Converts RGBA pixels to luminance over a white page, writing from `offset` in `out`. */
export function rgbaToGray(rgba: Uint8ClampedArray, out: Uint8Array, offset = 0): void {
  const count = rgba.length >> 2;
  for (let i = 0; i < count; i += 1) {
    const at = i << 2;
    const alpha = rgba[at + 3]!;
    const gray = (rgba[at]! * 77 + rgba[at + 1]! * 150 + rgba[at + 2]! * 29) >> 8;
    out[offset + i] = alpha === 255 ? gray : (gray * alpha + 255 * (255 - alpha) + 127) / 255;
  }
}

/** Renders the page at `scale` (raster pixels per logical page unit) as a grayscale image. */
export async function renderPageGray(
  pdfPage: PDFPageProxy,
  bounds: LogicalPageBounds,
  scale: number,
  signal: AbortSignal,
): Promise<GrayImage> {
  const viewport = pdfPage.getViewport({ scale, rotation: bounds.rotation });
  const width = Math.max(1, Math.round(viewport.width));
  const height = Math.max(1, Math.round(viewport.height));
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("The page could not be rendered.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  const task = pdfPage.render({ canvas, canvasContext: context, viewport });
  const abort = () => task.cancel();
  signal.addEventListener("abort", abort);
  try {
    await task.promise;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y += BAND_ROWS) {
      const rows = Math.min(BAND_ROWS, height - y);
      rgbaToGray(context.getImageData(0, y, width, rows).data, data, y * width);
    }
    return { data, width, height };
  } finally {
    signal.removeEventListener("abort", abort);
    canvas.width = 0;
    canvas.height = 0;
  }
}
