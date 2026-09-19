import type {
  AreaDisplay,
  LinearUnit,
  Measurement,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageCalibration,
} from "../types/domain";
import {
  hasValidMeasurementPoints,
  measurementPathSpecs,
  measurementResultsMm,
} from "./geometry";
import {
  fromMillimetres,
  fromSquareMillimetres,
  fromSquareMillimetresToAcres,
  scaleByRatio,
} from "./units";

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

const SIXTEENTHS_PER_INCH = 16;
const SIXTEENTHS_PER_FOOT = 12 * SIXTEENTHS_PER_INCH;
export const MAX_SAFE_ARCHITECTURAL_SIXTEENTHS = Math.floor(Number.MAX_SAFE_INTEGER / 127);

export function architecturalSixteenthsToMillimetres(totalSixteenths: number): number | null {
  if (
    !Number.isSafeInteger(totalSixteenths) ||
    totalSixteenths < 0 ||
    totalSixteenths > MAX_SAFE_ARCHITECTURAL_SIXTEENTHS
  ) {
    return null;
  }
  return scaleByRatio(totalSixteenths, 127, 80);
}

export function resolveLinearUnit(displayUnit: MeasurementDisplayUnit): LinearUnit {
  return displayUnit === "ft-in" ? "ft" : displayUnit;
}

function parseSafeInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseArchitecturalInchPart(input: string): number | null {
  const match = /^(?:(\d+)(?: (\d+)\/(2|4|8|16))?|(\d+)\/(2|4|8|16))$/.exec(input);
  if (!match) return null;

  const wholeText = match[1];
  const numeratorText = match[2] ?? match[4];
  const denominatorText = match[3] ?? match[5];
  const whole = wholeText === undefined ? 0 : parseSafeInteger(wholeText);
  if (whole === null || whole > 11) return null;

  let fractionalSixteenths = 0;
  if (numeratorText !== undefined && denominatorText !== undefined) {
    const numerator = parseSafeInteger(numeratorText);
    const denominator = Number(denominatorText);
    if (numerator === null || numerator <= 0 || numerator >= denominator) return null;
    fractionalSixteenths = numerator * (SIXTEENTHS_PER_INCH / denominator);
  }

  return whole * SIXTEENTHS_PER_INCH + fractionalSixteenths;
}

export function parseArchitecturalLength(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const feetOnly = /^(\d+)'$/.exec(trimmed);
  if (feetOnly) {
    const feet = parseSafeInteger(feetOnly[1]!);
    if (
      feet === null ||
      feet > Math.floor(MAX_SAFE_ARCHITECTURAL_SIXTEENTHS / SIXTEENTHS_PER_FOOT)
    ) {
      return null;
    }
    return architecturalSixteenthsToMillimetres(feet * SIXTEENTHS_PER_FOOT);
  }

  const feetAndInches = /^(\d+)'(?:\s*-\s*|\s+)(.+)"$/.exec(trimmed);
  if (feetAndInches) {
    const feet = parseSafeInteger(feetAndInches[1]!);
    const inchSixteenths = parseArchitecturalInchPart(feetAndInches[2]!);
    if (feet === null || inchSixteenths === null) return null;
    const maxFeet = Math.floor(
      (MAX_SAFE_ARCHITECTURAL_SIXTEENTHS - inchSixteenths) / SIXTEENTHS_PER_FOOT,
    );
    if (feet > maxFeet) return null;
    const totalSixteenths = feet * SIXTEENTHS_PER_FOOT + inchSixteenths;
    return architecturalSixteenthsToMillimetres(totalSixteenths);
  }

  const inchesOnly = /^(.+)"$/.exec(trimmed);
  if (!inchesOnly) return null;
  const totalSixteenths = parseArchitecturalInchPart(inchesOnly[1]!);
  return totalSixteenths === null ? null : architecturalSixteenthsToMillimetres(totalSixteenths);
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

export function formatArchitecturalLength(millimetres: number): string {
  if (!Number.isFinite(millimetres) || millimetres < 0) {
    throw new RangeError("Architectural length must be a finite non-negative value.");
  }

  const roundedSixteenths = Math.round(scaleByRatio(millimetres, 80, 127));
  if (millimetres > 0 && roundedSixteenths === 0) return '< 1/16"';

  const totalSixteenths = BigInt(roundedSixteenths);
  const feet = totalSixteenths / BigInt(SIXTEENTHS_PER_FOOT);
  const remainingSixteenths = totalSixteenths % BigInt(SIXTEENTHS_PER_FOOT);
  const wholeInches = Number(remainingSixteenths / BigInt(SIXTEENTHS_PER_INCH));
  const fractionalSixteenths = Number(remainingSixteenths % BigInt(SIXTEENTHS_PER_INCH));

  let inchPart = wholeInches > 0 ? String(wholeInches) : "";
  if (fractionalSixteenths > 0) {
    const divisor = gcd(fractionalSixteenths, SIXTEENTHS_PER_INCH);
    const fraction = `${fractionalSixteenths / divisor}/${SIXTEENTHS_PER_INCH / divisor}`;
    inchPart = inchPart ? `${inchPart} ${fraction}` : fraction;
  }

  if (feet > 0n) return inchPart ? `${feet}' ${inchPart}"` : `${feet}'`;
  return `${inchPart || "0"}"`;
}

export function formatLinearValue(
  millimetres: number,
  displayUnit: MeasurementDisplayUnit,
  decimalPlaces: MeasurementDecimalPlaces = DEFAULT_MEASUREMENT_DECIMAL_PLACES,
): string {
  if (displayUnit === "ft-in") return formatArchitecturalLength(millimetres);
  return `${formatDisplayNumber(fromMillimetres(millimetres, displayUnit), decimalPlaces)} ${displayUnit}`;
}

export function formatAreaValue(
  squareMillimetres: number,
  displayUnit: MeasurementDisplayUnit,
  areaDisplay: AreaDisplay,
  decimalPlaces: MeasurementDecimalPlaces = DEFAULT_MEASUREMENT_DECIMAL_PLACES,
): string {
  if (areaDisplay === "ac") {
    return `${formatDisplayNumber(fromSquareMillimetresToAcres(squareMillimetres), decimalPlaces)} ac`;
  }
  const linearUnit = resolveLinearUnit(displayUnit);
  return `${formatDisplayNumber(fromSquareMillimetres(squareMillimetres, linearUnit), decimalPlaces)} ${linearUnit}²`;
}

export function formatMeasurement(
  measurement: Pick<Measurement, "type" | "points">,
  calibration: PageCalibration,
  displayUnit: MeasurementDisplayUnit,
  decimalPlaces: MeasurementDecimalPlaces = DEFAULT_MEASUREMENT_DECIMAL_PLACES,
  areaDisplay: AreaDisplay = "auto",
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
    return formatLinearValue(result.lengthMm, displayUnit, decimalPlaces);
  }
  return `P ${formatLinearValue(result.perimeterMm ?? 0, displayUnit, decimalPlaces)} · A ${formatAreaValue(result.areaMm2 ?? 0, displayUnit, areaDisplay, decimalPlaces)}`;
}
