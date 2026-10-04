import {
  deleteDB,
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
} from "idb";
import type { CurrentSession, PdfMetadata } from "../types/domain";
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
  activeProjectId?: string | null;
}

interface ProjectRecord extends SessionRecord {
  projectId: string;
}

export interface SavedProjectSummary {
  id: string;
  name: string;
  pageCount: number;
  savedAt: number;
  isCurrent: boolean;
}

interface PdfRecord {
  key: string;
  blob: Blob;
  revision?: string;
}

interface PlanMeasureDb extends DBSchema {
  sessions: {
    key: string;
    value: SessionRecord | ProjectRecord | PersistenceStateRecord;
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
let databaseInstance: IDBPDatabase<PlanMeasureDb> | null = null;

function getDatabase(): Promise<IDBPDatabase<PlanMeasureDb>> {
  if (databasePromise) return databasePromise;
  let connection: IDBPDatabase<PlanMeasureDb> | null = null;
  const invalidate = () => {
    // A late callback from an old connection must not clear its replacement.
    if (databasePromise !== opening) return;
    databasePromise = null;
    databaseInstance = null;
  };
  const opening: Promise<IDBPDatabase<PlanMeasureDb>> = openDB<PlanMeasureDb>(DATABASE_NAME, 1, {
    upgrade(database) {
      database.createObjectStore("sessions", { keyPath: "key" });
      database.createObjectStore("pdfs", { keyPath: "key" });
    },
    terminated: invalidate,
    blocking() {
      connection?.close();
      invalidate();
    },
  })
    .then((database) => {
      connection = database;
      if (databasePromise === opening) databaseInstance = database;
      return database;
    })
    .catch((error: unknown) => {
      invalidate();
      throw error;
    });
  databasePromise = opening;
  return opening;
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
  projectId: string;
  session: CurrentSession;
  pdfBlob: Blob;
  revision: string;
  compatibility: SessionCompatibility;
  incompatibleMeasurementIds: string[];
}

function isPersistenceStateRecord(
  record: SessionRecord | ProjectRecord | PersistenceStateRecord | undefined,
): record is PersistenceStateRecord {
  return Boolean(
    record &&
    "activeRevision" in record &&
    (record.activeRevision === null ||
      (typeof record.activeRevision === "string" && record.activeRevision.length > 0)),
  );
}

function isProjectRecord(
  record: SessionRecord | ProjectRecord | PersistenceStateRecord | undefined,
): record is ProjectRecord {
  return Boolean(
    record &&
    "projectId" in record &&
    typeof record.projectId === "string" &&
    record.projectId.length > 0 &&
    typeof record.serialized === "string",
  );
}

function projectRecordKey(projectId: string): string {
  return `project:${projectId}`;
}

function readMatchingActiveRevision(
  sessionRecord: SessionRecord | ProjectRecord | PersistenceStateRecord | undefined,
  pdfRecord: PdfRecord | undefined,
): string | null {
  if (!sessionRecord || isPersistenceStateRecord(sessionRecord) || !pdfRecord) return null;
  const revision = sessionRecord.revision;
  return typeof revision === "string" && revision.length > 0 && pdfRecord.revision === revision
    ? revision
    : null;
}

async function ensureActiveProject(
  transaction: PersistenceTransaction,
  state: PersistenceStateRecord,
  sessionRecord: SessionRecord | ProjectRecord | PersistenceStateRecord | undefined,
  pdfRecord: PdfRecord | undefined,
): Promise<PersistenceStateRecord> {
  const sessions = transaction.objectStore("sessions");
  const pdfs = transaction.objectStore("pdfs");
  if (state.activeProjectId) {
    const existing = await sessions.get(projectRecordKey(state.activeProjectId));
    if (isProjectRecord(existing)) return state;
  }
  if (
    !sessionRecord ||
    isPersistenceStateRecord(sessionRecord) ||
    !pdfRecord ||
    !sessionRecord.revision ||
    pdfRecord.revision !== sessionRecord.revision
  ) {
    return state;
  }
  const sessionPdf = readRecoverableSessionPdfMetadata(sessionRecord.serialized);
  if (sessionPdf && storedFileIdentityMatches(pdfRecord.blob, sessionPdf) === false) return state;
  const projectId = state.activeProjectId || crypto.randomUUID();
  const key = projectRecordKey(projectId);
  await Promise.all([
    sessions.put({
      key,
      projectId,
      serialized: sessionRecord.serialized,
      savedAt: sessionRecord.savedAt ?? Date.now(),
    }),
    pdfs.put({ key, blob: pdfRecord.blob }),
  ]);
  const nextState = { ...state, activeProjectId: projectId };
  await sessions.put(nextState);
  return nextState;
}

function readRecoverableSessionPdfMetadata(serialized: string): PdfMetadata | null {
  try {
    return deserializeSessionForRecovery(serialized).session.pdf;
  } catch {
    return null;
  }
}

function readStoredFileMetadata(blob: Blob): PdfMetadata | null {
  if (typeof File === "undefined" || !(blob instanceof File)) return null;
  if (!Number.isFinite(blob.lastModified)) return null;
  return { name: blob.name, size: blob.size, lastModified: blob.lastModified };
}

function storedFileIdentityMatches(blob: Blob, sessionPdf: PdfMetadata): boolean | null {
  const storedPdf = readStoredFileMetadata(blob);
  if (!storedPdf) return null;
  return (
    sessionPdf.name === storedPdf.name &&
    sessionPdf.size === storedPdf.size &&
    sessionPdf.lastModified === storedPdf.lastModified
  );
}

export async function copyPdfBlob(blob: Blob): Promise<Blob> {
  const bytes =
    typeof blob.arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(blob);
        });
  return new Blob([bytes], { type: blob.type });
}

