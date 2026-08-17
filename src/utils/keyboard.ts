export function shouldIgnoreGlobalKeyboardShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.matches(
      "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='link']",
    ) ||
    Boolean(target.closest("dialog"))
  );
}
