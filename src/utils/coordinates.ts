import { getAppPreferences } from "./appPreferences";
import type { LogicalPageBounds, Point, ViewTransform } from "../types/domain";

export interface ViewerSize {
  width: number;
  height: number;
}

export interface CanvasLayout {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  left: number;
  top: number;
}

export interface PdfRasterLayout extends CanvasLayout {
  rasterScale: number;
}

export const VIEWER_MIN_ZOOM = 0.1;
export const MAX_PDF_RASTER_PIXELS = 16 * 1024 * 1024;
export const MAX_PDF_RASTER_DIMENSION = 8192;

/** Raster limits per render quality (balanced matches the constants above). */
export const PDF_RASTER_QUALITY_LIMITS = {
  balanced: {
    maxPixels: MAX_PDF_RASTER_PIXELS,
    maxDimension: MAX_PDF_RASTER_DIMENSION,
    maxDpr: Infinity,
  },
  sharp: { maxPixels: 32 * 1024 * 1024, maxDimension: MAX_PDF_RASTER_DIMENSION, maxDpr: Infinity },
  fast: { maxPixels: 8 * 1024 * 1024, maxDimension: 4096, maxDpr: 1.5 },
} as const;

/** iOS/iPadOS WebKit caps canvas area near 16.7 Mpx; clamp the raster budget there. */
export function effectiveRasterPixels(maxPixels: number): number {
  if (typeof navigator === "undefined") return maxPixels;
  const touchWebKit =
    navigator.maxTouchPoints > 1 && /iPad|iPhone|Macintosh/.test(navigator.userAgent ?? "");
  return touchWebKit ? Math.min(maxPixels, MAX_PDF_RASTER_PIXELS) : maxPixels;
}

export function logicalPageBoundsFromViewport(viewport: {
  width: number;
  height: number;
  rotation: number;
}): LogicalPageBounds {
  return {
    width: viewport.width,
    height: viewport.height,
    rotation: normalizeRotation(viewport.rotation),
  };
}

