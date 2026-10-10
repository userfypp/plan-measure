import type {
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageCalibration,
  Point,
} from "../../types/domain";
import { areEffectivelyIdentical, measurementResultsMm } from "../../utils/geometry";
import { formatDisplayNumber, formatLinearValue } from "../../utils/format";

export function scaleCheckResult(
  points: [Point, Point],
  calibration: PageCalibration,
  realMm: number,
) {
  if (!Number.isFinite(realMm))
    throw new RangeError("Enter a valid distance that is not excessively large.");
  if (realMm <= 0) throw new RangeError("Enter a distance greater than zero.");
  if (areEffectivelyIdentical(...points))
    throw new RangeError("Choose two distinct calibration points.");
  const measuredMm = measurementResultsMm({ type: "line", points }, calibration).lengthMm!;
  const differenceMm = measuredMm - realMm;
  const percentage = (differenceMm / realMm) * 100;
  // Beyond safe integer precision, a percentage cannot convey a reliable comparison.
  const percentageDifference =
    Number.isFinite(percentage) && Math.abs(percentage) <= Number.MAX_SAFE_INTEGER
      ? percentage
      : null;
  return { measuredMm, realMm, differenceMm, percentageDifference };
}

export function formatScaleCheckResult(
  result: ReturnType<typeof scaleCheckResult>,
  unit: MeasurementDisplayUnit,
  decimals: MeasurementDecimalPlaces,
) {
  const sign = result.differenceMm > 0 ? "+" : result.differenceMm < 0 ? "−" : "";
  const percentage = result.percentageDifference;
  return {
    measured: formatLinearValue(result.measuredMm, unit, decimals),
    real: formatLinearValue(result.realMm, unit, decimals),
    difference: `${sign}${formatLinearValue(Math.abs(result.differenceMm), unit, decimals)}`,
    percentage:
      percentage === null
        ? "Unavailable: real distance is too small for a reliable percentage."
        : `${percentage > 0 ? "+" : percentage < 0 ? "−" : ""}${formatDisplayNumber(Math.abs(percentage), decimals)}%`,
  };
}
