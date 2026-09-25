import {
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

export type RovingFocusOrientation = "horizontal" | "vertical";

interface RovingFocusGroupOptions<T extends HTMLElement> {
  orientation: RovingFocusOrientation;
  itemSelector?: string;
  suspendWhen?: (root: T) => boolean;
  getDirectionalTarget?: (
    current: HTMLElement,
    direction: 1 | -1,
    candidates: readonly HTMLElement[],
  ) => HTMLElement | null;
}

/**
 * Owns the roving tab stop and arrow-key behavior for one ARIA toolbar.
 * Items nested in a different roving group are excluded so groups can compose.
 */
export function useRovingFocusGroup<T extends HTMLElement>(
  ref: RefObject<T | null>,
  {
    orientation,
    itemSelector = "button, a[href], [role='button'], input, select, textarea",
    suspendWhen,
    getDirectionalTarget,
  }: RovingFocusGroupOptions<T>,
) {
  const rememberedItemRef = useRef<HTMLElement | null>(null);

  function allItems(): HTMLElement[] {
    const root = ref.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(itemSelector)).filter(
      (item) => item.closest("[data-roving-focus-group]") === root,
    );
  }

  function focusableItems(): HTMLElement[] {
    return allItems().filter((item) => !item.matches(":disabled"));
  }

  function setRovingItem(item: HTMLElement | null) {
    for (const candidate of allItems()) candidate.tabIndex = candidate === item ? 0 : -1;
    rememberedItemRef.current = item;
  }

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    if (suspendWhen?.(root)) {
      setRovingItem(null);
      return;
    }

    const items = focusableItems();
    const active = document.activeElement;
    const focused =
      active instanceof HTMLElement && root.contains(active) && items.includes(active)
        ? active
        : null;
    const remembered =
      rememberedItemRef.current &&
      root.contains(rememberedItemRef.current) &&
      items.includes(rememberedItemRef.current)
        ? rememberedItemRef.current
        : null;
    setRovingItem(focused ?? remembered ?? items[0] ?? null);
  });

  function onFocusCapture(event: FocusEvent<T>) {
    const root = ref.current;
    const target = event.target;
    if (!root || !(target instanceof HTMLElement) || suspendWhen?.(root)) return;
    if (focusableItems().includes(target)) setRovingItem(target);
  }

  function onKeyDown(event: KeyboardEvent<T>) {
    if (event.defaultPrevented) return;
    const isHorizontalArrow = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const isVerticalArrow = event.key === "ArrowUp" || event.key === "ArrowDown";
    const isHomeOrEnd = event.key === "Home" || event.key === "End";
    if (
      suspendWhen?.(event.currentTarget) ||
      (!isHomeOrEnd &&
        !(orientation === "horizontal" ? isHorizontalArrow : isVerticalArrow))
    ) {
      return;
    }

    const items = focusableItems();
    if (items.length === 0) return;
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    if (currentIndex < 0) return;

    let target: HTMLElement | null = null;
    if (event.key === "Home") target = items[0] ?? null;
    else if (event.key === "End") target = items.at(-1) ?? null;
    else if (currentIndex >= 0 && getDirectionalTarget) {
      target = getDirectionalTarget(
        items[currentIndex]!,
        event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1,
        items,
      );
    } else if (currentIndex >= 0) {
      const direction: 1 | -1 =
        event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      target = items[(currentIndex + direction + items.length) % items.length] ?? null;
    }

    if (!target) return;
    event.preventDefault();
    setRovingItem(target);
    target.focus();
  }

  return {
    "data-roving-focus-group": "",
    onFocusCapture,
    onKeyDown,
  };
}
