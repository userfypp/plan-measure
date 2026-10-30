import {
  ACTION_IDS,
  MAX_BINDINGS_PER_ACTION,
  RESERVED,
  parseBinding,
  type ActionId,
  type PresetId,
  type ShortcutBindings,
} from "../../utils/shortcuts/bindings";
import { FIXED_KEYS } from "./catalog";
import { diffFromDefault, effectiveBindings, presetBindings } from "./presets";

const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

const TAB_OR_WINDOW = "Browsers keep this key for tabs and windows";
const PAGE_ACTION = "Browsers keep this key for page actions";
const HISTORY = "Browsers keep this key for back and forward";

/**
 * Combos a page cannot intercept, with the reason shown to the user. They are
 * refused when capturing a key and when importing; they are not checked at
 * startup, so this list stays out of the main bundle.
 */
export const BLOCKED: ReadonlyMap<string, string> = new Map<string, string>([
  ...["W", "T", "N"].flatMap((key) => [
    [`Mod+${key}`, TAB_OR_WINDOW] as const,
    [`Mod+Shift+${key}`, TAB_OR_WINDOW] as const,
  ]),
  ["Mod+Q", TAB_OR_WINDOW],
  ["Mod+Tab", TAB_OR_WINDOW],
  ["Mod+Shift+Tab", TAB_OR_WINDOW],
  ...Array.from({ length: 10 }, (_, digit) => [`Mod+${digit}`, TAB_OR_WINDOW] as const),
  ["Mod+PageUp", TAB_OR_WINDOW],
  ["Mod+PageDown", TAB_OR_WINDOW],
  ["Mod+Shift+PageUp", TAB_OR_WINDOW],
  ["Mod+Shift+PageDown", TAB_OR_WINDOW],
  ["Mod+R", PAGE_ACTION],
  ["Mod+L", PAGE_ACTION],
  ["Mod++", PAGE_ACTION],
  ["Mod+-", PAGE_ACTION],
  ["Mod+=", PAGE_ACTION],
  ["F5", PAGE_ACTION],
  ["F11", PAGE_ACTION],
  ["F12", PAGE_ACTION],
  ["Alt+ArrowLeft", HISTORY],
  ["Alt+ArrowRight", HISTORY],
]);

export const WARN_REASON = "May also trigger a browser shortcut";

/**
 * Combos that work but may also trigger a browser shortcut: the common Mod
 * letters, Mod+Shift with any letter but Z (Redo), every Alt letter (menus on
 * Windows and Linux, special characters with Option on a Mac) and some F keys.
 */
export const WARN: ReadonlySet<string> = new Set([
  ...["S", "P", "O", "D", "E", "F", "G", "H", "J", "K", "U", "Y", "A", "B", "I", ","].map(
    (key) => `Mod+${key}`,
  ),
  ...LETTERS.filter((key) => key !== "Z").map((key) => `Mod+Shift+${key}`),
  ...LETTERS.flatMap((key) => [`Alt+${key}`, `Alt+Shift+${key}`]),
  ...["F1", "F3", "F6", "F7", "F10"],
]);

export type ComboClassification =
  | { readonly kind: "free" }
  | { readonly kind: "reserved"; readonly reason: string }
  | { readonly kind: "blocked"; readonly reason: string }
  | { readonly kind: "warn"; readonly reason: string };

const FREE: ComboClassification = Object.freeze({ kind: "free" });

/** Reserved combos with the fixed key that owns them, for the message. */
const RESERVED_REASONS: ReadonlyMap<string, string> = new Map(
  FIXED_KEYS.flatMap((row) =>
    row.combos.map((combo) => [combo, `Fixed key, used for ${row.label.toLowerCase()}`] as const),
  ),
);

/**
 * Whether a combo can be bound: reserved keys belong to the viewer, blocked ones
 * never reach the page and combos outside the binding grammar cannot be stored.
 * Blocked wins over warn, so Mod+Shift+T is blocked and Mod+Shift+H is a warning.
 */
