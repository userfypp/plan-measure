import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession } from "../types/domain";
import {
  activateSavedProject,
  closeActiveSession,
  discardSavedProject,
  discardSavedSession,
  listSavedProjects,
  loadSavedProject,
  loadSavedSession,
  PersistenceConflictError,
  PersistenceLoadError,
  replaceSavedSession,
  resetPersistenceForTests,
  saveSessionMetadata,
} from "./persistence";
import { deserializeSession, serializeSession } from "./persistenceCodec";

beforeEach(resetPersistenceForTests);
afterEach(async () => {
  vi.restoreAllMocks();
  await resetPersistenceForTests();
});

// Not valid UTF-8, so a copy through text would change these bytes.
const pdfBytes = (seed: number) =>
  Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00, 0xfe, 0x80, 0xc3, 0x28, seed]);
const pdfBlob = (seed: number) => new Blob([pdfBytes(seed)], { type: "application/pdf" });

const sessionNamed = (name: string): CurrentSession =>
  createEmptySession({ name, size: pdfBytes(0).length, lastModified: 1 }, 1);
const relabeled = (session: CurrentSession, label: string): CurrentSession => ({
  ...session,
  pageLabelOverrides: { 1: label },
});

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

type StoredRecord = Record<string, unknown> & { key: string };

function withDatabase<T>(run: (database: IDBDatabase) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("plan-measure");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      run(database)
        .then(resolve, reject)
        .finally(() => database.close());
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Everything stored, with each PDF as its bytes, so two snapshots can be compared exactly. */
async function storedRecords() {
  const { sessions, pdfs } = await withDatabase(async (database) => {
    const transaction = database.transaction(["sessions", "pdfs"]);
    return {
      sessions: await requestResult<StoredRecord[]>(transaction.objectStore("sessions").getAll()),
      pdfs: await requestResult<StoredRecord[]>(transaction.objectStore("pdfs").getAll()),
    };
  });
  return {
    sessions,
    pdfs: await Promise.all(
      pdfs.map(async ({ blob, ...record }) => ({ ...record, bytes: await bytesOf(blob as Blob) })),
    ),
  };
}

function editStore(store: "sessions" | "pdfs", edit: (records: IDBObjectStore) => void) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(store, "readwrite");
    edit(transaction.objectStore(store));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

const storedRecord = (records: StoredRecord[], key: string) =>
  records.find((record) => record.key === key);

const editActive = (store: "sessions" | "pdfs", edit: (record: StoredRecord) => StoredRecord) =>
  editStore(store, (records) => {
    const request = records.get("active-v2");
    request.onsuccess = () => records.put(edit(request.result as StoredRecord));
  });
const tearActivePair = (store: "sessions" | "pdfs") =>
  editActive(store, (record) => ({ ...record, revision: "torn" }));
const storeActivePdf = (blob: Blob) => editActive("pdfs", (record) => ({ ...record, blob }));
const storeState = (activeRevision: string) =>
  editStore("sessions", (sessions) =>
    sessions.put({ key: "persistence-v2", activeRevision, activeProjectId: "second" }),
  );

/** What an old build leaves behind when it stored a pair this one cannot prove belongs together. */
async function leaveLegacyPair(blob: Blob) {
  const serialized = serializeSession(sessionNamed("legacy.pdf"));
  await editStore("sessions", (sessions) =>
    sessions.put({ key: "active", serialized, savedAt: 1 }),
  );
  await editStore("pdfs", (pdfs) => pdfs.put({ key: "active", blob }));
}

interface Seeded {
  revision: string;
  staleRevision: string;
  original: CurrentSession;
}

/** Project "first" is saved, then project "second" becomes the active one with an Undo history. */
async function seed(): Promise<Seeded> {
  const first = sessionNamed("first.pdf");
  const staleRevision = await replaceSavedSession(first, pdfBlob(1), null, "first");
  const original = sessionNamed("second.pdf");
  const revision = await replaceSavedSession(original, pdfBlob(2), staleRevision, "second", first);
  await editStore("sessions", (sessions) => sessions.put({ key: "undo-history", revision }));
  return { revision, staleRevision, original };
}

/**
 * Fails the transaction at its Nth `put` as a full disk does: the write is accepted, then the
 * transaction aborts with `QuotaExceededError`, the writes still queued fail with `AbortError`, and
 * everything rolls back. On the last write this is the failure a browser reports at commit.
 */
function failOnPut(writeNumber: number) {
  const original = IDBObjectStore.prototype.put as (...args: unknown[]) => IDBRequest;
  let writes = 0;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    ...args: unknown[]
  ) {
    const request = original.apply(this, args);
    writes += 1;
    if (writes === writeNumber) {
      const transaction = this.transaction as IDBTransaction & { _abort(name: string): void };
      request.addEventListener("success", () => transaction._abort("QuotaExceededError"));
    }
    return request;
  } as never);
}

