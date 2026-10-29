import defaultCursor from "./cursors/default.png";
import crosshairCursor from "./cursors/crosshair.png";
import grabCursor from "./cursors/grab.png";
import grabbingCursor from "./cursors/grabbing.png";

// Standard macOS NSCursor images at 2x resolution, with their logical sizes and
// AppKit hotspots. Preserve the native shape and click location in the fallback.
export const SOFTWARE_CURSORS = {
  default: { src: defaultCursor, width: 28, height: 40, x: 5, y: 5 },
  crosshair: { src: crosshairCursor, width: 24, height: 24, x: 11, y: 11 },
  grab: { src: grabCursor, width: 32, height: 32, x: 15, y: 16 },
  grabbing: { src: grabbingCursor, width: 32, height: 32, x: 15, y: 16 },
};

// WebKit on macOS hides NSCursor after a handled keydown until the mouse moves.
// The viewer uses keyboard shortcuts while the pointer must remain visible.
// See WebKit UIProcess/mac/WebViewImpl.mm, doneWithKeyEvent:
// https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/mac/WebViewImpl.mm
export function needsSoftwareCursor(): boolean {
  return navigator.vendor === "Apple Computer, Inc." && navigator.userAgent.includes("Macintosh");
}
