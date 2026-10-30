/**
 * Keyboard shortcut vocabulary: stable action ids, the binding grammar and the
 * default key map. Pure data and functions, with no storage or React imports,
 * so the preference registry, the store and the dispatcher can all depend on it.
 */

/** Stable storage contract: ids are persisted in preferences and must never be renamed. */
export const ACTION_IDS = [
  "tool.select",
  "tool.hand",
  "tool.line",
  "tool.polyline",
  "tool.polygon",
  "tool.rectangle",
  "tool.ellipse",
  "tool.cloud",
  "tool.count",
  "tool.calibrate",
  "mode.orthogonal",
  "mode.snap",
  "edit.undo",
  "edit.redo",
  "edit.copy",
  "edit.paste",
  "edit.delete",
  "edit.duplicate",
  "edit.rename",
  "measurement.toggleDetails",
  "measurement.toggleVisibility",
  "view.zoomIn",
  "view.zoomOut",
  "view.fitPage",
  "view.fitWidth",
  "view.actualSize",
  "page.previous",
  "page.next",
  "page.first",
  "page.last",
  "page.panel",
  "workspace.next",
  "workspace.previous",
  "workspace.measurements",
  "workspace.takeoff",
  "workspace.classifications",
  "workspace.scales",
  "app.projects",
  "app.export",
  "app.settings",
  "app.toggleTheme",
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export const PRESET_IDS = [
  "default",
  "legacy",
  "keyboard-first",
  "left-hand",
  "essentials",
  "right-hand",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

/** What is stored: only the actions that differ from Default; `[]` means "no shortcut". */
export type ShortcutBindings = Readonly<Partial<Record<ActionId, readonly string[]>>>;

export const EMPTY_SHORTCUT_BINDINGS: ShortcutBindings = Object.freeze({});

/** Each action shows two key slots in Settings. */
export const MAX_BINDINGS_PER_ACTION = 2;

/**
 * Default is Legacy plus keys for the actions that had none, so it is not the
 * previous behaviour: the update notice depends on this flag.
 */
export const DEFAULT_CHANGES_LEGACY = true;

/**
 * Binding grammar: `Mod+Alt+Shift+KEY` with the prefixes in that fixed order.
 * Mod is Ctrl or Command (exactly one), letters are uppercase, and Shift only
 * exists for letters and named keys because it changes the character of digits
 * and symbols. Mod and Alt never combine: AltGr is reported as Ctrl+Alt.
 */
const NAMED_KEYS: ReadonlySet<string> = new Set([
  "Delete",
  "Backspace",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
]);

const SYMBOL_KEYS = "+-=,.";

/** Keys the fixed (non-customizable) handlers consume; events report them but they never bind. */
const FIXED_KEYS: ReadonlySet<string> = new Set([
  "Enter",
  "Escape",
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

/**
 * Keys that no binding may use because a fixed handler consumes them: the
 * viewer's pan, finish and cancel keys, keyboard geometry (arrows, E, N, [ ])
 * and focus navigation. Compared against `eventToCombo` output.
 */
export const RESERVED: ReadonlySet<string> = new Set([
  "Space",
  "Shift+Space",
  "Enter",
  "Escape",
  "Tab",
  "Shift+Tab",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Shift+ArrowLeft",
  "Shift+ArrowRight",
  "Shift+ArrowUp",
  "Shift+ArrowDown",
  "E",
  "Shift+E",
  "N",
  "Shift+N",
  "[",
  "]",
]);

export interface ParsedBinding {
  readonly mod: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly key: string;
}

const isLetterKey = (key: string): boolean => /^[A-Z]$/.test(key);

const isBindableKey = (key: string): boolean =>
  isLetterKey(key) ||
  /^[0-9]$/.test(key) ||
  (key.length === 1 && SYMBOL_KEYS.includes(key)) ||
  NAMED_KEYS.has(key);

/** Shift is meaningful for letters and named keys; digits and symbols already encode it. */
const shiftApplies = (key: string): boolean =>
  isLetterKey(key) || NAMED_KEYS.has(key) || FIXED_KEYS.has(key) || key === "Space";

export function serializeBinding({ mod, alt, shift, key }: ParsedBinding): string {
  return `${mod ? "Mod+" : ""}${alt ? "Alt+" : ""}${shift ? "Shift+" : ""}${key}`;
}

/**
 * Strict parser: returns null unless `text` is already in canonical form, so
 * `serializeBinding(parseBinding(text)) === text` for every accepted binding.
 * Prefixes are stripped in order and what remains is the key, hence `Mod++`.
 */
export function parseBinding(text: string): ParsedBinding | null {
  let rest = text;
  const strip = (prefix: string): boolean => {
    if (!rest.startsWith(prefix) || rest.length === prefix.length) return false;
    rest = rest.slice(prefix.length);
    return true;
  };
  const mod = strip("Mod+");
  const alt = strip("Alt+");
  const shift = strip("Shift+");
  if (mod && alt) return null;
  if (!isBindableKey(rest)) return null;
  if (shift && !shiftApplies(rest)) return null;
  return { mod, alt, shift, key: rest };
}

/** Whether a combo may be stored for an action: canonical and not owned by a fixed handler. */
export function isAssignableBinding(value: unknown): value is string {
  return typeof value === "string" && parseBinding(value) !== null && !RESERVED.has(value);
}

function isBindingList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_BINDINGS_PER_ACTION &&
    value.every(isAssignableBinding) &&
    new Set(value).size === value.length
  );
}

const ACTION_ID_SET: ReadonlySet<string> = new Set(ACTION_IDS);

/** Strict check used when a whole bindings map is set at once. */
export function isShortcutBindings(value: unknown): value is ShortcutBindings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([id, list]) => ACTION_ID_SET.has(id) && isBindingList(list));
}

