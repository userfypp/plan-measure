import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { LogicalPageBounds, PageState, ViewTransform } from "../../types/domain";

export const PDF_RENDER_DEBOUNCE_MS = 90;
export const MAX_PAN_CACHE_PIXELS = 4 * 1024 * 1024;
export const MAX_PAN_CACHE_DIMENSION = 4096;

export function panCachePixelRatio(
  bounds: LogicalPageBounds,
  zoom: number,
  devicePixelRatio: number,
): number | null {
  const width = Math.ceil(bounds.width);
  const height = Math.ceil(bounds.height);
  if (!(width > 0 && height > 0 && Number.isFinite(width * height))) return null;
  const ratio = Math.min(
    zoom * Math.max(1, devicePixelRatio),
    Math.sqrt(MAX_PAN_CACHE_PIXELS / (width * height)),
    MAX_PAN_CACHE_DIMENSION / Math.max(width, height),
  );
  return Number.isFinite(ratio) &&
    ratio > 0 &&
    Math.floor(width * ratio) > 0 &&
    Math.floor(height * ratio) > 0
    ? ratio
    : null;
}

export interface LoadedPageData {
  document: PDFDocumentProxy;
  pageNumber: number;
  pdfPage: PDFPageProxy;
  bounds: LogicalPageBounds;
}

export interface ReadyRaster {
  page: LoadedPageData;
  canvas: HTMLCanvasElement;
}

export interface RecentRaster {
  document: PDFDocumentProxy;
  cacheKey: string;
  canvas: HTMLCanvasElement;
}

export interface StagePage {
  slot: 0 | 1;
  data: LoadedPageData;
  page: PageState;
  transform: ViewTransform;
  presented: boolean;
}

export function copyRasterToCanvas(source: HTMLCanvasElement, target: HTMLCanvasElement): boolean {
  const context = target.getContext("2d", { alpha: false });
  if (!context) return false;
  if (target.width !== source.width) target.width = source.width;
  if (target.height !== source.height) target.height = source.height;
  context.drawImage(source, 0, 0);
  return true;
}
