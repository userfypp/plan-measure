import type { PageCalibration } from "../../types/domain";
import { formatDisplayNumber } from "../../utils/format";
import {
  calibrationScaleX,
  calibrationScaleY,
  millimetresPerPageUnit,
} from "../../utils/geometry";
import { scaleRatioDenominatorFromMillimetresPerPageUnit } from "../../utils/pdfUnits";

function formatRatioValue(value: number): string {
  const formatted = formatDisplayNumber(value);
  return formatted.includes(".") ? formatted.replace(/0+$/, "").replace(/\.$/, "") : formatted;
}

export interface ScaleDisplayMetadata {
  ratioLabel: string;
  modeLabel: "Uniform" | "X/Y";
  detailLabel: string;
}

export function scaleDisplayMetadata(calibration: PageCalibration): ScaleDisplayMetadata {
  if (calibration.mode === "uniform") {
    const ratioLabel = `1:${formatRatioValue(
      scaleRatioDenominatorFromMillimetresPerPageUnit(millimetresPerPageUnit(calibration)),
    )}`;
    return {
      ratioLabel,
      modeLabel: "Uniform",
      detailLabel: `${ratioLabel} · Uniform`,
    };
  }

  const xRatio = `1:${formatRatioValue(
    scaleRatioDenominatorFromMillimetresPerPageUnit(calibrationScaleX(calibration)),
  )}`;
  const yRatio = `1:${formatRatioValue(
    scaleRatioDenominatorFromMillimetresPerPageUnit(calibrationScaleY(calibration)),
  )}`;
  return {
    ratioLabel: `X ${xRatio} · Y ${yRatio}`,
    modeLabel: "X/Y",
    detailLabel: `X ${xRatio} · Y ${yRatio} · X/Y`,
  };
}
