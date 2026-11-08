import { useSyncExternalStore } from "react";

interface CountItemFocus {
  measurementId: string;
  index: number;
}

let focus: CountItemFocus | null = null;
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
export function setFocusedCountItem(next: CountItemFocus | null): void {
  if (focus?.measurementId === next?.measurementId && focus?.index === next?.index) return;
  focus = next;
  listeners.forEach((listener) => listener());
}

/** The focused item of this count measurement, or -1; re-renders only when that answer changes. */
export function useFocusedCountItemIndex(measurementId: string): number {
  return useSyncExternalStore(
    subscribe,
    () => (focus?.measurementId === measurementId ? focus.index : -1),
    () => -1,
  );
}