function canAdoptLegacyPair(sessionRecord: SessionRecord, pdfRecord: PdfRecord): boolean {
  const sessionPdf = readRecoverableSessionPdfMetadata(sessionRecord.serialized);
  return Boolean(sessionPdf && storedFileIdentityMatches(pdfRecord.blob, sessionPdf) === true);
}

async function readOrCreatePersistenceState(
  transaction: PersistenceTransaction,
): Promise<PersistenceStateRecord> {
  const sessions = transaction.objectStore("sessions");
  const pdfs = transaction.objectStore("pdfs");
  const existingState = await sessions.get(STATE_KEY);
  const [activeSession, activePdf] = await Promise.all([
    sessions.get(ACTIVE_KEY),
    pdfs.get(ACTIVE_KEY),
  ]);
  const activeRevision = readMatchingActiveRevision(activeSession, activePdf);
  if (activeRevision !== null) {
    const nextState =
      isPersistenceStateRecord(existingState) && existingState.activeRevision === activeRevision
        ? existingState
        : { key: STATE_KEY, activeRevision };
    if (nextState !== existingState) await sessions.put(nextState);
    return ensureActiveProject(transaction, nextState, activeSession, activePdf);
  }
  if (isPersistenceStateRecord(existingState) && existingState.activeRevision !== null) {
    return existingState;
  }
  if (activeSession || activePdf) {
    const protectedRevision = crypto.randomUUID();
    await sessions.put({ key: STATE_KEY, activeRevision: protectedRevision });
    return { key: STATE_KEY, activeRevision: protectedRevision };
  }
  if (isPersistenceStateRecord(existingState)) return existingState;

  const [legacySession, legacyPdf] = await Promise.all([
    sessions.get(LEGACY_ACTIVE_KEY),
    pdfs.get(LEGACY_ACTIVE_KEY),
  ]);
  const legacyRevision = legacySession || legacyPdf ? crypto.randomUUID() : null;
  const writes: Array<Promise<unknown>> = [
    sessions.put({ key: STATE_KEY, activeRevision: legacyRevision }),
  ];
  if (
    legacySession &&
    !isPersistenceStateRecord(legacySession) &&
    legacyPdf &&
    canAdoptLegacyPair(legacySession, legacyPdf)
  ) {
    writes.push(
      sessions.put({ ...legacySession, key: ACTIVE_KEY, revision: legacyRevision! }),
      pdfs.put({ ...legacyPdf, key: ACTIVE_KEY, revision: legacyRevision! }),
      sessions.delete(LEGACY_ACTIVE_KEY),
      pdfs.delete(LEGACY_ACTIVE_KEY),
    );
  }
  await Promise.all(writes);
  const nextState = { key: STATE_KEY, activeRevision: legacyRevision };
  if (legacyRevision === null) return nextState;
  const [migratedSession, migratedPdf] = await Promise.all([
    sessions.get(ACTIVE_KEY),
    pdfs.get(ACTIVE_KEY),
  ]);
  return ensureActiveProject(transaction, nextState, migratedSession, migratedPdf);
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
    if (storedFileIdentityMatches(pdfRecord.blob, decoded.session.pdf) === false) {
      throw new Error("The saved PDF does not match its session metadata.");
    }
    return {
      projectId: state.activeProjectId ?? "",
      ...decoded,
      pdfBlob: pdfRecord.blob,
      revision: state.activeRevision,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The saved session is invalid.";
    throw new PersistenceLoadError(message, state.activeRevision);
  }
}

