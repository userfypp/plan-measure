import { describe, expect, it } from "vitest";
import {
  cleanScaleRatioDenominator,
  millimetresPerPageUnitForScaleRatio,
  practicalScaleRatioDenominator,
  scaleRatioDenominatorFromMillimetresPerPageUnit,
} from "./pdfUnits";
import { scaleByRatio } from "./units";

describe("PDF scale units", () => {
  it("uses the exact 127/360 millimetre relationship for one PDF page unit", () => {
    expect(millimetresPerPageUnitForScaleRatio(1)).toBe(scaleByRatio(1, 127, 360));
  });

  it.each([1, 20, 50, 60, 62.5, 62.5125, 100, 100.125])(
    "round-trips a 1:%s denominator through millimetres per page unit",
    (denominator) => {
      const millimetresPerPageUnit = millimetresPerPageUnitForScaleRatio(denominator);
      expect(millimetresPerPageUnit).toBe(scaleByRatio(denominator, 127, 360));
      expect(scaleRatioDenominatorFromMillimetresPerPageUnit(millimetresPerPageUnit)).toBeCloseTo(
        denominator,
        13,
      );
    },
  );

  it("cleans only floating-point noise near practical decimal ratios", () => {
    expect(cleanScaleRatioDenominator(Number("65.34499999999999"))).toBe(65.345);
    expect(cleanScaleRatioDenominator(62.5125)).toBe(62.5125);
    expect(cleanScaleRatioDenominator(Number("283.46456692913387"))).toBeNull();
  });

  it("keeps the significant digits of very small ratios", () => {
    expect(cleanScaleRatioDenominator(1.23456e-15)).toBe(1.23456e-15);
    expect(practicalScaleRatioDenominator(1.23456e-15)).toBe(1.23456e-15);
    const roundTrip = scaleRatioDenominatorFromMillimetresPerPageUnit(
      millimetresPerPageUnitForScaleRatio(1.23456e-15),
    );
    expect(practicalScaleRatioDenominator(roundTrip)).toBe(1.23456e-15);
  });

  it("limits arbitrary ratio prefills to practical numeric precision without two-decimal rounding", () => {
    expect(practicalScaleRatioDenominator(Number("65.34499999999999"))).toBe(65.345);
    expect(practicalScaleRatioDenominator(Number("283.46456692913387"))).toBe(
      Number("283.464566929134"),
    );
  });

  it("treats one page unit as a PDF point of 1/72 inch (25.4 / 72 mm)", () => {
    expect(millimetresPerPageUnitForScaleRatio(1)).toBeCloseTo(25.4 / 72, 15);
    expect(72 * millimetresPerPageUnitForScaleRatio(1)).toBeCloseTo(25.4, 12);
    // At 1:100, one inch of paper (72 points) is 2.54 m.
    expect(72 * millimetresPerPageUnitForScaleRatio(100)).toBeCloseTo(2540, 9);
  });

  it.each([NaN, Infinity, -Infinity])("has no clean ratio for the non-finite value %s", (value) => {
    expect(cleanScaleRatioDenominator(value)).toBeNull();
    expect(practicalScaleRatioDenominator(value)).toBe(value);
  });

  it("passes non-finite values through the unit conversions", () => {
    expect(millimetresPerPageUnitForScaleRatio(NaN)).toBeNaN();
    expect(millimetresPerPageUnitForScaleRatio(Infinity)).toBe(Infinity);
    expect(scaleRatioDenominatorFromMillimetresPerPageUnit(NaN)).toBeNaN();
    expect(scaleRatioDenominatorFromMillimetresPerPageUnit(-Infinity)).toBe(-Infinity);
  });
});
