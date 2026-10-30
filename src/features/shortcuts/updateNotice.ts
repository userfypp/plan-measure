import { bindingsDiffBetween, presetBindings } from "./presets";

/** Text of the one-time "Shortcuts updated" notification: how many keys Default adds to Legacy. */
export function shortcutsUpdatedMessage(): string {
  const added = bindingsDiffBetween(presetBindings("legacy"), presetBindings("default")).reduce(
    (total, { before, after }) => total + after.filter((combo) => !before.includes(combo)).length,
    0,
  );
  return `Shortcuts updated. ${added} shortcuts were added; your current keys still work.`;
}