describe("a write that fails for lack of space", () => {
  interface Operation {
    label: string;
    writes: number;
    run(seeded: Seeded): Promise<unknown>;
    /** What the active session and project "second" hold once this has succeeded. */
    active(seeded: Seeded): CurrentSession | null;
    second(seeded: Seeded): CurrentSession;
  }

  const outgoing = ({ original }: Seeded) => relabeled(original, "outgoing");
  const edited = ({ original }: Seeded) => relabeled(original, "edited");

  const operations: Operation[] = [
    {
      label: "replacing the session",
      writes: 5,
      run: ({ revision }) =>
        replaceSavedSession(sessionNamed("third.pdf"), pdfBlob(3), revision, "new"),
      active: () => sessionNamed("third.pdf"),
      second: ({ original }) => original,
    },
    {
      label: "replacing the session and saving the outgoing one",
      writes: 6,
      run: (seeded) =>
        replaceSavedSession(
          sessionNamed("third.pdf"),
          pdfBlob(3),
          seeded.revision,
          "new",
          outgoing(seeded),
        ),
      active: () => sessionNamed("third.pdf"),
      second: outgoing,
    },
    {
      label: "activating a project and saving the outgoing one",
      writes: 4,
      run: (seeded) => activateSavedProject("first", seeded.revision, outgoing(seeded)),
      active: () => sessionNamed("first.pdf"),
      second: outgoing,
    },
    {
      label: "closing the project and saving its latest session",
      writes: 2,
      run: (seeded) => closeActiveSession(seeded.revision, outgoing(seeded)),
      active: () => null,
      second: outgoing,
    },
    {
      label: "saving the session metadata",
      writes: 4,
      run: (seeded) => saveSessionMetadata(edited(seeded), seeded.revision),
      active: edited,
      second: edited,
    },
  ];

  const failures = operations.flatMap((operation) =>
    Array.from({ length: operation.writes }, (_, index) => ({
      ...operation,
      writeNumber: index + 1,
    })),
  );

  it.each(failures)(
    "$label keeps every record intact when write $writeNumber of $writes fails",
    async ({ writeNumber, writes, run }) => {
      const seeded = await seed();
      const before = await storedRecords();
      failOnPut(writeNumber);

      await expect(run(seeded)).rejects.toMatchObject({
        name: writeNumber === writes ? "QuotaExceededError" : "AbortError",
      });

      vi.restoreAllMocks();
      expect(await storedRecords()).toStrictEqual(before);
    },
  );

  it.each(operations)(
    "$label succeeds on retry once there is space",
    async ({ writes, run, active, second }) => {
      const seeded = await seed();
      failOnPut(writes);
      await expect(run(seeded)).rejects.toMatchObject({ name: "QuotaExceededError" });
      vi.restoreAllMocks();

      await run(seeded);

      expect((await loadSavedSession())?.session ?? null).toStrictEqual(active(seeded));
      expect((await loadSavedProject("second")).session).toStrictEqual(second(seeded));
    },
  );
});

