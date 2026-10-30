import { describe, expect, it } from "vitest";
import { pageGridLines, pageGridStep } from "./pageGrid";

describe("page grid", () => {
  it("is absent when off and snaps the step to 1/2/5 x 10^n", () => {
    expect(pageGridStep("off", 1)).toBeNull();
    expect(pageGridStep("fine", 1)).toBe(50);
    expect(pageGridStep("coarse", 1)).toBe(100);
    expect(pageGridStep("fine", 4)).toBe(10);
  });

  it("keeps a roughly constant on-screen spacing across zoom levels", () => {
    for (const zoom of [0.1, 0.37, 1, 2.5, 8]) {
      const screen = pageGridStep("fine", zoom)! * zoom;
      expect(screen).toBeGreaterThanOrEqual(24 - 1e-9);
      expect(screen).toBeLessThanOrEqual(24 * 2.5 + 1e-9);
    }
  });

  it("generates interior lines only and never floods the canvas", () => {
    expect(pageGridLines("off", 1, 100, 100)).toEqual({ vertical: [], horizontal: [] });
    const lines = pageGridLines("coarse", 1, 250, 100);
    expect(lines.vertical).toEqual([100, 0, 100, 100, 200, 0, 200, 100]);
    expect(lines.horizontal).toEqual([]);
    expect(pageGridLines("fine", 1e-9, 1e12, 1e12).vertical.length).toBeLessThanOrEqual(800);
  });
});

describe("page grid range", () => {
  it("covers a range deep into a large page instead of stopping after the first lines", () => {
    // A0 landscape in PDF points at 8× with the fine grid: a step of 5, about 674 lines per axis.
    const step = pageGridStep("fine", 8)!;
    expect(step).toBe(5);
    const lines = pageGridLines("fine", 8, 3370, 2384, {
      left: 3000,
      top: 2000,
      right: 3200,
      bottom: 2100,
    });

    const xs = lines.vertical.filter((_, index) => index % 4 === 0);
    const ys = lines.horizontal.filter((_, index) => index % 4 === 1);
    expect(xs[0]).toBe(3000);
    expect(xs.at(-1)).toBe(3195);
    expect(xs).toHaveLength(40);
    expect(ys[0]).toBe(2000);
    expect(ys.at(-1)).toBe(2095);
    // Lines still span the whole page in the other direction.
    expect(lines.vertical.slice(0, 4)).toEqual([3000, 0, 3000, 2384]);
  });

  it("clamps the range to the page and starts at the first multiple of the step inside it", () => {
    const lines = pageGridLines("coarse", 1, 250, 100, {
      left: -500,
      top: -500,
      right: 1000,
      bottom: 1000,
    });
    expect(lines.vertical).toEqual([100, 0, 100, 100, 200, 0, 200, 100]);
    expect(lines.horizontal).toEqual([]);

    // At 200× the fine step is 0.2 page units.
    const fractional = pageGridLines("fine", 200, 1, 1, {
      left: 0.3,
      top: 0,
      right: 0.95,
      bottom: 0,
    });
    const xs = fractional.vertical.filter((_, index) => index % 4 === 0);
    expect(xs).toHaveLength(3);
    [0.4, 0.6, 0.8].forEach((x, index) => expect(xs[index]).toBeCloseTo(x, 12));
  });

  it("is empty when the range misses the page", () => {
    expect(
      pageGridLines("fine", 1, 100, 100, { left: 200, top: 200, right: 300, bottom: 300 }),
    ).toEqual({ vertical: [], horizontal: [] });
  });
});
