export const KEYBOARD_AUTHORING_STORAGE_KEY = "plan-measure.keyboard-authoring";

export function readKeyboardAuthoringPreference(): boolean {
  try {
    return window.localStorage.getItem(KEYBOARD_AUTHORING_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeKeyboardAuthoringPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(KEYBOARD_AUTHORING_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // The preference remains usable for this page even if browser storage is unavailable.
  }
}
