import { useSyncExternalStore, type ComponentType } from "react";
import type { PlanCompareOverlayProps } from "./PlanCompareOverlay";

/**
 * Whether a plan is being compared with another PDF, which file, and the overlay it draws under
 * the measurements. The only plan-compare module that ships in the main and viewer chunks: the
 * bar (which registers the overlay while it is shown), the overlay, the session and the diff load
 * on demand.
 */
interface PlanCompareState {
  active: boolean;
  /** The other version, kept in memory only. */
  file: File | null;
  overlay?: ComponentType<PlanCompareOverlayProps>;
}

let state: PlanCompareState = { active: false, file: null };
const listeners = new Set<() => void>();

export function setPlanCompare(patch: Partial<PlanCompareState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export const getPlanCompare = () => state;
export const startPlanCompare = (file: File) => setPlanCompare({ active: true, file });
export const stopPlanCompare = () => setPlanCompare({ active: false, file: null });

export const subscribePlanCompare = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePlanCompare = () => useSyncExternalStore(subscribePlanCompare, () => state);
