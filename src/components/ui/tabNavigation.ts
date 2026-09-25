import { useEffect, type RefObject } from "react";

function isTabStop(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.matches(":disabled")) return false;

  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    if (
      parent.hidden ||
      parent.hasAttribute("inert") ||
      parent.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }
    const style = window.getComputedStyle(parent);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
      return false;
    }
  }
  return true;
}

function visitOwnedTree(container: HTMLElement, visit: (element: HTMLElement) => void) {
  const document = container.ownerDocument;
  const visited = new Set<HTMLElement>([container]);

  function visitChildren(parent: HTMLElement) {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (visited.has(child)) continue;
      visited.add(child);
      visit(child);
      visitChildren(child);

      const ownerId = child.dataset.focusOwner;
      if (!ownerId) continue;
      const portal = document.getElementById(ownerId);
      if (
        portal instanceof HTMLElement &&
        portal.dataset.focusPortal === ownerId &&
        !visited.has(portal)
      ) {
        visited.add(portal);
        visit(portal);
        visitChildren(portal);
      }
    }
  }

  visitChildren(container);
}

function collectTabStops(container: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  visitOwnedTree(container, (element) => {
    if (isTabStop(element)) result.push(element);
  });
  return result;
}

function isNamedRadio(element: HTMLElement): element is HTMLInputElement {
  return (
    element.tagName === "INPUT" &&
    (element as HTMLInputElement).type === "radio" &&
    (element as HTMLInputElement).name !== ""
  );
}

function isSameRadioGroup(left: HTMLInputElement, right: HTMLInputElement): boolean {
  return (
    left.name === right.name &&
    left.form === right.form &&
    left.getRootNode() === right.getRootNode()
  );
}

function consolidateRadioGroups(stops: HTMLElement[]): HTMLElement[] {
  const result: HTMLElement[] = [];
  const groupedRadios = new Set<HTMLInputElement>();

  for (const stop of stops) {
    if (!isNamedRadio(stop)) {
      result.push(stop);
      continue;
    }

    if (groupedRadios.has(stop)) continue;
    const group = stops.filter(
      (candidate): candidate is HTMLInputElement =>
        isNamedRadio(candidate) && isSameRadioGroup(stop, candidate),
    );
    const representative = group.find((radio) => radio.checked) ?? group[0];
    for (const radio of group) groupedRadios.add(radio);
    if (representative) result.push(representative);
  }

  return result;
}

function orderedTabStops(container: HTMLElement): HTMLElement[] {
  const stops = consolidateRadioGroups(collectTabStops(container));
  const positiveTabStops = stops.filter((element) => element.tabIndex > 0);
  const normalTabStops = stops.filter((element) => element.tabIndex === 0);
  positiveTabStops.sort((left, right) => left.tabIndex - right.tabIndex);
  return [...positiveTabStops, ...normalTabStops];
}

function findFocusOwner(document: Document, ownerId: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[data-focus-owner]")).find(
      (candidate) => candidate.dataset.focusOwner === ownerId,
    ) ?? null
  );
}

function ownedPortalBelongsTo(container: HTMLElement, portal: HTMLElement): boolean {
  const document = container.ownerDocument;
  const visited = new Set<HTMLElement>();
  let currentPortal: HTMLElement | null = portal;

  while (currentPortal && !visited.has(currentPortal)) {
    visited.add(currentPortal);
    const ownerId = currentPortal.dataset.focusPortal;
    if (!ownerId || document.getElementById(ownerId) !== currentPortal) return false;
    const owner = findFocusOwner(document, ownerId);
    if (!owner) return false;
    if (container.contains(owner)) return true;
    currentPortal = owner.closest<HTMLElement>("[data-focus-portal]");
  }

  return false;
}

function activeTabStopIndex(stops: HTMLElement[], active: HTMLElement | null): number {
  if (!active) return -1;
  const directIndex = stops.indexOf(active);
  if (directIndex >= 0) return directIndex;
  if (!isNamedRadio(active)) return -1;
  return stops.findIndex(
    (stop) => isNamedRadio(stop) && isSameRadioGroup(active, stop),
  );
}

function activeFocusTrap(root: HTMLElement): HTMLElement | null {
  const dialogs: HTMLElement[] = [];
  visitOwnedTree(root, (element) => {
    if (element.matches("dialog[open][data-focus-trap], dialog[open][aria-modal='true']")) {
      dialogs.push(element);
    }
  });
  return dialogs.at(-1) ?? null;
}

/**
 * Applies one app-owned Tab sequence across browsers. Toolbars contribute only
 * their roving item, and portaled popovers are visited directly after their
 * trigger. Ordinary form controls keep their native editing behavior.
 */
type ManagedTabKeyboardEvent = Pick<
  KeyboardEvent,
  "key" | "shiftKey" | "defaultPrevented" | "preventDefault"
>;

export function handleManagedTabNavigation(event: ManagedTabKeyboardEvent, root: HTMLElement) {
  if (event.key !== "Tab" || event.defaultPrevented) return;

  const active = root.ownerDocument.activeElement;
  const activeElement = active instanceof HTMLElement ? active : null;
  const activePortal = activeElement?.closest<HTMLElement>("[data-focus-portal]");
  const inOwnedPortal = Boolean(
    activePortal && ownedPortalBelongsTo(root, activePortal),
  );
  const activeInApp = Boolean(
    active === root.ownerDocument.body ||
      active === root.ownerDocument.documentElement ||
      (activeElement && root.contains(activeElement)) ||
      inOwnedPortal,
  );
  if (!activeInApp) return;

  const trap = activeFocusTrap(root);
  if (
    !trap &&
    event.shiftKey &&
    (active === root.ownerDocument.body || active === root.ownerDocument.documentElement)
  ) {
    return;
  }
  const scope = trap ?? root;
  const stops = orderedTabStops(scope);
  const activeIndex = activeTabStopIndex(stops, activeElement);

  if (trap) {
    if (stops.length === 0) {
      event.preventDefault();
      trap.focus({ preventScroll: true });
      return;
    }
    const first = stops[0]!;
    const last = stops.at(-1)!;
    const activeInTrap = Boolean(
      activeElement &&
        (trap.contains(activeElement) ||
          (activePortal && ownedPortalBelongsTo(trap, activePortal))),
    );
    if (event.shiftKey && (activeIndex === 0 || !activeInTrap)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
      return;
    }
    if (!event.shiftKey && (activeIndex === stops.length - 1 || !activeInTrap)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
      return;
    }
  }

  if (activeIndex < 0) {
    if (stops.length === 0) return;
    const activePortal = activeElement?.closest<HTMLElement>("[data-focus-portal]");
    const portalStops = activePortal ? stops.filter((stop) => activePortal.contains(stop)) : [];
    const next = event.shiftKey ? stops.at(-1) : portalStops[0] ?? stops[0];
    if (!next) return;
    event.preventDefault();
    next.focus({ preventScroll: true });
    return;
  }

  const nextIndex = activeIndex + (event.shiftKey ? -1 : 1);
  const next = stops[nextIndex];
  if (!next) return;
  event.preventDefault();
  next.focus({ preventScroll: true });
}

export function useManagedTabNavigation<T extends HTMLElement>(rootRef: RefObject<T | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleKeyDown = (event: KeyboardEvent) => handleManagedTabNavigation(event, root);
    root.ownerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => root.ownerDocument.removeEventListener("keydown", handleKeyDown, true);
  }, [rootRef]);
}
