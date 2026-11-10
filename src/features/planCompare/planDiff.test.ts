import { describe, expect, it } from "vitest";
import type { GrayImage } from "../symbolCount/templateMatch";
import { diffPlans, type PlanDiffPalette } from "./planDiff";

const palette: PlanDiffPalette = {
  paper: [255, 255, 255],
  common: [100, 100, 100],
  added: [0, 150, 0],
  removed: [200, 0, 0],
};

function image(width: number, height: number, ink: [number, number][]): GrayImage {
  const data = new Uint8Array(width * height).fill(255);
  for (const [x, y] of ink) data[y * width + x] = 0;
  return { data, width, height };
}

function colorAt(result: ReturnType<typeof diffPlans>, x: number, y: number) {
  const at = (y * result.width + x) * 4;
  return Array.from(result.rgba.slice(at, at + 4));
}

const opaque = (rgb: readonly number[]) => [...rgb, 255];

describe("diffPlans", () => {
  it("keeps paper, shared ink, added ink and removed ink apart", () => {
    const current = image(20, 20, [
      [2, 2],
      [10, 10],
    ]);
    const other = image(20, 20, [
      [2, 2],
      [17, 3],
    ]);
    const result = diffPlans(current, other, 0, 0, palette);
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
    expect(colorAt(result, 2, 2)).toEqual(opaque(palette.common));
    expect(colorAt(result, 10, 10)).toEqual(opaque(palette.added));
    expect(colorAt(result, 17, 3)).toEqual(opaque(palette.removed));
    expect(colorAt(result, 0, 19)).toEqual(opaque(palette.paper));
  });

  it("does not count ink one pixel away as a change", () => {
    const current = image(12, 12, [[5, 5]]);
    const other = image(12, 12, [[6, 6]]);
    const result = diffPlans(current, other, 0, 0, palette);
    expect(colorAt(result, 5, 5)).toEqual(opaque(palette.common));
    expect(colorAt(result, 6, 6)).toEqual(opaque(palette.common));
  });

  it("counts ink two pixels away as a change", () => {
    const current = image(12, 12, [[5, 5]]);
    const other = image(12, 12, [[7, 5]]);
    const result = diffPlans(current, other, 0, 0, palette);
    expect(colorAt(result, 5, 5)).toEqual(opaque(palette.added));
    expect(colorAt(result, 7, 5)).toEqual(opaque(palette.removed));
  });

  it("moves the other image before comparing", () => {
    const current = image(12, 12, [[8, 4]]);
    const other = image(12, 12, [[5, 2]]);
    expect(colorAt(diffPlans(current, other, 0, 0, palette), 8, 4)).toEqual(opaque(palette.added));
    const moved = diffPlans(current, other, 3, 2, palette);
    expect(colorAt(moved, 8, 4)).toEqual(opaque(palette.common));
    expect(colorAt(moved, 5, 2)).toEqual(opaque(palette.paper));
  });

  it("leaves what is moved out of the frame, and what has no counterpart, as paper", () => {
    const current = image(10, 10, []);
    const other = image(6, 6, [
      [0, 0],
      [5, 5],
    ]);
    const result = diffPlans(current, other, 8, 8, palette);
    expect(colorAt(result, 8, 8)).toEqual(opaque(palette.removed));
    expect(Array.from(result.rgba.slice(0, 4))).toEqual(opaque(palette.paper));
    expect(result.rgba.length).toBe(10 * 10 * 4);
  });

  it("treats pixels lighter than the ink threshold as paper", () => {
    const current: GrayImage = { data: new Uint8Array([200, 255]), width: 2, height: 1 };
    const other: GrayImage = { data: new Uint8Array([255, 255]), width: 2, height: 1 };
    expect(colorAt(diffPlans(current, other, 0, 0, palette), 0, 0)).toEqual(opaque(palette.paper));
  });
});
