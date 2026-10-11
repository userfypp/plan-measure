import type {
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageCalibration,
  Point,
} from "../../types/domain";
import { formatLinearValue } from "../../utils/format";
import { calibrationScaleX, calibrationScaleY } from "../../utils/geometry";

export interface BoxGuideBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boxGuideBounds(points: readonly Point[]): BoxGuideBounds | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export interface BoxGuideDimensions {
  width: string;
  height: string;
}

/** Live width/height texts: calibrated units when a scale exists, otherwise page pixels. */
export function boxGuideDimensionTexts(
  width: number,
  height: number,
  calibration: PageCalibration | null,
  displayUnit: MeasurementDisplayUnit,
  decimalPlaces: MeasurementDecimalPlaces,
): BoxGuideDimensions {
  if (calibration) {
    return {
      width: formatLinearValue(width * calibrationScaleX(calibration), displayUnit, decimalPlaces),
      height: formatLinearValue(height * calibrationScaleY(calibration), displayUnit, decimalPlaces),
    };
  }
  return { width: `${Math.round(width)} px`, height: `${Math.round(height)} px` };
}
