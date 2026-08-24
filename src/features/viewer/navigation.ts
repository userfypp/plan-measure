import type { Tool } from "../../types/domain";

/**
 * Hand and Space use the primary button; the middle button always invokes the
 * same transient-pan path, whatever drawing tool is currently active.
 */
export function startsViewerPan(tool: Tool, spacePan: boolean, button: number): boolean {
  return button === 1 || (button === 0 && (tool === "hand" || spacePan));
}

/**
 * Geometry and selection use primary-button clicks only. This keeps auxiliary
 * mouse buttons from becoming drawing input after a navigation gesture.
 */
export function isPrimaryViewerClick(button: number): boolean {
  return button === 0;
}