describe("stored PDF bytes", () => {
  const pdfOf = (records: Awaited<ReturnType<typeof storedRecords>>, key: string) =>
    storedRecord(records.pdfs, key)?.bytes;

  it("stores the replaced PDF byte for byte as both the active and the project copy", async () => {
    await replaceSavedSession(sessionNamed("plan.pdf"), pdfBlob(1), null, "project");

    const records = await storedRecords();
    expect(pdfOf(records, "active-v2")).toStrictEqual(pdfBytes(1));
    expect(pdfOf(records, "project:project")).toStrictEqual(pdfBytes(1));
  });

  it("copies the selected project's bytes when it becomes active", async () => {
    const { revision, original } = await seed();

    const activated = await activateSavedProject("first", revision, original);

    const records = await storedRecords();
    expect(await bytesOf(activated.pdfBlob)).toStrictEqual(pdfBytes(1));
    expect(pdfOf(records, "active-v2")).toStrictEqual(pdfBytes(1));
    expect(pdfOf(records, "project:first")).toStrictEqual(pdfBytes(1));
    expect(pdfOf(records, "project:second")).toStrictEqual(pdfBytes(2));
  });

  it("keeps the bytes when only the metadata is saved", async () => {
    const { revision, original } = await seed();

    await saveSessionMetadata(relabeled(original, "edited"), revision);

    const records = await storedRecords();
    expect(pdfOf(records, "active-v2")).toStrictEqual(pdfBytes(2));
    expect(pdfOf(records, "project:second")).toStrictEqual(pdfBytes(2));
    expect(await bytesOf((await loadSavedSession())!.pdfBlob)).toStrictEqual(pdfBytes(2));
  });

  it("keeps the project's bytes after closing it", async () => {
    const { revision, original } = await seed();

    await closeActiveSession(revision, relabeled(original, "edited"));

    const records = await storedRecords();
    expect(pdfOf(records, "active-v2")).toBeUndefined();
    expect(await bytesOf((await loadSavedProject("second")).pdfBlob)).toStrictEqual(pdfBytes(2));
  });

  it.each<[string, (seeded: Seeded) => Promise<unknown>]>([
    ["closing it", (s) => closeActiveSession(s.revision, s.original)],
    ["leaving it for another", (s) => activateSavedProject("first", s.revision, s.original)],
  ])("gives a project that lost its PDF the active bytes on %s", async (_label, run) => {
    const seeded = await seed();
    await editStore("pdfs", (pdfs) => pdfs.delete("project:second"));

    await run(seeded);

    expect(pdfOf(await storedRecords(), "project:second")).toStrictEqual(pdfBytes(2));
  });
});

