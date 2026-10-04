/* @vitest-environment jsdom */

import "fake-indexeddb/auto";
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfSessionLifecycle } from "./usePdfSessionLifecycle";
import { isSessionPersistable } from "./autosave";
import { PdfLoadLifecycle } from "./pdfLoadLifecycle";
import type { ReplacePdfPayload } from "./overlayState";
import * as persistenceService from "../services/persistence";
import {
  activateSavedProject,
  listSavedProjects,
  loadSavedProject,
  loadSavedSession,
  replaceSavedSession,
  resetPersistenceForTests,
} from "../services/persistence";
import type { CurrentSession } from "../types/domain";
import type { LoadedPdf } from "../services/pdf";
import { createEmptySession, SessionProvider, useSessionState } from "./sessionState";
import { AppProvider } from "./state";
import { createProjectFile, readProjectFile } from "../services/projectFile";
import type { WorkspaceModule } from "./workspaceState";

vi.mock("../services/pdf", () => ({
  loadPdf: async () => ({
    document: { numPages: 1 },
    loadingTask: { destroy: async () => undefined },
    pageLabels: null,
  }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let lifecycle: ReturnType<typeof usePdfSessionLifecycle> | null = null;
let setHarnessSession: ((session: CurrentSession) => void) | null = null;
let harnessSession: CurrentSession | null = null;
let historyCommands: ReturnType<typeof useSessionState> | null = null;
let resetWorkspaceCalls: Array<WorkspaceModule | undefined> = [];
let replacementPromptCount = 0;
let replacementPromptPayload: ReplacePdfPayload | null = null;
let lifecycleErrors: string[] = [];
let lifecycleErrorClearCount = 0;
let latestLifecycleError: string | null = null;
let closeAllOverlaysCount = 0;
let lifecycleRuntimeEvents: Array<
  { type: "viewer-cleanup" | "destroy"; pdf: LoadedPdf }
> = [];
const originalStructuredClone = globalThis.structuredClone;

beforeEach(async () => {
  // jsdom's structuredClone drops Blob data; IndexedDB preserves it in browsers.
  vi.stubGlobal("structuredClone", (value: unknown) => {
    if (value && typeof value === "object" && "blob" in value && value.blob instanceof Blob) {
      return {
        ...originalStructuredClone({ ...value, blob: null }),
        blob: new Blob([value.blob], { type: value.blob.type }),
      };
    }
    return originalStructuredClone(value);
  });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  await resetPersistenceForTests();
});

afterEach(async () => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  lifecycle = null;
  setHarnessSession = null;
  harnessSession = null;
  historyCommands = null;
  resetWorkspaceCalls = [];
  replacementPromptCount = 0;
  replacementPromptPayload = null;
  lifecycleErrors = [];
  lifecycleErrorClearCount = 0;
  latestLifecycleError = null;
  closeAllOverlaysCount = 0;
  lifecycleRuntimeEvents = [];
  vi.restoreAllMocks();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  await resetPersistenceForTests();
  vi.unstubAllGlobals();
});

function LifecycleHarness({
  publish,
  recoveredStartupWorkspace,
  history,
}: {
  publish: (
    currentLifecycle: ReturnType<typeof usePdfSessionLifecycle>,
    updateSession: (session: CurrentSession) => void,
  ) => void;
  recoveredStartupWorkspace: WorkspaceModule;
  history?: ReturnType<typeof useSessionState>;
}) {
  const [localSession, setLocalSession] = useState<CurrentSession | null>(null);
  const session = history ? history.session : localSession;
  const setSession = history ? history.loadSession : setLocalSession;
  const currentLifecycle = usePdfSessionLifecycle({
    session,
    loadSession: (nextSession) => setSession(nextSession),
    clearSession: () => (history ? history.clearSession() : setLocalSession(null)),
    resetWorkspace: (module) => resetWorkspaceCalls.push(module),
    recoveredStartupWorkspace,
    cancelWorkspaceCalibration: () => undefined,
    cancelReferenceEdit: () => undefined,
    requestReplacePdf: (payload) => {
      replacementPromptCount += 1;
      replacementPromptPayload = payload;
    },
    closeDialog: () => undefined,
    closeConfirmation: () => undefined,
    closeAllOverlays: () => {
      closeAllOverlaysCount += 1;
    },
    setError: (message) => {
      latestLifecycleError = message;
      if (message) lifecycleErrors.push(message);
      else lifecycleErrorClearCount += 1;
    },
  });
  useEffect(() => {
    harnessSession = session;
    publish(currentLifecycle, (nextSession) => setSession(nextSession));
  }, [currentLifecycle, publish, session, setSession]);
  return createElement(PdfEffectProbe, { pdf: currentLifecycle.activePdf });
}

function HistoryLifecycleHarness(props: Parameters<typeof LifecycleHarness>[0]) {
  const history = useSessionState();
  useEffect(() => {
    historyCommands = history;
  }, [history]);
  return createElement(LifecycleHarness, { ...props, history });
}

function PdfEffectProbe({ pdf }: { pdf: LoadedPdf | null }) {
  useEffect(() => {
    if (!pdf) return;
    return () => {
      lifecycleRuntimeEvents.push({ type: "viewer-cleanup", pdf });
    };
  }, [pdf]);
  return null;
}

async function renderLifecycleHarness(
  recoveredStartupWorkspace: WorkspaceModule = "scales",
  withHistory = false,
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const publish = (
    currentLifecycle: ReturnType<typeof usePdfSessionLifecycle>,
    updateSession: (session: CurrentSession) => void,
  ) => {
    lifecycle = currentLifecycle;
    setHarnessSession = updateSession;
  };
  await act(async () => {
    const props = { publish, recoveredStartupWorkspace };
    root!.render(
      withHistory
        ? createElement(
            AppProvider,
            null,
            createElement(SessionProvider, null, createElement(HistoryLifecycleHarness, props)),
          )
        : createElement(LifecycleHarness, props),
    );
  });
  for (let attempt = 0; attempt < 20 && !lifecycle?.recoveryChecked; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }
  expect(lifecycle?.recoveryChecked).toBe(true);
}

async function seedRecoverySession(): Promise<CurrentSession> {
  const base = createEmptySession({ name: "recovered.pdf", size: 3, lastModified: 1 }, 1);
  const calibration = {
    id: "scale-1",
    name: "Scale 1",
    mode: "uniform" as const,
    start: { x: 10, y: 10 },
    end: { x: 110, y: 10 },
    referenceDistanceMm: 1000,
  };
  const session: CurrentSession = {
    ...base,
    pages: {
      ...base.pages,
      1: {
        ...base.pages[1]!,
        calibrations: [calibration],
        activeCalibrationId: calibration.id,
      },
    },
  };
  await replaceSavedSession(session, new Blob(["pdf"], { type: "application/pdf" }), null);
  return session;
}

describe("workspace initialization", () => {
  it("discards any saved project and closes the workspace only when discarding the current project", async () => {
    const activeProject = createEmptySession({ name: "Active.pdf", size: 3, lastModified: 1 }, 1);
    const archivedProject = createEmptySession(
      { name: "Archived.pdf", size: 4, lastModified: 2 },
      1,
    );
    let revision = await replaceSavedSession(
      activeProject,
      new Blob(["active-pdf"]),
      null,
      "active-project",
    );
    revision = await replaceSavedSession(
      archivedProject,
      new Blob(["archived-pdf"]),
      revision,
      "archived-project",
      activeProject,
    );
    await activateSavedProject("active-project", revision);
    await renderLifecycleHarness();

    await act(async () => {
      await lifecycle!.continueRecovery();
    });
    await act(async () => {
      await lifecycle!.discardProject("active-project");
    });
    expect(harnessSession).toBeNull();
    expect(await loadSavedSession()).toBeNull();
    expect((await listSavedProjects()).map((project) => project.id)).toEqual(["archived-project"]);

    await act(async () => {
      await lifecycle!.openProject("archived-project");
    });
    expect(harnessSession?.pdf.name).toBe("Archived.pdf");
    expect((await loadSavedSession())?.projectId).toBe("archived-project");

    await act(async () => {
      await lifecycle!.discardProject("archived-project");
    });
    expect(harnessSession).toBeNull();
    expect(await loadSavedSession()).toBeNull();
    expect(await listSavedProjects()).toEqual([]);
  });

  it("switches between local projects and saves the outgoing session before switching", async () => {
    const projectA = createEmptySession({ name: "A-101.pdf", size: 3, lastModified: 1 }, 1);
    const projectB = createEmptySession({ name: "B-202.pdf", size: 4, lastModified: 2 }, 1);
    let revision = await replaceSavedSession(
      projectA,
      new Blob(["pdf-a"], { type: "application/pdf" }),
      null,
      "project-a",
    );
    revision = await replaceSavedSession(
      projectB,
      new Blob(["pdf-b"], { type: "application/pdf" }),
      revision,
      "project-b",
      projectA,
    );
    await activateSavedProject("project-a", revision);
    await renderLifecycleHarness();

    await act(async () => {
      await lifecycle!.continueRecovery();
    });
    expect(harnessSession?.pdf.name).toBe("A-101.pdf");

    const clearCountBeforeSwitch = lifecycleErrorClearCount;
    await act(async () => {
      await lifecycle!.openProject("project-b");
    });
    expect(harnessSession?.pdf.name).toBe("B-202.pdf");
    expect(lifecycleErrorClearCount).toBeGreaterThan(clearCountBeforeSwitch);
    expect((await loadSavedSession())?.projectId).toBe("project-b");

    const editedProjectB = {
      ...harnessSession!,
      settings: { ...harnessSession!.settings, showLabels: false },
    };
    act(() => setHarnessSession!(editedProjectB));
    await act(async () => {
      await lifecycle!.openProject("project-a");
    });
    expect(harnessSession?.pdf.name).toBe("A-101.pdf");
    expect((await loadSavedProject("project-b")).session.settings.showLabels).toBe(false);
    expect((await listSavedProjects()).find((project) => project.id === "project-a")?.isCurrent).toBe(
      true,
    );
  });

  it("releases the previous PDF runtime after the viewer effects clean up", async () => {
    const projectA = createEmptySession({ name: "A.pdf", size: 3, lastModified: 1 }, 1);
    const projectB = createEmptySession({ name: "B.pdf", size: 4, lastModified: 2 }, 1);
    let revision = await replaceSavedSession(
      projectA,
      new Blob(["pdf-a"], { type: "application/pdf" }),
      null,
      "project-a",
    );
    revision = await replaceSavedSession(
      projectB,
      new Blob(["pdf-b"], { type: "application/pdf" }),
      revision,
      "project-b",
      projectA,
    );
    await activateSavedProject("project-a", revision);
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.continueRecovery();
    });

    const previousPdf = lifecycle!.activePdf;
    if (!previousPdf) throw new Error("Expected project A to be active.");
    const destroyPdf = PdfLoadLifecycle.prototype.destroy;
    vi.spyOn(PdfLoadLifecycle.prototype, "destroy").mockImplementation(async function (
      this: PdfLoadLifecycle,
      pdf,
    ) {
      if (pdf) lifecycleRuntimeEvents.push({ type: "destroy", pdf });
      return destroyPdf.call(this, pdf);
    });

    await act(async () => {
      await lifecycle!.openProject("project-b");
    });
    await act(async () => Promise.resolve());

    const viewerCleanupIndex = lifecycleRuntimeEvents.findIndex(
      (event) => event.type === "viewer-cleanup" && event.pdf === previousPdf,
    );
    const destroyIndex = lifecycleRuntimeEvents.findIndex(
      (event) => event.type === "destroy" && event.pdf === previousPdf,
    );
    expect(viewerCleanupIndex).toBeGreaterThanOrEqual(0);
    expect(destroyIndex).toBeGreaterThan(viewerCleanupIndex);
  });

  it("serializes overlapping project switches and leaves the latest requested project active", async () => {
    const projectA = createEmptySession({ name: "A.pdf", size: 1, lastModified: 1 }, 1);
    const projectB = createEmptySession({ name: "B.pdf", size: 1, lastModified: 2 }, 1);
    const projectC = createEmptySession({ name: "C.pdf", size: 1, lastModified: 3 }, 1);
    let revision = await replaceSavedSession(projectA, new Blob(["A"]), null, "project-a");
    revision = await replaceSavedSession(
      projectB,
      new Blob(["B"]),
      revision,
      "project-b",
      projectA,
    );
    revision = await replaceSavedSession(
      projectC,
      new Blob(["C"]),
      revision,
      "project-c",
      projectB,
    );
    await activateSavedProject("project-a", revision);
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.continueRecovery();
    });

    let releaseActivation!: () => void;
    let reportCommitted!: () => void;
    const activationCommitted = new Promise<void>((resolve) => {
      reportCommitted = resolve;
    });
    const activationGate = new Promise<void>((resolve) => {
      releaseActivation = resolve;
    });
    const activate = persistenceService.activateSavedProject;
    vi.spyOn(persistenceService, "activateSavedProject").mockImplementation(
      async (...args) => {
        const result = await activate(...args);
        if (args[0] === "project-b") {
          reportCommitted();
          await activationGate;
        }
        return result;
      },
    );

    await act(async () => {
      const openingB = lifecycle!.openProject("project-b");
      await activationCommitted;
      const openingC = lifecycle!.openProject("project-c");
      releaseActivation();
      await Promise.all([openingB, openingC]);
    });

    expect(harnessSession?.pdf.name).toBe("C.pdf");
    expect((await loadSavedSession())?.projectId).toBe("project-c");
    expect((await loadSavedProject("project-a")).session.pdf.name).toBe("A.pdf");
    expect((await loadSavedProject("project-b")).session.pdf.name).toBe("B.pdf");
    expect(lifecycleErrors).toEqual([]);
  });

  it("keeps the current project open if saving a new PDF fails", async () => {
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.chooseFile(
        new File(["first"], "First.pdf", { type: "application/pdf", lastModified: 1 }),
      );
    });
    const savedBefore = await loadSavedSession();
    if (!savedBefore) throw new Error("Expected the first PDF to be saved.");
    const persistenceFailure = new Error("simulated persistence failure");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(persistenceService, "replaceSavedSession").mockRejectedValue(persistenceFailure);

    await act(async () => {
      await lifecycle!.chooseFile(
        new File(["second"], "Second.pdf", { type: "application/pdf", lastModified: 2 }),
      );
    });

    expect(harnessSession?.pdf.name).toBe("First.pdf");
    expect((await loadSavedSession())?.projectId).toBe(savedBefore.projectId);
    expect((await listSavedProjects()).map((project) => project.name)).toEqual(["First.pdf"]);
    expect(lifecycleErrors).toContain("The new PDF could not be saved. The current project remains open.");
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "Could not save the new PDF session.",
      persistenceFailure,
    );
  });

  it("opens another project without overwriting an unrepaired current snapshot", async () => {
    const projectA = createEmptySession({ name: "A.pdf", size: 1, lastModified: 1 }, 1);
    const projectB = createEmptySession({ name: "B.pdf", size: 1, lastModified: 2 }, 1);
    let revision = await replaceSavedSession(projectA, new Blob(["A"]), null, "project-a");
    revision = await replaceSavedSession(
      projectB,
      new Blob(["B"]),
      revision,
      "project-b",
      projectA,
    );
    await activateSavedProject("project-a", revision);
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.continueRecovery();
    });

    const unrepairedSession = {
      ...harnessSession!,
      pdf: { ...harnessSession!.pdf, size: Number.NaN },
    };
    expect(isSessionPersistable(unrepairedSession)).toBe(false);
    act(() => setHarnessSession!(unrepairedSession));
    await act(async () => {
      await lifecycle!.openProject("project-b");
    });

    expect(harnessSession?.pdf.name).toBe("B.pdf");
    expect((await loadSavedSession())?.projectId).toBe("project-b");
    const savedA = await loadSavedProject("project-a");
    expect(savedA.session.pdf).toEqual(projectA.pdf);
    expect(lifecycleErrors).toEqual([]);
  });

  it("ignores a stale page-exit save after a project switch", async () => {
    const projectA = createEmptySession({ name: "A.pdf", size: 1, lastModified: 1 }, 1);
    const projectB = createEmptySession({ name: "B.pdf", size: 1, lastModified: 2 }, 1);
    let revision = await replaceSavedSession(projectA, new Blob(["A"]), null, "project-a");
    revision = await replaceSavedSession(
      projectB,
      new Blob(["B"]),
      revision,
      "project-b",
      projectA,
    );
    await activateSavedProject("project-a", revision);
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.continueRecovery();
    });
    const originalA = harnessSession!;
    const editedA = {
      ...originalA,
      settings: { ...originalA.settings, showLabels: false },
    };
    const addEventListener = vi.spyOn(window, "addEventListener");
    act(() => setHarnessSession!(editedA));
    const beforeUnloadHandler = addEventListener.mock.calls.find(
      ([type]) => type === "beforeunload",
    )?.[1];
    if (typeof beforeUnloadHandler !== "function") {
      throw new Error("The changed session did not register its page-exit save.");
    }

    await act(async () => {
      await lifecycle!.openProject("project-b");
    });
    act(() => beforeUnloadHandler(new Event("beforeunload")));

    expect((await loadSavedProject("project-a")).session.settings.showLabels).toBe(false);
    expect((await loadSavedProject("project-b")).session.settings.showLabels).toBe(true);
    expect(harnessSession?.pdf.name).toBe("B.pdf");
  });

  it.each(["scales", "measurements", "takeoff", "classifications"] as const)(
    "resets recovered sessions directly into %s without mutating session state",
    async (workspace) => {
      const saved = await seedRecoverySession();
      await renderLifecycleHarness(workspace);

      await act(async () => {
        await lifecycle!.continueRecovery();
      });

      expect(resetWorkspaceCalls).toEqual([workspace]);
      expect(harnessSession).toEqual(saved);
      expect(harnessSession?.currentPage).toBe(saved.currentPage);
      expect(harnessSession?.pages[1]?.activeCalibrationId).toBe(
        saved.pages[1]?.activeCalibrationId,
      );
    },
  );

  it.each(["measurements", "takeoff", "classifications"] as const)(
    "keeps a brand-new PDF on Scales when recovered startup preference is %s",
    async (workspace) => {
      await renderLifecycleHarness(workspace);

      await act(async () => {
        await lifecycle!.chooseFile(
          new File(["pdf"], "new.pdf", { type: "application/pdf", lastModified: 1 }),
        );
      });

      expect(resetWorkspaceCalls).toEqual([undefined]);
    },
  );

  it("waits for saved project summaries before a successful PDF activation resolves", async () => {
    await renderLifecycleHarness();

    const listSavedProjectsNow = persistenceService.listSavedProjects;
    let reportRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      reportRefreshStarted = resolve;
    });
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    vi.spyOn(persistenceService, "listSavedProjects").mockImplementation(async () => {
      reportRefreshStarted();
      await refreshGate;
      return listSavedProjectsNow();
    });

    let activationSettled = false;
    let activation!: Promise<void>;
    await act(async () => {
      activation = lifecycle!
        .chooseFile(
          new File(["first"], "First.pdf", { type: "application/pdf", lastModified: 1 }),
        )
        .finally(() => {
          activationSettled = true;
        });
      await refreshStarted;
    });

    expect(activationSettled).toBe(false);
    expect(lifecycle!.projectOperationPending).toBe(true);

    await act(async () => {
      releaseRefresh();
      await activation;
    });

    expect(activationSettled).toBe(true);
    expect(lifecycle!.projectOperationPending).toBe(false);
    expect(lifecycle!.savedProjects.map((project) => project.name)).toEqual(["First.pdf"]);
  });

  it("opens a selected PDF as a new project without a replacement prompt", async () => {
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.chooseFile(
        new File(["first"], "First.pdf", { type: "application/pdf", lastModified: 1 }),
      );
    });
    const firstProject = await loadSavedSession();
    if (!firstProject) throw new Error("Expected the first PDF project to be saved.");

    await act(async () => {
      await lifecycle!.chooseFile(
        new File(["second"], "Second.pdf", { type: "application/pdf", lastModified: 2 }),
      );
    });

    expect(replacementPromptCount).toBe(0);
    expect((await loadSavedSession())?.session.pdf.name).toBe("Second.pdf");
    expect((await loadSavedProject(firstProject.projectId)).session.pdf.name).toBe("First.pdf");
    expect((await listSavedProjects()).map((project) => project.name)).toEqual([
      "Second.pdf",
      "First.pdf",
    ]);
  });

  it("imports a complete project as a new saved project and keeps the previous one", async () => {
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.chooseFile(
        new File(["old"], "Old.pdf", { type: "application/pdf", lastModified: 1 }),
      );
    });
    const previous = await loadSavedSession();
    if (!previous) throw new Error("Expected a saved project before import.");
    const imported = createEmptySession({ name: "Imported.pdf", size: 3, lastModified: 7 }, 1);
    imported.settings.showLabels = false;
    const file = createProjectFile(imported, new Blob(["new"]));

    await act(async () => {
      await lifecycle!.importProject(file as File);
    });

    expect(harnessSession).toEqual(imported);
    expect((await loadSavedSession())?.session).toEqual(imported);
    expect((await loadSavedProject(previous.projectId)).session.pdf.name).toBe("Old.pdf");
    expect((await listSavedProjects()).map((project) => project.name)).toEqual([
      "Imported.pdf",
      "Old.pdf",
    ]);

    await act(async () => {
      await lifecycle!.importProject(new Blob(["bad project"]) as File);
    });
    expect((await loadSavedSession())?.session).toEqual(imported);
    expect(latestLifecycleError).toContain("invalid or unsupported");
  });

  it("keeps recoverable project data when an imported project cannot be saved", async () => {
    const previous = await seedRecoverySession();
    await renderLifecycleHarness();
    const persistenceFailure = new Error("storage unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(persistenceService, "replaceSavedSession").mockRejectedValueOnce(persistenceFailure);
    const imported = createEmptySession({ name: "Imported.pdf", size: 3, lastModified: 7 }, 1);
    await act(async () => {
      await lifecycle!.importProject(createProjectFile(imported, new Blob(["new"])) as File);
    });
    expect(harnessSession).toBeNull();
    expect((await loadSavedSession())?.session).toEqual(previous);
    expect(lifecycle!.savedProjects).toHaveLength(1);
    expect(latestLifecycleError).toContain("current project remains open");
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "Could not save the new PDF session.",
      persistenceFailure,
    );
  });

  it("exports current in-memory edits and rejects projects that need repair", async () => {
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.chooseFile(
        new File(["pdf"], "Current.pdf", { type: "application/pdf", lastModified: 1 }),
      );
    });
    const savedBeforeExport = await loadSavedSession();
    if (!savedBeforeExport || !harnessSession) throw new Error("Expected an open project.");
    const changed = {
      ...harnessSession,
      settings: { ...harnessSession.settings, showLabels: false },
    };
    act(() => setHarnessSession!(changed));

    const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const downloads: Blob[] = [];
    let downloadName = "";
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        downloads.push(blob);
        return "blob:project-test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });
    const setTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, "setTimeout").mockImplementation((handler, timeout) =>
      timeout === 60_000 ? 0 : setTimeout(handler, timeout),
    );
    try {
      await act(async () => {
        await lifecycle!.exportProject();
      });
      expect(downloads).toHaveLength(1);
      expect(downloadName).toBe("Current.planmeasure");
      expect((await readProjectFile(downloads[0]!)).session.settings.showLabels).toBe(false);
      expect((await loadSavedSession())?.session.settings.showLabels).toBe(true);

      const invalid = {
        ...changed,
        pages: {
          ...changed.pages,
          1: {
            ...changed.pages[1]!,
            measurements: [{
              id: "unrepairable",
              name: "Needs repair",
              type: "line" as const,
              calibrationId: "missing-scale",
              points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] as [{ x: number; y: number }, { x: number; y: number }],
              classificationValueIds: [],
              visible: true,
            }],
          },
        },
      };
      act(() => setHarnessSession!(invalid));
      await act(async () => {
        await lifecycle!.exportProject();
      });
      expect(downloads).toHaveLength(1);
      expect(latestLifecycleError).toContain("Repair this project's measurements");
      expect((await loadSavedSession())?.session.settings.showLabels).toBe(true);
    } finally {
      if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("keeps a newer PDF replacement prompt open when an earlier save finishes", async () => {
    await renderLifecycleHarness();
    let releaseFirstSave!: () => void;
    let reportFirstSave!: () => void;
    const firstSaveCommitted = new Promise<void>((resolve) => {
      reportFirstSave = resolve;
    });
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const replace = persistenceService.replaceSavedSession;
    vi.spyOn(persistenceService, "replaceSavedSession").mockImplementation(
      async (...args) => {
        const revision = await replace(...args);
        if (args[0].pdf.name === "First.pdf") {
          reportFirstSave();
          await firstSaveGate;
        }
        return revision;
      },
    );

    let openingFirst!: Promise<void>;
    await act(async () => {
      openingFirst = lifecycle!.chooseFile(
        new File(["first"], "First.pdf", { type: "application/pdf", lastModified: 1 }),
      );
      await firstSaveCommitted;
      await lifecycle!.chooseFile(
        new File(["second"], "Second.pdf", { type: "application/pdf", lastModified: 2 }),
      );
    });

    expect(replacementPromptPayload?.fileName).toBe("Second.pdf");
    const closeCountBeforeFirstSaveCompletes = closeAllOverlaysCount;
    await act(async () => {
      releaseFirstSave();
      await openingFirst;
    });
    expect(closeAllOverlaysCount).toBe(closeCountBeforeFirstSaveCompletes);
    expect(replacementPromptPayload?.fileName).toBe("Second.pdf");

    const replacementPayload = replacementPromptPayload;
    if (!replacementPayload) throw new Error("Expected the second PDF to await confirmation.");
    await act(async () => {
      lifecycle!.confirmPdfReplacement({ type: "replacePdf", payload: replacementPayload });
      for (let attempt = 0; attempt < 20 && harnessSession?.pdf.name !== "Second.pdf"; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    });

    expect(harnessSession?.pdf.name).toBe("Second.pdf");
    expect((await listSavedProjects()).map((project) => project.name)).toEqual([
      "Second.pdf",
      "First.pdf",
    ]);
  });

  it("preserves a newer PDF load error when an earlier save finishes", async () => {
    await renderLifecycleHarness();
    let releaseFirstSave!: () => void;
    let reportFirstSave!: () => void;
    const firstSaveCommitted = new Promise<void>((resolve) => {
      reportFirstSave = resolve;
    });
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const replace = persistenceService.replaceSavedSession;
    vi.spyOn(persistenceService, "replaceSavedSession").mockImplementation(
      async (...args) => {
        const revision = await replace(...args);
        if (args[0].pdf.name === "First.pdf") {
          reportFirstSave();
          await firstSaveGate;
        }
        return revision;
      },
    );

    let openingFirst!: Promise<void>;
    await act(async () => {
      openingFirst = lifecycle!.chooseFile(
        new File(["first"], "First.pdf", { type: "application/pdf", lastModified: 1 }),
      );
      await firstSaveCommitted;
      await lifecycle!.chooseFile(
        new File(["not a pdf"], "Notes.txt", { type: "text/plain", lastModified: 2 }),
      );
    });
    const laterLoadError = latestLifecycleError;
    expect(laterLoadError).not.toBeNull();

    await act(async () => {
      releaseFirstSave();
      await openingFirst;
    });

    expect(harnessSession?.pdf.name).toBe("First.pdf");
    expect(latestLifecycleError).toBe(laterLoadError);
  });
});

