import type { PageCalibration } from "../../types/domain";
import { formatDisplayNumber } from "../../utils/format";
import {
  calibrationScaleX,
  calibrationScaleY,
  millimetresPerPageUnit,
} from "../../utils/geometry";
import {
  cleanScaleRatioDenominator,
  scaleRatioDenominatorFromMillimetresPerPageUnit,
} from "../../utils/pdfUnits";

function formatRatioValue(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const clean = cleanScaleRatioDenominator(value);
  if (clean !== null) return String(clean);

  const fallback = formatDisplayNumber(value);
  return fallback.includes(".") ? fallback.replace(/0+$/, "").replace(/\.$/, "") : fallback;
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