export async function listSavedProjects(): Promise<SavedProjectSummary[]> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  const state = await readOrCreatePersistenceState(transaction);
  const [records, pdfRecords] = await Promise.all([
    transaction.objectStore("sessions").getAll(),
    transaction.objectStore("pdfs").getAll(),
  ]);
  const pdfKeys = new Set(pdfRecords.map((record) => record.key));
  const projects = records.flatMap((record) => {
    if (!isProjectRecord(record) || !pdfKeys.has(projectRecordKey(record.projectId))) return [];
    try {
      const session = deserializeSessionForRecovery(record.serialized).session;
      return [{
        id: record.projectId,
        name: session.pdf.name,
        pageCount: session.pageCount,
        savedAt: record.savedAt,
        isCurrent: record.projectId === state.activeProjectId,
      }];
    } catch {
      return [];
    }
  });
  await transaction.done;
  return projects.sort(
    (left, right) =>
      Number(right.isCurrent) - Number(left.isCurrent) || right.savedAt - left.savedAt,
  );
}

export async function loadSavedProject(projectId: string): Promise<Omit<SavedSession, "revision">> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readonly");
  const key = projectRecordKey(projectId);
  const [project, pdf] = await Promise.all([
    transaction.objectStore("sessions").get(key),
    transaction.objectStore("pdfs").get(key),
  ]);
  await transaction.done;
  if (!isProjectRecord(project) || !pdf) {
    throw new Error("The selected project is no longer available.");
  }
  try {
    const decoded = deserializeSessionForRecovery(project.serialized);
    if (storedFileIdentityMatches(pdf.blob, decoded.session.pdf) === false) {
      throw new Error("The saved PDF does not match its session metadata.");
    }
    return { ...decoded, projectId, pdfBlob: pdf.blob };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The saved project is invalid.";
    throw new Error(message, { cause: error });
  }
}

