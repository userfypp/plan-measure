export const MEASUREMENT_NAME_EMPTY_ERROR = "Measurement name cannot be empty.";

export function normalizeMeasurementName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed || null;
}
