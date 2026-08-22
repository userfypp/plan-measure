import type { LinearUnit, Measurement, PageCalibration } from "../types/domain";
import { lineLengthMm, polygonResultsMm } from "./geometry";
import { fromMillimetres, fromSquareMillimetres } from "./units";

export function formatNumber(value: number): string {
  return value.toFixed(2);
}

export function formatMeasurement(
  measurement: Measurement,
  calibration: PageCalibration,
  unit: LinearUnit,
): string {
  if (measurement.type === "line") {
    return `${formatNumber(fromMillimetres(lineLengthMm(measurement.points, calibration), unit))} ${unit}`;
  }
  const result = polygonResultsMm(measurement, calibration);
  return `P ${formatNumber(fromMillimetres(result.perimeterMm, unit))} ${unit} · A ${formatNumber(fromSquareMillimetres(result.areaMm2, unit))} ${unit}²`;
}
