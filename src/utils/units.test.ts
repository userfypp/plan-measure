import { describe, expect, it } from "vitest";
import { convertArea, convertLinear, fromSquareMillimetres } from "./units";

describe("unit conversions", () => {
  it.each([
    [100, "mm", "cm", 10],
    [1000, "mm", "m", 1],
    [1, "cm", "mm", 10],
    [100, "cm", "m", 1],
    [1, "m", "cm", 100],
    [1, "m", "mm", 1000],
  ] as const)("converts %s %s to %s", (value, from, to, expected) => {
    expect(convertLinear(value, from, to)).toBe(expected);
  });

  it("converts square units using the squared linear factor", () => {
    expect(convertArea(1_000_000, "mm", "m")).toBe(1);
    expect(convertArea(1, "m", "cm")).toBe(10_000);
    expect(fromSquareMillimetres(10_000, "cm")).toBe(100);
  });
});
