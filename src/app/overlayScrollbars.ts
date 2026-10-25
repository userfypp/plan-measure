/** Class of the scrollers that hide their native scrollbar and get an overlay thumb instead. */
export const OVERLAY_SCROLL_CLASS = "overlayScroll";
/** Class of the thumbs; styled by `scrollSurface.css`. */
export const OVERLAY_THUMB_CLASS = "overlayScrollThumb";

const MIN_THUMB_SIZE = 24;
const THUMB_THICKNESS = "var(--space-8)";

type Axis = "x" | "y";

interface Thumb {
  axis: Axis;
  element: HTMLDivElement;
}

interface Tracked {
  fixed: boolean;
  thumbs: Thumb[];
}

const AXES = {
  y: { client: "clientHeight", scroll: "scrollHeight", position: "scrollTop" },
  x: { client: "clientWidth", scroll: "scrollWidth", position: "scrollLeft" },
} as const;

function scrollsOn(style: CSSStyleDeclaration, axis: Axis): boolean {
  const overflow = axis === "y" ? style.overflowY : style.overflowX;
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

/**
 * Replaces the native scrollbar of every `.overlayScroll` element in the document with a thin
 * translucent thumb drawn over its content, so scrollbars never take layout width. Each thumb is
 * the scroller's next sibling, absolutely positioned: it shares the scroller's stacking context,
 * clipping and transforms (dialogs, popovers), and is updated from scroll and resize events, never
 * from React renders. Returns the cleanup that removes the thumbs.
 */
export function installOverlayScrollbars(root: HTMLElement = document.body): () => void {
  const tracked = new Map<HTMLElement, Tracked>();
  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => schedule());
  const pending: Element[] = [root];
  let frame = 0;

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function createThumb(scroller: HTMLElement, axis: Axis, zIndex: string): Thumb {
    const element = document.createElement("div");
    // A positioned scroller with its own z-index (popovers, the toolbar) would cover a sibling thumb.
    if (zIndex !== "auto") element.style.zIndex = String(Number(zIndex) + 1);
    element.className = OVERLAY_THUMB_CLASS;
    element.dataset.axis = axis;
    element.setAttribute("aria-hidden", "true");
    element.style.display = "none";
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      element.setPointerCapture?.(event.pointerId);
      const { client, scroll, position } = AXES[axis];
      const start = axis === "y" ? event.clientY : event.clientX;
      const startPosition = scroller[position];
      element.dataset.dragging = "";
      const move = (moveEvent: PointerEvent) => {
        const size = axis === "y" ? element.offsetHeight : element.offsetWidth;
        const track = scroller[client] - size;
        if (track <= 0) return;
        const current = axis === "y" ? moveEvent.clientY : moveEvent.clientX;
        scroller[position] =
          startPosition + ((current - start) * (scroller[scroll] - scroller[client])) / track;
      };
      const end = () => {
        delete element.dataset.dragging;
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", end);
        element.removeEventListener("pointercancel", end);
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", end);
      element.addEventListener("pointercancel", end);
    });
    return { axis, element };
  }

  function track(scroller: HTMLElement) {
    if (tracked.has(scroller)) return;
    const style = getComputedStyle(scroller);
    const thumbs = (["y", "x"] as const)
      .filter((axis) => scrollsOn(style, axis))
      .map((axis) => createThumb(scroller, axis, style.zIndex));
    tracked.set(scroller, { fixed: style.position === "fixed", thumbs });
    resizeObserver?.observe(scroller);
    for (const child of Array.from(scroller.children)) resizeObserver?.observe(child);
  }

  function untrack(scroller: HTMLElement) {
    for (const { element } of tracked.get(scroller)?.thumbs ?? []) element.remove();
    tracked.delete(scroller);
    resizeObserver?.unobserve(scroller);
    for (const child of Array.from(scroller.children)) resizeObserver?.unobserve(child);
  }

  function discover() {
    for (const node of pending.splice(0)) {
      if (!node.isConnected) continue;
      if (node.matches(`.${OVERLAY_SCROLL_CLASS}`)) track(node as HTMLElement);
      for (const scroller of node.querySelectorAll<HTMLElement>(`.${OVERLAY_SCROLL_CLASS}`)) {
        track(scroller);
      }
    }
  }

  function update() {
    frame = 0;
    discover();
    // Read every metric first, then write, so the thumbs never force a layout between scrollers.
    const placements: Array<() => void> = [];
    for (const [scroller, entry] of tracked) {
      if (!scroller.isConnected) {
        untrack(scroller);
        continue;
      }
      const rect = entry.fixed ? scroller.getBoundingClientRect() : null;
      const left = (rect ? rect.left : scroller.offsetLeft) + scroller.clientLeft;
      const top = (rect ? rect.top : scroller.offsetTop) + scroller.clientTop;
      const clientWidth = scroller.clientWidth;
      const clientHeight = scroller.clientHeight;
      let anchor: Element = scroller;
      for (const { axis, element } of entry.thumbs) {
        const after = anchor;
        anchor = element;
        const { client, scroll, position } = AXES[axis];
        const visible = scroller[client];
        const scrollSize = scroller[scroll];
        const overflow = scrollSize - visible;
        const scrolled = scroller[position];
        placements.push(() => {
          if (after.nextElementSibling !== element) after.after(element);
          if (visible === 0 || overflow <= 1) {
            element.style.display = "none";
            return;
          }
          const size = Math.max(MIN_THUMB_SIZE, (visible * visible) / scrollSize);
          const offset = (scrolled / overflow) * (visible - size);
          element.style.display = "";
          element.style.position = entry.fixed ? "fixed" : "absolute";
          if (axis === "y") {
            element.style.left = `calc(${left + clientWidth}px - ${THUMB_THICKNESS})`;
            element.style.top = `${top}px`;
            element.style.height = `${size}px`;
            element.style.transform = `translateY(${offset}px)`;
          } else {
            element.style.left = `${left}px`;
            element.style.top = `calc(${top + clientHeight}px - ${THUMB_THICKNESS})`;
            element.style.width = `${size}px`;
            element.style.transform = `translateX(${offset}px)`;
          }
        });
      }
    }
    for (const place of placements) place();
  }

  const onScroll = (event: Event) => {
    if (event.target === document || tracked.has(event.target as HTMLElement)) schedule();
  };
  // Scrolling an ancestor, a dialog or popover animation ending, or a resize all move scrollers.
  root.ownerDocument.addEventListener("scroll", onScroll, { capture: true, passive: true });
  // Hover and focus transitions (colors) never move a scroller, so only transform/opacity count.
  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.propertyName === "transform" || event.propertyName === "opacity") schedule();
  };
  root.ownerDocument.addEventListener("transitionend", onTransitionEnd, true);
  root.ownerDocument.addEventListener("animationend", schedule, true);
  window.addEventListener("resize", schedule);

  // New scrollers appear when a panel, dialog or popover mounts; panes are shown and hidden with
  // `hidden`. Only added elements are scanned. Rows churning inside a scroller are covered by the
  // resize observer (it also watches each direct child), so deeper changes only schedule an update
  // when they bring a nested scroller.
  const SELECTOR = `.${OVERLAY_SCROLL_CLASS}`;
  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        schedule();
        continue;
      }
      const insideScroller = record.target instanceof Element && record.target.closest(SELECTOR);
      const tracksTarget = record.target instanceof HTMLElement && tracked.has(record.target);
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (!(node instanceof Element) || node.classList.contains(OVERLAY_THUMB_CLASS)) continue;
        // Direct children of a tracked scroller are watched, so adding rows resizes the content.
        if (tracksTarget && node.isConnected) {
          resizeObserver?.observe(node);
          schedule();
        }
        const bringsScroller = node.matches(SELECTOR) || node.querySelector(SELECTOR) !== null;
        if (bringsScroller && node.isConnected) pending.push(node);
        if (!insideScroller || bringsScroller) schedule();
      }
    }
  });
  mutationObserver.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });

  schedule();

  return () => {
    cancelAnimationFrame(frame);
    mutationObserver.disconnect();
    resizeObserver?.disconnect();
    root.ownerDocument.removeEventListener("scroll", onScroll, { capture: true });
    root.ownerDocument.removeEventListener("transitionend", onTransitionEnd, true);
    root.ownerDocument.removeEventListener("animationend", schedule, true);
    window.removeEventListener("resize", schedule);
    for (const scroller of Array.from(tracked.keys())) untrack(scroller);
  };
}
