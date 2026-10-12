import { viewerShortcuts } from "./keyboard";

export interface ShortcutReferenceEntry {
  label: string;
  keys: string;
}

export interface ShortcutReferenceGroup {
  title: string;
  entries: readonly ShortcutReferenceEntry[];
}

/** Modifier shown for the platform-dependent shortcuts (the app has no platform detection). */
const MOD = "Ctrl/⌘";

/**
 * Read-only reference for Settings → Shortcuts. "Tools" derives from the
 * viewer shortcut registry; the static entries are each checked against the
 * real keyboard action functions in shortcutReference.test.ts.
 */
export const SHORTCUT_GROUPS: readonly ShortcutReferenceGroup[] = [
  {
    title: "Tools",
    entries: viewerShortcuts.map(({ label, key }) => ({ label, keys: key.toUpperCase() })),
  },
  {
    title: "View and editing",
    entries: [
      { label: "Pan (hold)", keys: "Space" },
      { label: "Zoom in", keys: "+" },
      { label: "Zoom out", keys: "-" },
      { label: "Finish measurement", keys: "Enter" },
      { label: "Cancel or leave tool", keys: "Esc" },
      { label: "Delete selected", keys: "Delete" },
      { label: "Copy", keys: `${MOD}+C` },
      { label: "Paste", keys: `${MOD}+V` },
      { label: "Undo", keys: `${MOD}+Z` },
      { label: "Redo", keys: `${MOD}+Shift+Z` },
    ],
  },
];