export function normalizeRotation(rotation: number): 0 | 90 | 180 | 270 {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

export function pageToScreen(point: Point, transform: ViewTransform): Point {
  return {
    x: transform.panX + point.x * transform.zoom,
    y: transform.panY + point.y * transform.zoom,
  };
}

export function screenToPage(point: Point, transform: ViewTransform): Point {
  return {
    x: (point.x - transform.panX) / transform.zoom,
    y: (point.y - transform.panY) / transform.zoom,
  };
}

export function clampPointToPage(
  point: Point,
  page: Pick<LogicalPageBounds, "width" | "height">,
): Point {
  return {
    x: Math.min(page.width, Math.max(0, point.x)),
    y: Math.min(page.height, Math.max(0, point.y)),
  };
}

export function clampViewerZoom(zoom: number): number {
  return Math.min(getAppPreferences().maxZoom, Math.max(VIEWER_MIN_ZOOM, zoom));
}

export function zoomViewAtPoint(
  transform: ViewTransform,
  screenPoint: Point,
  requestedZoom: number,
): ViewTransform {
  const pagePoint = screenToPage(screenPoint, transform);
  const zoom = clampViewerZoom(requestedZoom);
  return {
    zoom,
    panX: screenPoint.x - pagePoint.x * zoom,
    panY: screenPoint.y - pagePoint.y * zoom,
  };
}

export function fitToScreen(
  page: Pick<LogicalPageBounds, "width" | "height">,
  viewer: ViewerSize,
  padding = 24,
  minZoom = 0,
  maxZoom = getAppPreferences().maxZoom,
): ViewTransform {
  const availableWidth = Math.max(1, viewer.width - padding * 2);
  const availableHeight = Math.max(1, viewer.height - padding * 2);
  const zoom = Math.min(
    maxZoom,
    Math.max(minZoom, Math.min(availableWidth / page.width, availableHeight / page.height)),
  );
  return {
    zoom,
    panX: (viewer.width - page.width * zoom) / 2,
    panY: (viewer.height - page.height * zoom) / 2,
  };
}

/**
 * Initial view of a page. "fit-page" is exactly {@link fitToScreen}; "fit-width" fills the
 * viewer width and starts at the top; "actual" is 100% (zoom 1). Zoom stays within the limits
 * and a page larger than the viewer starts at its top-left corner instead of centred.
 */
export function initialViewTransform(
  mode: "fit-page" | "fit-width" | "actual",
  page: Pick<LogicalPageBounds, "width" | "height">,
  viewer: ViewerSize,
  padding = 24,
  minZoom = 0,
  maxZoom = getAppPreferences().maxZoom,
): ViewTransform {
  if (mode === "fit-page") return fitToScreen(page, viewer, padding, minZoom, maxZoom);
  const availableWidth = Math.max(1, viewer.width - padding * 2);
  const wanted = mode === "fit-width" ? availableWidth / page.width : 1;
  const zoom = Math.min(maxZoom, Math.max(minZoom, wanted));
  const place = (viewerSize: number, pageSize: number) =>
    pageSize <= viewerSize - padding * 2 ? (viewerSize - pageSize) / 2 : padding;
  return {
    zoom,
    panX: place(viewer.width, page.width * zoom),
    panY: place(viewer.height, page.height * zoom),
  };
}

export function pdfRasterLayout(
  page: Pick<LogicalPageBounds, "width" | "height">,
  transform: ViewTransform,
  devicePixelRatio: number,
  maxPixels = MAX_PDF_RASTER_PIXELS,
  maxDimension = MAX_PDF_RASTER_DIMENSION,
): PdfRasterLayout {
  const cssWidth = page.width * transform.zoom;
  const cssHeight = page.height * transform.zoom;
  const desiredScale = transform.zoom * Math.max(1, devicePixelRatio);
  const area = page.width * page.height;
  // The product overflows for extreme pages, so take the square roots separately.
  const areaScaleLimit = Number.isFinite(area)
    ? Math.sqrt(maxPixels / Math.max(1, area))
    : Math.sqrt(maxPixels / page.width) / Math.sqrt(page.height);
  const dimensionScaleLimit = Math.min(
    maxDimension / Math.max(1, page.width),
    maxDimension / Math.max(1, page.height),
  );
  let rasterScale = Math.min(
    Math.max(Number.EPSILON, desiredScale),
    areaScaleLimit,
    dimensionScaleLimit,
  );
  let backingWidth = Math.max(1, Math.ceil(page.width * rasterScale));
  let backingHeight = Math.max(1, Math.ceil(page.height * rasterScale));
  if (backingWidth * backingHeight > maxPixels) {
    // Rounding both sides up can overshoot the budget. Shrink the scale so that
    // (width + 1) × (height + 1), which bounds the rounded size, fits.
    const width = page.width * rasterScale;
    const height = page.height * rasterScale;
    const sum = width + height;
    const spare = maxPixels - 1;
    rasterScale *= (2 * spare) / (sum + Math.sqrt(sum * sum + 4 * width * height * spare));
    backingWidth = Math.max(1, Math.ceil(page.width * rasterScale));
    backingHeight = Math.max(1, Math.ceil(page.height * rasterScale));
  }

  return {
    cssWidth,
    cssHeight,
    backingWidth,
    backingHeight,
    left: transform.panX,
    top: transform.panY,
    rasterScale,
  };
}

export function canvasLayout(
  page: Pick<LogicalPageBounds, "width" | "height">,
  transform: ViewTransform,
  devicePixelRatio: number,
): CanvasLayout {
  const cssWidth = page.width * transform.zoom;
  const cssHeight = page.height * transform.zoom;
  return {
    cssWidth,
    cssHeight,
    backingWidth: Math.max(1, Math.ceil(cssWidth * devicePixelRatio)),
    backingHeight: Math.max(1, Math.ceil(cssHeight * devicePixelRatio)),
    left: transform.panX,
    top: transform.panY,
  };
}

export function isPointInPage(point: Point, page: LogicalPageBounds): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= page.width && point.y <= page.height;
}
