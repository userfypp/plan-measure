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
  normalizeRotation,
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

describe("normalizeRotation", () => {
  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
    [360, 0],
    [450, 90],
    [720, 0],
    [-90, 270],
    [-180, 180],
    [-270, 90],
    [-450, 270],
  ])("turns %i degrees into %i", (rotation, expected) => {
    expect(normalizeRotation(rotation)).toBe(expected);
  });

  it.each([45, 89.9, 90.5, 135, NaN, Infinity, -Infinity])(
    "treats %s, which is not a quarter turn, as no rotation",
    (rotation) => {
      expect(normalizeRotation(rotation)).toBe(0);
    },
  );
});

describe("logicalPageBoundsFromViewport", () => {
  it("keeps the viewport's own width and height, which already include its rotation", () => {
    // A portrait 600 x 800 page rotated a quarter turn is shown as 800 x 600.
    expect(logicalPageBoundsFromViewport({ width: 800, height: 600, rotation: 90 })).toEqual({
      width: 800,
      height: 600,
      rotation: 90,
    });
    expect(logicalPageBoundsFromViewport({ width: 600, height: 800, rotation: 0 })).toEqual({
      width: 600,
      height: 800,
      rotation: 0,
    });
  });

  it("normalizes the rotation without touching the size", () => {
    expect(logicalPageBoundsFromViewport({ width: 3, height: 7, rotation: -90 })).toEqual({
      width: 3,
      height: 7,
      rotation: 270,
    });
    expect(logicalPageBoundsFromViewport({ width: 3, height: 7, rotation: 450 })).toEqual({
      width: 3,
      height: 7,
      rotation: 90,
    });
  });
});

describe("isPointInPage", () => {
  const page = { width: 10, height: 5, rotation: 0 as const };

  it.each([
    ["the top-left corner", { x: 0, y: 0 }, true],
    ["the bottom-right corner", { x: 10, y: 5 }, true],
    ["the middle of the right edge", { x: 10, y: 2.5 }, true],
    ["the middle of the bottom edge", { x: 5, y: 5 }, true],
    ["just past the right edge", { x: 10.000001, y: 2 }, false],
    ["just past the bottom edge", { x: 5, y: 5.000001 }, false],
    ["just before the left edge", { x: -0.000001, y: 2 }, false],
    ["just above the top edge", { x: 5, y: -0.000001 }, false],
    [
      "x between the height and the width, which a width/height swap would reject",
      { x: 6, y: 5 },
      true,
    ],
    ["y beyond the height", { x: 1, y: 6 }, false],
    ["NaN", { x: Number.NaN, y: 1 }, false],
    ["Infinity", { x: 1, y: Infinity }, false],
  ])("%s", (_label, point, expected) => {
    expect(isPointInPage(point, page)).toBe(expected);
  });
});

describe("clampPointToPage", () => {
  const page = { width: 10, height: 5 };

  it("leaves a point inside the page alone and pulls others to the nearest edge", () => {
    expect(clampPointToPage({ x: 3, y: 4 }, page)).toEqual({ x: 3, y: 4 });
    expect(clampPointToPage({ x: -3, y: 9 }, page)).toEqual({ x: 0, y: 5 });
    expect(clampPointToPage({ x: 11, y: -1 }, page)).toEqual({ x: 10, y: 0 });
  });

  it("clamps infinite coordinates to the page", () => {
    expect(clampPointToPage({ x: Infinity, y: -Infinity }, page)).toEqual({ x: 10, y: 0 });
  });
});

describe("zoom limits for unusual numbers", () => {
  it("clamps infinite zoom to the limits and treats negative zoom as the minimum", () => {
    expect(clampViewerZoom(Infinity)).toBe(DEFAULT_APP_PREFERENCES.maxZoom);
    expect(clampViewerZoom(-Infinity)).toBe(VIEWER_MIN_ZOOM);
    expect(clampViewerZoom(-3)).toBe(VIEWER_MIN_ZOOM);
    expect(clampViewerZoom(0)).toBe(VIEWER_MIN_ZOOM);
  });

  it("falls back to actual size for NaN instead of corrupting the view", () => {
    expect(clampViewerZoom(Number.NaN)).toBe(1);
    const view = zoomViewAtPoint({ zoom: 2, panX: 10, panY: 20 }, { x: 50, y: 60 }, Number.NaN);
    expect(Number.isFinite(view.zoom)).toBe(true);
    expect(Number.isFinite(view.panX)).toBe(true);
    expect(Number.isFinite(view.panY)).toBe(true);
  });

  it("keeps the point under the cursor fixed at the exact limits", () => {
    const view = { zoom: 2, panX: -40, panY: 30 };
    const anchor = { x: 200, y: 150 };
    const before = screenToPage(anchor, view);
    for (const requested of [VIEWER_MIN_ZOOM, DEFAULT_APP_PREFERENCES.maxZoom]) {
      const zoomed = zoomViewAtPoint(view, anchor, requested);
      expect(zoomed.zoom).toBe(requested);
      const after = screenToPage(anchor, zoomed);
      expect(after.x).toBeCloseTo(before.x, 10);
      expect(after.y).toBeCloseTo(before.y, 10);
    }
  });
});

describe("fitToScreen edge cases", () => {
  it("fits a wide page by width and a tall page by height, centring the other axis", () => {
    const viewer = { width: 800, height: 600 };
    // Available area is 752 x 552 with the default 24 px padding.
    const wide = fitToScreen({ width: 1504, height: 100 }, viewer, 24, 0, 16);
    expect(wide.zoom).toBe(0.5);
    expect(wide.panX).toBe(24);
    expect(wide.panY).toBe(275);
    const tall = fitToScreen({ width: 100, height: 1104 }, viewer, 24, 0, 16);
    expect(tall.zoom).toBe(0.5);
    expect(tall.panX).toBe(375);
    expect(tall.panY).toBe(24);
  });

  it("never exceeds the maximum zoom for a tiny page", () => {
    expect(fitToScreen({ width: 1, height: 1 }, { width: 800, height: 600 }, 24, 0, 8).zoom).toBe(
      8,
    );
  });

  it("raises the zoom to the requested minimum even when the page does not fit", () => {
    expect(
      fitToScreen({ width: 10000, height: 10000 }, { width: 800, height: 600 }, 24, 0.25, 8).zoom,
    ).toBe(0.25);
  });

  it("keeps a usable positive zoom in a viewer that has no room left", () => {
    const view = fitToScreen({ width: 100, height: 100 }, { width: 10, height: 10 });
    expect(view.zoom).toBeGreaterThan(0);
    expect(Number.isFinite(view.panX)).toBe(true);
  });
});
