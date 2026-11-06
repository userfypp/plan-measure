/** Digits every spreadsheet application keeps; the JSON export skips this and keeps them all. */
const EXPORT_SIGNIFICANT_DIGITS = 15;

/**
 * A number as CSV, XLSX and ODS write it: rounded to 15 significant digits, so binary noise such
 * as 0.1 + 0.2 = 0.30000000000000004 is written as 0.3. A value that would round past the largest
 * finite number is kept as it is.
 */
export function roundExportNumber(value: number): number {
  const rounded = Number(value.toPrecision(EXPORT_SIGNIFICANT_DIGITS));
  return Number.isFinite(rounded) ? rounded : value;
}
