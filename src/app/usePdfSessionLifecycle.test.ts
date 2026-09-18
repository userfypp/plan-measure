/* @vitest-environment jsdom */

import "fake-indexeddb/auto";
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfSessionLifecycle } from "./usePdfSessionLifecycle";
import {
  loadSavedSession,
  replaceSavedSession,
  resetPersistenceForTests,
} from "../services/persistence";
import type { CurrentSession } from "../types/domain";
import { createEmptySession } from "./sessionState";
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
let resetWorkspaceCalls: Array<WorkspaceModule | undefined> = [];

beforeEach(async () => {
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
  resetWorkspaceCalls = [];
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  await resetPersistenceForTests();
});

function LifecycleHarness({
  publish,
  recoveredStartupWorkspace,
}: {
  publish: (
    currentLifecycle: ReturnType<typeof usePdfSessionLifecycle>,
    updateSession: (session: CurrentSession) => void,
  ) => void;
  recoveredStartupWorkspace: WorkspaceModule;
}) {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const currentLifecycle = usePdfSessionLifecycle({
    session,
    loadSession: (nextSession) => setSession(nextSession),
    clearSession: () => setSession(null),
    resetWorkspace: (module) => resetWorkspaceCalls.push(module),
    recoveredStartupWorkspace,
    cancelWorkspaceCalibration: () => undefined,
    cancelReferenceEdit: () => undefined,
    requestReplacePdf: () => undefined,
    closeDialog: () => undefined,
    closeConfirmation: () => undefined,
    closeAllOverlays: () => undefined,
    setError: () => undefined,
  });
  useEffect(() => {
    harnessSession = session;
    publish(currentLifecycle, (nextSession) => setSession(nextSession));
  }, [currentLifecycle, publish, session]);
  return null;
}

async function renderLifecycleHarness(recoveredStartupWorkspace: WorkspaceModule = "scales") {
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
    root!.render(createElement(LifecycleHarness, { publish, recoveredStartupWorkspace }));
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
  it.each(["scales", "measurements", "classifications"] as const)(
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

  it.each(["measurements", "classifications"] as const)(
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
