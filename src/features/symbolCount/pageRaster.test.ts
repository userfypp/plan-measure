import { describe, expect, it } from "vitest";
import { MAX_RASTER_PIXELS, chooseRasterScale, rgbaToGray } from "./pageRaster";

describe("chooseRasterScale", () => {
  it("renders a small symbol up to 40 pixels, capped at 4x", () => {
    expect(chooseRasterScale(20, 600, 800)).toBe(2);
    expect(chooseRasterScale(5, 600, 800)).toBe(4);
  });

  it("keeps a large symbol at 1x", () => {
    expect(chooseRasterScale(100, 600, 800)).toBe(1);
    expect(chooseRasterScale(0, 600, 800)).toBe(1);
  });

  it("shrinks the scale so a big page stays within the pixel budget", () => {
    const scale = chooseRasterScale(5, 3000, 2000);
    expect(scale).toBeLessThan(4);
    expect(3000 * 2000 * scale * scale).toBeLessThanOrEqual(MAX_RASTER_PIXELS + 1);
  });
});

describe("rgbaToGray", () => {
  it("weights channels and composites transparency over white", () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 0, 0, 0,
    ]);
    const out = new Uint8Array(5);
    rgbaToGray(rgba, out, 1);
    expect(Array.from(out)).toEqual([0, 0, 255, (255 * 77) >> 8, 255]);
  });
});
