export const MEASUREMENT_DELETE_CONFIRMATION_STORAGE_KEY =
  "plan-measure.confirm-measurement-deletion";

export function readMeasurementDeleteConfirmationPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(MEASUREMENT_DELETE_CONFIRMATION_STORAGE_KEY);
    return stored !== "false";
  } catch {
    return true;
  }
}

export function writeMeasurementDeleteConfirmationPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      MEASUREMENT_DELETE_CONFIRMATION_STORAGE_KEY,
      enabled ? "true" : "false",
    );
  } catch {
    // The preference remains usable for this page even if browser storage is unavailable.
  }
}
