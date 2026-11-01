import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CurrentSession } from "../types/domain";
import {
  listSavedProjects,
  loadSavedProject,
  loadSavedSession,
  resetPersistenceForTests,
} from "./persistence";
import {
  deserializeSession,
  deserializeSessionForRecovery,
  serializeSession,
} from "./persistenceCodec";
import { readProjectFile } from "./projectFile";

// See fixtures/README.md: these files come from the builds that wrote each schema version.

beforeEach(resetPersistenceForTests);
afterEach(resetPersistenceForTests);

const SCHEMA_VERSIONS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const PROJECT_FILE_VERSIONS = SCHEMA_VERSIONS.filter((version) => version >= 11);

const fixtureUrl = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const fixtureName = (version: number) => `session-v${String(version).padStart(2, "0")}`;

async function savedText(name: string): Promise<string> {
  return readFile(fixtureUrl(`${name}.serialized`), "utf8");
}

async function expectedSession(name: string): Promise<CurrentSession> {
  return JSON.parse(await readFile(fixtureUrl(`${name}.expected.json`), "utf8")) as CurrentSession;
}

async function pdfBytes(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fixtureUrl("plan-bytes.bin")));
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Up to V10 the app stored the `File` it was given; later builds store a `Blob` copy of it. */
async function storedPdf(version: number, name: string): Promise<Blob> {
  const bytes = (await pdfBytes()) as BlobPart;
  const type = "application/pdf";
  if (version > 10) return new Blob([bytes], { type });
  const { pdf } = JSON.parse(await savedText(name)) as Pick<CurrentSession, "pdf">;
  return new File([bytes], pdf.name, { type, lastModified: pdf.lastModified });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("plan-measure", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("sessions", { keyPath: "key" });
      request.result.createObjectStore("pdfs", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type StoredRecord = Record<string, unknown>;

/** The IndexedDB records each era of the app left behind for one active project. */
function storedRecords(version: number, serialized: string, blob: Blob) {
  const savedAt = 1760000000000;
  if (version <= 7) {
    return {
      sessions: [{ key: "active", serialized, savedAt }],
      pdfs: [{ key: "active", blob }],
    };
  }
  const revision = `saved-by-v${version}`;
  const active = {
    sessions: [{ key: "active-v2", serialized, savedAt, revision }],
    pdfs: [{ key: "active-v2", blob, revision }],
  };
  if (version <= 10) {
    return {
      sessions: [...active.sessions, { key: "persistence-v2", activeRevision: revision }],
      pdfs: active.pdfs,
    };
  }
  const projectId = `project-v${version}`;
  const key = `project:${projectId}`;
  return {
    sessions: [
      ...active.sessions,
      { key: "persistence-v2", activeRevision: revision, activeProjectId: projectId },
      { key, projectId, serialized, savedAt },
    ],
    pdfs: [...active.pdfs, { key, blob }],
  };
}

async function writeStoredRecords(records: { sessions: StoredRecord[]; pdfs: StoredRecord[] }) {
  const database = await openDatabase();
  const transaction = database.transaction(["sessions", "pdfs"], "readwrite");
  for (const record of records.sessions) transaction.objectStore("sessions").put(record);
  for (const record of records.pdfs) transaction.objectStore("pdfs").put(record);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

describe.each(SCHEMA_VERSIONS)("a session saved by schema V%i", (version) => {
  const name = fixtureName(version);

  it("is the schema version it claims to be", async () => {
    expect((JSON.parse(await savedText(name)) as { schemaVersion: unknown }).schemaVersion).toBe(
      version,
    );
  });

  it("migrates to the complete expected session", async () => {
    expect(deserializeSessionForRecovery(await savedText(name))).toStrictEqual({
      session: await expectedSession(name),
      compatibility: "current",
      incompatibleMeasurementIds: [],
    });
  });

  it("migrates to a session the current build can save and read back", async () => {
    const expected = await expectedSession(name);
    const migrated = deserializeSession(await savedText(name));
    expect(deserializeSession(serializeSession(migrated))).toStrictEqual(expected);
  });

  it("opens from the IndexedDB records that build left, with its PDF byte for byte", async () => {
    const bytes = await pdfBytes();
    await writeStoredRecords(
      storedRecords(version, await savedText(name), await storedPdf(version, name)),
    );

    const loaded = await loadSavedSession();

    expect(loaded?.session).toStrictEqual(await expectedSession(name));
    expect(loaded?.compatibility).toBe("current");
    expect(loaded?.incompatibleMeasurementIds).toStrictEqual([]);
    expect(await bytesOf(loaded!.pdfBlob)).toStrictEqual(bytes);
  });

  it("appears as the one current project, which opens to the same session", async () => {
    const bytes = await pdfBytes();
    await writeStoredRecords(
      storedRecords(version, await savedText(name), await storedPdf(version, name)),
    );

    const projects = await listSavedProjects();

    expect(projects.map(({ isCurrent }) => isCurrent)).toStrictEqual([true]);
    const project = await loadSavedProject(projects[0]!.id);
    expect(project.session).toStrictEqual(await expectedSession(name));
    expect(await bytesOf(project.pdfBlob)).toStrictEqual(bytes);
  });
});

describe.each(PROJECT_FILE_VERSIONS)("a project file exported by schema V%i", (version) => {
  it("opens to the complete expected session and its PDF byte for byte", async () => {
    const name = fixtureName(version);
    const file = new Blob([await readFile(fixtureUrl(`${name}.planmeasure`))]);

    const { session, pdfBlob } = await readProjectFile(file);

    expect(session).toStrictEqual(await expectedSession(name));
    expect(await bytesOf(pdfBlob)).toStrictEqual(await pdfBytes());
    expect(pdfBlob.type).toBe("application/pdf");
  });
});

describe("polygons saved before they had to be simple", () => {
  const name = "session-v08-invalid-polygons";
  const invalidIds = ["self-crossing", "closed-twice", "collinear", "touching-itself"];

  it("keeps the session and names exactly the polygons that need repair", async () => {
    expect(deserializeSessionForRecovery(await savedText(name))).toStrictEqual({
      session: await expectedSession(name),
      compatibility: "historical-repair-required",
      incompatibleMeasurementIds: invalidIds,
    });
  });

  it("opens from IndexedDB in recovery rather than failing", async () => {
    await writeStoredRecords(storedRecords(8, await savedText(name), await storedPdf(8, name)));

    const loaded = await loadSavedSession();

    expect(loaded?.compatibility).toBe("historical-repair-required");
    expect(loaded?.incompatibleMeasurementIds).toStrictEqual(invalidIds);
    expect(loaded?.session).toStrictEqual(await expectedSession(name));
  });
});
