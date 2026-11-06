import { describe, expect, it } from "vitest";
import { roundExportNumber } from "./exportNumber";

describe("roundExportNumber", () => {
  it("drops the binary noise past the 15th significant digit", () => {
    expect(roundExportNumber(0.1 + 0.2)).toBe(0.3);
    expect(roundExportNumber(-(0.1 + 0.2))).toBe(-0.3);
    expect(roundExportNumber(2 / 3)).toBe(0.666666666666667);
    // The double nearest 1.118033988749895 is 1.1180339887498949025..., so the 15th digit stays 9.
    expect(roundExportNumber(1.118033988749895)).toBe(1.11803398874989);
  });

  it("keeps a value that already has 15 significant digits or fewer", () => {
    expect(roundExportNumber(123456.789012345)).toBe(123456.789012345);
    expect(roundExportNumber(1.005)).toBe(1.005);
    expect(roundExportNumber(0.005)).toBe(0.005);
    expect(roundExportNumber(1e21)).toBe(1e21);
    expect(roundExportNumber(42)).toBe(42);
  });

  it("rounds large integers and values in exponent notation by significant digits, not decimals", () => {
    expect(roundExportNumber(12345678901234567e3)).toBe(12345678901234600000);
    expect(roundExportNumber(1.234567890123456e-200)).toBe(1.23456789012346e-200);
    expect(roundExportNumber(0.00001234567890123456)).toBe(0.0000123456789012346);
  });

  it("writes zero without a sign", () => {
    expect(Object.is(roundExportNumber(-0), 0)).toBe(true);
  });

  it("keeps the largest finite number instead of rounding it to Infinity", () => {
    expect(roundExportNumber(Number.MAX_VALUE)).toBe(1.7976931348623157e308);
    expect(roundExportNumber(-Number.MAX_VALUE)).toBe(-1.7976931348623157e308);
  });

  it("returns non-finite values unchanged", () => {
    expect(roundExportNumber(Infinity)).toBe(Infinity);
    expect(roundExportNumber(-Infinity)).toBe(-Infinity);
    expect(roundExportNumber(NaN)).toBeNaN();
  });
});
