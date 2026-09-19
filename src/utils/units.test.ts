import { describe, expect, it } from "vitest";
import {
  convertArea,
  convertLinear,
  fromMillimetres,
  fromSquareMillimetres,
  fromSquareMillimetresToAcres,
  scaleByRatio,
  toMillimetres,
} from "./units";

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

  it("derives imperial linear conversions from exact integer ratios", () => {
    expect(toMillimetres(1, "in")).toBe(127 / 5);
    expect(toMillimetres(1, "ft")).toBe(1524 / 5);
    expect(toMillimetres(12, "in")).toBe(toMillimetres(1, "ft"));
    expect(convertLinear(12, "in", "ft")).toBe(1);
    expect(convertLinear(150, "in", "ft")).toBe(12.5);
    expect(fromMillimetres(3048, "ft")).toBe(10);
    expect(fromMillimetres(3048, "in")).toBe(120);
  });

  it("reduces exact identity ratios without changing the input value", () => {
    const values = [
      0,
      1,
      -1,
      Number.MIN_VALUE,
      -Number.MIN_VALUE,
      Number.MAX_VALUE / 2,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ];

    for (const value of values) {
      expect(scaleByRatio(value, 127, 127)).toBe(value);
      expect(scaleByRatio(value, 7620, 7620)).toBe(value);
    }
  });

  it("preserves same-unit linear conversions exactly at IEEE-754 extremes", () => {
    const values = [
      0,
      1,
      -1,
      Number.MIN_VALUE,
      -Number.MIN_VALUE,
      Number.MAX_VALUE / 2,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ];
    const units = ["mm", "cm", "m", "in", "ft"] as const;

    for (const unit of units) {
      for (const value of values) {
        expect(convertLinear(value, unit, unit)).toBe(value);
      }
    }
  });

  it("avoids intermediate overflow when the final linear conversion is finite", () => {
    const feetToInches = convertLinear(1e307, "ft", "in");
    const inchesToFeet = convertLinear(1e308, "in", "ft");

    expect(Number.isFinite(feetToInches)).toBe(true);
    expect(feetToInches).toBe(1e307 * 12);
    expect(Number.isFinite(inchesToFeet)).toBe(true);
    expect(inchesToFeet).toBe(1e308 / 12);
    expect(convertLinear(10, "ft", "in")).toBe(120);
  });

  it("derives square feet and acres from the same exact foot definition", () => {
    const squareFootMm2 = (1524 * 1524) / 25;
    const acreMm2 = (43_560 * 1524 * 1524) / 25;

    expect(convertArea(1, "ft", "mm")).toBe(squareFootMm2);
    expect(convertArea(43_560, "ft", "mm")).toBe(acreMm2);
    expect(acreMm2).toBe(101_171_410_560 / 25);
    expect(fromSquareMillimetresToAcres(acreMm2)).toBe(1);
  });

  it("preserves same-unit area conversions exactly at IEEE-754 extremes", () => {
    const values = [
      0,
      1,
      -1,
      Number.MIN_VALUE,
      -Number.MIN_VALUE,
      Number.MAX_VALUE / 2,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ];
    const units = ["mm", "cm", "m", "in", "ft"] as const;

    for (const unit of units) {
      for (const value of values) {
        expect(convertArea(value, unit, unit)).toBe(value);
      }
    }
  });

  it("keeps finite extreme area conversions finite when the final value is representable", () => {
    expect(Number.isFinite(fromSquareMillimetres(Number.MAX_VALUE, "ft"))).toBe(true);
    expect(Number.isFinite(fromSquareMillimetresToAcres(Number.MAX_VALUE))).toBe(true);
  });
});
