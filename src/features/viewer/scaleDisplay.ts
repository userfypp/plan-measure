import type { PageCalibration } from "../../types/domain";
import { formatDisplayNumber } from "../../utils/format";
import {
  calibrationScaleX,
  calibrationScaleY,
  millimetresPerPageUnit,
} from "../../utils/geometry";

const MILLIMETRES_PER_PDF_POINT = 25.4 / 72;

function formatRatioValue(value: number): string {
  const formatted = formatDisplayNumber(value);
  return formatted.includes(".") ? formatted.replace(/0+$/, "").replace(/\.$/, "") : formatted;
}

function ratioDenominator(millimetresPerPageUnitValue: number): number {
  return millimetresPerPageUnitValue / MILLIMETRES_PER_PDF_POINT;
}

export interface ScaleDisplayMetadata {
  ratioLabel: string;
  modeLabel: "Uniform" | "X/Y";
  detailLabel: string;
}

export function scaleDisplayMetadata(calibration: PageCalibration): ScaleDisplayMetadata {
  if (calibration.mode === "uniform") {
    const ratioLabel = `1:${formatRatioValue(
      ratioDenominator(millimetresPerPageUnit(calibration)),
    )}`;
    return {
      ratioLabel,
      modeLabel: "Uniform",
      detailLabel: `${ratioLabel} · Uniform`,
    };
  }

  const xRatio = `1:${formatRatioValue(ratioDenominator(calibrationScaleX(calibration)))}`;
  const yRatio = `1:${formatRatioValue(ratioDenominator(calibrationScaleY(calibration)))}`;
  return {
    ratioLabel: `X ${xRatio} · Y ${yRatio}`,
    modeLabel: "X/Y",
    detailLabel: `X ${xRatio} · Y ${yRatio} · X/Y`,
  };
}