/**
 * Lenient reader for stored data: drops only the invalid entries (unknown ids
 * and lists that are too long, non-canonical, reserved or duplicated) and keeps
 * the rest, so one corrupt entry never resets the user's other shortcuts.
 * Collisions between actions are not an error here; the store resolves them.
 */
export function sanitizeShortcutBindings(raw: unknown): ShortcutBindings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_SHORTCUT_BINDINGS;
  const source = raw as Record<string, unknown>;
  const result: Partial<Record<ActionId, readonly string[]>> = {};
  let kept = false;
  for (const id of ACTION_IDS) {
    const list = source[id];
    if (!isBindingList(list)) continue;
    result[id] = Object.freeze([...list]);
    kept = true;
  }
  return kept ? Object.freeze(result) : EMPTY_SHORTCUT_BINDINGS;
}

/** The subset of a keyboard event the combo normalization reads. */
export type ComboEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
> & {
  code?: string;
  getModifierState?: (key: string) => boolean;
};

function comboKey(event: ComboEvent): string | null {
  const { key } = event;
  // IME composition and dead keys have no stable character to bind.
  if (key === "Dead" || key === "Process" || key === "Unidentified") return null;
  // Option/Alt rewrites the character on macOS (Option+L types ¬), so Alt reads the physical key.
  if (event.altKey) {
    const physical = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(event.code ?? "");
    if (physical) return physical[1] ?? physical[2]!;
  }
  if (key === " ") return "Space";
  if (NAMED_KEYS.has(key) || FIXED_KEYS.has(key)) return key;
  if ([...key].length !== 1) return null;
  const upper = key.toUpperCase();
  // Only a plain case pair folds to a letter key: the Turkish dotless "ı" must not become "I".
  const folds =
    upper !== key.toLowerCase() &&
    upper.length === key.length &&
    upper.toLowerCase() === key.toLowerCase();
  return folds ? upper : key;
}

/**
 * Normalizes a keydown to the binding grammar, or null when it cannot be a
 * shortcut (modifier-only presses, dead keys, Ctrl+Meta, Mod+Alt, AltGr).
 * Mod reads `key`, not `code`, so Ctrl+Z follows the layout (AZERTY included).
 * The result may name a key that cannot be bound (Enter, "/"): check it with
 * `parseBinding` and `RESERVED` before storing it.
 */
export function eventToCombo(event: ComboEvent): string | null {
  const { ctrlKey, metaKey, altKey } = event;
  if (ctrlKey && metaKey) return null;
  const mod = ctrlKey || metaKey;
  if (mod && altKey) return null;
  if (event.getModifierState?.("AltGraph")) return null;
  const key = comboKey(event);
  if (key === null) return null;
  return serializeBinding({ mod, alt: altKey, shift: event.shiftKey && shiftApplies(key), key });
}

const keys = (...combos: string[]): readonly string[] => combos;

/**
 * The `default` preset: today's keys (Legacy) kept as they are, plus keys for
 * the actions that had none. Every action has an entry; `[]` is "no shortcut".
 */
export const DEFAULT_BINDINGS: Readonly<Record<ActionId, readonly string[]>> = Object.freeze({
  "tool.select": keys("V"),
  "tool.hand": keys("H"),
  "tool.line": keys("L"),
  "tool.polyline": keys("M"),
  "tool.polygon": keys("P"),
  "tool.rectangle": keys("R"),
  "tool.ellipse": keys("I"),
  "tool.cloud": keys("K"),
  "tool.count": keys("C"),
  "tool.calibrate": keys(),
  "mode.orthogonal": keys("O"),
  "mode.snap": keys("S"),
  "edit.undo": keys("Mod+Z"),
  "edit.redo": keys("Mod+Shift+Z", "Mod+Y"),
  "edit.copy": keys("Mod+C"),
  "edit.paste": keys("Mod+V"),
  "edit.delete": keys("Delete", "Backspace"),
  "edit.duplicate": keys("Mod+D"),
  "edit.rename": keys("F2"),
  "measurement.toggleDetails": keys(),
  "measurement.toggleVisibility": keys(),
  "view.zoomIn": keys("+", "="),
  "view.zoomOut": keys("-"),
  "view.fitPage": keys("F"),
  "view.fitWidth": keys("W"),
  "view.actualSize": keys("0"),
  "page.previous": keys("PageUp"),
  "page.next": keys("PageDown"),
  "page.first": keys("Home"),
  "page.last": keys("End"),
  "page.panel": keys("T"),
  "workspace.next": keys(),
  "workspace.previous": keys(),
  "workspace.measurements": keys("1"),
  "workspace.takeoff": keys("2"),
  "workspace.classifications": keys("3"),
  "workspace.scales": keys("4"),
  "app.projects": keys("Mod+O"),
  "app.export": keys("Mod+E"),
  "app.settings": keys("Mod+,"),
  "app.toggleTheme": keys(),
});
