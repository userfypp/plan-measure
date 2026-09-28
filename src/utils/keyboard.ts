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

export function shouldIgnoreKeyboardShortcut(event: KeyboardShortcutEvent): boolean {
  return (
    event.defaultPrevented ||
    hasKeyboardShortcutModifier(event) ||
    shouldIgnoreGlobalKeyboardShortcut(event.target)
  );
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

export type HistoryKeyboardAction = "undo" | "redo";

export function getHistoryKeyboardAction(
  event: KeyboardShortcutEvent,
): HistoryKeyboardAction | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.metaKey === event.ctrlKey ||
    shouldIgnoreMeasurementClipboardShortcutTarget(event.target) ||
    event.key.toLowerCase() !== "z"
  ) {
    return null;
  }
  return event.shiftKey ? "redo" : "undo";
}

export type MeasurementKeyboardAction =
  "copy-measurement" | "delete-measurement" | "paste-measurement";

/**
 * Application-level copy/paste stays available after non-editing application
 * controls receive focus. Editable controls and dialogs retain native clipboard
 * behavior. Delete/Backspace follows the same non-editing focus policy as viewer shortcuts.
 */
export function getMeasurementKeyboardAction(
  event: KeyboardShortcutEvent,
): MeasurementKeyboardAction | null {
  if (event.key === "Delete" || event.key === "Backspace") {
    return shouldIgnoreViewerKeyboardShortcut(event) ? null : "delete-measurement";
  }

  if (
    event.defaultPrevented ||
    shouldIgnoreMeasurementClipboardShortcutTarget(event.target) ||
    event.repeat ||
    event.altKey ||
    event.shiftKey ||
    event.metaKey === event.ctrlKey
  ) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === "c") return "copy-measurement";
  if (key === "v") return "paste-measurement";
  return null;
}

export type DrawingKeyboardAction =
  "cancel-calibration" | "cancel-draft" | "complete-path" | "exit-tool";

export type ToolShortcut = Exclude<Tool, "calibrate">;

export type ShortcutAction =
  | "toggle-orthogonal"
  | "toggle-snap"
  | { type: "choose-tool"; tool: ToolShortcut };

export interface ViewerShortcut {
  key: string;
  label: string;
  action: ShortcutAction;
}

/**
 * Single source of truth for the viewer's tool and drawing-mode shortcuts.
 * Toolbar labels and keyboard dispatch both derive from this registry.
 */
export const viewerShortcuts: readonly ViewerShortcut[] = [
  { key: "v", label: "Select", action: { type: "choose-tool", tool: "select" } },
  { key: "h", label: "Hand", action: { type: "choose-tool", tool: "hand" } },
  { key: "l", label: "Line", action: { type: "choose-tool", tool: "line" } },
  { key: "m", label: "Polyline", action: { type: "choose-tool", tool: "polyline" } },
  { key: "p", label: "Polygon", action: { type: "choose-tool", tool: "polygon" } },
  { key: "o", label: "Ortho 90°", action: "toggle-orthogonal" },
  { key: "s", label: "Snap", action: "toggle-snap" },
];

export type ViewerKeyboardAction =
  DrawingKeyboardAction | "start-pan" | "zoom-in" | "zoom-out" | ShortcutAction;

function findShortcut(key: string): ViewerShortcut | null {
  return viewerShortcuts.find((shortcut) => shortcut.key === key.toLowerCase()) ?? null;
}

export function getToolShortcut(key: string): ToolShortcut | null {
  const action = findShortcut(key)?.action;
  return action && typeof action !== "string" ? action.tool : null;
}

export function getToolShortcutLabel(tool: ToolShortcut): string | null {
  const shortcut = viewerShortcuts.find(
    (entry) => typeof entry.action !== "string" && entry.action.tool === tool,
  );
  return shortcut?.key.toUpperCase() ?? null;
}

export function getShortcutLabel(action: ShortcutAction): string | null {
  const shortcut = viewerShortcuts.find((entry) => {
    if (typeof entry.action === "string" || typeof action === "string") {
      return entry.action === action;
    }
    return entry.action.tool === action.tool;
  });
  return shortcut?.key.toUpperCase() ?? null;
}

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
  if (tool === "line" && !draft) return "exit-tool";
  return null;
}

/** Keep editing and native control activation ahead of application shortcuts. */
export function shouldIgnoreViewerKeyboardShortcut(event: KeyboardShortcutEvent): boolean {
  if (event.defaultPrevented || event.isComposing || hasKeyboardShortcutModifier(event)) return true;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.isContentEditable ||
    target.matches("input, textarea, select") ||
    target.closest("input, textarea, select, [contenteditable], dialog, [role='dialog'], [role='menu'], [role='listbox']")
  ) return true;
  return (event.key === " " || event.key === "Enter") && Boolean(
    target.matches("button, a, [role='button'], [role='link'], [role='checkbox'], [role='switch'], [role='radio']") ||
    target.closest("button, a, [role='button'], [role='link'], [role='checkbox'], [role='switch'], [role='radio']"),
  );
}

/** Application-wide viewer shortcuts, except editing and native control keys. */
export function getViewerKeyboardAction(
  event: KeyboardShortcutEvent,
  tool: Tool,
  draft: DrawingDraft | null,
): ViewerKeyboardAction | null {
  if (shouldIgnoreViewerKeyboardShortcut(event)) return null;

  if (event.key === " ") return "start-pan";
  if (event.key === "+" || event.key === "=") return "zoom-in";
  if (event.key === "-") return "zoom-out";

  const drawingAction = getDrawingKeyboardAction(event.key, tool, draft);
  if (drawingAction) return drawingAction;

  return findShortcut(event.key)?.action ?? null;
}
