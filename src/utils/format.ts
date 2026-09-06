import type { LinearUnit, Measurement, PageCalibration } from "../types/domain";
import {
  hasValidMeasurementPoints,
  measurementPathSpecs,
  measurementResultsMm,
} from "./geometry";
import { fromMillimetres, fromSquareMillimetres } from "./units";

const DEFAULT_DISPLAY_DECIMAL_PLACES = 2;
const MAX_DISPLAY_DECIMAL_PLACES = 20;

function roundsToZero(value: number, decimalPlaces: number): boolean {
  return value !== 0 && Number(value.toFixed(decimalPlaces)) === 0;
}

/**
 * Formats a value for the UI with two decimals by default. If that would hide a
 * finite non-zero value as zero, more decimals are shown until the value is visible.
 */
export function formatDisplayNumber(value: number): string {
  const rounded = value.toFixed(DEFAULT_DISPLAY_DECIMAL_PLACES);
  if (!roundsToZero(value, DEFAULT_DISPLAY_DECIMAL_PLACES)) return rounded;

  for (
    let decimalPlaces = DEFAULT_DISPLAY_DECIMAL_PLACES + 1;
    decimalPlaces <= MAX_DISPLAY_DECIMAL_PLACES;
    decimalPlaces += 1
  ) {
    const expanded = value.toFixed(decimalPlaces);
    if (!roundsToZero(value, decimalPlaces)) return expanded;
  }

  // Extremely small values can be below toFixed's supported precision. String()
  // still makes the non-zero value explicit and is deterministic for a JS number.
  return String(value);
}

/**
 * Formats a measurement value for CSV without rounding. Ordinary decimal values
 * keep at least two fractional places for compatibility with existing exports.
 */
export function formatCsvNumber(value: number): string {
  const serialized = String(value);
  if (!Number.isFinite(value) || /e/i.test(serialized)) return serialized;

  const decimalPoint = serialized.indexOf(".");
  if (decimalPoint === -1) return `${serialized}.00`;

  const fractionDigits = serialized.length - decimalPoint - 1;
  return fractionDigits >= 2
    ? serialized
    : serialized.padEnd(serialized.length + (2 - fractionDigits), "0");
}

/**
 * Kept as a compatibility alias for existing UI callers.
 */
export function formatNumber(value: number): string {
  return formatDisplayNumber(value);
}

export function formatMeasurement(
  measurement: Pick<Measurement, "type" | "points">,
  calibration: PageCalibration,
  unit: LinearUnit,
): string {
  if (
    measurement.type === "polygon" &&
    !hasValidMeasurementPoints(measurement.type, measurement.points)
  ) {
    return "Repair required";
  }
  const result = measurementResultsMm(measurement, calibration);
  if (!measurementPathSpecs[measurement.type].closed && result.lengthMm !== null) {
    return `${formatDisplayNumber(fromMillimetres(result.lengthMm, unit))} ${unit}`;
  }
  return `P ${formatDisplayNumber(fromMillimetres(result.perimeterMm ?? 0, unit))} ${unit} · A ${formatDisplayNumber(fromSquareMillimetres(result.areaMm2 ?? 0, unit))} ${unit}²`;
}
