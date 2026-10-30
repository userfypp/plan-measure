import { useEffect, useEffectEvent } from "react";
import {
  shouldIgnoreMeasurementClipboardShortcutTarget,
  shouldIgnoreViewerKeyboardShortcut,
} from "../keyboard";
import { eventToCombo, type ActionId } from "./bindings";
import { getShortcutSnapshot } from "./store";

/** Returns true when it acted on the action; it calls `preventDefault` itself. */
export type ShortcutHandler = (action: ActionId, event: KeyboardEvent) => boolean;

/** Actions that keep firing while the key is held; every other one acts once per press. */
const REPEATABLE: ReadonlySet<ActionId> = new Set([
  "view.zoomIn",
  "view.zoomOut",
  "edit.delete",
  "page.previous",
  "page.next",
]);

const PAGING_KEYS: ReadonlySet<string> = new Set(["PageUp", "PageDown", "Home", "End"]);

/** Widgets that use the paging keys themselves (list navigation, tab and grid roving focus). */
const PAGING_OWNERS =
  "[data-layout-slot='workspace-panel-host'], [role='tablist'], [role='toolbar'], [role='grid'], [role='tree']";

const BLOCKING_OVERLAY =
  "dialog[open], [role='dialog'][aria-modal='true'], [data-layout-slot='viewer-interaction-shield']";

/** Whether a modal, the loading overlay or the interaction shield is covering the app. */
export function isBlockingOverlayOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector(BLOCKING_OVERLAY) !== null;
}

function scrollsVertically(element: HTMLElement): boolean {
  if (element.scrollHeight <= element.clientHeight) return false;
  const { overflowY } = window.getComputedStyle(element);
  return overflowY === "auto" || overflowY === "scroll";
}

/** The browser scrolls the nearest scrollable ancestor of the focused element on these keys. */
function targetOwnsPagingKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(PAGING_OWNERS)) return true;
  for (
    let node: HTMLElement | null = target;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (scrollsVertically(node)) return true;
  }
  return false;
}

/**
 * Exact combo first. A Shift-only variant then falls back to the bare key, so
 * Shift+L (or Caps Lock) still picks Line and Shift+Delete still deletes.
 */
function findAction(combo: string, event: KeyboardEvent): ActionId | null {
  const { byCombo } = getShortcutSnapshot();
  const exact = byCombo.get(combo);
  if (exact) return exact;
  if (event.ctrlKey || event.metaKey || event.altKey || !combo.startsWith("Shift+")) return null;
  return byCombo.get(combo.slice("Shift+".length)) ?? null;
}

const handlers: ShortcutHandler[] = [];

function handleKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return;
  const combo = eventToCombo(event);
  if (!combo) return;
  const action = findAction(combo, event);
  if (!action) return;
  if (event.repeat && !REPEATABLE.has(action)) return;
  // Browser and OS shortcuts win: a Mod or Alt binding only yields to editing targets.
  const modified = event.ctrlKey || event.metaKey || event.altKey;
  if (
    modified
      ? shouldIgnoreMeasurementClipboardShortcutTarget(event.target)
      : shouldIgnoreViewerKeyboardShortcut(event) ||
        (PAGING_KEYS.has(event.key) && targetOwnsPagingKeys(event.target))
  ) {
    return;
  }
  // Most recent registration first, so a more specific owner can claim an action.
  for (const handler of [...handlers].reverse()) {
    if (handler(action, event)) return;
  }
}

/**
 * Routes customizable shortcuts to the mounted handlers. Mounting `handler`
 * (it may close over fresh state; the registration itself never changes)
 * adds it, and the single window listener lives only while one is mounted.
 */
export function useShortcutHandlers(handler: ShortcutHandler): void {
  const onShortcut = useEffectEvent(handler);
  useEffect(() => {
    handlers.push(onShortcut);
    if (handlers.length === 1) window.addEventListener("keydown", handleKeyDown);
    return () => {
      handlers.splice(handlers.indexOf(onShortcut), 1);
      if (handlers.length === 0) window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
