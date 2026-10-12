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
