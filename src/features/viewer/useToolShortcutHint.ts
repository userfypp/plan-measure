import { useSyncExternalStore } from "react";
import { subscribeAppPreferences } from "../../utils/appPreferences";
import { getShortcutSnapshot, type ShortcutSnapshot } from "../../utils/shortcuts/store";
import { toolRailRegistry } from "./toolRegistry";

const keyList = new Intl.ListFormat("en", { type: "disjunction" });

let cached: { labels: ShortcutSnapshot["labels"]; hint: string } | null = null;

/** "Use V, H, or L to select a tool.", or "" when no tool has a shortcut. */
function toolShortcutHint(): string {
  const { labels } = getShortcutSnapshot();
  if (cached?.labels !== labels) {
    // Derived from the tool registry so a new tool is announced with the others.
    const keys = toolRailRegistry.flatMap(({ actionId }) => (actionId && labels[actionId]) || []);
    cached = { labels, hint: keys.length ? `Use ${keyList.format(keys)} to select a tool.` : "" };
  }
  return cached.hint;
}

/** The tool-key hint for the viewer's accessible name; a string, so it re-renders only when it changes. */
export function useToolShortcutHint(): string {
  return useSyncExternalStore(subscribeAppPreferences, toolShortcutHint, toolShortcutHint);
}
