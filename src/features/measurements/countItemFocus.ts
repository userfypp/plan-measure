import { useSyncExternalStore } from "react";

export interface CountItemRef {
  measurementId: string;
  index: number;
}

let focus: CountItemRef | null = null;
let selected: CountItemRef | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Marks the count item a list row is hovering, focusing or renaming so the viewer can point it
 * out. Pass `null` to release it. Kept outside the workspace state: hovering rows must not
 * re-render the viewer, only the one count shape that shows the item.
 */
export function setFocusedCountItem(next: CountItemRef | null): void {
  if (focus?.measurementId === next?.measurementId && focus?.index === next?.index) return;
  focus = next;
  listeners.forEach((listener) => listener());
}

/**
 * The count item the user picked, by clicking its point or its row: the context toolbar offers
 * its rename, move and delete. The viewer drops it as soon as it no longer belongs to the single
 * selected count.
 */
export function setSelectedCountItem(next: CountItemRef | null): void {
  if (selected === next) return;
  selected = next;
  listeners.forEach((listener) => listener());
}

export function getSelectedCountItem(): CountItemRef | null {
  return selected;
}

/** The selected count item; re-renders only when it changes. */
export function useSelectedCountItem(): CountItemRef | null {
  return useSyncExternalStore(subscribe, getSelectedCountItem);
}

/**
 * The item of this count measurement the viewer points out, or -1: the one a row is hovering,
 * focusing or renaming, otherwise the selected one. Re-renders only when that answer changes.
 */
export function useFocusedCountItemIndex(measurementId: string): number {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (focus?.measurementId === measurementId) return focus.index;
      return selected?.measurementId === measurementId ? selected.index : -1;
    },
    () => -1,
  );
}
