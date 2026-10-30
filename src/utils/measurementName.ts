export const MEASUREMENT_NAME_EMPTY_ERROR = "Measurement name cannot be empty.";

/** Zero-width characters that `String.prototype.trim` keeps but that render as nothing. */
const ZERO_WIDTH_CHARACTERS = /[\u200b-\u200d\u2060]/g;

export function normalizeMeasurementName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.replace(ZERO_WIDTH_CHARACTERS, "").trim() ? trimmed : null;
}
