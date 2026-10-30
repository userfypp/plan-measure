import { useSyncExternalStore } from "react";
import { getAppPreferences, subscribeAppPreferences } from "../appPreferences";
import {
  ACTION_IDS,
  DEFAULT_BINDINGS,
  parseBinding,
  type ActionId,
  type ShortcutBindings,
} from "./bindings";

export type ResolvedBindings = Readonly<Record<ActionId, readonly string[]>>;

/**
 * Everything derived from the stored bindings. It is rebuilt only when the
 * stored map or the platform changes, so callers can rely on its identity.
 */
export interface ShortcutSnapshot {
  readonly byAction: ResolvedBindings;
  /** Combo to action, for dispatching a keydown. */
  readonly byCombo: ReadonlyMap<string, ActionId>;
  /** The first binding of each action as shown to the user, or "" when it has none. */
  readonly labels: Readonly<Record<ActionId, string>>;
  /** All bindings of each action as `aria-keyshortcuts` text, or "" when it has none. */
  readonly aria: Readonly<Record<ActionId, string>>;
}

/**
 * Stored bindings replace Default per action. A combo can belong to one action:
 * stored lists claim theirs first (in `ACTION_IDS` order when two collide), and
 * an inherited default that collides with a claimed combo is dropped.
 */
export function resolveBindings(stored: ShortcutBindings): ResolvedBindings {
  const claimed = new Set<string>();
  const resolved = {} as Record<ActionId, readonly string[]>;
  const claim = (id: ActionId, list: readonly string[]) => {
    const kept = list.filter((combo) => !claimed.has(combo));
    kept.forEach((combo) => claimed.add(combo));
    resolved[id] = Object.freeze(kept);
  };
  for (const id of ACTION_IDS) {
    const list = stored[id];
    if (list) claim(id, list);
  }
  for (const id of ACTION_IDS) {
    if (!stored[id]) claim(id, DEFAULT_BINDINGS[id]);
  }
  return Object.freeze(resolved);
}

// Case-insensitive: `userAgentData.platform` says "macOS", `navigator.platform` says "MacIntel".
const APPLE_PLATFORM = /Mac|iP(hone|ad)/i;

type NavigatorWithUserAgentData = Navigator & { userAgentData?: { platform?: string } };

function readPlatform(): string {
  if (typeof navigator === "undefined") return "";
  const { userAgentData, platform } = navigator as NavigatorWithUserAgentData;
  return userAgentData?.platform ?? platform ?? "";
}

/** `Ctrl+Shift+Z`, or `⌘⇧Z` on Apple platforms. */
export function formatBinding(combo: string, apple = APPLE_PLATFORM.test(readPlatform())): string {
  const parsed = parseBinding(combo);
  if (!parsed) return combo;
  if (apple) {
    return `${parsed.mod ? "⌘" : ""}${parsed.alt ? "⌥" : ""}${parsed.shift ? "⇧" : ""}${parsed.key}`;
  }
  return [parsed.mod && "Ctrl", parsed.alt && "Alt", parsed.shift && "Shift", parsed.key]
    .filter(Boolean)
    .join("+");
}

/** W3C `aria-keyshortcuts` tokens for one binding; Mod expands to Control and Meta. */
export function formatBindingAria(combo: string): string {
  const parsed = parseBinding(combo);
  if (!parsed) return combo;
  const tokens = (mod: string | false) =>
    [mod, parsed.alt && "Alt", parsed.shift && "Shift", parsed.key].filter(Boolean).join("+");
  return parsed.mod ? `${tokens("Control")} ${tokens("Meta")}` : tokens(false);
}

function buildSnapshot(stored: ShortcutBindings, apple: boolean): ShortcutSnapshot {
  const byAction = resolveBindings(stored);
  const byCombo = new Map<string, ActionId>();
  const labels = {} as Record<ActionId, string>;
  const aria = {} as Record<ActionId, string>;
  for (const id of ACTION_IDS) {
    const list = byAction[id];
    list.forEach((combo) => byCombo.set(combo, id));
    labels[id] = list[0] ? formatBinding(list[0], apple) : "";
    aria[id] = list.map(formatBindingAria).join(" ");
  }
  return Object.freeze({
    byAction,
    byCombo,
    labels: Object.freeze(labels),
    aria: Object.freeze(aria),
  });
}

let cached: { stored: ShortcutBindings; platform: string; snapshot: ShortcutSnapshot } | null =
  null;

/** Memoized on the identity of the stored map, so unrelated preference changes cost nothing. */
export function getShortcutSnapshot(): ShortcutSnapshot {
  const stored = getAppPreferences().shortcutBindings;
  const platform = readPlatform();
  if (!cached || cached.stored !== stored || cached.platform !== platform) {
    cached = { stored, platform, snapshot: buildSnapshot(stored, APPLE_PLATFORM.test(platform)) };
  }
  return cached.snapshot;
}

/** The first binding of an action as text for tooltips and menus, or "" when it has none. */
export function getShortcutLabel(id: ActionId): string {
  return getShortcutSnapshot().labels[id];
}

/** The shortcut label of one action; re-renders only when that string changes. */
export function useShortcutLabel(id: ActionId): string {
  return useSyncExternalStore(
    subscribeAppPreferences,
    () => getShortcutSnapshot().labels[id],
    () => getShortcutSnapshot().labels[id],
  );
}

/** The `aria-keyshortcuts` value of one action, or "" when it has none. */
export function useShortcutAria(id: ActionId): string {
  return useSyncExternalStore(
    subscribeAppPreferences,
    () => getShortcutSnapshot().aria[id],
    () => getShortcutSnapshot().aria[id],
  );
}

/** Every label at once, for surfaces that render many (the snapshot map is stable). */
export function useShortcutLabels(): Readonly<Record<ActionId, string>> {
  return useSyncExternalStore(
    subscribeAppPreferences,
    () => getShortcutSnapshot().labels,
    () => getShortcutSnapshot().labels,
  );
}
