import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  mainPdfBusy,
  mainPdfPage,
  mainPdfRaster,
  mainPdfRenderMs,
  setMainPdfBusy,
  setMainPdfPage,
  setMainPdfRasterSource,
  setMainPdfRenderMs,
  subscribePdfPriority,
} from "./pdfRenderPriority";

/** Each test gets its own document, so the module-level registry never leaks between tests. */
function createDocument() {
  return {} as PDFDocumentProxy;
}

function createCanvas() {
  return {} as HTMLCanvasElement;
}

describe("pdfRenderPriority", () => {
  it("starts on page 1, idle, with no raster or render time", () => {
    const document = createDocument();
    expect(mainPdfPage(document)).toBe(1);
    expect(mainPdfBusy(document)).toBe(false);
    expect(mainPdfRaster(document, 1)).toBeUndefined();
    expect(mainPdfRenderMs(document, 1)).toBeUndefined();
  });

  it("stays busy until every owner releases and notifies only on changes", () => {
    const document = createDocument();
    const first = {};
    const second = {};
    const listener = vi.fn();
    subscribePdfPriority(document, listener);

    setMainPdfBusy(document, first, true);
    setMainPdfBusy(document, first, true);
    expect(listener).toHaveBeenCalledTimes(1);
    setMainPdfBusy(document, second, true);
    expect(listener).toHaveBeenCalledTimes(2);

    setMainPdfBusy(document, first, false);
    expect(mainPdfBusy(document)).toBe(true);
    setMainPdfBusy(document, first, false);
    expect(listener).toHaveBeenCalledTimes(3);
    setMainPdfBusy(document, second, false);
    expect(mainPdfBusy(document)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("stops notifying a listener after it unsubscribes", () => {
    const document = createDocument();
    const listener = vi.fn();
    const unsubscribe = subscribePdfPriority(document, listener);
    unsubscribe();
    setMainPdfBusy(document, {}, true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("tracks the main viewer page", () => {
    const document = createDocument();
    setMainPdfPage(document, 7);
    expect(mainPdfPage(document)).toBe(7);
  });

  it("reads rasters from the current source and ignores a stale disposer", () => {
    const document = createDocument();
    const canvas = createCanvas();
    const disposeFirst = setMainPdfRasterSource(document, (page) =>
      page === 2 ? canvas : undefined,
    );
    expect(mainPdfRaster(document, 2)).toBe(canvas);
    expect(mainPdfRaster(document, 3)).toBeUndefined();

    const replacement = createCanvas();
    const disposeSecond = setMainPdfRasterSource(document, () => replacement);
    disposeFirst();
    expect(mainPdfRaster(document, 2)).toBe(replacement);
    disposeSecond();
    expect(mainPdfRaster(document, 2)).toBeUndefined();
  });

  it("keeps the cheapest completed render time per page", () => {
    const document = createDocument();
    setMainPdfRenderMs(document, 1, 120);
    setMainPdfRenderMs(document, 1, 300);
    expect(mainPdfRenderMs(document, 1)).toBe(120);
    setMainPdfRenderMs(document, 1, 40);
    expect(mainPdfRenderMs(document, 1)).toBe(40);
    expect(mainPdfRenderMs(document, 2)).toBeUndefined();
  });

  it("keeps state separate for each document", () => {
    const first = createDocument();
    const second = createDocument();
    setMainPdfBusy(first, {}, true);
    setMainPdfPage(first, 4);
    setMainPdfRenderMs(first, 1, 50);
    expect(mainPdfBusy(second)).toBe(false);
    expect(mainPdfPage(second)).toBe(1);
    expect(mainPdfRenderMs(second, 1)).toBeUndefined();
  });
});
