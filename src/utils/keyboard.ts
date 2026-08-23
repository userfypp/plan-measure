import type { DrawingDraft, Tool } from "../types/domain";

export function shouldIgnoreGlobalKeyboardShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.matches(
      "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='link']",
    ) ||
    Boolean(target.closest("dialog"))
  );
}

export type DrawingKeyboardAction =
  | "cancel-calibration"
  | "cancel-draft"
  | "complete-polygon"
  | "exit-tool";

export type ToolShortcut = Exclude<Tool, "calibrate">;

export function getToolShortcut(key: string): ToolShortcut | null {
  switch (key.toLowerCase()) {
    case "p":
      return "polygon";
    case "l":
      return "line";
    case "h":
      return "hand";
    case "v":
      return "select";
    default:
      return null;
  }
}

export function getDrawingKeyboardAction(
  key: string,
  tool: Tool,
  draft: DrawingDraft | null,
): DrawingKeyboardAction | null {
  if (key === "Escape") {
    if (tool === "calibrate") return "cancel-calibration";
    if (tool === "line" || tool === "polygon") {
      return draft ? "cancel-draft" : "exit-tool";
    }
    return null;
  }

  if (key !== "Enter") return null;
  if (tool === "polygon") {
    if (!draft) return "exit-tool";
    return draft.type === "polygon" && draft.points.length >= 3 ? "complete-polygon" : null;
  }
  if (tool === "line" && !draft) return "exit-tool";
  return null;
}