export function classifyCombo(combo: string): ComboClassification {
  if (RESERVED.has(combo)) {
    return { kind: "reserved", reason: RESERVED_REASONS.get(combo) ?? "Fixed key" };
  }
  if (parseBinding(combo) === null) {
    return { kind: "blocked", reason: "This key cannot be used as a shortcut" };
  }
  const blocked = BLOCKED.get(combo);
  if (blocked) return { kind: "blocked", reason: blocked };
  if (WARN.has(combo)) return { kind: "warn", reason: WARN_REASON };
  return FREE;
}

/** The action that owns the combo, ignoring `exceptActionId`, or null when it is free. */
export function findConflict(
  effective: Readonly<Record<ActionId, readonly string[]>>,
  combo: string,
  exceptActionId?: ActionId,
): ActionId | null {
  return ACTION_IDS.find((id) => id !== exceptActionId && effective[id].includes(combo)) ?? null;
}

type MutableBindings = Record<ActionId, string[]>;

function mutableEffective(stored: ShortcutBindings): MutableBindings {
  const effective = effectiveBindings(stored);
  return Object.fromEntries(ACTION_IDS.map((id) => [id, [...effective[id]]])) as MutableBindings;
}

function removeFromOthers(bindings: MutableBindings, combo: string, keep: ActionId): void {
  for (const id of ACTION_IDS) {
    if (id !== keep) bindings[id] = bindings[id].filter((other) => other !== combo);
  }
}

/**
 * Puts a combo in one of an action's two slots (a slot past the end appends).
 * Reserved, blocked and malformed combos are never stored, and a combo another
 * action owns is only taken with `reassign`; in those cases `stored` is returned
 * unchanged. A combo already in the other slot of the same action swaps places.
 */
export function assignBinding(
  stored: ShortcutBindings,
  actionId: ActionId,
  slot: 0 | 1,
  combo: string,
  { reassign = false }: { reassign?: boolean } = {},
): ShortcutBindings {
  if (slot < 0 || slot >= MAX_BINDINGS_PER_ACTION) return stored;
  const { kind } = classifyCombo(combo);
  if (kind === "reserved" || kind === "blocked") return stored;
  const bindings = mutableEffective(stored);
  if (findConflict(bindings, combo, actionId) !== null && !reassign) return stored;

  const own = bindings[actionId];
  const existing = own.indexOf(combo);
  if (existing === slot) return stored;
  if (existing !== -1) {
    if (slot >= own.length) return stored;
    [own[slot], own[existing]] = [own[existing]!, own[slot]!];
  } else if (slot < own.length) {
    own[slot] = combo;
  } else {
    own.push(combo);
  }
  removeFromOthers(bindings, combo, actionId);
  return diffFromDefault(bindings);
}

/** Removes the key in a slot; a second key moves up into the first slot. */
export function clearBinding(
  stored: ShortcutBindings,
  actionId: ActionId,
  slot: 0 | 1,
): ShortcutBindings {
  const bindings = mutableEffective(stored);
  if (slot < 0 || slot >= bindings[actionId].length) return stored;
  bindings[actionId].splice(slot, 1);
  return diffFromDefault(bindings);
}

/**
 * Gives an action the keys of the current preset again. A key that another
 * action took since is taken back from it, so the action always ends up
 * exactly as the preset defines it.
 */
export function resetAction(
  stored: ShortcutBindings,
  actionId: ActionId,
  presetId: PresetId = "default",
): ShortcutBindings {
  const bindings = mutableEffective(stored);
  const target = presetBindings(presetId)[actionId];
  bindings[actionId] = [...target];
  for (const combo of target) removeFromOthers(bindings, combo, actionId);
  return diffFromDefault(bindings);
}

/** Every action back to a preset (Default unless told otherwise). */
export function resetAll(presetId: PresetId = "default"): ShortcutBindings {
  return diffFromDefault(presetBindings(presetId));
}
