import type { PageCalibration, UniformPageCalibration, XyPageCalibration } from "../../types/domain";
import {
  calibrationScaleX,
  calibrationScaleY,
  millimetresPerPageUnit,
} from "../../utils/geometry";
import {
  millimetresPerPageUnitForScaleRatio,
  practicalScaleRatioDenominator,
  scaleRatioDenominatorFromMillimetresPerPageUnit,
} from "../../utils/pdfUnits";
import { toMillimetres } from "../../utils/units";

export type RatioCalibrationInput =
  | Omit<UniformPageCalibration, "id" | "name">
  | Omit<XyPageCalibration, "id" | "name">;

interface UniformScaleRatioSpec {
  mode: "uniform";
  denominator: number;
}

interface XyScaleRatioSpec {
  mode: "xy";
  xDenominator: number;
  yDenominator: number;
}

export type ScaleRatioSpec = UniformScaleRatioSpec | XyScaleRatioSpec;

const CANONICAL_REFERENCE_PAGE_UNITS = 72;

interface ScaleRatioMetrics {
  millimetresPerPageUnit: number;
  referenceDistanceMm: number;
}

function scaleRatioMetrics(denominator: number): ScaleRatioMetrics | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;

  const millimetresPerPageUnit = millimetresPerPageUnitForScaleRatio(denominator);
  const referenceDistanceMm = toMillimetres(denominator, "in");
  if (
    !Number.isFinite(millimetresPerPageUnit) ||
    millimetresPerPageUnit <= 0 ||
    !Number.isFinite(referenceDistanceMm) ||
    referenceDistanceMm <= 0
  ) {
    return null;
  }

  return { millimetresPerPageUnit, referenceDistanceMm };
}

export function isValidScaleRatioDenominator(denominator: number): boolean {
  return scaleRatioMetrics(denominator) !== null;
}

function requiredScaleRatioMetrics(denominator: number): ScaleRatioMetrics {
  const metrics = scaleRatioMetrics(denominator);
  if (!metrics) {
    throw new RangeError("Scale ratio denominator must produce a finite positive calibration.");
  }
  return metrics;
}

export function createPageCalibrationFromRatio(
  spec: UniformScaleRatioSpec,
): Omit<UniformPageCalibration, "id" | "name">;
export function createPageCalibrationFromRatio(
  spec: XyScaleRatioSpec,
): Omit<XyPageCalibration, "id" | "name">;
export function createPageCalibrationFromRatio(spec: ScaleRatioSpec): RatioCalibrationInput {
  if (spec.mode === "uniform") {
    const { referenceDistanceMm } = requiredScaleRatioMetrics(spec.denominator);
    return {
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: CANONICAL_REFERENCE_PAGE_UNITS, y: 0 },
      referenceDistanceMm,
    };
  }

  const xMetrics = requiredScaleRatioMetrics(spec.xDenominator);
  const yMetrics = requiredScaleRatioMetrics(spec.yDenominator);
  return {
    mode: "xy",
    xReference: {
      start: { x: 0, y: 0 },
      end: { x: CANONICAL_REFERENCE_PAGE_UNITS, y: 0 },
      referenceDistanceMm: xMetrics.referenceDistanceMm,
    },
    yReference: {
      start: { x: 0, y: 0 },
      end: { x: 0, y: CANONICAL_REFERENCE_PAGE_UNITS },
      referenceDistanceMm: yMetrics.referenceDistanceMm,
    },
  };
}

function practicalRatioFromMillimetresPerPageUnit(value: number): number {
  return practicalScaleRatioDenominator(
    scaleRatioDenominatorFromMillimetresPerPageUnit(value),
  );
}

export function scaleRatioSpecFromCalibration(calibration: PageCalibration): ScaleRatioSpec {
  if (calibration.mode === "uniform") {
    return {
      mode: "uniform",
      denominator: practicalRatioFromMillimetresPerPageUnit(millimetresPerPageUnit(calibration)),
    };
  }

  return {
    mode: "xy",
    xDenominator: practicalRatioFromMillimetresPerPageUnit(calibrationScaleX(calibration)),
    yDenominator: practicalRatioFromMillimetresPerPageUnit(calibrationScaleY(calibration)),
  };
}

export function copyCalibrationToPage(
  calibration: UniformPageCalibration,
): Omit<UniformPageCalibration, "id" | "name">;
export function copyCalibrationToPage(
  calibration: XyPageCalibration,
): Omit<XyPageCalibration, "id" | "name">;
export function copyCalibrationToPage(calibration: PageCalibration): RatioCalibrationInput;
export function copyCalibrationToPage(calibration: PageCalibration): RatioCalibrationInput {
  if (calibration.mode === "uniform") {
    return {
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: CANONICAL_REFERENCE_PAGE_UNITS, y: 0 },
      referenceDistanceMm:
        millimetresPerPageUnit(calibration) * CANONICAL_REFERENCE_PAGE_UNITS,
    };
  }

  return {
    mode: "xy",
    xReference: {
      start: { x: 0, y: 0 },
      end: { x: CANONICAL_REFERENCE_PAGE_UNITS, y: 0 },
      referenceDistanceMm: calibrationScaleX(calibration) * CANONICAL_REFERENCE_PAGE_UNITS,
    },
    yReference: {
      start: { x: 0, y: 0 },
      end: { x: 0, y: CANONICAL_REFERENCE_PAGE_UNITS },
      referenceDistanceMm: calibrationScaleY(calibration) * CANONICAL_REFERENCE_PAGE_UNITS,
    },
  };
}
