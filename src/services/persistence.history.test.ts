import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../app/sessionState";
import { performanceSession } from "../performance/fixtures";
import type { CurrentSession } from "../types/domain";
import {
  activateSavedProject,
  closeActiveSession,
  discardSavedProject,
  discardSavedSession,
  listSavedProjects,
  openSessionsTransaction,
  replaceSavedSession,
  resetPersistenceForTests,
  saveSessionMetadata,
} from "./persistence";
import { loadUndoHistory, writeUndoHistory, type UndoHistory } from "./undoHistoryStorage";

beforeEach(resetPersistenceForTests);
afterEach(async () => {
  vi.restoreAllMocks();
  await resetPersistenceForTests();
});

const pdf = new Blob(["pdf"]);

function baseSession(name = "plan.pdf"): CurrentSession {
  return createEmptySession({ name, size: 3, lastModified: 1 }, 2);
}

/** Two entries that share the untouched page 2 object, as consecutive edits do. */
function historyOf(base: CurrentSession): UndoHistory {
  const edited = (name: string): CurrentSession => ({
    ...base,
    pages: {
      ...base.pages,
      1: {
        ...base.pages[1]!,
        measurements: [
          {
            id: name,
            name,
            type: "line",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            calibrationId: null,
            classificationValueIds: [],
            visible: true,
          },
        ],
      },
    },
  });
  return { undo: [base, edited("one")], redo: [edited("two")] };
}

async function openProject(projectId = "project-a") {
  const session = baseSession();
  const revision = await replaceSavedSession(session, pdf, null, projectId);
  return { session, revision, projectId };
}

async function readRecord(key: string): Promise<unknown> {
  const transaction = await openSessionsTransaction("readonly");
  return transaction.objectStore("sessions").get(key);
}

async function storedHistoryKeys(): Promise<string[]> {
  const keys: string[] = [];
  for (const key of ["undo-history-v1", "undo-history-revision-v1"]) {
    if (await readRecord(key)) keys.push(key);
  }
  return keys;
}

