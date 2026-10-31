import { OVERLAY_THUMB_CLASS } from "./overlayScrollbars";

/** Attribute of the rows that light up under the pointer; styled by the row's own stylesheet. */
export const HOVER_ROW_ATTRIBUTE = "data-hover-row";
/** Set on the row under the pointer, by `installScrollHover` and nothing else. */
export const HOVER_ACTIVE_ATTRIBUTE = "data-hover";

const SELECTOR = `[${HOVER_ROW_ATTRIBUTE}]`;
const LISTENER_OPTIONS = { capture: true, passive: true };

/**
 * Browsers refresh `:hover` while a list scrolls only on a timer (about every 100 ms) or once the
 * scroll ends, so the highlight trails the pointer. This keeps the row under a still pointer in
 * step with every scrolled frame instead: it remembers the pointer, and each frame a pointer move
 * or a scroll happens it asks which row is under it and moves `data-hover` there. It writes one
 * attribute and never touches React state, so scrolling renders nothing. Returns the cleanup.
 */
export function installScrollHover(doc: Document = document): () => void {
  // A negative x means the pointer is outside the page: nothing is lit.
  let x = -1;
  let y = 0;
  let frame = 0;
  let current: Element | null = null;

  function mark(next: Element | null) {
    if (next === current) return;
    current?.removeAttribute(HOVER_ACTIVE_ATTRIBUTE);
    next?.setAttribute(HOVER_ACTIVE_ATTRIBUTE, "");
    current = next;
  }

  function sync() {
    frame = 0;
    const hit = x < 0 ? null : doc.elementFromPoint(x, y);
    // The overlay scrollbar sits over the row's edge: the row stays lit while the thumb is grabbed.
    if (hit?.classList.contains(OVERLAY_THUMB_CLASS)) return;
    mark(hit?.closest(SELECTOR) ?? null);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    x = event.clientX;
    y = event.clientY;
    schedule();
  };
  const onPointerLeave = () => {
    x = -1;
    schedule();
  };
  const onScroll = () => {
    if (x >= 0) schedule();
  };

  doc.addEventListener("pointermove", onPointerMove, LISTENER_OPTIONS);
  doc.documentElement.addEventListener("pointerleave", onPointerLeave);
  doc.addEventListener("scroll", onScroll, LISTENER_OPTIONS);

  return () => {
    cancelAnimationFrame(frame);
    doc.removeEventListener("pointermove", onPointerMove, LISTENER_OPTIONS);
    doc.documentElement.removeEventListener("pointerleave", onPointerLeave);
    doc.removeEventListener("scroll", onScroll, LISTENER_OPTIONS);
    mark(null);
  };
}
