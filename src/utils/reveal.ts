/** Matches the dialog enter motion so revealed surfaces arrive with the same feel as dialogs. */
export const REVEAL_DURATION_MS = 180;
const REVEAL_EASING = "cubic-bezier(0.2, 0, 0, 1)";

function motionReduced(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (element.ownerDocument.documentElement.dataset.motion === "reduce") return true;
  return view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Fades freshly shown content in once, so it does not pop in. Unlike a CSS animation it does not
 * replay when the element is later replaced (a skeleton by its content, one page by the next).
 * Runs on the compositor (opacity only) and leaves no lasting style behind.
 */
export function revealElements(elements: readonly (Element | null | undefined)[]): void {
  for (const element of elements) {
    if (!element || typeof element.animate !== "function" || motionReduced(element)) continue;
    element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: REVEAL_DURATION_MS,
      easing: REVEAL_EASING,
    });
  }
}
