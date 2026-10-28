import "fake-indexeddb/auto";
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
  replaceSavedSession,
  resetPersistenceForTests,
  saveSessionMetadata,
} from "./persistence";

beforeEach(resetPersistenceForTests);
afterEach(async () => {
  vi.restoreAllMocks();
  await resetPersistenceForTests();
});

const pdfBytes = () => new Blob(["%PDF-1.7 test"], { type: "application/pdf" });
const sessionNamed = (name: string): CurrentSession =>
  createEmptySession({ name, size: pdfBytes().size, lastModified: 1 }, 1);

type StoreMethod = "get" | "getAll" | "put" | "delete";

/**
 * Aborts the transaction just after its next call to `method`, which is what a browser does when
 * a write fails (quota, disk error): the pending requests fail and the whole transaction rolls back.
 */
function abortTransactionOn(method: StoreMethod) {
  const original = IDBObjectStore.prototype[method] as (...args: unknown[]) => IDBRequest;
  let armed = true;
  vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (
    this: IDBObjectStore,
    ...args: unknown[]
  ) {
    const request = original.apply(this, args);
    if (armed) {
      armed = false;
      const { transaction } = this;
      // A browser reports the failure asynchronously, after the code has queued its other requests.
      queueMicrotask(() => transaction.abort());
    }
    return request;
  } as never);
}

interface RejectionSource {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
}
// @ts-expect-error Vitest runs this test in Node; the app's TypeScript intentionally omits Node types.
const nodeProcess = process as RejectionSource;

async function collectUnhandledRejections(run: () => Promise<unknown>) {
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => unhandled.push(reason);
  nodeProcess.on("unhandledRejection", listener);
  try {
    const outcome = await run().then(
      () => "resolved",
      () => "rejected",
    );
    // Unhandled rejections are reported after the microtask queue drains.
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { outcome, unhandled };
  } finally {
    nodeProcess.off("unhandledRejection", listener);
  }
}

interface Seeded {
  revision: string;
  original: CurrentSession;
}

/** Project "first" is saved, then project "second" becomes the active one. */
async function seed(): Promise<Seeded & { firstRevision: string }> {
  const first = sessionNamed("first.pdf");
  const firstRevision = await replaceSavedSession(first, pdfBytes(), null, "first");
  const second = sessionNamed("second.pdf");
  const revision = await replaceSavedSession(second, pdfBytes(), firstRevision, "second", first);
  return { revision, firstRevision, original: second };
}

async function expectStorageUntouched({ revision, original }: Seeded) {
  const loaded = await loadSavedSession();
  expect(loaded?.revision).toBe(revision);
  expect(loaded?.session).toEqual(original);
  expect(await loaded?.pdfBlob.text()).toBe("%PDF-1.7 test");
  const projects = await listSavedProjects();
  expect(projects.map(({ id }) => id).sort()).toEqual(["first", "second"]);
  expect(projects.find(({ isCurrent }) => isCurrent)?.id).toBe("second");
}

describe("a transaction that fails halfway", () => {
  const cases: [
    string,
    StoreMethod,
    (seeded: Seeded & { firstRevision: string }) => Promise<unknown>,
  ][] = [
    ["loading the saved session", "get", () => loadSavedSession()],
    ["listing the saved projects", "getAll", () => listSavedProjects()],
    ["loading a saved project", "get", () => loadSavedProject("first")],
    ["discarding the saved session", "delete", ({ revision }) => discardSavedSession(revision)],
    [
      "discarding the saved session, before it writes",
      "get",
      ({ revision }) => discardSavedSession(revision),
    ],
    [
      "discarding a saved project",
      "delete",
      ({ revision }) => discardSavedProject("first", revision),
    ],
    ["closing the active project", "delete", ({ revision }) => closeActiveSession(revision)],
    [
      "replacing the saved session",
      "put",
      ({ revision }) =>
        replaceSavedSession(sessionNamed("third.pdf"), pdfBytes(), revision, "third"),
    ],
    [
      "saving the session metadata",
      "put",
      ({ revision, original }) =>
        saveSessionMetadata(
          { ...original, currentPage: original.currentPage, pageLabelOverrides: { 1: "A-1" } },
          revision,
        ),
    ],
    [
      "reading the PDF before switching to another saved project",
      "get",
      ({ revision, original }) => activateSavedProject("first", revision, original),
    ],
    [
      "reading the PDF before saving the session metadata",
      "get",
      ({ revision, original }) =>
        saveSessionMetadata({ ...original, pageLabelOverrides: { 1: "A-1" } }, revision),
    ],
    [
      "switching to another saved project",
      "put",
      ({ revision, original }) => activateSavedProject("first", revision, original),
    ],
  ];

  it.each(cases)(
    "%s leaves the stored project intact and no unhandled rejection",
    async (_label, method, operation) => {
      const seeded = await seed();
      abortTransactionOn(method);
      const { outcome, unhandled } = await collectUnhandledRejections(() => operation(seeded));
      vi.restoreAllMocks();
      // Whether the operation reports the failure or finishes before it, nothing may be left half done.
      expect(["rejected", "resolved"]).toContain(outcome);
      expect(unhandled).toEqual([]);
      if (outcome === "rejected") await expectStorageUntouched(seeded);
    },
  );
});
