import { useSyncExternalStore } from "react";
import type { Point } from "../../types/domain";
import { setSymbolCount } from "./symbolCountStore";
import {
  SYMBOL_SEARCH_UNAVAILABLE,
  createSymbolSearch,
  type CreateSymbolSearch,
  type SymbolSearch,
} from "./symbolSearch";
import type { GrayImage, PixelRect, SymbolMatch, SymbolMatchFailure } from "./templateMatch";

export type SymbolCountPhase = "pick" | "scanning" | "review" | "error";
export type SimilarityPreset = "exact" | "high" | "balanced" | "loose";
export type MatchStatus = "accepted" | "excluded" | "below" | "duplicate";

export const SIMILARITY_PRESETS: readonly {
  value: SimilarityPreset;
  label: string;
  threshold: number;
}[] = [
  { value: "exact", label: "Exact", threshold: 0.9 },
  { value: "high", label: "High", threshold: 0.8 },
  { value: "balanced", label: "Balanced", threshold: 0.7 },
  { value: "loose", label: "Loose", threshold: 0.6 },
];

export const EMPTY_BOX_MESSAGE = "The box is empty. Drag a box around a symbol.";
export const SMALL_BOX_MESSAGE = "The box is too small.";

export interface SymbolCountState {
  phase: SymbolCountPhase;
  /** Whole percent of the search done. */
  progress: number;
  /** Matches in page coordinates, best first. */
  matches: readonly SymbolMatch[];
  /** Indexes into `matches` the user took out. */
  excluded: ReadonlySet<number>;
  similarity: SimilarityPreset;
  orientations: boolean;
  /** Why the user is asked to pick again, or what went wrong. */
  message: string | null;
  /** Points of the count the items are added to, to skip symbols already counted. */
  existing: readonly Point[];
}

export function similarityThreshold(preset: SimilarityPreset): number {
  return SIMILARITY_PRESETS.find((entry) => entry.value === preset)!.threshold;
}

function isCounted(match: SymbolMatch, existing: readonly Point[]): boolean {
  const reach = Math.min(match.width, match.height) / 2;
  return existing.some((point) => Math.hypot(point.x - match.x, point.y - match.y) <= reach);
}

export function matchStatus(state: SymbolCountState, index: number): MatchStatus {
  const match = state.matches[index]!;
  if (match.score < similarityThreshold(state.similarity)) return "below";
  if (isCounted(match, state.existing)) return "duplicate";
  return state.excluded.has(index) ? "excluded" : "accepted";
}

export function acceptedPoints(state: SymbolCountState): Point[] {
  const points: Point[] = [];
  state.matches.forEach((match, index) => {
    if (matchStatus(state, index) === "accepted") points.push({ x: match.x, y: match.y });
  });
  return points;
}

/** The best match whose box (at least `minHalfSide` around its centre) holds `point`. */
export function hitMatch(
  state: SymbolCountState,
  point: Point,
  minHalfSide: number,
): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  state.matches.forEach((match, index) => {
    const status = matchStatus(state, index);
    if (status !== "accepted" && status !== "excluded") return;
    const dx = Math.abs(point.x - match.x);
    const dy = Math.abs(point.y - match.y);
    if (dx > Math.max(match.width / 2, minHalfSide) || dy > Math.max(match.height / 2, minHalfSide))
      return;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

const INITIAL_STATE: SymbolCountState = {
  phase: "pick",
  progress: 0,
  matches: [],
  excluded: new Set(),
  similarity: "balanced",
  orientations: true,
  message: null,
  existing: [],
};

export interface SymbolSearchStart {
  image: GrayImage;
  /** Raster pixels per page unit. */
  scale: number;
  /** The boxed symbol, in raster pixels. */
  box: PixelRect;
  existing: readonly Point[];
}

export function createSymbolCountSession(createSearch: CreateSymbolSearch = createSymbolSearch) {
  let state = INITIAL_STATE;
  let search: SymbolSearch | null = null;
  let scale = 1;
  let box: PixelRect = { x: 0, y: 0, width: 0, height: 0 };
  let commitHandler: ((points: Point[]) => void) | null = null;
  const listeners = new Set<() => void>();

  function set(patch: Partial<SymbolCountState>) {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  }

  function endSearch() {
    search?.terminate();
    search = null;
  }

  function failureMessage(failure: SymbolMatchFailure) {
    return failure === "empty" ? EMPTY_BOX_MESSAGE : SMALL_BOX_MESSAGE;
  }

  function backToPick(message: string | null = null) {
    endSearch();
    set({ phase: "pick", progress: 0, message, matches: [], excluded: new Set() });
  }

  function fail(message: string) {
    endSearch();
    set({ phase: "error", message });
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Back to the first state; drops the search and the commit handler. */
    reset() {
      endSearch();
      commitHandler = null;
      if (state !== INITIAL_STATE) {
        state = INITIAL_STATE;
        for (const listener of [...listeners]) listener();
      }
    },
    /** The box is released and the page is being rendered. */
    beginScan() {
      set({ phase: "scanning", progress: 0, message: null, matches: [], excluded: new Set() });
    },
    /** Rendering failed or was not possible. */
    fail,
    /** The user is asked to draw a new box. */
    backToPick,
    startSearch(request: SymbolSearchStart) {
      endSearch();
      scale = request.scale;
      box = request.box;
      set({ phase: "scanning", progress: 0, existing: request.existing });
      try {
        search = createSearch(request.image, {
          onProgress: (fraction) => {
            const progress = Math.min(100, Math.max(0, Math.floor(fraction * 100)));
            if (state.phase === "scanning" && progress !== state.progress) set({ progress });
          },
          onResult: (result) => {
            if (result.failure) {
              backToPick(failureMessage(result.failure));
              return;
            }
            set({
              phase: "review",
              progress: 100,
              message: null,
              excluded: new Set(),
              matches: result.matches.map((match) => ({
                ...match,
                x: match.x / scale,
                y: match.y / scale,
                width: match.width / scale,
                height: match.height / scale,
              })),
            });
          },
          onError: fail,
        });
        search.search(box, state.orientations);
      } catch {
        fail(SYMBOL_SEARCH_UNAVAILABLE);
      }
    },
    setSimilarity(similarity: SimilarityPreset) {
      set({ similarity });
    },
    /** Searches again with or without rotated and mirrored copies. */
    setOrientations(orientations: boolean) {
      if (orientations === state.orientations) return;
      if (!search || state.phase !== "review") {
        set({ orientations });
        return;
      }
      set({ orientations, phase: "scanning", progress: 0, excluded: new Set() });
      search.search(box, orientations);
    },
    toggleExcluded(index: number) {
      if (!state.matches[index]) return;
      const excluded = new Set(state.excluded);
      if (!excluded.delete(index)) excluded.add(index);
      set({ excluded });
    },
    /** The overlay says how to add the points; the bar asks for it. */
    setCommitHandler(handler: ((points: Point[]) => void) | null) {
      commitHandler = handler;
    },
    /** Adds the accepted items in one step and ends the search. */
    commit(): boolean {
      const points = acceptedPoints(state);
      if (state.phase !== "review" || points.length === 0 || !commitHandler) return false;
      commitHandler(points);
      stopSymbolCount();
      return true;
    },
  };
}

export type SymbolCountSession = ReturnType<typeof createSymbolCountSession>;

export const symbolCountSession = createSymbolCountSession();

export function useSymbolCountState(session: SymbolCountSession = symbolCountSession) {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}

/** Leaves "Find similar symbols". */
export const stopSymbolCount = () => setSymbolCount({ active: false });