describe("autosave after undoing a repair", () => {
  it.each(["polygon", "classification"] as const)(
    "pauses on Undo and resumes on Redo of a %s repair without disabling storage",
    async (kind) => {
      await seedRecoverySession();
      const saved = (await loadSavedSession())!;
      const historical = structuredClone(saved.session);
      if (kind === "polygon") {
        historical.pages[1]!.measurements.push({
          id: "invalid-polygon",
          name: "Historical polygon",
          type: "polygon",
          calibrationId: "scale-1",
          classificationValueIds: [],
          visible: true,
          note: "",
          points: [
            { x: 0, y: 0 },
            { x: 6, y: 5 },
            { x: 0, y: 4 },
            { x: 4, y: 0 },
          ],
        });
      } else {
        historical.classificationCatalog.dimensions.push(
          { id: "first", name: "Trade", archived: false, values: [] },
          { id: "second", name: "Trade", archived: false, values: [] },
        );
      }
      expect(isSessionPersistable(historical)).toBe(false);
      vi.spyOn(persistenceService, "loadSavedSession").mockResolvedValueOnce({
        ...saved,
        session: historical,
        compatibility:
          kind === "polygon" ? "historical-repair-required" : "classification-repair-required",
        incompatibleMeasurementIds: kind === "polygon" ? ["invalid-polygon"] : [],
      });
      await renderLifecycleHarness("scales", true);
      await act(async () => {
        await lifecycle!.continueRecovery();
      });
      expect(lifecycle!.autosaveWarning).toContain("Autosave is paused");
      const save = vi.spyOn(persistenceService, "saveSessionMetadata");
      act(() => {
        if (kind === "polygon") historyCommands!.deleteMeasurement(1, "invalid-polygon");
        else historyCommands!.renameClassificationDimension("second", "System");
      });
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      });
      expect(save).toHaveBeenCalledOnce();
      expect(lifecycle!.autosaveUnavailable).toBe(false);
      expect(lifecycle!.autosaveWarning).toBeNull();
      const repairedSaved = (await loadSavedSession())!;

      await act(async () => {
        historyCommands!.undo();
      });
      expect(isSessionPersistable(harnessSession!)).toBe(false);
      expect(lifecycle!.autosaveWarning).toContain("Autosave is paused");
      await act(async () => {
        window.dispatchEvent(new Event("beforeunload"));
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      });
      expect(save).toHaveBeenCalledOnce();
      expect(await loadSavedSession()).toEqual(repairedSaved);

      act(() => historyCommands!.redo());
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      });
      expect(save).toHaveBeenCalledTimes(2);
      expect(isSessionPersistable(harnessSession!)).toBe(true);
      expect(lifecycle!.autosaveUnavailable).toBe(false);
      expect(lifecycle!.autosaveWarning).toBeNull();
      expect((await loadSavedSession())!.session).toEqual(harnessSession);
    },
  );

  it("keeps the repair warning when an older save finishes after an invalid snapshot is restored", async () => {
    await seedRecoverySession();
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.continueRecovery();
    });
    const valid = harnessSession!;
    const edited = { ...valid, settings: { ...valid.settings, displayUnit: "mm" as const } };
    const invalid = {
      ...edited,
      classificationCatalog: {
        dimensions: [
          { id: "one", name: "Trade", archived: false, values: [] },
          { id: "two", name: "Trade", archived: false, values: [] },
        ],
      },
    };
    let releaseSave!: () => void;
    let reportSaved!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const saved = new Promise<void>((resolve) => {
      reportSaved = resolve;
    });
    const originalSave = persistenceService.saveSessionMetadata;
    const save = vi
      .spyOn(persistenceService, "saveSessionMetadata")
      .mockImplementationOnce(async (...args) => {
        const revision = await originalSave(...args);
        reportSaved();
        await gate;
        return revision;
      });
    act(() => setHarnessSession!(edited));
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      await saved;
    });
    act(() => setHarnessSession!(invalid));
    await act(async () => {
      releaseSave();
      await gate;
    });
    expect(lifecycle!.autosaveUnavailable).toBe(true);
    expect(lifecycle!.autosaveWarning).toContain("Autosave is paused");
    expect(save).toHaveBeenCalledOnce();
    act(() => setHarnessSession!(edited));
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(lifecycle!.autosaveUnavailable).toBe(false);
    expect(lifecycle!.autosaveWarning).toBeNull();
    expect((await loadSavedSession())!.session).toEqual(edited);
  });

  it("does not resume autosave or overwrite another tab after a revision conflict", async () => {
    await seedRecoverySession();
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.continueRecovery();
    });
    const saved = (await loadSavedSession())!;
    const external = {
      ...saved.session,
      settings: { ...saved.session.settings, showLabels: false },
    };
    await persistenceService.saveSessionMetadata(external, saved.revision, saved.pdfBlob);
    const save = vi.spyOn(persistenceService, "saveSessionMetadata");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const edited = {
      ...saved.session,
      settings: { ...saved.session.settings, displayUnit: "mm" as const },
    };
    act(() => setHarnessSession!(edited));
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });
    expect(lifecycle!.autosaveWarning).toContain("Autosave is unavailable");
    expect(save).toHaveBeenCalledOnce();
    const invalid = { ...edited, pdf: { ...edited.pdf, size: Number.NaN } };
    act(() => setHarnessSession!(invalid));
    act(() => setHarnessSession!(edited));
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });
    expect(save).toHaveBeenCalledOnce();
    expect(lifecycle!.autosaveWarning).toContain("Autosave is unavailable");
    expect((await loadSavedSession())!.session).toEqual(external);
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("page-exit autosave", () => {
  it("registers beforeunload only while a changed snapshot still needs autosave protection", async () => {
    await renderLifecycleHarness();
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    await act(async () => {
      await lifecycle!.chooseFile(
        new File(["pdf"], "plan.pdf", { type: "application/pdf", lastModified: 1 }),
      );
    });
    expect(addEventListener.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(0);

    const activeSession = (await loadSavedSession())!.session;
    const edited = {
      ...activeSession,
      settings: { ...activeSession.settings, displayUnit: "mm" as const },
    };
    act(() => setHarnessSession!(edited));

    const beforeUnloadCalls = addEventListener.mock.calls.filter(([type]) => type === "beforeunload");
    expect(beforeUnloadCalls).toHaveLength(1);
    const beforeUnloadHandler = beforeUnloadCalls[0]![1];

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });
    expect((await loadSavedSession())?.session.settings.displayUnit).toBe("mm");
    expect(removeEventListener).toHaveBeenCalledWith("beforeunload", beforeUnloadHandler);

    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });

  it("flushes the latest completed session from beforeunload without waiting for the debounce", async () => {
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.chooseFile(
        new File(["pdf"], "plan.pdf", { type: "application/pdf", lastModified: 1 }),
      );
    });
    const activeSession = (await loadSavedSession())!.session;
    const edited = {
      ...activeSession,
      settings: { ...activeSession.settings, displayUnit: "mm" as const },
    };
    act(() => setHarnessSession!(edited));

    const clearTimeout = vi.spyOn(window, "clearTimeout");
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    const preventDefault = vi.spyOn(beforeUnload, "preventDefault");
    act(() => window.dispatchEvent(beforeUnload));
    expect(clearTimeout).toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(beforeUnload.defaultPrevented).toBe(false);
    clearTimeout.mockRestore();

    let savedDisplayUnit: string | undefined;
    for (let attempt = 0; attempt < 20 && savedDisplayUnit !== "mm"; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        savedDisplayUnit = (await loadSavedSession())?.session.settings.displayUnit;
      });
    }
    expect(savedDisplayUnit).toBe("mm");
  });

  it("flushes the latest completed session when the page becomes hidden", async () => {
    await renderLifecycleHarness();
    await act(async () => {
      await lifecycle!.chooseFile(
        new File(["pdf"], "plan.pdf", { type: "application/pdf", lastModified: 1 }),
      );
    });
    const activeSession = (await loadSavedSession())!.session;
    const edited = {
      ...activeSession,
      settings: { ...activeSession.settings, displayUnit: "cm" as const },
    };
    act(() => setHarnessSession!(edited));

    const clearTimeout = vi.spyOn(window, "clearTimeout");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(clearTimeout).toHaveBeenCalled();
    clearTimeout.mockRestore();

    let savedDisplayUnit: string | undefined;
    for (let attempt = 0; attempt < 20 && savedDisplayUnit !== "cm"; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        savedDisplayUnit = (await loadSavedSession())?.session.settings.displayUnit;
      });
    }
    expect(savedDisplayUnit).toBe("cm");
  });
});
