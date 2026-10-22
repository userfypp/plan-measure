import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_PREFERENCES } from "./appPreferences";
import {
  canvasLayout,
  clampPointToPage,
  clampViewerZoom,
  effectiveRasterPixels,
  fitToScreen,
  initialViewTransform,
  isPointInPage,
  logicalPageBoundsFromViewport,
  MAX_PDF_RASTER_DIMENSION,
  MAX_PDF_RASTER_PIXELS,
  pageToScreen,
  PDF_RASTER_QUALITY_LIMITS,
  pdfRasterLayout,
  screenToPage,
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

  it("fits below the manual minimum when the whole page requires it", () => {
    const result = fitToScreen({ width: 10000, height: 5000 }, { width: 800, height: 600 }, 20);
    expect(result.zoom).toBeCloseTo(0.076);
    expect(result.zoom).toBeLessThan(VIEWER_MIN_ZOOM);
    expect(result.panX).toBeCloseTo(20);
    expect(result.panY).toBeCloseTo(110);
  });

  it.each([
    { rotation: 0, width: 600, height: 800 },
    { rotation: 90, width: 800, height: 600 },
    { rotation: 180, width: 600, height: 800 },
    { rotation: 270, width: 800, height: 600 },
  ])("uses the PDF.js viewport bounds for intrinsic $rotation° rotation", (viewport) => {
    const page = logicalPageBoundsFromViewport(viewport);
    expect(page).toEqual(viewport);

    const transform = { zoom: 1.5, panX: 37, panY: -18 };
    const corners = [
      { x: 0, y: 0 },
      { x: page.width, y: 0 },
      { x: page.width, y: page.height },
      { x: 0, y: page.height },
    ];
    for (const corner of corners) {
      const logicalPoint = screenToPage(pageToScreen(corner, transform), transform);
      expect(isPointInPage(logicalPoint, page)).toBe(true);
    }
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

  it("clamps manual zoom to the supported 10–800% range", () => {
    expect(clampViewerZoom(0.01)).toBe(VIEWER_MIN_ZOOM);
    expect(clampViewerZoom(4)).toBe(4);
    expect(clampViewerZoom(20)).toBe(DEFAULT_APP_PREFERENCES.maxZoom);

    const initial = { zoom: 4, panX: -100, panY: 60 };
    const anchor = { x: 320, y: 240 };
    const pageBefore = screenToPage(anchor, initial);
    const zoomedOut = zoomViewAtPoint(initial, anchor, 0.01);
    expect(zoomedOut.zoom).toBe(VIEWER_MIN_ZOOM);
    expect(screenToPage(anchor, zoomedOut)).toEqual(pageBefore);
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

  it("keeps a 48 × 36 inch page at actual size within the pixel budget once rounded up", () => {
    const layout = pdfRasterLayout({ width: 3456, height: 2592 }, { zoom: 1, panX: 0, panY: 0 }, 2);
    expect(layout.backingWidth * layout.backingHeight).toBeLessThanOrEqual(MAX_PDF_RASTER_PIXELS);
    expect(layout.backingWidth * layout.backingHeight).toBeGreaterThan(
      MAX_PDF_RASTER_PIXELS * 0.999,
    );
  });

  it.each(Object.keys(PDF_RASTER_QUALITY_LIMITS) as (keyof typeof PDF_RASTER_QUALITY_LIMITS)[])(
    "never rounds a %s raster past its pixel budget",
    (quality) => {
      const { maxPixels, maxDimension, maxDpr } = PDF_RASTER_QUALITY_LIMITS[quality];
      for (const width of [595.276, 1234.567, 3456, 7919.3]) {
        for (const height of [841.89, 2592, 4001.7]) {
          for (const zoom of [1, 2.5, 8]) {
            for (const dpr of [1, 1.5, 2, 3]) {
              const layout = pdfRasterLayout(
                { width, height },
                { zoom, panX: 0, panY: 0 },
                Math.min(dpr, maxDpr),
                maxPixels,
                maxDimension,
              );
              expect(layout.backingWidth * layout.backingHeight).toBeLessThanOrEqual(maxPixels);
            }
          }
        }
      }
    },
  );

  it.each([
    { width: 1e20, height: 1e20 },
    { width: 1e20, height: 1e5 },
    { width: 1e200, height: 1e200 },
    { width: 1e308, height: 1e308 },
  ])("keeps the raster cap for an extreme $width × $height page", (page) => {
    const layout = pdfRasterLayout(page, { zoom: 1, panX: 0, panY: 0 }, 2);
    expect(layout.rasterScale).toBeGreaterThan(0);
    expect(layout.backingWidth * layout.backingHeight).toBeLessThanOrEqual(MAX_PDF_RASTER_PIXELS);
    expect(layout.backingWidth).toBeLessThanOrEqual(MAX_PDF_RASTER_DIMENSION);
    expect(layout.backingHeight).toBeLessThanOrEqual(MAX_PDF_RASTER_DIMENSION);
  });
});

describe("render quality limits", () => {
  const huge = { width: 100_000, height: 100_000 };
  const transform = { zoom: 8, panX: 0, panY: 0 };
  const raster = (quality: keyof typeof PDF_RASTER_QUALITY_LIMITS, dpr = 2) => {
    const { maxPixels, maxDimension, maxDpr } = PDF_RASTER_QUALITY_LIMITS[quality];
    return pdfRasterLayout(huge, transform, Math.min(dpr, maxDpr), maxPixels, maxDimension);
  };

  it("balanced is identical to the default limits", () => {
    expect(raster("balanced")).toEqual(pdfRasterLayout(huge, transform, 2));
    const page = { width: 600, height: 800 };
    const { maxPixels, maxDimension } = PDF_RASTER_QUALITY_LIMITS.balanced;
    expect(pdfRasterLayout(page, transform, 2, maxPixels, maxDimension)).toEqual(
      pdfRasterLayout(page, transform, 2),
    );
  });

  it("fast caps at 8 Mpx / 4096 and sharp at 32 Mpx / 8192", () => {
    const fast = raster("fast");
    expect(fast.backingWidth * fast.backingHeight).toBeLessThanOrEqual(8 * 1024 * 1024 * 1.001);
    expect(fast.backingWidth).toBeLessThanOrEqual(4096);
    const sharp = raster("sharp");
    expect(sharp.backingWidth * sharp.backingHeight).toBeGreaterThan(MAX_PDF_RASTER_PIXELS);
    expect(sharp.backingWidth).toBeLessThanOrEqual(MAX_PDF_RASTER_DIMENSION);
  });

  it("fast limits the pixel ratio to 1.5", () => {
    const page = { width: 600, height: 800 };
    const { maxPixels, maxDimension, maxDpr } = PDF_RASTER_QUALITY_LIMITS.fast;
    const layout = pdfRasterLayout(
      page,
      { zoom: 1, panX: 0, panY: 0 },
      Math.min(3, maxDpr),
      maxPixels,
      maxDimension,
    );
    expect(layout.rasterScale).toBe(1.5);
  });
});

describe("initialViewTransform", () => {
  const page = { width: 1000, height: 2000 };
  const viewer = { width: 800, height: 600 };

  it("fit-page is exactly fitToScreen", () => {
    expect(initialViewTransform("fit-page", page, viewer)).toEqual(fitToScreen(page, viewer));
  });

  it("fit-width fills the width and starts at the top of a tall page", () => {
    const view = initialViewTransform("fit-width", page, viewer, 24, 0, 16);
    expect(view.zoom).toBeCloseTo((800 - 48) / 1000);
    expect(view.panX).toBeCloseTo(24);
    expect(view.panY).toBe(24);
  });

  it("actual is 100% and respects the zoom limits", () => {
    const view = initialViewTransform("actual", { width: 400, height: 300 }, viewer, 24, 0, 16);
    expect(view).toEqual({ zoom: 1, panX: 200, panY: 150 });
    expect(initialViewTransform("actual", page, viewer, 24, 2, 16).zoom).toBe(2);
  });
});

describe("effectiveRasterPixels", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clamps to 16 Mpx on touch WebKit only", () => {
    const sharp = PDF_RASTER_QUALITY_LIMITS.sharp.maxPixels;
    vi.stubGlobal("navigator", { maxTouchPoints: 5, userAgent: "Mozilla (Macintosh) Safari" });
    expect(effectiveRasterPixels(sharp)).toBe(MAX_PDF_RASTER_PIXELS);
    expect(effectiveRasterPixels(8 * 1024 * 1024)).toBe(8 * 1024 * 1024);
    vi.stubGlobal("navigator", { maxTouchPoints: 0, userAgent: "Macintosh" });
    expect(effectiveRasterPixels(sharp)).toBe(sharp);
    vi.stubGlobal("navigator", undefined);
    expect(effectiveRasterPixels(sharp)).toBe(sharp);
  });
});
