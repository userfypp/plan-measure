import { describe, expect, it } from "vitest";
import {
  cleanScaleRatioDenominator,
  MILLIMETRES_PER_PDF_POINT,
  millimetresPerPageUnitForScaleRatio,
  practicalScaleRatioDenominator,
  scaleRatioDenominatorFromMillimetresPerPageUnit,
} from "./pdfUnits";
import { scaleByRatio } from "./units";

describe("PDF scale units", () => {
  it("uses the exact 127/360 millimetre relationship for one PDF page unit", () => {
    expect(MILLIMETRES_PER_PDF_POINT).toBe(127 / 360);
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

  it("limits arbitrary ratio prefills to practical numeric precision without two-decimal rounding", () => {
    expect(practicalScaleRatioDenominator(Number("65.34499999999999"))).toBe(65.345);
    expect(practicalScaleRatioDenominator(Number("283.46456692913387"))).toBe(
      Number("283.464566929134"),
    );
  });
});
