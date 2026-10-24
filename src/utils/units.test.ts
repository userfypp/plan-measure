import { describe, expect, it } from "vitest";
import {
  fromMillimetres,
  fromSquareMillimetres,
  fromSquareMillimetresToAcres,
  scaleByRatio,
  toMillimetres,
} from "./units";

describe("unit conversions", () => {
  it.each([
    [100, "cm", 10],
    [1000, "m", 1],
    [1000, "mm", 1000],
  ] as const)("converts %s mm to %s", (value, unit, expected) => {
    expect(fromMillimetres(value, unit)).toBe(expected);
    expect(toMillimetres(expected, unit)).toBe(value);
  });

  it("converts square units using the squared linear factor", () => {
    expect(fromSquareMillimetres(1_000_000, "m")).toBe(1);
    expect(fromSquareMillimetres(1_000_000, "cm")).toBe(10_000);
    expect(fromSquareMillimetres(10_000, "cm")).toBe(100);
  });

  it("derives imperial linear conversions from exact integer ratios", () => {
    expect(toMillimetres(1, "in")).toBe(127 / 5);
    expect(toMillimetres(1, "ft")).toBe(1524 / 5);
    expect(toMillimetres(12, "in")).toBe(toMillimetres(1, "ft"));
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

  it("preserves millimetre conversions exactly at IEEE-754 extremes", () => {
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
      expect(toMillimetres(value, "mm")).toBe(value);
      expect(fromMillimetres(value, "mm")).toBe(value);
      expect(fromSquareMillimetres(value, "mm")).toBe(value);
    }
  });

  it("avoids intermediate overflow when the final linear conversion is finite", () => {
    const feet = Number.MAX_VALUE / 1000;
    const feetToMillimetres = toMillimetres(feet, "ft");
    const millimetresToInches = fromMillimetres(Number.MAX_VALUE, "in");

    expect(feet * 1524).toBe(Infinity);
    expect(Number.isFinite(feetToMillimetres)).toBe(true);
    expect(feetToMillimetres).toBe((feet / 5) * 1524);
    expect(Number.isFinite(millimetresToInches)).toBe(true);
    expect(millimetresToInches).toBe((Number.MAX_VALUE / 127) * 5);
    expect(toMillimetres(10, "ft")).toBe(3048);
  });

  it("derives square feet and acres from the same exact foot definition", () => {
    const squareFootMm2 = (1524 * 1524) / 25;
    const acreMm2 = (43_560 * 1524 * 1524) / 25;

    expect(fromSquareMillimetres(squareFootMm2 * 4, "ft")).toBe(4);
    expect(acreMm2).toBe(101_171_410_560 / 25);
    expect(fromSquareMillimetresToAcres(acreMm2)).toBe(1);
  });

  it("keeps finite extreme area conversions finite when the final value is representable", () => {
    expect(Number.isFinite(fromSquareMillimetres(Number.MAX_VALUE, "ft"))).toBe(true);
    expect(Number.isFinite(fromSquareMillimetresToAcres(Number.MAX_VALUE))).toBe(true);
  });
});
