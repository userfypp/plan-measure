/* @vitest-environment jsdom */

import "fake-indexeddb/auto";
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePdfSessionLifecycle } from "./usePdfSessionLifecycle";
import { loadSavedSession, resetPersistenceForTests } from "../services/persistence";
import type { CurrentSession } from "../types/domain";

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
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  await resetPersistenceForTests();
});

function LifecycleHarness({
  publish,
}: {
  publish: (
    currentLifecycle: ReturnType<typeof usePdfSessionLifecycle>,
    updateSession: (session: CurrentSession) => void,
  ) => void;
}) {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const currentLifecycle = usePdfSessionLifecycle({
    session,
    loadSession: (nextSession) => setSession(nextSession),
    clearSession: () => setSession(null),
    resetWorkspace: () => undefined,
    cancelWorkspaceCalibration: () => undefined,
    cancelReferenceEdit: () => undefined,
    requestReplacePdf: () => undefined,
    closeDialog: () => undefined,
    closeConfirmation: () => undefined,
    closeAllOverlays: () => undefined,
    setError: () => undefined,
  });
  useEffect(() => {
    publish(currentLifecycle, (nextSession) => setSession(nextSession));
  }, [currentLifecycle, publish]);
  return null;
}

async function renderLifecycleHarness() {
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
    root!.render(createElement(LifecycleHarness, { publish }));
  });
  for (let attempt = 0; attempt < 20 && !lifecycle?.recoveryChecked; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }
  expect(lifecycle?.recoveryChecked).toBe(true);
}

describe("page-exit autosave", () => {
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
    act(() => window.dispatchEvent(new Event("beforeunload")));
    expect(clearTimeout).toHaveBeenCalled();
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