describe("loading, activating and discarding what cannot be used", () => {
  const unsupported = JSON.stringify({ schemaVersion: 99 });
  const unsupportedMessage = "The saved session uses an unsupported schema.";
  const unavailableMessage = "The selected project is no longer available.";
  const mismatchMessage = "The saved PDF does not match its session metadata.";

  const corruptProject = () =>
    editStore("sessions", (sessions) =>
      sessions.put({
        key: "project:first",
        projectId: "first",
        serialized: unsupported,
        savedAt: 1,
      }),
    );
  const swapProjectPdf = () =>
    editStore("pdfs", (pdfs) =>
      pdfs.put({
        key: "project:first",
        blob: new File([pdfBytes(9)], "other.pdf", { lastModified: 1 }),
      }),
    );

  it.each<[string, (seeded: Seeded) => Promise<unknown>]>([
    ["activating a project", (s) => activateSavedProject("first", s.staleRevision, s.original)],
    ["discarding a project", (s) => discardSavedProject("first", s.staleRevision)],
  ])("%s with a stale revision changes nothing", async (_label, run) => {
    const seeded = await seed();
    const before = await storedRecords();

    const failure = run(seeded);

    await expect(failure).rejects.toBeInstanceOf(PersistenceConflictError);
    await expect(failure).rejects.toThrow("The saved session changed in another tab.");
    expect(await storedRecords()).toStrictEqual(before);
  });

  it.each<[string, (seeded: Seeded) => Promise<unknown>]>([
    ["loading", () => loadSavedProject("gone")],
    ["activating", (s) => activateSavedProject("gone", s.revision, s.original)],
    ["discarding", (s) => discardSavedProject("gone", s.revision)],
  ])("%s a project that does not exist changes nothing", async (_label, run) => {
    const seeded = await seed();
    const before = await storedRecords();

    await expect(run(seeded)).rejects.toThrow(unavailableMessage);

    expect(await storedRecords()).toStrictEqual(before);
  });

  it.each<[string, () => Promise<void>, string, (seeded: Seeded) => Promise<unknown>]>([
    ["loading a corrupt", corruptProject, unsupportedMessage, () => loadSavedProject("first")],
    [
      "activating a corrupt",
      corruptProject,
      unsupportedMessage,
      (s) => activateSavedProject("first", s.revision, s.original),
    ],
    ["loading a mismatched", swapProjectPdf, mismatchMessage, () => loadSavedProject("first")],
    [
      "activating a mismatched",
      swapProjectPdf,
      mismatchMessage,
      (s) => activateSavedProject("first", s.revision, s.original),
    ],
  ])("%s project reports why and changes nothing", async (_label, damage, message, run) => {
    const seeded = await seed();
    await damage();
    const before = await storedRecords();

    await expect(run(seeded)).rejects.toThrow(message);

    expect(await storedRecords()).toStrictEqual(before);
  });

  it.each<[string, (seeded: Seeded) => Promise<unknown>]>([
    ["loading", () => loadSavedProject("first")],
    ["activating", (s) => activateSavedProject("first", s.revision, s.original)],
    ["discarding", (s) => discardSavedProject("first", s.revision)],
  ])("%s a project whose session is gone but whose PDF remains", async (_label, run) => {
    const seeded = await seed();
    await editStore("sessions", (sessions) => sessions.delete("project:first"));
    const before = await storedRecords();

    await expect(run(seeded)).rejects.toThrow(unavailableMessage);

    expect(await storedRecords()).toStrictEqual(before);
  });

  it("stops activating a project whose PDF disappears while it is copied", async () => {
    const { revision, original } = await seed();
    const before = await storedRecords();
    const read = Blob.prototype.arrayBuffer;
    vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementationOnce(async function (this: Blob) {
      await editStore("pdfs", (pdfs) => pdfs.delete("project:first"));
      return read.call(this);
    });

    await expect(activateSavedProject("first", revision, original)).rejects.toThrow(
      unavailableMessage,
    );

    expect(await storedRecords()).toStrictEqual({
      ...before,
      pdfs: before.pdfs.filter(({ key }) => key !== "project:first"),
    });
  });

  it("leaves a corrupt project out of the list without losing the others", async () => {
    await seed();
    await corruptProject();

    const projects = await listSavedProjects();

    expect(projects.map(({ id }) => id)).toStrictEqual(["second"]);
  });

  it("can discard a corrupt project", async () => {
    const { revision } = await seed();
    await corruptProject();

    await expect(discardSavedProject("first", revision)).resolves.toBe(false);

    const records = await storedRecords();
    expect(storedRecord(records.sessions, "project:first")).toBeUndefined();
    expect(storedRecord(records.pdfs, "project:first")).toBeUndefined();
    expect(storedRecord(records.pdfs, "project:second")).toBeDefined();
  });

  it.each<[string, () => Promise<void>, string]>([
    [
      "corrupt",
      () =>
        editStore("sessions", (sessions) => {
          const request = sessions.get("active-v2");
          request.onsuccess = () => sessions.put({ ...request.result, serialized: unsupported });
        }),
      unsupportedMessage,
    ],
    [
      "mismatched",
      () =>
        editStore("pdfs", (pdfs) => {
          const request = pdfs.get("active-v2");
          request.onsuccess = () =>
            pdfs.put({
              ...request.result,
              blob: new File([pdfBytes(9)], "other.pdf", { lastModified: 1 }),
            });
        }),
      mismatchMessage,
    ],
  ])(
    "reports a %s active session with its revision, ready to discard",
    async (_, damage, message) => {
      const { revision } = await seed();
      await damage();
      const before = await storedRecords();

      const failure = loadSavedSession();

      await expect(failure).rejects.toBeInstanceOf(PersistenceLoadError);
      await expect(failure).rejects.toMatchObject({ message, revision });
      expect(await storedRecords()).toStrictEqual(before);

      await discardSavedSession(revision);
      expect(await loadSavedSession()).toBeNull();
    },
  );

  it("notices a stored file of another size", async () => {
    await seed();
    await storeActivePdf(new File([pdfBytes(2), "x"], "second.pdf", { lastModified: 1 }));

    await expect(loadSavedSession()).rejects.toThrow(mismatchMessage);
  });

  it.each(["sessions", "pdfs"] as const)(
    "reports an active pair torn in %s as incomplete and leaves it alone",
    async (store) => {
      const { revision } = await seed();
      await tearActivePair(store);
      const before = await storedRecords();

      await expect(loadSavedSession()).rejects.toMatchObject({
        message: "The saved session is incomplete.",
        revision,
      });

      expect(await storedRecords()).toStrictEqual(before);
    },
  );

  it.each(["sessions", "pdfs"] as const)(
    "refuses to save over an active pair torn in %s",
    async (store) => {
      const { revision, original } = await seed();
      await tearActivePair(store);
      const before = await storedRecords();

      await expect(saveSessionMetadata(relabeled(original, "edited"), revision)).rejects.toThrow(
        "Cannot save session metadata without its PDF.",
      );

      expect(await storedRecords()).toStrictEqual(before);
    },
  );
});

