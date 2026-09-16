import type {
  LinearUnit,
  Measurement,
  MeasurementDecimalPlaces,
  PageCalibration,
} from "../types/domain";
import {
  hasValidMeasurementPoints,
  measurementPathSpecs,
  measurementResultsMm,
} from "./geometry";
import { fromMillimetres, fromSquareMillimetres } from "./units";

export const DEFAULT_MEASUREMENT_DECIMAL_PLACES: MeasurementDecimalPlaces = 2;
const MAX_DISPLAY_DECIMAL_PLACES = 20;

function roundsToZero(value: number, decimalPlaces: number): boolean {
  return value !== 0 && Number(value.toFixed(decimalPlaces)) === 0;
}

/**
 * Formats a value for the UI with the requested fixed precision. If that would
 * hide a finite non-zero value as zero, more decimals are shown until the value
 * is visible.
 */
export function formatDisplayNumber(
  value: number,
  decimalPlaces: MeasurementDecimalPlaces = DEFAULT_MEASUREMENT_DECIMAL_PLACES,
): string {
  const rounded = value.toFixed(decimalPlaces);
  if (!roundsToZero(value, decimalPlaces)) return rounded;

  for (
    let expandedDecimalPlaces = decimalPlaces + 1;
    expandedDecimalPlaces <= MAX_DISPLAY_DECIMAL_PLACES;
    expandedDecimalPlaces += 1
  ) {
    const expanded = value.toFixed(expandedDecimalPlaces);
    if (!roundsToZero(value, expandedDecimalPlaces)) return expanded;
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
  decimalPlaces: MeasurementDecimalPlaces = DEFAULT_MEASUREMENT_DECIMAL_PLACES,
): string {
  if (
    measurement.type === "polygon" &&
    !hasValidMeasurementPoints(measurement.type, measurement.points)
  ) {
    return "Repair required";
  }
  let result: ReturnType<typeof measurementResultsMm>;
  try {
    result = measurementResultsMm(measurement, calibration);
  } catch (error) {
    if (error instanceof RangeError) return "Repair required";
    throw error;
  }
  if (!measurementPathSpecs[measurement.type].closed && result.lengthMm !== null) {
    return `${formatDisplayNumber(fromMillimetres(result.lengthMm, unit), decimalPlaces)} ${unit}`;
  }
  return `P ${formatDisplayNumber(fromMillimetres(result.perimeterMm ?? 0, unit), decimalPlaces)} ${unit} · A ${formatDisplayNumber(fromSquareMillimetres(result.areaMm2 ?? 0, unit), decimalPlaces)} ${unit}²`;
}
