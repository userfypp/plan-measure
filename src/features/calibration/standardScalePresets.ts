import type { UniformPageCalibration } from "../../types/domain";
import { millimetresPerPageUnitForScaleRatio } from "../../utils/pdfUnits";

export const STANDARD_SCALE_PRESET_RATIOS = [20, 50, 100] as const;

export type StandardScalePresetRatio = (typeof STANDARD_SCALE_PRESET_RATIOS)[number];

const PRESET_REFERENCE_PAGE_UNITS = 72;

export function createStandardScalePreset(
  ratioDenominator: StandardScalePresetRatio,
): Omit<UniformPageCalibration, "id" | "name"> {
  return {
    mode: "uniform",
    start: { x: 0, y: 0 },
    end: { x: PRESET_REFERENCE_PAGE_UNITS, y: 0 },
    referenceDistanceMm:
      PRESET_REFERENCE_PAGE_UNITS * millimetresPerPageUnitForScaleRatio(ratioDenominator),
  };
}
