import type { CurrentSession } from "../types/domain";
import { isActiveRevision, openSessionsTransaction, STATE_KEY } from "./persistence";

const UNDO_HISTORY_KEY = "undo-history-v1";
const UNDO_HISTORY_REVISION_KEY = "undo-history-revision-v1";
const UNDO_HISTORY_FORMAT = 1;
const UNDO_HISTORY_SCHEMA_VERSION: CurrentSession["schemaVersion"] = 16;

export interface UndoHistory {
  undo: readonly CurrentSession[];
  redo: readonly CurrentSession[];
}

interface UndoHistoryRecord extends UndoHistory {
  key: string;
  format: number;
  projectId: string;
}

interface UndoHistoryRevisionRecord {
  key: string;
  revision: string;
}

// The history records share the `sessions` store but are not part of `PlanMeasureDb`'s value
// union: widening it would make every `record.serialized` and `"projectId" in record` check in
// `persistence.ts` handle them. They carry neither `serialized` nor `activeRevision`, so those
// guards already skip them, and every flow that replaces the active session deletes them.
interface UndoHistoryStore {
  get(key: string): Promise<unknown>;
  put(record: UndoHistoryRecord | UndoHistoryRevisionRecord): Promise<unknown>;
}

/**
 * Stores the Undo and Redo stacks as one record, tied to `revision` by a separate label so that a
 * save that leaves the stacks alone only rewrites the label. `history: null` writes the label only.
 * Nothing is written, and false is returned, unless `revision` still is the active one of
 * `projectId`. It never throws: the history is an extra and must not affect saving.
 */
export async function writeUndoHistory(
  projectId: string,
  revision: string,
  history: UndoHistory | null,
): Promise<boolean> {
  try {
    const transaction = await openSessionsTransaction("readwrite");
    void transaction.done.catch(() => undefined);
    const sessions = transaction.objectStore("sessions");
    const store = sessions as unknown as UndoHistoryStore;
    // Every request is issued before the first result arrives, so the structured clone of the
    // stacks happens in this call. A mismatch aborts the transaction and rolls the puts back.
    const stateRequest = sessions.get(STATE_KEY);
    const writes = Promise.all([
      history
        ? store.put({
            key: UNDO_HISTORY_KEY,
            format: UNDO_HISTORY_FORMAT,
            projectId,
            undo: history.undo,
            redo: history.redo,
          })
        : undefined,
      store.put({ key: UNDO_HISTORY_REVISION_KEY, revision }),
    ]);
    void writes.catch(() => undefined);
    if (!isActiveRevision(await stateRequest, projectId, revision)) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      return false;
    }
    await writes;
    await transaction.done;
    return true;
  } catch {
    return false;
  }
}

function isRestorableHistoryEntry(entry: unknown, base: CurrentSession): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const candidate = entry as Partial<CurrentSession>;
  return (
    candidate.schemaVersion === UNDO_HISTORY_SCHEMA_VERSION &&
    candidate.pageCount === base.pageCount &&
    candidate.pdf?.name === base.pdf.name &&
    candidate.pdf?.size === base.pdf.size
  );
}

/**
 * Reads the stacks written for `projectId` while `revision` was active. Returns null unless the
 * label names `revision` and every entry still describes the same plan as `base`. It never throws.
 */
export async function loadUndoHistory(
  projectId: string,
  revision: string,
  base: CurrentSession,
): Promise<UndoHistory | null> {
  try {
    const transaction = await openSessionsTransaction("readonly");
    void transaction.done.catch(() => undefined);
    const store = transaction.objectStore("sessions") as unknown as UndoHistoryStore;
    const [record, label] = (await Promise.all([
      store.get(UNDO_HISTORY_KEY),
      store.get(UNDO_HISTORY_REVISION_KEY),
    ])) as [Partial<UndoHistoryRecord> | undefined, Partial<UndoHistoryRevisionRecord> | undefined];
    await transaction.done;
    if (
      !record ||
      record.format !== UNDO_HISTORY_FORMAT ||
      record.projectId !== projectId ||
      label?.revision !== revision ||
      !Array.isArray(record.undo) ||
      !Array.isArray(record.redo) ||
      !record.undo.every((entry) => isRestorableHistoryEntry(entry, base)) ||
      !record.redo.every((entry) => isRestorableHistoryEntry(entry, base))
    ) {
      return null;
    }
    return { undo: record.undo, redo: record.redo };
  } catch {
    return null;
  }
}
