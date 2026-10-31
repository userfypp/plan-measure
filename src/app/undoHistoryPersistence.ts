import type { CurrentSession } from "../types/domain";
import {
  loadUndoHistory,
  writeUndoHistory,
  type UndoHistory,
} from "../services/undoHistoryStorage";

/** Measurement slots one persisted history may hold; each unique page counts its measurements once. */
export const MAX_HISTORY_SLOTS = 250_000;
const DEBOUNCE_MS = 1000;

/** Approximates the stored size of `sessions` by the measurements of their distinct pages. */
export function estimateHistoryLoad(sessions: readonly CurrentSession[]): number {
  const seen = new Set<object>();
  let slots = 0;
  for (const session of sessions) slots += countNewSlots(session, seen);
  return slots;
}

function countNewSlots(session: CurrentSession, seen: Set<object>): number {
  let slots = 0;
  for (const page of Object.values(session.pages)) {
    if (seen.has(page)) continue;
    seen.add(page);
    slots += page.measurements.length;
  }
  return slots;
}

/**
 * Keeps the history within `maxSlots`, dropping the oldest Undo steps first and then the farthest
 * Redo steps. The same arrays come back when nothing is dropped.
 */
export function trimToBudget(
  undo: readonly CurrentSession[],
  redo: readonly CurrentSession[],
  maxSlots: number,
): UndoHistory {
  const seen = new Set<object>();
  let slots = 0;
  const keptCount = (nearestFirst: Iterable<CurrentSession>) => {
    let kept = 0;
    for (const session of nearestFirst) {
      const next = slots + countNewSlots(session, seen);
      if (next > maxSlots) break;
      slots = next;
      kept += 1;
    }
    return kept;
  };
  const keptRedo = keptCount([...redo].reverse());
  if (keptRedo < redo.length) return { undo: [], redo: redo.slice(redo.length - keptRedo) };
  const keptUndo = keptCount([...undo].reverse());
  return keptUndo === undo.length
    ? { undo, redo }
    : { undo: undo.slice(undo.length - keptUndo), redo };
}

export interface SavedHistoryEntry extends UndoHistory {
  projectId: string;
  /** The revision returned by the save whose snapshot was the head of these stacks. */
  revision: string;
  /** False once the save generation moved on, so a stale entry is never written. */
  isCurrent: () => boolean;
}

interface WrittenHistory extends UndoHistory {
  projectId: string;
}

interface UndoHistoryWriterOptions {
  write?: (projectId: string, revision: string, history: UndoHistory | null) => Promise<boolean>;
  /** Runs `callback` once the page is quiet and returns a function that cancels it. */
  idle?: (callback: () => void) => () => void;
}

export interface UndoHistoryWriter {
  recordSaved: (entry: SavedHistoryEntry) => void;
  /** Brings the stored stacks back once the page is idle. */
  restoreWhenIdle: (options: UndoHistoryRestore) => void;
  flushNow: () => Promise<void>;
  reset: () => void;
}

/** Waits `delayMs`, then for an idle callback, so history work stays off the editing path. */
export function scheduleWhenIdle(callback: () => void, delayMs = DEBOUNCE_MS): () => void {
  let cancelIdle: (() => void) | null = null;
  const timer = window.setTimeout(() => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(callback, { timeout: 4000 });
      cancelIdle = () => window.cancelIdleCallback(handle);
    } else callback();
  }, delayMs);
  return () => {
    window.clearTimeout(timer);
    cancelIdle?.();
  };
}

/**
 * Persists the Undo and Redo stacks after a confirmed save. A save that leaves the stacks as they
 * were last written only refreshes the revision label; any other waits for idle time, and the last
 * one recorded wins. A failed write is only logged: it never touches the save status.
 */
export function createUndoHistoryWriter({
  write = writeUndoHistory,
  idle = scheduleWhenIdle,
}: UndoHistoryWriterOptions = {}): UndoHistoryWriter {
  let pending: SavedHistoryEntry | null = null;
  let written: WrittenHistory | null = null;
  let cancelScheduled: (() => void) | null = null;
  let epoch = 0;

  const unschedule = () => {
    cancelScheduled?.();
    cancelScheduled = null;
  };

  const run = async (entry: SavedHistoryEntry, labelOnly: boolean) => {
    if (!entry.isCurrent()) return;
    const startEpoch = epoch;
    let saved: boolean;
    try {
      saved = await write(
        entry.projectId,
        entry.revision,
        labelOnly ? null : trimToBudget(entry.undo, entry.redo, MAX_HISTORY_SLOTS),
      );
    } catch {
      saved = false;
    }
    if (startEpoch !== epoch) return;
    if (!saved) {
      console.warn("The undo history could not be saved.");
      written = null;
    } else if (!labelOnly) {
      written = { projectId: entry.projectId, undo: entry.undo, redo: entry.redo };
    }
  };

  const flushPending = async () => {
    unschedule();
    const entry = pending;
    pending = null;
    if (entry) await run(entry, false);
  };

  const reset = () => {
    unschedule();
    pending = null;
    written = null;
    epoch += 1;
  };

  return {
    recordSaved(entry) {
      unschedule();
      pending = null;
      if (
        written &&
        written.projectId === entry.projectId &&
        written.undo === entry.undo &&
        written.redo === entry.redo
      ) {
        void run(entry, true);
        return;
      }
      pending = entry;
      cancelScheduled = idle(() => void flushPending());
    },
    restoreWhenIdle({ projectId, revision, base, expected, isCurrent, restore }) {
      scheduleWhenIdle(() => {
        void loadUndoHistory(projectId, revision, base).then((history) => {
          // A write still waiting for its turn holds the empty stacks the plan was loaded with.
          if (history && isCurrent() && restore(expected, history.undo, history.redo)) reset();
        });
      }, 0);
    },
    flushNow: flushPending,
    reset,
  };
}

interface UndoHistoryRestore {
  projectId: string;
  revision: string;
  /** The session just loaded; the stored stacks must describe the same plan. */
  base: CurrentSession;
  /** The stacks right after loading `base`, which must still be in place to restore. */
  expected: UndoHistory;
  /** Whether the opened project is still the one the history belongs to. */
  isCurrent: () => boolean;
  restore: (
    expected: UndoHistory,
    undo: readonly CurrentSession[],
    redo: readonly CurrentSession[],
  ) => boolean;
}
