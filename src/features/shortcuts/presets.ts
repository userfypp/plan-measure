import {
  ACTION_IDS,
  DEFAULT_BINDINGS,
  EMPTY_SHORTCUT_BINDINGS,
  PRESET_IDS,
  type ActionId,
  type PresetId,
  type ShortcutBindings,
} from "../../utils/shortcuts/bindings";
import { resolveBindings, type ResolvedBindings } from "../../utils/shortcuts/store";

export interface PresetDefinition {
  readonly id: PresetId;
  readonly label: string;
  /** One sentence of intent, shown under the preset picker. */
  readonly description: string;
  /** Every action, with `[]` for the ones that have no key. */
  readonly bindings: ResolvedBindings;
}

type PartialBindings = Partial<Record<ActionId, readonly string[]>>;

/** Fills the actions a preset leaves out with "no shortcut". M = Mod (Ctrl or Command). */
function preset(keys: PartialBindings): ResolvedBindings {
  const bindings = {} as Record<ActionId, readonly string[]>;
  for (const id of ACTION_IDS) bindings[id] = Object.freeze([...(keys[id] ?? [])]);
  return Object.freeze(bindings);
}

/** The keys before shortcuts became customizable: it must keep matching that behaviour. */
const LEGACY = preset({
  "tool.select": ["V"],
  "tool.hand": ["H"],
  "tool.line": ["L"],
  "tool.polyline": ["M"],
  "tool.polygon": ["P"],
  "tool.rectangle": ["R"],
  "tool.ellipse": ["I"],
  "tool.cloud": ["K"],
  "tool.count": ["C"],
  "mode.orthogonal": ["O"],
  "mode.snap": ["S"],
  "view.zoomIn": ["+", "="],
  "view.zoomOut": ["-"],
  "edit.undo": ["Mod+Z"],
  "edit.redo": ["Mod+Shift+Z"],
  "edit.copy": ["Mod+C"],
  "edit.paste": ["Mod+V"],
  "edit.delete": ["Delete", "Backspace"],
});

/** The edit and zoom keys the hand presets keep from Legacy. */
const EDIT_AND_ZOOM: PartialBindings = {
  "view.zoomIn": LEGACY["view.zoomIn"],
  "view.zoomOut": LEGACY["view.zoomOut"],
  "edit.undo": LEGACY["edit.undo"],
  "edit.redo": LEGACY["edit.redo"],
  "edit.copy": LEGACY["edit.copy"],
  "edit.paste": LEGACY["edit.paste"],
  "edit.delete": LEGACY["edit.delete"],
};

/** Keys for duplicating, renaming and the app dialogs, shared by every preset but Legacy. */
const DUPLICATE_RENAME_AND_APP: PartialBindings = {
  "edit.duplicate": ["Mod+D"],
  "edit.rename": ["F2"],
  "app.projects": ["Mod+O"],
  "app.export": ["Mod+E"],
  "app.settings": ["Mod+,"],
};

const KEYBOARD_FIRST = preset({
  ...DEFAULT_BINDINGS,
  "tool.calibrate": ["B"],
  "measurement.toggleDetails": ["D"],
  "measurement.toggleVisibility": ["Mod+Shift+H"],
  "workspace.next": ["Alt+PageDown"],
  "workspace.previous": ["Alt+PageUp"],
  "app.toggleTheme": ["Mod+Shift+L"],
  "page.previous": ["PageUp", ","],
  "page.next": ["PageDown", "."],
});

/** Tools on the left of the keyboard, so the right hand can stay on the mouse. */
const LEFT_HAND = preset({
  ...EDIT_AND_ZOOM,
  ...DUPLICATE_RENAME_AND_APP,
  "tool.select": ["A"],
  "tool.line": ["S"],
  "tool.polyline": ["D"],
  "tool.polygon": ["F"],
  "tool.rectangle": ["G"],
  "tool.count": ["Z"],
  "tool.ellipse": ["X"],
  "tool.cloud": ["C"],
  "tool.hand": ["V"],
  "tool.calibrate": ["B"],
  "mode.orthogonal": ["R"],
  "mode.snap": ["T"],
  "page.previous": ["Q"],
  "page.next": ["W"],
  "view.fitPage": ["5"],
  "workspace.measurements": ["1"],
  "workspace.takeoff": ["2"],
  "workspace.classifications": ["3"],
  "workspace.scales": ["4"],
});

