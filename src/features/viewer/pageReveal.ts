/** Matches the dialog enter motion so the plan arrives with the same feel as other surfaces. */
export const PAGE_REVEAL_DURATION_MS = 180;
const PAGE_REVEAL_EASING = "cubic-bezier(0.2, 0, 0, 1)";

function motionReduced(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (element.ownerDocument.documentElement.dataset.motion === "reduce") return true;
  return view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Fades freshly shown page content in once, so a document's first raster does not pop in.
 * Runs on the compositor (opacity only) and leaves no lasting style behind.
 */
export function revealPageContent(elements: readonly (HTMLElement | null | undefined)[]): void {
  for (const element of elements) {
    if (!element || typeof element.animate !== "function" || motionReduced(element)) continue;
    element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: PAGE_REVEAL_DURATION_MS,
      easing: PAGE_REVEAL_EASING,
    });
  }
}
