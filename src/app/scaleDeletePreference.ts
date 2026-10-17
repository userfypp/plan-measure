export const SCALE_DELETE_CONFIRMATION_STORAGE_KEY = "plan-measure.confirm-scale-deletion";

export function readScaleDeleteConfirmationPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(SCALE_DELETE_CONFIRMATION_STORAGE_KEY);
    return stored !== "false";
  } catch {
    return true;
  }
}

export function writeScaleDeleteConfirmationPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(SCALE_DELETE_CONFIRMATION_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // The preference remains usable for this page even if browser storage is unavailable.
  }
}
