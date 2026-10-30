/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubDialogMethods, stubMatchMedia } from "../test/domTestUtils";
import {
  resetShortcutsNoticeForTests,
  SHORTCUTS_NOTICE_STORAGE_KEY,
} from "../utils/shortcuts/notice";
import { App } from "./App";
import { subscribeSettingsDialogRequests } from "./settingsDialogRequest";
import { ThemeProvider } from "./themeState";

const lifecycle = vi.hoisted(() => ({
  recoveryChecked: true,
  recoveryIssue: null as string | null,
  loading: false,
  projectOperationPending: false,
  savedProjects: [] as { id: string }[],
}));

vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }));

vi.mock("./usePdfSessionLifecycle", () => ({
  preloadPdfRuntime: async () => undefined,
  usePdfSessionLifecycle: () => ({
    saveStatusStore: undefined,
    activePdf: null,
    recovery: null,
    savedProjects: lifecycle.savedProjects,
    activeProjectId: null,
    recoveryChecked: lifecycle.recoveryChecked,
    recoveryIssue: lifecycle.recoveryIssue,
    confirmDiscardRecovery: false,
    loading: lifecycle.loading,
    autosaveWarning: null,
    autosaveFailed: false,
    canRetryAutosave: false,
    projectOperationPending: lifecycle.projectOperationPending,
    retryAutosave: () => undefined,
    exportProject: () => undefined,
    autosaveUnavailable: false,
    chooseFile: async () => undefined,
    importProject: async () => undefined,
    openSampleProject: async () => undefined,
    openProject: () => undefined,
    hasUnsavedMemoryProject: () => false,
    refreshSavedProjects: async () => [],
    continueRecovery: () => undefined,
    discardRecovery: () => undefined,
    discardProject: async () => undefined,
    closeProject: async () => undefined,
    continueWithoutRecovery: () => undefined,
    showDiscardRecoveryConfirmation: () => undefined,
    hideDiscardRecoveryConfirmation: () => undefined,
    dismissAutosaveWarning: () => undefined,
    confirmPdfReplacement: () => undefined,
    cancelPdfReplacement: () => undefined,
  }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let restoreDialog: (() => void) | null = null;

/** Renders the whole app again, so the lifecycle double is read with its new values. */
async function render() {
  await act(async () =>
    root!.render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    ),
  );
}

/** A page load: the notice looks at what the storage holds right now. */
function startVisit(storage: Record<string, string> = {}) {
  window.localStorage.clear();
  for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
  resetShortcutsNoticeForTests();
}

/** The AppShell notification (the loading overlay is also a status, so match the text). */
function notice() {
  return (
    [...document.querySelectorAll('[role="status"]')].find((candidate) =>
      candidate.textContent?.startsWith("Shortcuts updated."),
    ) ?? null
  );
}

/** The notice needs a lazy import() for its count, so poll inside act. */
async function waitForNotice() {
  await vi.waitFor(async () => {
    await act(async () => undefined);
    expect(notice()).not.toBeNull();
  });
}

async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent) === name,
  );
  if (!found) throw new Error(`Button ${name} was not rendered.`);
  return found;
}

const marker = () => window.localStorage.getItem(SHORTCUTS_NOTICE_STORAGE_KEY);
const UPGRADING = { "plan-measure.preferences": "{}" };

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  restoreDialog = stubDialogMethods();
  lifecycle.recoveryChecked = true;
  lifecycle.recoveryIssue = null;
  lifecycle.loading = false;
  lifecycle.projectOperationPending = false;
  lifecycle.savedProjects = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  restoreDialog?.();
  window.localStorage.clear();
  resetShortcutsNoticeForTests();
});

describe("App shortcuts notice", () => {
  it("shows once to an upgrading user, remembering it as soon as it appears", async () => {
    startVisit(UPGRADING);
    await render();
    await waitForNotice();
    expect(notice()!.querySelector("span")!.textContent).toMatch(
      /^Shortcuts updated\. \d+ shortcuts were added; your current keys still work\.$/,
    );
    expect(marker()).toBe("done");

    // Dismissing, and later renders of the app, do not bring it back.
    await act(async () => button("Dismiss").click());
    expect(notice()).toBeNull();
    await render();
    await settle();
    expect(notice()).toBeNull();
  });

  it("is not shown again by the next visit, even if it was never dismissed", async () => {
    startVisit(UPGRADING);
    await render();
    await waitForNotice();

    await act(async () => root!.unmount());
    startVisit({
      ...UPGRADING,
      [SHORTCUTS_NOTICE_STORAGE_KEY]: window.localStorage.getItem(SHORTCUTS_NOTICE_STORAGE_KEY)!,
    });
    root = createRoot(container!);
    await render();
    await settle();
    expect(notice()).toBeNull();
  });

  it("never shows on a fresh install", async () => {
    startVisit();
    await render();
    await settle();
    expect(notice()).toBeNull();
    expect(marker()).toBe("done");
  });

  it("shows when the only trace of earlier use is a saved project", async () => {
    startVisit();
    lifecycle.savedProjects = [{ id: "p1" }];
    await render();
    await waitForNotice();
    expect(marker()).toBe("done");
  });

  it("waits for the saved-session check and for loading to finish", async () => {
    startVisit(UPGRADING);
    lifecycle.recoveryChecked = false;
    await render();
    await settle();
    expect(notice()).toBeNull();
    expect(marker()).toBeNull();

    lifecycle.recoveryChecked = true;
    lifecycle.loading = true;
    await render();
    await settle();
    expect(notice()).toBeNull();
    expect(marker()).toBeNull();

    lifecycle.loading = false;
    await render();
    await waitForNotice();
  });

  it("waits while the saved session is unreadable", async () => {
    startVisit(UPGRADING);
    lifecycle.recoveryIssue = "The previous session could not be read.";
    await render();
    await settle();
    expect(document.querySelector("dialog h2")?.textContent).toBe("Saved session unavailable");
    expect(notice()).toBeNull();
    expect(marker()).toBeNull();

    lifecycle.recoveryIssue = null;
    await render();
    await waitForNotice();
  });

  it("stays hidden when it could not be remembered", async () => {
    startVisit(UPGRADING);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    await render();
    await settle();
    expect(notice()).toBeNull();
  });

  it("opens the Shortcuts section of Settings from Review and closes", async () => {
    const requests: unknown[] = [];
    const unsubscribe = subscribeSettingsDialogRequests((section) => requests.push(section));
    try {
      startVisit(UPGRADING);
      await render();
      await waitForNotice();
      await act(async () => button("Review").click());
      expect(requests).toEqual(["shortcuts"]);
      expect(notice()).toBeNull();
    } finally {
      unsubscribe();
    }
  });
});
