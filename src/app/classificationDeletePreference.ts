export type ClassificationDeletionTarget = "value" | "dimension";

const STORAGE_KEYS: Record<ClassificationDeletionTarget, string> = {
  value: "plan-measure.confirm-value-deletion",
  dimension: "plan-measure.confirm-dimension-deletion",
};

export function readClassificationDeleteConfirmationPreference(
  target: ClassificationDeletionTarget,
): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEYS[target]) !== "false";
  } catch {
    return true;
  }
}

export function writeClassificationDeleteConfirmationPreference(
  target: ClassificationDeletionTarget,
  enabled: boolean,
): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS[target], enabled ? "true" : "false");
  } catch {
    // The preference remains usable for this page even if browser storage is unavailable.
  }
}