/** Tools on the right of the keyboard, so the left hand can stay on the mouse. */
const RIGHT_HAND = preset({
  ...EDIT_AND_ZOOM,
  ...DUPLICATE_RENAME_AND_APP,
  "tool.hand": ["H"],
  "tool.select": ["J"],
  "tool.line": ["K"],
  "tool.polyline": ["L"],
  "tool.polygon": ["U"],
  "tool.rectangle": ["I"],
  "tool.ellipse": ["O"],
  "tool.cloud": ["P"],
  "tool.count": ["M"],
  "mode.orthogonal": ["Y"],
  "mode.snap": [","],
  "page.previous": ["PageUp"],
  "page.next": ["PageDown"],
  "page.first": ["Home"],
  "page.last": ["End"],
  "page.panel": ["."],
  "workspace.measurements": ["7"],
  "workspace.takeoff": ["8"],
  "workspace.classifications": ["9"],
  "workspace.scales": ["0"],
});

/** Modifier and navigation keys only, so nothing fires by accident while typing. */
const ESSENTIALS = preset({
  ...EDIT_AND_ZOOM,
  ...DUPLICATE_RENAME_AND_APP,
  "edit.redo": ["Mod+Shift+Z", "Mod+Y"],
  "page.previous": ["PageUp"],
  "page.next": ["PageDown"],
  "page.first": ["Home"],
  "page.last": ["End"],
  "workspace.next": ["Alt+PageDown"],
  "workspace.previous": ["Alt+PageUp"],
});

/** Presets in picker order (`PRESET_IDS`). */
export const PRESETS: Readonly<Record<PresetId, PresetDefinition>> = Object.freeze({
  default: {
    id: "default",
    label: "Default",
    description: "Your current keys plus shortcuts for pages, workspaces, zoom fit and app dialogs",
    bindings: preset(DEFAULT_BINDINGS),
  },
  legacy: {
    id: "legacy",
    label: "Legacy",
    description: "The keys from before shortcuts could be customized, and nothing else",
    bindings: LEGACY,
  },
  "keyboard-first": {
    id: "keyboard-first",
    label: "Keyboard first",
    description: "Default plus a key for every action, including calibrate, details and theme",
    bindings: KEYBOARD_FIRST,
  },
  "left-hand": {
    id: "left-hand",
    label: "Left hand",
    description: "Tool keys on the left of the keyboard, leaving the right hand on the mouse",
    bindings: LEFT_HAND,
  },
  essentials: {
    id: "essentials",
    label: "Essentials",
    description: "Modifier and navigation keys only, with no single-letter shortcuts",
    bindings: ESSENTIALS,
  },
  "right-hand": {
    id: "right-hand",
    label: "Right hand",
    description: "Tool keys on the right of the keyboard, leaving the left hand on the mouse",
    bindings: RIGHT_HAND,
  },
});

export function presetBindings(id: PresetId): ResolvedBindings {
  return PRESETS[id].bindings;
}

/** Slot order matters: the first key is the one shown in tooltips. */
function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((combo, index) => combo === b[index]);
}

/** Whether two full maps give every action the same keys in the same slots. */
export function sameBindings(a: ResolvedBindings, b: ResolvedBindings): boolean {
  return ACTION_IDS.every((id) => sameKeys(a[id], b[id]));
}

/** What gets stored: only the actions whose keys differ from Default. */
export function diffFromDefault(effective: ResolvedBindings): ShortcutBindings {
  const diff: Partial<Record<ActionId, readonly string[]>> = {};
  let changed = false;
  for (const id of ACTION_IDS) {
    if (sameKeys(effective[id], DEFAULT_BINDINGS[id])) continue;
    diff[id] = Object.freeze([...effective[id]]);
    changed = true;
  }
  return changed ? Object.freeze(diff) : EMPTY_SHORTCUT_BINDINGS;
}

/** The full map a stored diff stands for, with the collisions resolved as the dispatcher does. */
export function effectiveBindings(stored: ShortcutBindings): ResolvedBindings {
  return resolveBindings(stored);
}

/**
 * The preset the stored bindings still equal, or "custom". With the stored
 * preset id only that preset is tried, so a map that merely happens to equal
 * another preset stays "custom"; without it every preset is tried in order.
 */
export function detectPreset(
  stored: ShortcutBindings,
  storedPreset?: PresetId,
): PresetId | "custom" {
  const effective = effectiveBindings(stored);
  const candidates = storedPreset ? [storedPreset] : PRESET_IDS;
  return candidates.find((id) => sameBindings(effective, presetBindings(id))) ?? "custom";
}

export interface BindingsChange {
  readonly id: ActionId;
  readonly before: readonly string[];
  readonly after: readonly string[];
}

/** The actions whose keys differ between two full maps, in action order, for the update notice. */
export function bindingsDiffBetween(a: ResolvedBindings, b: ResolvedBindings): BindingsChange[] {
  return ACTION_IDS.filter((id) => !sameKeys(a[id], b[id])).map((id) => ({
    id,
    before: a[id],
    after: b[id],
  }));
}
