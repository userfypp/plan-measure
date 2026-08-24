import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SessionV4 } from "../types/domain";
import { deserializeSession, serializeSession } from "./persistenceCodec";

const DATABASE_NAME = "plan-measure";
const ACTIVE_KEY = "active";

interface SessionRecord {
  key: string;
  serialized: string;
  savedAt: number;
}

interface PdfRecord {
  key: string;
  blob: Blob;
}

interface PlanMeasureDb extends DBSchema {
  sessions: {
    key: string;
    value: SessionRecord;
  };
  pdfs: {
    key: string;
    value: PdfRecord;
  };
}

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

export interface SavedSession {
  session: SessionV4;
  pdfBlob: Blob;
}

export async function loadSavedSession(): Promise<SavedSession | null> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readonly");
  const [sessionRecord, pdfRecord] = await Promise.all([
    transaction.objectStore("sessions").get(ACTIVE_KEY),
    transaction.objectStore("pdfs").get(ACTIVE_KEY),
  ]);
  await transaction.done;
  if (!sessionRecord && !pdfRecord) return null;
  if (!sessionRecord || !pdfRecord) throw new Error("The saved session is incomplete.");
  return {
    session: deserializeSession(sessionRecord.serialized),
    pdfBlob: pdfRecord.blob,
  };
}

export async function replaceSavedSession(session: SessionV4, pdfBlob: Blob): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  await Promise.all([
    transaction.objectStore("sessions").put({
      key: ACTIVE_KEY,
      serialized: serializeSession(session),
      savedAt: Date.now(),
    }),
    transaction.objectStore("pdfs").put({ key: ACTIVE_KEY, blob: pdfBlob }),
  ]);
  await transaction.done;
}

export async function saveSessionMetadata(session: SessionV4): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  const pdfKey = await transaction.objectStore("pdfs").getKey(ACTIVE_KEY);
  if (pdfKey === undefined) {
    transaction.abort();
    await transaction.done.catch(() => undefined);
    throw new Error("Cannot save session metadata without its PDF.");
  }
  await transaction.objectStore("sessions").put({
    key: ACTIVE_KEY,
    serialized: serializeSession(session),
    savedAt: Date.now(),
  });
  await transaction.done;
}

export async function discardSavedSession(): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  await Promise.all([
    transaction.objectStore("sessions").delete(ACTIVE_KEY),
    transaction.objectStore("pdfs").delete(ACTIVE_KEY),
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
