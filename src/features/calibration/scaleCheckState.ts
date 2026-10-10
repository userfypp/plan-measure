import type { PageCalibration, Point } from "../../types/domain";

export interface ScaleCheck {
  pageNumber: number;
  activeCalibrationId: string | null;
  workspaceVersion: number;
  calibration: PageCalibration;
  points: [Point, Point] | null;
  referenceDistanceMm: number | null;
}

/** Runtime-only state; no session, history or persistence commands. */
export function createScaleCheckStore() {
  let snapshot: ScaleCheck | null = null;
  const listeners = new Set<() => void>();
  function set(next: ScaleCheck | null) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin: (scope: Omit<ScaleCheck, "points" | "referenceDistanceMm">) =>
      set({ ...scope, points: null, referenceDistanceMm: null }),
    select: (points: [Point, Point]) => {
      if (snapshot) set({ ...snapshot, points, referenceDistanceMm: null });
    },
    complete: (referenceDistanceMm: number) => {
      if (snapshot?.points) set({ ...snapshot, referenceDistanceMm });
    },
    clear: () => {
      if (snapshot) set(null);
    },
  };
}

export type ScaleCheckStore = ReturnType<typeof createScaleCheckStore>;
