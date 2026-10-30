import { DEFAULT_CHANGES_LEGACY } from "./bindings";

/** `"done"` once the one-time "Shortcuts updated" notification has been shown (or never applies). */
export const SHORTCUTS_NOTICE_STORAGE_KEY = "plan-measure.shortcuts-notice";

/** Every key the app stores starts with this, so any of them means the browser has used the app. */
const STORAGE_KEY_PREFIX = "plan-measure.";

function hasStoredAppKeys(): boolean {
  try {
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(STORAGE_KEY_PREFIX) && key !== SHORTCUTS_NOTICE_STORAGE_KEY) return true;
    }
  } catch {
    // Without readable storage the notice is never shown.
  }
  return false;
}

// Taken when the module loads, before the app writes any key of its own.
let hadStoredAppKeys = hasStoredAppKeys();
let show: boolean | undefined;
/** This page load decided "done" only because the browser had no trace of earlier use. */
let assumedFreshInstall = false;
let startupChecked = false;

function decide(): boolean {
  try {
    const { localStorage } = window;
    if (!DEFAULT_CHANGES_LEGACY) {
      localStorage.setItem(SHORTCUTS_NOTICE_STORAGE_KEY, "done");
      return false;
    }
    if (localStorage.getItem(SHORTCUTS_NOTICE_STORAGE_KEY) === "done") return false;
    if (hadStoredAppKeys) return true;
    localStorage.setItem(SHORTCUTS_NOTICE_STORAGE_KEY, "done");
    assumedFreshInstall = true;
  } catch {
    // Without usable storage the notice could not be remembered, so it is never shown.
  }
  return false;
}

/** Whether the notice is due. It is settled once per page load, on the first call. */
export function shouldShowShortcutsNotice(): boolean {
  show ??= decide();
  return show;
}

/**
 * Second signal for a browser with saved projects but none of the app's keys (nobody changed a
 * setting). Call it once saved projects have been listed; only the first call counts, so a
 * project created during this visit never turns a new user into an upgrading one. Returns
 * whether the notice is now due.
 */
export function noteSavedProjectsAtStartup(hasSavedProjects: boolean): boolean {
  const due = shouldShowShortcutsNotice();
  if (startupChecked) return due;
  startupChecked = true;
  if (hasSavedProjects && assumedFreshInstall) show = true;
  return show === true;
}

/**
 * Remembers that the notice is being shown, so it never appears again, whether it is dismissed,
 * times out or the page is left. Returns false, and the notice must stay hidden, when the
 * marker could not be written.
 */
export function markShortcutsNoticeShown(): boolean {
  show = false;
  try {
    window.localStorage.setItem(SHORTCUTS_NOTICE_STORAGE_KEY, "done");
    return true;
  } catch {
    return false;
  }
}

/** Test only: forgets this page load's decision and looks at the stored keys again. */
export function resetShortcutsNoticeForTests(): void {
  hadStoredAppKeys = hasStoredAppKeys();
  show = undefined;
  assumedFreshInstall = false;
  startupChecked = false;
}
