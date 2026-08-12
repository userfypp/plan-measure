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
export const VIEWER_MAX_ZOOM = 8;
export const VIEWER_ZOOM_STEP = 1.25;
export const MAX_PDF_RASTER_PIXELS = 16 * 1024 * 1024;
export const MAX_PDF_RASTER_DIMENSION = 8192;

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

export function rotatedPageBounds(
  unrotatedWidth: number,
  unrotatedHeight: number,
  rotation: number,
): LogicalPageBounds {
  const normalized = normalizeRotation(rotation);
  const swapsAxes = normalized === 90 || normalized === 270;
  return {
    width: swapsAxes ? unrotatedHeight : unrotatedWidth,
    height: swapsAxes ? unrotatedWidth : unrotatedHeight,
    rotation: normalized,
  };
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

export function clampViewerZoom(zoom: number): number {
  return Math.min(VIEWER_MAX_ZOOM, Math.max(VIEWER_MIN_ZOOM, zoom));
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
  minZoom = VIEWER_MIN_ZOOM,
  maxZoom = VIEWER_MAX_ZOOM,
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
  const areaScaleLimit = Math.sqrt(maxPixels / Math.max(1, page.width * page.height));
  const dimensionScaleLimit = Math.min(
    maxDimension / Math.max(1, page.width),
    maxDimension / Math.max(1, page.height),
  );
  const rasterScale = Math.max(
    Number.EPSILON,
    Math.min(desiredScale, areaScaleLimit, dimensionScaleLimit),
  );

  return {
    cssWidth,
    cssHeight,
    backingWidth: Math.max(1, Math.ceil(page.width * rasterScale)),
    backingHeight: Math.max(1, Math.ceil(page.height * rasterScale)),
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
