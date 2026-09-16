// Plan Measure stores geometry in PDF.js viewport units at scale: 1. PDF.js folds
// UserUnit into that viewport, so one stored logical unit represents one 1/72 in point.
export const MILLIMETRES_PER_PDF_POINT = 25.4 / 72;

export function scaleRatioDenominatorFromMillimetresPerPageUnit(
  millimetresPerPageUnit: number,
): number {
  return millimetresPerPageUnit / MILLIMETRES_PER_PDF_POINT;
}

export function millimetresPerPageUnitForScaleRatio(ratioDenominator: number): number {
  return ratioDenominator * MILLIMETRES_PER_PDF_POINT;
}