describe("persisted undo history", () => {
  it("round-trips the stacks and keeps the references the entries share", async () => {
    const { session, revision, projectId } = await openProject();
    const history = historyOf(session);

    await expect(writeUndoHistory(projectId, revision, history)).resolves.toBe(true);
    const loaded = await loadUndoHistory(projectId, revision, session);

    expect(loaded).toEqual(history);
    expect(loaded!.undo[0]!.pages[2]).toBe(loaded!.undo[1]!.pages[2]);
    expect(loaded!.undo[1]!.pages[2]).toBe(loaded!.redo[0]!.pages[2]);
  });

  it("rewrites only the revision label when no stacks are given", async () => {
    const { session, revision, projectId } = await openProject();
    const history = historyOf(session);
    await writeUndoHistory(projectId, revision, history);

    const nextRevision = await saveSessionMetadata({ ...session, currentPage: 2 }, revision, pdf);
    expect(nextRevision).not.toBe(revision);
    await expect(loadUndoHistory(projectId, revision, session)).resolves.not.toBeNull();
    await expect(writeUndoHistory(projectId, nextRevision, null)).resolves.toBe(true);

    await expect(loadUndoHistory(projectId, revision, session)).resolves.toBeNull();
    await expect(loadUndoHistory(projectId, nextRevision, session)).resolves.toEqual(history);
  });

  it("returns null when the revision, project or format differ", async () => {
    const { session, revision, projectId } = await openProject();
    await writeUndoHistory(projectId, revision, historyOf(session));

    await expect(loadUndoHistory(projectId, "another-revision", session)).resolves.toBeNull();
    await expect(loadUndoHistory("project-b", revision, session)).resolves.toBeNull();

    const record = (await readRecord("undo-history-v1")) as object;
    const transaction = await openSessionsTransaction("readwrite");
    const store = transaction.objectStore("sessions") as unknown as {
      put(record: unknown): Promise<unknown>;
    };
    await store.put({ ...record, format: 2 });
    await transaction.done;
    await expect(loadUndoHistory(projectId, revision, session)).resolves.toBeNull();
  });

  it("returns null when an entry does not belong to the loaded plan", async () => {
    const { session, revision, projectId } = await openProject();
    const history = historyOf(session);
    const legacyEntry = { ...session, schemaVersion: 15 } as unknown as CurrentSession;
    const otherPageCount = { ...session, pageCount: 3 };
    const otherPdf = { ...session, pdf: { ...session.pdf, size: 4 } };
    const otherName = { ...session, pdf: { ...session.pdf, name: "other.pdf" } };

    for (const entry of [legacyEntry, otherPageCount, otherPdf, otherName]) {
      await writeUndoHistory(projectId, revision, { undo: [entry], redo: history.redo });
      await expect(loadUndoHistory(projectId, revision, session)).resolves.toBeNull();
      await writeUndoHistory(projectId, revision, { undo: history.undo, redo: [entry] });
      await expect(loadUndoHistory(projectId, revision, session)).resolves.toBeNull();
    }
  });

  it("writes nothing and does not throw when the active revision or project changed", async () => {
    const { session, revision, projectId } = await openProject();
    const history = historyOf(session);

    await expect(writeUndoHistory(projectId, "stale-revision", history)).resolves.toBe(false);
    await expect(writeUndoHistory("project-b", revision, history)).resolves.toBe(false);
    await expect(writeUndoHistory(projectId, "stale-revision", null)).resolves.toBe(false);

    expect(await storedHistoryKeys()).toEqual([]);
  });

  it("keeps the previous history when a rejected write comes after it", async () => {
    const { session, revision, projectId } = await openProject();
    const history = historyOf(session);
    await writeUndoHistory(projectId, revision, history);

    await expect(writeUndoHistory(projectId, "stale-revision", null)).resolves.toBe(false);

    await expect(loadUndoHistory(projectId, revision, session)).resolves.toEqual(history);
  });

  it("is not listed or counted as a project", async () => {
    const { session, revision, projectId } = await openProject();
    await writeUndoHistory(projectId, revision, historyOf(session));

    const projects = await listSavedProjects();

    expect(projects.map((project) => project.id)).toEqual([projectId]);
  });

  describe("is removed together with the session it belonged to", () => {
    async function openWithHistory() {
      const opened = await openProject();
      await writeUndoHistory(opened.projectId, opened.revision, historyOf(opened.session));
      expect(await storedHistoryKeys()).toHaveLength(2);
      return opened;
    }

    it("when a saved project becomes the active one", async () => {
      const first = await openWithHistory();
      const second = await replaceSavedSession(baseSession("b.pdf"), pdf, first.revision, "b");
      await writeUndoHistory("b", second, historyOf(baseSession("b.pdf")));
      expect(await storedHistoryKeys()).toHaveLength(2);

      await activateSavedProject(first.projectId, second);

      expect(await storedHistoryKeys()).toEqual([]);
    });

    it("when a new session replaces the active one", async () => {
      const { revision } = await openWithHistory();

      await replaceSavedSession(baseSession("b.pdf"), pdf, revision, "project-b");

      expect(await storedHistoryKeys()).toEqual([]);
    });

    it("when the saved session is discarded", async () => {
      const { revision } = await openWithHistory();

      await discardSavedSession(revision);

      expect(await storedHistoryKeys()).toEqual([]);
    });

    it("when the active project is closed", async () => {
      const { revision } = await openWithHistory();

      await closeActiveSession(revision);

      expect(await storedHistoryKeys()).toEqual([]);
    });

    it("when the active project is discarded, but not when another one is", async () => {
      const first = await openWithHistory();
      const second = await replaceSavedSession(baseSession("b.pdf"), pdf, first.revision, "b");
      const secondRevision = await activateSavedProject(first.projectId, second).then(
        (activated) => activated.revision,
      );
      await writeUndoHistory(first.projectId, secondRevision, historyOf(first.session));

      await expect(discardSavedProject("b", secondRevision)).resolves.toBe(false);
      expect(await storedHistoryKeys()).toHaveLength(2);

      await expect(discardSavedProject(first.projectId, secondRevision)).resolves.toBe(true);
      expect(await storedHistoryKeys()).toEqual([]);
    });
  });

  it("stores a heavy session's stacks without serializing them to text", async () => {
    const heavy = performanceSession(2000);
    const revision = await replaceSavedSession(heavy, pdf, null, "heavy");
    const history: UndoHistory = { undo: [heavy], redo: [] };
    const stringify = vi.spyOn(JSON, "stringify");
    await expect(writeUndoHistory("heavy", revision, history)).resolves.toBe(true);

    expect(stringify).not.toHaveBeenCalled();
    await expect(loadUndoHistory("heavy", revision, heavy)).resolves.toEqual(history);
  });
});
