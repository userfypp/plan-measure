import { useSyncExternalStore, type ComponentType } from "react";
import type { SymbolCountOverlayProps } from "./SymbolCountOverlay";

/**
 * Whether "Find similar symbols" is running, and the overlay it draws over the page. The only
 * symbol-count module that ships in the main and viewer chunks: the bar (which registers the
 * overlay when it loads), the overlay and the search load on demand.
 */
interface SymbolCountState {
  active: boolean;
  overlay?: ComponentType<SymbolCountOverlayProps>;
}

let state: SymbolCountState = { active: false };
const listeners = new Set<() => void>();

export function setSymbolCount(patch: Partial<SymbolCountState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export const getSymbolCount = () => state;
export const startSymbolCount = () => setSymbolCount({ active: true });

export const subscribeSymbolCount = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useSymbolCount = () => useSyncExternalStore(subscribeSymbolCount, () => state);
