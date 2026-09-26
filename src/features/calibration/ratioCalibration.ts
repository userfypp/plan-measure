import type {
  LogicalPageBounds,
  PageCalibration,
  UniformPageCalibration,
  XyPageCalibration,
} from "../../types/domain";
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

export function fitCalibrationReferencesToPage(
  calibration: Omit<UniformPageCalibration, "id" | "name">,
  bounds: Pick<LogicalPageBounds, "width" | "height"> | null,
): Omit<UniformPageCalibration, "id" | "name">;
export function fitCalibrationReferencesToPage(
  calibration: Omit<XyPageCalibration, "id" | "name">,
  bounds: Pick<LogicalPageBounds, "width" | "height"> | null,
): Omit<XyPageCalibration, "id" | "name">;
export function fitCalibrationReferencesToPage(
  calibration: RatioCalibrationInput,
  bounds: Pick<LogicalPageBounds, "width" | "height"> | null,
): RatioCalibrationInput;
export function fitCalibrationReferencesToPage(
  calibration: RatioCalibrationInput,
  bounds: Pick<LogicalPageBounds, "width" | "height"> | null,
): RatioCalibrationInput {
  if (
    !bounds ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return calibration;
  }

  const insetX = bounds.width * 0.1;
  const insetY = bounds.height * 0.1;
  const width = Math.min(CANONICAL_REFERENCE_PAGE_UNITS, bounds.width * 0.8);
  const height = Math.min(CANONICAL_REFERENCE_PAGE_UNITS, bounds.height * 0.8);
  if (calibration.mode === "uniform") {
    const millimetresPerPageUnit =
      calibration.referenceDistanceMm /
      Math.hypot(
        calibration.end.x - calibration.start.x,
        calibration.end.y - calibration.start.y,
      );
    return {
      ...calibration,
      start: { x: insetX, y: insetY },
      end: { x: insetX + width, y: insetY },
      referenceDistanceMm: millimetresPerPageUnit * width,
    };
  }

  return {
    ...calibration,
    xReference: {
      start: { x: insetX, y: insetY },
      end: { x: insetX + width, y: insetY },
      referenceDistanceMm:
        (calibration.xReference.referenceDistanceMm /
          Math.hypot(
            calibration.xReference.end.x - calibration.xReference.start.x,
            calibration.xReference.end.y - calibration.xReference.start.y,
          )) *
        width,
    },
    yReference: {
      start: { x: insetX, y: insetY },
      end: { x: insetX, y: insetY + height },
      referenceDistanceMm:
        (calibration.yReference.referenceDistanceMm /
          Math.hypot(
            calibration.yReference.end.x - calibration.yReference.start.x,
            calibration.yReference.end.y - calibration.yReference.start.y,
          )) *
        height,
    },
  };
}

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
