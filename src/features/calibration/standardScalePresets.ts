import type { UniformPageCalibration } from "../../types/domain";
import { createPageCalibrationFromRatio } from "./ratioCalibration";

export const STANDARD_SCALE_PRESET_RATIOS = [20, 50, 100] as const;

export type StandardScalePresetRatio = (typeof STANDARD_SCALE_PRESET_RATIOS)[number];

export function createStandardScalePreset(
  ratioDenominator: StandardScalePresetRatio,
): Omit<UniformPageCalibration, "id" | "name"> {
  return createPageCalibrationFromRatio({ mode: "uniform", denominator: ratioDenominator });
}
