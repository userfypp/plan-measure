import { describe, expect, it } from "vitest";
import {
  canvasLayout,
  clampPointToPage,
  clampViewerZoom,
  fitToScreen,
  logicalPageBoundsFromViewport,
  MAX_PDF_RASTER_DIMENSION,
  MAX_PDF_RASTER_PIXELS,
  pageToScreen,
  pdfRasterLayout,
  rotatedPageBounds,
  screenToPage,
  VIEWER_MAX_ZOOM,
  VIEWER_MIN_ZOOM,
  zoomViewAtPoint,
} from "./coordinates";

describe("page and screen coordinates", () => {
  it.each([
    { zoom: 0.25, panX: 0, panY: 0 },
    { zoom: 1, panX: 50, panY: -20 },
    { zoom: 3.5, panX: -200, panY: 125 },
  ])("round trips page to screen to page at $zoom zoom", (transform) => {
    const page = { x: 123.456, y: 789.012 };
    const screen = pageToScreen(page, transform);
    const restored = screenToPage(screen, transform);
    expect(restored.x).toBeCloseTo(page.x, 10);
    expect(restored.y).toBeCloseTo(page.y, 10);
  });

  it("fits and centers a page inside the viewer", () => {
    const result = fitToScreen({ width: 1000, height: 500 }, { width: 800, height: 600 }, 20);
    expect(result.zoom).toBeCloseTo(0.76);
    expect(result.panX).toBeCloseTo(20);
    expect(result.panY).toBeCloseTo(110);
  });

  it("accounts for intrinsic PDF rotation", () => {
    expect(rotatedPageBounds(600, 800, 0)).toMatchObject({ width: 600, height: 800 });
    expect(rotatedPageBounds(600, 800, 90)).toMatchObject({ width: 800, height: 600 });
    expect(rotatedPageBounds(600, 800, 180)).toMatchObject({ width: 600, height: 800 });
    expect(rotatedPageBounds(600, 800, 270)).toMatchObject({ width: 800, height: 600 });
    expect(logicalPageBoundsFromViewport({ width: 800, height: 600, rotation: 90 })).toEqual({
      width: 800,
      height: 600,
      rotation: 90,
    });
  });

  it("uses DPR only for backing resolution", () => {
    const page = { width: 600, height: 800 };
    const transform = { zoom: 1.5, panX: 14, panY: 22 };
    const dpr1 = canvasLayout(page, transform, 1);
    const dpr2 = canvasLayout(page, transform, 2);
    expect(dpr2.cssWidth).toBe(dpr1.cssWidth);
    expect(dpr2.cssHeight).toBe(dpr1.cssHeight);
    expect(dpr2.left).toBe(dpr1.left);
    expect(dpr2.top).toBe(dpr1.top);
    expect(dpr2.backingWidth).toBe(dpr1.backingWidth * 2);
    expect(dpr2.backingHeight).toBe(dpr1.backingHeight * 2);
    expect(screenToPage(pageToScreen({ x: 10, y: 20 }, transform), transform)).toEqual({
      x: 10,
      y: 20,
    });
  });

  it("keeps PDF CSS bounds and the Konva page transform on one zoom", () => {
    const page = { width: 500, height: 400 };
    const transform = { zoom: 2, panX: 30, panY: 40 };
    const layout = canvasLayout(page, transform, 2);
    const bottomRight = pageToScreen({ x: page.width, y: page.height }, transform);
    expect(layout.left + layout.cssWidth).toBe(bottomRight.x);
    expect(layout.top + layout.cssHeight).toBe(bottomRight.y);
  });

  it("maps a pointer to the exact clamped page vertex", () => {
    const transform = { zoom: 2, panX: 40, panY: 30 };
    const page = { width: 500, height: 400 };
    const pointer = pageToScreen({ x: 120, y: 80 }, transform);

    expect(clampPointToPage(screenToPage(pointer, transform), page)).toEqual({ x: 120, y: 80 });
    expect(clampPointToPage(screenToPage({ x: -100, y: 1000 }, transform), page)).toEqual({
      x: 0,
      y: 400,
    });
  });

  it("clamps every logical zoom path to the supported 10–800% range", () => {
    expect(clampViewerZoom(0.01)).toBe(VIEWER_MIN_ZOOM);
    expect(clampViewerZoom(4)).toBe(4);
    expect(clampViewerZoom(20)).toBe(VIEWER_MAX_ZOOM);

    const initial = { zoom: 4, panX: -100, panY: 60 };
    const anchor = { x: 320, y: 240 };
    const pageBefore = screenToPage(anchor, initial);
    const zoomed = zoomViewAtPoint(initial, anchor, 10);
    expect(zoomed.zoom).toBe(8);
    expect(screenToPage(anchor, zoomed)).toEqual(pageBefore);
  });

  it("caps high-zoom PDF raster memory without changing logical CSS bounds", () => {
    const page = { width: 595.276, height: 841.89 };
    const transform = { zoom: 8, panX: -1200, panY: -900 };
    const layout = pdfRasterLayout(page, transform, 2);

    expect(layout.cssWidth).toBeCloseTo(page.width * 8);
    expect(layout.cssHeight).toBeCloseTo(page.height * 8);
    expect(layout.left).toBe(transform.panX);
    expect(layout.top).toBe(transform.panY);
    expect(layout.rasterScale).toBeLessThan(16);
    expect(layout.backingWidth * layout.backingHeight).toBeLessThanOrEqual(
      MAX_PDF_RASTER_PIXELS * 1.001,
    );
    expect(layout.backingWidth).toBeLessThanOrEqual(MAX_PDF_RASTER_DIMENSION);
    expect(layout.backingHeight).toBeLessThanOrEqual(MAX_PDF_RASTER_DIMENSION);
  });

  it("renders at requested zoom and DPR when the raster stays within the cap", () => {
    const layout = pdfRasterLayout({ width: 600, height: 800 }, { zoom: 1, panX: 0, panY: 0 }, 2);
    expect(layout.rasterScale).toBe(2);
    expect(layout.backingWidth).toBe(1200);
    expect(layout.backingHeight).toBe(1600);
  });

  it("keeps the raster cap effective for unusually large logical pages", () => {
    const layout = pdfRasterLayout(
      { width: 100_000, height: 100_000 },
      { zoom: 8, panX: 0, panY: 0 },
      2,
    );
    expect(layout.rasterScale).toBeLessThan(VIEWER_MIN_ZOOM);
    expect(layout.backingWidth * layout.backingHeight).toBeLessThanOrEqual(
      MAX_PDF_RASTER_PIXELS * 1.001,
    );
    expect(layout.backingWidth).toBeLessThanOrEqual(MAX_PDF_RASTER_DIMENSION);
    expect(layout.backingHeight).toBeLessThanOrEqual(MAX_PDF_RASTER_DIMENSION);
  });
});