export async function activateSavedProject(
  projectId: string,
  expectedRevision: string | null,
  currentSession?: CurrentSession,
): Promise<SavedSession> {
  const serializedCurrentSession = currentSession ? serializeSession(currentSession) : null;
  const database = await getDatabase();
  const source = database.transaction("pdfs", "readonly");
  const sourcePdf = await source.objectStore("pdfs").get(projectRecordKey(projectId));
  await source.done;
  if (!sourcePdf) throw new Error("The selected project is no longer available.");
  const activePdfBlob = await copyPdfBlob(sourcePdf.blob);
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  void transaction.done.catch(() => undefined);
  const state = await requireExpectedRevision(transaction, expectedRevision);
  const key = projectRecordKey(projectId);
  const [project, pdf, activePdf] = await Promise.all([
    transaction.objectStore("sessions").get(key),
    transaction.objectStore("pdfs").get(key),
    transaction.objectStore("pdfs").get(ACTIVE_KEY),
  ]);
  if (!isProjectRecord(project) || !pdf) {
    return abort(transaction, new Error("The selected project is no longer available."));
  }
  let decoded: ReturnType<typeof deserializeSessionForRecovery>;
  try {
    decoded = deserializeSessionForRecovery(project.serialized);
    if (storedFileIdentityMatches(pdf.blob, decoded.session.pdf) === false) {
      throw new Error("The saved PDF does not match its session metadata.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The saved project is invalid.";
    return abort(transaction, new Error(message));
  }
  const writes: Array<Promise<unknown>> = [];
  if (state.activeProjectId && serializedCurrentSession && activePdf) {
    writes.push(
      putProjectSessionSnapshot(
        transaction,
        state.activeProjectId,
        serializedCurrentSession,
        activePdf.blob,
      ),
    );
  }
  const revision = crypto.randomUUID();
  writes.push(
    transaction.objectStore("sessions").put({
      key: ACTIVE_KEY,
      serialized: project.serialized,
      savedAt: Date.now(),
      revision,
    }),
    transaction.objectStore("pdfs").put({ key: ACTIVE_KEY, blob: activePdfBlob, revision }),
    transaction.objectStore("sessions").put({
      key: STATE_KEY,
      activeRevision: revision,
      activeProjectId: projectId,
    }),
  );
  await finishWrites(transaction, writes);
  return {
    ...decoded,
    projectId,
    pdfBlob: activePdfBlob,
    revision,
  };
}

export async function replaceSavedSession(
  session: CurrentSession,
  pdfBlob: Blob,
  expectedRevision: string | null,
  projectId: string = crypto.randomUUID(),
  currentSession?: CurrentSession,
): Promise<string> {
  const serialized = serializeSession(session);
  const serializedCurrentSession = currentSession ? serializeSession(currentSession) : null;
  const persistedPdfBlob = await copyPdfBlob(pdfBlob);
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  void transaction.done.catch(() => undefined);
  const state = await requireExpectedRevision(transaction, expectedRevision);
  const activePdf = await transaction.objectStore("pdfs").get(ACTIVE_KEY);
  const writes: Array<Promise<unknown>> = [];
  if (state.activeProjectId && serializedCurrentSession && activePdf) {
    writes.push(
      putProjectSessionSnapshot(
        transaction,
        state.activeProjectId,
        serializedCurrentSession,
        activePdf.blob,
      ),
    );
  }
  const revision = crypto.randomUUID();
  writes.push(
    transaction.objectStore("sessions").put({
      key: ACTIVE_KEY,
      serialized,
      savedAt: Date.now(),
      revision,
    }),
    transaction.objectStore("pdfs").put({ key: ACTIVE_KEY, blob: persistedPdfBlob, revision }),
    putProjectSnapshot(transaction, projectId, serialized, persistedPdfBlob),
    transaction.objectStore("sessions").put({
      key: STATE_KEY,
      activeRevision: revision,
      activeProjectId: projectId,
    }),
  );
  await finishWrites(transaction, writes);
  return revision;
}

async function putProjectSnapshot(
  transaction: PersistenceTransaction,
  projectId: string,
  serialized: string,
  pdfBlob: Blob,
  savedAt = Date.now(),
): Promise<void> {
  const key = projectRecordKey(projectId);
  await Promise.all([
    transaction.objectStore("sessions").put({
      key,
      projectId,
      serialized,
      savedAt,
    }),
    transaction.objectStore("pdfs").put({ key, blob: pdfBlob }),
  ]);
}

async function putProjectSessionSnapshot(
  transaction: PersistenceTransaction,
  projectId: string,
  serialized: string,
  fallbackPdfBlob?: Blob,
  savedAt = Date.now(),
): Promise<void> {
  const key = projectRecordKey(projectId);
  const existingPdf = await transaction.objectStore("pdfs").get(key);
  if (!existingPdf && fallbackPdfBlob) {
    await transaction.objectStore("pdfs").put({ key, blob: fallbackPdfBlob });
  }
  await transaction.objectStore("sessions").put({
    key,
    projectId,
    serialized,
    savedAt,
  });
}

async function finishWrites(
  transaction: PersistenceTransaction,
  writes: Array<Promise<unknown>>,
): Promise<void> {
  try {
    await Promise.all(writes);
    await transaction.done;
  } catch (error) {
    await transaction.done.catch(() => undefined);
    throw error;
  }
}

export async function saveSessionMetadata(
  session: CurrentSession,
  expectedRevision: string,
  preparedPdfBlob?: Blob,
): Promise<string> {
  const serialized = serializeSession(session);
  const database = databaseInstance ?? (await getDatabase());
  let pdfBlob = preparedPdfBlob;
  if (!pdfBlob) {
    const source = database.transaction("pdfs", "readonly");
    const pdfRecord = await source.objectStore("pdfs").get(ACTIVE_KEY);
    await source.done;
    if (pdfRecord) {
      pdfBlob = await copyPdfBlob(pdfRecord.blob);
    }
  }
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  void transaction.done.catch(() => undefined);
  return saveSerializedSessionMetadata(
    serialized,
    () => expectedRevision,
    transaction,
    pdfBlob,
    session,
  );
}

async function saveSerializedSessionMetadata(
  serialized: string,
  expectedRevision: () => string,
  transaction: PersistenceTransaction,
  preparedPdfBlob: Blob | undefined,
  snapshot?: CurrentSession,
): Promise<string> {
  const state = await readOrCreatePersistenceState(transaction);
  const currentExpectedRevision = expectedRevision();
  if (state.activeRevision !== currentExpectedRevision) {
    return abort(transaction, new PersistenceConflictError());
  }
  const [sessionRecord, pdfRecord] = await Promise.all([
    transaction.objectStore("sessions").get(ACTIVE_KEY),
    transaction.objectStore("pdfs").get(ACTIVE_KEY),
  ]);
  if (
    !sessionRecord ||
    isPersistenceStateRecord(sessionRecord) ||
    !pdfRecord ||
    sessionRecord.revision !== currentExpectedRevision ||
    pdfRecord.revision !== currentExpectedRevision
  ) {
    return abort(transaction, new Error("Cannot save session metadata without its PDF."));
  }
  if (sessionRecord.serialized === serialized) {
    await finishWrites(
      transaction,
      snapshot && state.activeProjectId
        ? [putProjectSessionSnapshot(transaction, state.activeProjectId, serialized, preparedPdfBlob, sessionRecord.savedAt)]
        : [],
    );
    return currentExpectedRevision;
  }
  if (!preparedPdfBlob) {
    return abort(transaction, new Error("Cannot save session metadata without its PDF."));
  }
  const revision = crypto.randomUUID();
  const writes: Array<Promise<unknown>> = [
    transaction.objectStore("sessions").put({
      key: ACTIVE_KEY,
      serialized,
      savedAt: Date.now(),
      revision,
    }),
    transaction.objectStore("pdfs").put({ ...pdfRecord, blob: preparedPdfBlob, revision }),
    transaction.objectStore("sessions").put({
      key: STATE_KEY,
      activeRevision: revision,
      activeProjectId: state.activeProjectId ?? null,
    }),
  ];
  if (snapshot && state.activeProjectId) {
    writes.push(putProjectSessionSnapshot(transaction, state.activeProjectId, serialized, preparedPdfBlob));
  }
  await finishWrites(transaction, writes);
  return revision;
}

/**
 * Starts the IndexedDB transaction synchronously while the page is still in
 * beforeunload. The revision getter stays live so an already-started save from
 * this tab can finish first without weakening stale-writer protection.
 */
export function beginSessionMetadataSaveOnPageExit(
  session: CurrentSession,
  expectedRevision: () => string,
  preparedPdfBlob: Blob,
): Promise<string> | null {
  const database = databaseInstance;
  if (!database) return null;
  const serialized = serializeSession(session);
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  void transaction.done.catch(() => undefined);
  return saveSerializedSessionMetadata(
    serialized,
    expectedRevision,
    transaction,
    preparedPdfBlob,
    session,
  );
}

export async function discardSavedSession(expectedRevision: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  const state = await requireExpectedRevision(transaction, expectedRevision);
  const writes: Array<Promise<unknown>> = [
    transaction.objectStore("sessions").delete(ACTIVE_KEY),
    transaction.objectStore("pdfs").delete(ACTIVE_KEY),
    transaction.objectStore("sessions").delete(LEGACY_ACTIVE_KEY),
    transaction.objectStore("pdfs").delete(LEGACY_ACTIVE_KEY),
    transaction.objectStore("sessions").put({
      key: STATE_KEY,
      activeRevision: null,
      activeProjectId: null,
    }),
  ];
  if (state.activeProjectId) {
    const key = projectRecordKey(state.activeProjectId);
    writes.push(transaction.objectStore("sessions").delete(key));
    writes.push(transaction.objectStore("pdfs").delete(key));
  }
  await Promise.all(writes);
  await transaction.done;
}

export async function discardSavedProject(
  projectId: string,
  expectedRevision: string | null,
): Promise<boolean> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  const state = await requireExpectedRevision(transaction, expectedRevision);
  const key = projectRecordKey(projectId);
  const [project, pdf] = await Promise.all([
    transaction.objectStore("sessions").get(key),
    transaction.objectStore("pdfs").get(key),
  ]);
  if (!isProjectRecord(project) || !pdf) {
    return abort(transaction, new Error("The selected project is no longer available."));
  }
  const isActive = state.activeProjectId === projectId;
  const writes: Array<Promise<unknown>> = [
    transaction.objectStore("sessions").delete(key),
    transaction.objectStore("pdfs").delete(key),
  ];
  if (isActive) {
    writes.push(
      transaction.objectStore("sessions").delete(ACTIVE_KEY),
      transaction.objectStore("pdfs").delete(ACTIVE_KEY),
      transaction.objectStore("sessions").delete(LEGACY_ACTIVE_KEY),
      transaction.objectStore("pdfs").delete(LEGACY_ACTIVE_KEY),
      transaction.objectStore("sessions").put({
        key: STATE_KEY,
        activeRevision: null,
        activeProjectId: null,
      }),
    );
  }
  await Promise.all(writes);
  await transaction.done;
  return isActive;
}

export async function resetPersistenceForTests(): Promise<void> {
  if (databasePromise) {
    const database = await databasePromise;
    database.close();
    databasePromise = null;
    databaseInstance = null;
  }
  await deleteDB(DATABASE_NAME);
}
