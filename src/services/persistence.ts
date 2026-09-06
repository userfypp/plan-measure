import {
  deleteDB,
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
} from "idb";
import type { CurrentSession } from "../types/domain";
import {
  deserializeSessionForRecovery,
  serializeSession,
  type SessionCompatibility,
} from "./persistenceCodec";

const DATABASE_NAME = "plan-measure";
const LEGACY_ACTIVE_KEY = "active";
const ACTIVE_KEY = "active-v2";
const STATE_KEY = "persistence-v2";

interface SessionRecord {
  key: string;
  serialized: string;
  savedAt: number;
  revision?: string;
}

interface PersistenceStateRecord {
  key: string;
  activeRevision: string | null;
}

interface PdfRecord {
  key: string;
  blob: Blob;
  revision?: string;
}

interface PlanMeasureDb extends DBSchema {
  sessions: {
    key: string;
    value: SessionRecord | PersistenceStateRecord;
  };
  pdfs: {
    key: string;
    value: PdfRecord;
  };
}

type PersistenceTransaction = IDBPTransaction<
  PlanMeasureDb,
  ["sessions", "pdfs"],
  "readwrite"
>;

let databasePromise: Promise<IDBPDatabase<PlanMeasureDb>> | null = null;

function getDatabase(): Promise<IDBPDatabase<PlanMeasureDb>> {
  if (databasePromise) return databasePromise;
  databasePromise = openDB<PlanMeasureDb>(DATABASE_NAME, 1, {
    upgrade(database) {
      database.createObjectStore("sessions", { keyPath: "key" });
      database.createObjectStore("pdfs", { keyPath: "key" });
    },
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

export class PersistenceConflictError extends Error {
  constructor() {
    super("The saved session changed in another tab.");
    this.name = "PersistenceConflictError";
  }
}

export class PersistenceLoadError extends Error {
  constructor(
    message: string,
    readonly revision: string,
  ) {
    super(message);
    this.name = "PersistenceLoadError";
  }
}

export interface SavedSession {
  session: CurrentSession;
  pdfBlob: Blob;
  revision: string;
  compatibility: SessionCompatibility;
  incompatibleMeasurementIds: string[];
}

function isPersistenceStateRecord(
  record: SessionRecord | PersistenceStateRecord | undefined,
): record is PersistenceStateRecord {
  return Boolean(record && "activeRevision" in record);
}

async function readOrCreatePersistenceState(
  transaction: PersistenceTransaction,
): Promise<PersistenceStateRecord> {
  const sessions = transaction.objectStore("sessions");
  const pdfs = transaction.objectStore("pdfs");
  const existingState = await sessions.get(STATE_KEY);
  if (isPersistenceStateRecord(existingState)) return existingState;

  const [legacySession, legacyPdf] = await Promise.all([
    sessions.get(LEGACY_ACTIVE_KEY),
    pdfs.get(LEGACY_ACTIVE_KEY),
  ]);
  const activeRevision = legacySession || legacyPdf ? crypto.randomUUID() : null;
  const writes: Array<Promise<unknown>> = [
    sessions.put({ key: STATE_KEY, activeRevision }),
    sessions.delete(LEGACY_ACTIVE_KEY),
    pdfs.delete(LEGACY_ACTIVE_KEY),
  ];
  if (legacySession && !isPersistenceStateRecord(legacySession)) {
    writes.push(sessions.put({ ...legacySession, key: ACTIVE_KEY, revision: activeRevision! }));
  }
  if (legacyPdf) {
    writes.push(pdfs.put({ ...legacyPdf, key: ACTIVE_KEY, revision: activeRevision! }));
  }
  await Promise.all(writes);
  return { key: STATE_KEY, activeRevision };
}

async function abort(transaction: PersistenceTransaction, error: Error): Promise<never> {
  transaction.abort();
  await transaction.done.catch(() => undefined);
  throw error;
}

async function requireExpectedRevision(
  transaction: PersistenceTransaction,
  expectedRevision: string | null,
): Promise<PersistenceStateRecord> {
  const state = await readOrCreatePersistenceState(transaction);
  if (state.activeRevision !== expectedRevision) {
    return abort(transaction, new PersistenceConflictError());
  }
  return state;
}

export async function loadSavedSession(): Promise<SavedSession | null> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  const state = await readOrCreatePersistenceState(transaction);
  if (state.activeRevision === null) {
    await transaction.done;
    return null;
  }
  const [sessionRecord, pdfRecord] = await Promise.all([
    transaction.objectStore("sessions").get(ACTIVE_KEY),
    transaction.objectStore("pdfs").get(ACTIVE_KEY),
  ]);
  await transaction.done;
  if (
    !sessionRecord ||
    isPersistenceStateRecord(sessionRecord) ||
    !pdfRecord ||
    sessionRecord.revision !== state.activeRevision ||
    pdfRecord.revision !== state.activeRevision
  ) {
    throw new PersistenceLoadError("The saved session is incomplete.", state.activeRevision);
  }
  try {
    const decoded = deserializeSessionForRecovery(sessionRecord.serialized);
    return {
      ...decoded,
      pdfBlob: pdfRecord.blob,
      revision: state.activeRevision,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The saved session is invalid.";
    throw new PersistenceLoadError(message, state.activeRevision);
  }
}

export async function replaceSavedSession(
  session: CurrentSession,
  pdfBlob: Blob,
  expectedRevision: string | null,
): Promise<string> {
  const serialized = serializeSession(session);
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  await requireExpectedRevision(transaction, expectedRevision);
  const revision = crypto.randomUUID();
  await Promise.all([
    transaction.objectStore("sessions").put({
      key: ACTIVE_KEY,
      serialized,
      savedAt: Date.now(),
      revision,
    }),
    transaction.objectStore("pdfs").put({ key: ACTIVE_KEY, blob: pdfBlob, revision }),
    transaction.objectStore("sessions").put({ key: STATE_KEY, activeRevision: revision }),
  ]);
  await transaction.done;
  return revision;
}

export async function saveSessionMetadata(
  session: CurrentSession,
  expectedRevision: string,
): Promise<string> {
  const serialized = serializeSession(session);
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  await requireExpectedRevision(transaction, expectedRevision);
  const [sessionRecord, pdfRecord] = await Promise.all([
    transaction.objectStore("sessions").get(ACTIVE_KEY),
    transaction.objectStore("pdfs").get(ACTIVE_KEY),
  ]);
  if (
    !sessionRecord ||
    isPersistenceStateRecord(sessionRecord) ||
    !pdfRecord ||
    sessionRecord.revision !== expectedRevision ||
    pdfRecord.revision !== expectedRevision
  ) {
    return abort(transaction, new Error("Cannot save session metadata without its PDF."));
  }
  if (sessionRecord.serialized === serialized) {
    await transaction.done;
    return expectedRevision;
  }
  const revision = crypto.randomUUID();
  await Promise.all([
    transaction.objectStore("sessions").put({
      key: ACTIVE_KEY,
      serialized,
      savedAt: Date.now(),
      revision,
    }),
    transaction.objectStore("pdfs").put({ ...pdfRecord, revision }),
    transaction.objectStore("sessions").put({ key: STATE_KEY, activeRevision: revision }),
  ]);
  await transaction.done;
  return revision;
}

export async function discardSavedSession(expectedRevision: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  await requireExpectedRevision(transaction, expectedRevision);
  await Promise.all([
    transaction.objectStore("sessions").delete(ACTIVE_KEY),
    transaction.objectStore("pdfs").delete(ACTIVE_KEY),
    transaction.objectStore("sessions").delete(LEGACY_ACTIVE_KEY),
    transaction.objectStore("pdfs").delete(LEGACY_ACTIVE_KEY),
    transaction.objectStore("sessions").put({ key: STATE_KEY, activeRevision: null }),
  ]);
  await transaction.done;
}

export async function resetPersistenceForTests(): Promise<void> {
  if (databasePromise) {
    const database = await databasePromise;
    database.close();
    databasePromise = null;
  }
  await deleteDB(DATABASE_NAME);
}
