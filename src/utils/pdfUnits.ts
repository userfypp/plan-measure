import { scaleByRatio } from "./units";

// Plan Measure stores geometry in PDF.js viewport units at scale: 1. PDF.js folds
// UserUnit into that viewport, so one stored logical unit represents one 1/72 in point.
const PDF_POINT_MM_NUMERATOR = 127;
const PDF_POINT_MM_DENOMINATOR = 360;
const MAX_RATIO_SIGNIFICANT_DIGITS = 15;
const RATIO_ROUNDING_TOLERANCE_ULPS = 1.5;

export const MILLIMETRES_PER_PDF_POINT = PDF_POINT_MM_NUMERATOR / PDF_POINT_MM_DENOMINATOR;

export function scaleRatioDenominatorFromMillimetresPerPageUnit(
  millimetresPerPageUnit: number,
): number {
  return scaleByRatio(
    millimetresPerPageUnit,
    PDF_POINT_MM_DENOMINATOR,
    PDF_POINT_MM_NUMERATOR,
  );
}

export function cleanScaleRatioDenominator(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const tolerance =
    Number.EPSILON * Math.max(1, Math.abs(value)) * RATIO_ROUNDING_TOLERANCE_ULPS;
  for (
    let significantDigits = 1;
    significantDigits <= MAX_RATIO_SIGNIFICANT_DIGITS;
    significantDigits += 1
  ) {
    const rounded = Number(value.toPrecision(significantDigits));
    if (Math.abs(value - rounded) <= tolerance) return rounded;
  }
  return null;
}

export function practicalScaleRatioDenominator(value: number): number {
  const clean = cleanScaleRatioDenominator(value);
  return clean ?? Number(value.toPrecision(MAX_RATIO_SIGNIFICANT_DIGITS));
}

export function millimetresPerPageUnitForScaleRatio(ratioDenominator: number): number {
  return scaleByRatio(ratioDenominator, PDF_POINT_MM_NUMERATOR, PDF_POINT_MM_DENOMINATOR);
}
