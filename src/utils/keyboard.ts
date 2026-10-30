import type { DrawingDraft, Tool } from "../types/domain";
import { isMeasurementType, measurementPathSpecs } from "./geometry";

export type KeyboardShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "repeat" | "shiftKey" | "target"
> & { isComposing?: boolean };

export function shouldIgnoreGlobalKeyboardShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.matches(
      "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='link']",
    ) || Boolean(target.closest("dialog"))
  );
}

/**
 * Browser, operating-system, and assistive-technology shortcuts always take precedence.
 * Shift is intentionally allowed so letter shortcuts remain case-insensitive.
 */
export function hasKeyboardShortcutModifier(event: KeyboardShortcutEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

export function shouldIgnoreMeasurementClipboardShortcutTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.isContentEditable ||
    Boolean(target.closest("[contenteditable]")) ||
    target.matches("textarea, select") ||
    Boolean(target.closest("dialog, [role='dialog']"))
  ) {
    return true;
  }
  if (!target.matches("input")) return false;
  const inputType = target.getAttribute("type")?.toLocaleLowerCase() ?? "text";
  return !["button", "checkbox", "radio", "range", "reset", "submit"].includes(inputType);
}

export type DrawingKeyboardAction =
  "cancel-calibration" | "cancel-draft" | "complete-path" | "exit-tool";

export type ToolShortcut = Exclude<Tool, "calibrate">;

export type ShortcutAction =
  "toggle-orthogonal" | "toggle-snap" | { type: "choose-tool"; tool: ToolShortcut };

export type ViewerKeyboardAction =
  | DrawingKeyboardAction
  | "start-pan"
  | "zoom-in"
  | "zoom-out"
  | "fit-page"
  | "fit-width"
  | "actual"
  | ShortcutAction;

export function getDrawingKeyboardAction(
  key: string,
  tool: Tool,
  draft: DrawingDraft | null,
): DrawingKeyboardAction | null {
  if (key === "Escape") {
    if (tool === "calibrate") return "cancel-calibration";
    if (isMeasurementType(tool)) {
      return draft ? "cancel-draft" : "exit-tool";
    }
    return null;
  }

  if (key !== "Enter") return null;
  if (isMeasurementType(tool) && measurementPathSpecs[tool].maxVertices === null) {
    if (!draft) return "exit-tool";
    return draft.type === "path" &&
      draft.measurementType === tool &&
      draft.points.length >= measurementPathSpecs[tool].minVertices
      ? "complete-path"
      : null;
  }
  if ((tool === "line" || tool === "count") && !draft) return "exit-tool";
  return null;
}

/** Keep editing and native control activation ahead of application shortcuts. */
export function shouldIgnoreViewerKeyboardShortcut(event: KeyboardShortcutEvent): boolean {
  if (event.defaultPrevented || event.isComposing || hasKeyboardShortcutModifier(event))
    return true;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.isContentEditable ||
    target.matches("input, textarea, select") ||
    target.closest(
      "input, textarea, select, [data-select-trigger], [contenteditable], dialog, [role='dialog'], [role='menu'], [role='listbox']",
    )
  )
    return true;
  return (
    (event.key === " " || event.key === "Enter") &&
    Boolean(
      target.matches(
        "button, a, [role='button'], [role='link'], [role='checkbox'], [role='switch'], [role='radio']",
      ) ||
      target.closest(
        "button, a, [role='button'], [role='link'], [role='checkbox'], [role='switch'], [role='radio']",
      ),
    )
  );
}

/** The viewer keys that cannot be rebound: temporary pan and the drawing finish/cancel keys. */
export function getFixedViewerKeyboardAction(
  event: KeyboardShortcutEvent,
  tool: Tool,
  draft: DrawingDraft | null,
): DrawingKeyboardAction | "start-pan" | null {
  if (shouldIgnoreViewerKeyboardShortcut(event)) return null;
  if (event.key === " ") return "start-pan";
  return getDrawingKeyboardAction(event.key, tool, draft);
}