describe("what a change of session clears", () => {
  it.each<[string, (seeded: Seeded) => Promise<unknown>]>([
    ["discarding the session", (s) => discardSavedSession(s.revision)],
    ["closing the session", (s) => closeActiveSession(s.revision, s.original)],
    ["discarding the active project", (s) => discardSavedProject("second", s.revision)],
  ])("%s deletes any legacy pair left behind", async (_label, run) => {
    const seeded = await seed();
    await leaveLegacyPair(pdfBlob(3));

    await run(seeded);

    const records = await storedRecords();
    expect(storedRecord(records.sessions, "active")).toBeUndefined();
    expect(storedRecord(records.pdfs, "active")).toBeUndefined();
  });

  it("discarding the session takes its project and no other", async () => {
    const { revision } = await seed();

    await discardSavedSession(revision);

    const { sessions, pdfs } = await storedRecords();
    expect(storedRecord(sessions, "project:second")).toBeUndefined();
    expect(storedRecord(pdfs, "project:second")).toBeUndefined();
    expect((await listSavedProjects()).map(({ id }) => id)).toStrictEqual(["first"]);
  });
});

describe("two writers holding the same revision", () => {
  const thisTab = {
    activateSavedProject,
    closeActiveSession,
    discardSavedProject,
    discardSavedSession,
    replaceSavedSession,
    saveSessionMetadata,
  };

  /** A separate module instance has its own connection, like another tab of the app. */
  async function openOtherTab() {
    vi.resetModules();
    const tab = await import("./persistence");
    await tab.listSavedProjects();
    return tab;
  }

  interface Writer {
    run(tab: typeof thisTab, seeded: Seeded): Promise<unknown>;
    /** The active session once this writer has won; `null` when it leaves none. */
    leaves(seeded: Seeded): CurrentSession | null;
  }

  const replacing = (name: string): Writer => ({
    run: (tab, { revision }) => tab.replaceSavedSession(sessionNamed(name), pdfBlob(7), revision),
    leaves: () => sessionNamed(name),
  });
  const saving = (label: string): Writer => ({
    run: (tab, { revision, original }) =>
      tab.saveSessionMetadata(relabeled(original, label), revision),
    leaves: ({ original }) => relabeled(original, label),
  });
  const activating: Writer = {
    run: (tab, { revision, original }) => tab.activateSavedProject("first", revision, original),
    leaves: () => sessionNamed("first.pdf"),
  };
  const closing: Writer = {
    run: (tab, { revision, original }) => tab.closeActiveSession(revision, original),
    leaves: () => null,
  };
  const discardingSession: Writer = {
    run: (tab, { revision }) => tab.discardSavedSession(revision),
    leaves: () => null,
  };
  const discardingProject: Writer = {
    run: (tab, { revision }) => tab.discardSavedProject("second", revision),
    leaves: () => null,
  };

  it.each<[string, Writer, Writer]>([
    ["replace and replace", replacing("left.pdf"), replacing("right.pdf")],
    ["replace and activate", replacing("left.pdf"), activating],
    ["activate and replace", activating, replacing("right.pdf")],
    ["replace and close", replacing("left.pdf"), closing],
    ["replace and discard", replacing("left.pdf"), discardingSession],
    ["save and save", saving("left"), saving("right")],
    ["save and replace", saving("left"), replacing("right.pdf")],
    ["save and activate", saving("left"), activating],
    ["save and discard the project", saving("left"), discardingProject],
    ["activate and discard", activating, discardingSession],
    ["activate and close", activating, closing],
    ["close and discard", closing, discardingSession],
  ])("%s: one wins whole and the other conflicts", async (_label, left, right) => {
    const seeded = await seed();
    const otherTab = await openOtherTab();

    const results = await Promise.allSettled([
      left.run(thisTab, seeded),
      right.run(otherTab, seeded),
    ]);

    expect(results.map(({ status }) => status).sort()).toStrictEqual(["fulfilled", "rejected"]);
    const [leftResult, rightResult] = results;
    const loser = leftResult.status === "rejected" ? leftResult : rightResult;
    expect(loser).toMatchObject({
      reason: {
        name: "PersistenceConflictError",
        message: "The saved session changed in another tab.",
      },
    });

    const expected = (leftResult.status === "fulfilled" ? left : right).leaves(seeded);
    const { sessions, pdfs } = await storedRecords();
    const state = storedRecord(sessions, "persistence-v2") as unknown as {
      activeRevision: string | null;
      activeProjectId: string | null;
    };
    const active = storedRecord(sessions, "active-v2");
    const activePdf = storedRecord(pdfs, "active-v2");
    if (expected === null) {
      expect(state).toMatchObject({ activeRevision: null, activeProjectId: null });
      expect(active).toBeUndefined();
      expect(activePdf).toBeUndefined();
      return;
    }
    expect(deserializeSession(active?.serialized as string)).toStrictEqual(expected);
    expect(active?.revision).toBe(state.activeRevision);
    expect(activePdf?.revision).toBe(state.activeRevision);
    const projectKey = `project:${state.activeProjectId}`;
    expect(storedRecord(sessions, projectKey)?.serialized).toBe(active?.serialized);
    expect(storedRecord(pdfs, projectKey)?.bytes).toStrictEqual(activePdf?.bytes);
  });
});

