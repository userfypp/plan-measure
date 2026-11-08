export const WHATS_NEW_SEEN_STORAGE_KEY = "plan-measure.whats-new-seen";

/** The newest release whose notes the user has been shown on this device, or null. */
export function readSeenRelease(): string | null {
  try {
    return window.localStorage.getItem(WHATS_NEW_SEEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeSeenRelease(version: string): void {
  try {
    window.localStorage.setItem(WHATS_NEW_SEEN_STORAGE_KEY, version);
  } catch {
    // Without browser storage the section is marked new again on the next visit.
  }
}
