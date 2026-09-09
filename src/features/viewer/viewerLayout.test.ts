import { describe, expect, it } from "vitest";
import { fitToScreen } from "../../utils/coordinates";
import { safeViewerLayout } from "./viewerLayout";

describe("safeViewerLayout", () => {
  it("excludes the dock height and bottom inset without changing the horizontal viewport", () => {
    expect(safeViewerLayout({ width: 1000, height: 800 }, 56)).toEqual({
      size: { width: 1000, height: 744 },
      center: { x: 500, y: 372 },
    });
  });

  it("represents an unavailable safe viewport explicitly when exclusion consumes the height", () => {
    expect(safeViewerLayout({ width: 320, height: 40 }, 39)).toEqual({
      size: { width: 320, height: 1 },
      center: { x: 160, y: 0.5 },
    });
    expect(safeViewerLayout({ width: 320, height: 40 }, 40)).toEqual({
      size: { width: 320, height: 0 },
      center: null,
    });
    expect(safeViewerLayout({ width: 320, height: 40 }, 80)).toEqual({
      size: { width: 320, height: 0 },
      center: null,
    });
    expect(safeViewerLayout({ width: 0, height: 0 }, 56)).toEqual({
      size: { width: 0, height: 0 },
      center: null,
    });
    expect(safeViewerLayout({ width: 0, height: 80 }, 20)).toEqual({
      size: { width: 0, height: 60 },
      center: null,
    });
  });

  it("fits and centers a page inside the safe rectangle rather than behind the dock", () => {
    const safe = safeViewerLayout({ width: 1000, height: 800 }, 56);
    const transform = fitToScreen({ width: 600, height: 900 }, safe.size);
    const pageBottom = transform.panY + 900 * transform.zoom;

    expect(transform.panY).toBeGreaterThanOrEqual(24);
    expect(pageBottom).toBeLessThanOrEqual(safe.size.height - 24);
    expect(safe.center).not.toBeNull();
    expect(transform.panY + (900 * transform.zoom) / 2).toBeCloseTo(safe.center!.y);
  });
});