describe("unexpected stored state", () => {
  const upgradeDatabase = async () => {
    const database = await openDB("plan-measure", 2, {
      upgrade(upgrading) {
        upgrading.createObjectStore("added-by-a-newer-build");
      },
    });
    database.close();
  };

  it("refuses to read or write a database a newer build has upgraded", async () => {
    const { revision, original } = await seed();
    const before = await storedRecords();
    await upgradeDatabase();

    await expect(loadSavedSession()).rejects.toMatchObject({ name: "VersionError" });
    await expect(
      saveSessionMetadata(relabeled(original, "edited"), revision),
    ).rejects.toMatchObject({ name: "VersionError" });

    expect(await storedRecords()).toStrictEqual(before);
  });

  it("rebuilds an active project whose record is missing from the active pair", async () => {
    const { revision, original } = await seed();
    await editStore("sessions", (sessions) => sessions.delete("project:second"));
    await editStore("pdfs", (pdfs) => pdfs.delete("project:second"));

    const loaded = await loadSavedSession();

    expect(loaded?.projectId).toBe("second");
    expect(loaded?.revision).toBe(revision);
    expect(loaded?.session).toStrictEqual(original);
    const project = await loadSavedProject("second");
    expect(project.session).toStrictEqual(original);
    expect(await bytesOf(project.pdfBlob)).toStrictEqual(pdfBytes(2));
    expect((await listSavedProjects()).map(({ id }) => id)).toStrictEqual(["second", "first"]);
  });

  it("does not rebuild a project from a PDF that does not match its session", async () => {
    await seed();
    await editStore("sessions", (sessions) => sessions.delete("project:second"));
    await editStore("pdfs", (pdfs) => pdfs.delete("project:second"));
    await storeActivePdf(new File([pdfBytes(9)], "other.pdf", { lastModified: 1 }));

    expect((await listSavedProjects()).map(({ id }) => id)).toStrictEqual(["first"]);

    const { sessions, pdfs } = await storedRecords();
    expect(storedRecord(sessions, "project:second")).toBeUndefined();
    expect(storedRecord(pdfs, "project:second")).toBeUndefined();
  });

  it("rolls that repair back when the writer turns out to be stale", async () => {
    const { staleRevision } = await seed();
    await storeState("behind");
    const before = await storedRecords();

    await expect(discardSavedSession(staleRevision)).rejects.toBeInstanceOf(
      PersistenceConflictError,
    );

    expect(await storedRecords()).toStrictEqual(before);
  });

  it("hides a project without a PDF and refuses to open it", async () => {
    const { revision, original } = await seed();
    await editStore("pdfs", (pdfs) => pdfs.delete("project:first"));
    const before = await storedRecords();

    expect((await listSavedProjects()).map(({ id }) => id)).toStrictEqual(["second"]);
    await expect(loadSavedProject("first")).rejects.toThrow(
      "The selected project is no longer available.",
    );
    await expect(activateSavedProject("first", revision, original)).rejects.toThrow(
      "The selected project is no longer available.",
    );

    expect(await storedRecords()).toStrictEqual(before);
  });

  it.each(["active session", "active PDF"])(
    "reports an incomplete session when the %s is missing, ready to discard",
    async (missing) => {
      const { revision } = await seed();
      await editStore(missing === "active PDF" ? "pdfs" : "sessions", (store) =>
        store.delete("active-v2"),
      );
      await editStore("sessions", (sessions) =>
        sessions.put({
          key: "persistence-v2",
          activeRevision: revision,
          activeProjectId: "second",
        }),
      );

      await expect(loadSavedSession()).rejects.toMatchObject({
        message: "The saved session is incomplete.",
        revision,
      });

      await discardSavedSession(revision);
      expect(await loadSavedSession()).toBeNull();
    },
  );
});
