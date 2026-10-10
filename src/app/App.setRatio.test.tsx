/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSession, PageCalibration } from "../types/domain";
import { createPageCalibrationFromRatio } from "../features/calibration/ratioCalibration";
import { getMeasurementCalibration } from "../utils/calibration";
import { formatLinearValue } from "../utils/format";
import { toMillimetres } from "../utils/units";
import type { LinearUnit } from "../types/domain";
import { lineLengthMm } from "../utils/geometry";
import { createEmptySession, sessionReducer, type SessionCommandResult } from "./sessionState";
import { App } from "./App";
import { createSaveStatusStore, type SaveStatusStore } from "./saveStatus";

const lifecycleHarness = vi.hoisted(() => ({
  saveStatusStore: undefined as SaveStatusStore | undefined,
  autosaveFailed: false,
  canRetryAutosave: true,
  projectOperationPending: false,
  retryAutosave: vi.fn(),
  exportProject: vi.fn(),
  autosave: vi.fn(),
  measurementRenders: vi.fn(),
  initialSession: null as CurrentSession | null,
  latestSession: null as CurrentSession | null,
  loadSession: null as ((session: CurrentSession) => void) | null,
}));

vi.mock("./usePdfSessionLifecycle", async () => {
  const { useEffect } = await import("react");
  return {
    usePdfSessionLifecycle: (options: {
      session: CurrentSession | null;
      loadSession: (session: CurrentSession) => void;
    }) => {
      const { session, loadSession } = options;
      useEffect(() => { if (session) lifecycleHarness.autosave(session); }, [session]);
      lifecycleHarness.latestSession = session;
      lifecycleHarness.loadSession = loadSession;
      useEffect(() => {
        if (!session && lifecycleHarness.initialSession) {
          loadSession(lifecycleHarness.initialSession);
        }
      }, [loadSession, session]);
      return {
        saveStatusStore: lifecycleHarness.saveStatusStore,
        activePdf: { document: {} },
        recovery: null,
        savedProjects: [],
        recoveryChecked: true,
        recoveryIssue: null,
        confirmDiscardRecovery: false,
        loading: false,
        autosaveWarning: lifecycleHarness.autosaveFailed ? "Autosave stopped" : null,
        autosaveFailed: lifecycleHarness.autosaveFailed,
        canRetryAutosave: lifecycleHarness.canRetryAutosave,
        projectOperationPending: lifecycleHarness.projectOperationPending,
        retryAutosave: lifecycleHarness.retryAutosave,
        exportProject: lifecycleHarness.exportProject,
        autosaveUnavailable: false,
        chooseFile: () => undefined,
        openProject: () => undefined,
        refreshSavedProjects: async () => [],
        continueRecovery: () => undefined,
        discardRecovery: () => undefined,
        discardProject: async () => undefined,
        continueWithoutRecovery: () => undefined,
        showDiscardRecoveryConfirmation: () => undefined,
        hideDiscardRecoveryConfirmation: () => undefined,
        dismissAutosaveWarning: () => undefined,
        confirmPdfReplacement: () => undefined,
        cancelPdfReplacement: () => undefined,
      };
    },
  };
});

vi.mock("./AppShell", () => ({
  AppShell: ({
    saveStatus,
    children,
    onExport,
    statusMessage,
    statusActions,
    errorNotifications = [],
  }: {
    saveStatus?: ReactNode;
    children: ReactNode;
    onExport?: () => void;
    statusMessage?: string | null;
    statusActions?: ReactNode;
    errorNotifications?: { id: number; message: string }[];
  }) => (
    <div>
      {saveStatus}
      {onExport && <button onClick={onExport}>Open export</button>}
      {statusMessage && <div role="alert">{statusMessage}{statusActions}</div>}
      {errorNotifications.map(({ id, message }) => <div key={id} role="alert">{message}</div>)}
      {children}
    </div>
  ),
  LoadingOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./WorkspaceShell", async () => {
  const { ViewerInteractionCommandsProvider } = await import("../features/viewer/ViewerInteractionCommands");
  const { useWorkspaceState } = await import("./workspaceState");
  const { useSessionState } = await import("./sessionState");
  function PendingDraftControl() {
    const { canUndo, canRedo } = useSessionState();
    const { draft, startDraft } = useWorkspaceState();
    return (
      <>
        <button
          type="button"
          onClick={() =>
            startDraft({
              type: "path",
              measurementType: "line",
              points: [{ x: 10, y: 10 }],
            })
          }
        >
          Start pending drawing
        </button>
        <output data-testid="history">{`${canUndo}:${canRedo}`}</output>
        <output data-testid="pending-draft">{draft ? `${draft.type}:${draft.points.length}` : ""}</output>
      </>
    );
  }
  return {
    WorkspaceShell: ({
      workspacePanel,
      contextToolbar,
      emptyState,
      viewer,
      viewerOverlay,
      viewerTransientOverlay,
    }: {
      workspacePanel?: ReactNode;
      contextToolbar?: ReactNode;
      emptyState?: ReactNode;
      viewer?: ReactNode;
      viewerOverlay?: ReactNode;
      viewerTransientOverlay?: ReactNode;
    }) => (
      <main>
        {workspacePanel ?? emptyState}
        <ViewerInteractionCommandsProvider>{contextToolbar}</ViewerInteractionCommandsProvider>
        {viewer}{viewerOverlay}{viewerTransientOverlay}
        <PendingDraftControl />
      </main>
    ),
    EmptyWorkspaceState: () => null,
  };
});

vi.mock("./WorkspacePanel", () => ({
  WorkspacePanel: ({ measurements, scales, takeoff }: { measurements: ReactNode; scales: ReactNode; takeoff: ReactNode }) => (
    <aside>
      <div>{measurements}</div>
      <div>{scales}</div>
      <div>{takeoff}</div>
    </aside>
  ),
}));

vi.mock("../features/measurements/MeasurementPanel", async () => {
  const { useWorkspaceState } = await import("./workspaceState");
  return {
    MeasurementPanel: ({ onSelectMeasurement }: {
      onSelectMeasurement: (pageNumber: number, measurementId: string, additive?: boolean) => void;
    }) => {
      lifecycleHarness.measurementRenders();
      const { selectedMeasurementIds, measurementDetailsOpen } = useWorkspaceState();
      return <>
        <button type="button" onClick={() => onSelectMeasurement(2, "page-two-line")}>Select page 2 measurement</button>
        <button type="button" onClick={() => onSelectMeasurement(1, "page-one-line", true)}>Toggle page 1 measurement</button>
        <button type="button" onClick={() => onSelectMeasurement(2, "page-two-line", true)}>Toggle page 2 measurement</button>
        <button type="button" onClick={() => onSelectMeasurement(1, "page-one-second", true)}>Toggle second page 1 measurement</button>
        <output data-testid="selected-measurements">{selectedMeasurementIds.join(",")}</output>
        <output data-testid="details-open">{String(measurementDetailsOpen)}</output>
      </>;
    },
  };
});

vi.mock("./WorkspaceDrawerContext", () => ({
  useWorkspaceDrawerPresentation: () => ({
    isNarrow: false,
    narrowVersion: 0,
    open: true,
    close: () => undefined,
    currentCapability: null,
    capabilityWithoutDrawer: null,
    canRecoverAuthoringByClosingWorkspace: false,
    precisionActionAvailable: true,
    precisionDisabledReason: "Unavailable",
    requestPrecisionAuthoring: (start: () => void) => {
      start();
      return true;
    },
  }),
}));

vi.mock("../features/viewer/PdfViewer", async () => {
  const { useState } = await import("react");
  const { PageBrowserHost } = await import("../features/pages/PageBrowserHost");
  const pdf = { numPages: 2, getPage: vi.fn().mockRejectedValue(new Error("Thumbnail unavailable in App harness")) } as unknown as import("pdfjs-dist").PDFDocumentProxy;
  const { useWorkspaceState } = await import("./workspaceState");
  return { PdfViewer: ({ onCalibrationCandidate, onPageChange, onChooseTool }: {
    onCalibrationCandidate: (points: [{ x: number; y: number }, { x: number; y: number }]) => void;
    onPageChange: (page: number) => void;
    onChooseTool: (tool: "hand") => void;
  }) => {
    const { chooseTool } = useWorkspaceState();
    const [pagesOpen, setPagesOpen] = useState(false);
    return <>
      <button onClick={() => setPagesOpen(!pagesOpen)}>Pages</button>
      {pagesOpen && <PageBrowserHost document={pdf} sourceLabels={["i", "ii"]} onNavigate={onPageChange} onClose={() => setPagesOpen(false)} />}
      <button onClick={() => { chooseTool("select"); onCalibrationCandidate([{ x: 0, y: 0 }, { x: 10, y: 20 }]); }}>Mark check points</button>
      <button onClick={() => onPageChange(2)}>Next viewer page</button>
      <button onClick={() => onChooseTool("hand")}>Choose hand tool</button>
    </>;
  } };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function buildSession(
  calibration: PageCalibration,
  { withMeasurement = false, withOtherScale = false } = {},
): CurrentSession {
  let state: SessionCommandResult = {
    session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1),
    error: null,
  };
  state = sessionReducer(state, {
    type: "ADD_CALIBRATION",
    pageNumber: 1,
    id: calibration.id,
    name: calibration.name,
    calibration,
  });
  if (withMeasurement) {
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-1",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 72, y: 36 },
      ],
    });
  }
  if (withOtherScale) {
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "other-scale",
      name: "Other scale",
      calibration: createPageCalibrationFromRatio({ mode: "uniform", denominator: 25 }),
    });
  }
  if (!state.session) throw new Error("Test session could not be created.");
  return state.session;
}

function uniformScale(denominator = 50): PageCalibration {
  return {
    id: "target-scale",
    name: "Ground floor",
    ...createPageCalibrationFromRatio({ mode: "uniform", denominator }),
  };
}

function xyScale(xDenominator = 70, yDenominator = 30): PageCalibration {
  return {
    id: "target-scale",
    name: "Survey correction",
    ...createPageCalibrationFromRatio({ mode: "xy", xDenominator, yDenominator }),
  };
}

function currentSession(): CurrentSession {
  if (!lifecycleHarness.latestSession) throw new Error("App session was not loaded.");
  return lifecycleHarness.latestSession;
}

function measurementLength(session: CurrentSession): number {
  const page = session.pages[1]!;
  const measurement = page.measurements.find((candidate) => candidate.id === "line-1");
  if (!measurement) throw new Error("Test measurement is missing.");
  const calibration = getMeasurementCalibration(page, measurement);
  if (!calibration) throw new Error("Test measurement calibration is missing.");
  return lineLengthMm(measurement.points, calibration);
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button with label ${label} was not rendered.`);
  return button;
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button ${text} was not rendered.`);
  return button;
}

function dialogButtonByText(text: string): HTMLButtonElement {
  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  const button = dialog
    ? Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === text,
      )
    : undefined;
  if (!button) throw new Error(`Dialog button ${text} was not rendered.`);
  return button;
}

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function renderApp(session: CurrentSession) {
  lifecycleHarness.initialSession = session;
  lifecycleHarness.latestSession = null;
  lifecycleHarness.loadSession = null;
  await act(async () => {
    root!.render(<App />);
    await Promise.resolve();
  });
  currentSession();
}

function twoPageSession(): CurrentSession {
  return createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 2);
}

function openSetRatio(scaleName: string) {
  act(() => buttonByLabel(`Expand scale ${scaleName}, active`).click());
  act(() => buttonByLabel(`Set ratio for scale ${scaleName}`).click());
}

function saveUniformRatio(denominator: number) {
  const input = document.querySelector<HTMLInputElement>("#custom-ratio-uniform");
  if (!input) throw new Error("Uniform ratio input was not rendered.");
  setInputValue(input, String(denominator));
  act(() => buttonByText("Save").click());
}

function saveXyRatio(xDenominator: number, yDenominator: number) {
  const x = document.querySelector<HTMLInputElement>("#custom-ratio-x");
  const y = document.querySelector<HTMLInputElement>("#custom-ratio-y");
  if (!x || !y) throw new Error("X/Y ratio inputs were not rendered.");
  setInputValue(x, String(xDenominator));
  setInputValue(y, String(yDenominator));
  act(() => buttonByText("Save").click());
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "show", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  lifecycleHarness.saveStatusStore = undefined;
  if (root) act(() => root?.unmount());
  container?.remove();
  lifecycleHarness.autosaveFailed = false;
  lifecycleHarness.canRetryAutosave = true;
  lifecycleHarness.projectOperationPending = false;
  lifecycleHarness.retryAutosave.mockReset();
  lifecycleHarness.exportProject.mockReset();
  lifecycleHarness.autosave.mockReset();
  lifecycleHarness.initialSession = null;
  lifecycleHarness.latestSession = null;
  lifecycleHarness.loadSession = null;
  vi.restoreAllMocks();
  root = null;
  container = null;
});

describe("App export diferido", () => {
  it("abre el módulo resuelto y conserva cierre, reapertura y sesión", async () => {
    await renderApp(twoPageSession());
    const before = currentSession();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => {
      buttonByText("Open export").click();
      await vi.dynamicImportSettled();
    });
    expect(buttonByText("Export CSV")).toBeDefined();
    act(() => buttonByText("Cancel").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    act(() => buttonByText("Open export").click());
    expect(buttonByText("Export CSV")).toBeDefined();
    expect(currentSession()).toBe(before);
  });
});

describe("App Set ratio impact confirmation", () => {
  it("preserves pending drawing work when a measurement on another page is selected", async () => {
    await renderApp(twoPageSession());
    act(() => buttonByText("Start pending drawing").click());

    expect(container?.querySelector('[data-testid="pending-draft"]')?.textContent).toBe("path:1");
    act(() => buttonByText("Select page 2 measurement").click());

    expect(currentSession().currentPage).toBe(1);
    expect(container?.querySelector('[data-testid="pending-draft"]')?.textContent).toBe("path:1");
    expect(container?.querySelector('[role="alert"]')?.textContent).toBe(
      "Finish or cancel the current measurement or scale workflow before switching pages.",
    );
  });

  it("applies a Uniform ratio immediately when no measurements use the scale", async () => {
    await renderApp(buildSession(uniformScale()));
    openSetRatio("Ground floor");
    saveUniformRatio(60);

    expect(document.querySelector("dialog")).toBeNull();
    expect(currentSession().pages[1]!.calibrations[0]).toEqual({
      id: "target-scale",
      name: "Ground floor",
      ...createPageCalibrationFromRatio({ mode: "uniform", denominator: 60 }),
    });
  });

  it("does not recalibrate before confirmation and Cancel preserves calibration and results", async () => {
    const initial = buildSession(uniformScale(), { withMeasurement: true });
    const calibrationBefore = initial.pages[1]!.calibrations[0]!;
    const resultBefore = measurementLength(initial);
    await renderApp(initial);

    openSetRatio("Ground floor");
    saveUniformRatio(60);

    expect(currentSession().pages[1]!.calibrations[0]).toEqual(calibrationBefore);
    expect(measurementLength(currentSession())).toBe(resultBefore);
    expect(document.querySelector("dialog")?.textContent).toContain(
      "1 measurement uses this scale. Their values will be recalculated using the new ratio.",
    );

    act(() => dialogButtonByText("Cancel").click());

    expect(currentSession().pages[1]!.calibrations[0]).toEqual(calibrationBefore);
    expect(measurementLength(currentSession())).toBe(resultBefore);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("confirms a Uniform ratio in place and updates linked measurement results", async () => {
    const initial = buildSession(uniformScale(), { withMeasurement: true });
    const resultBefore = measurementLength(initial);
    await renderApp(initial);

    openSetRatio("Ground floor");
    saveUniformRatio(60);
    act(() => dialogButtonByText("Set ratio").click());

    const page = currentSession().pages[1]!;
    expect(page.calibrations[0]).toEqual({
      id: "target-scale",
      name: "Ground floor",
      ...createPageCalibrationFromRatio({ mode: "uniform", denominator: 60 }),
    });
    expect(page.measurements[0]!.calibrationId).toBe("target-scale");
    expect(measurementLength(currentSession())).not.toBe(resultBefore);
  });

  it("uses the same confirmation policy for X/Y ratios", async () => {
    const initial = buildSession(xyScale(), { withMeasurement: true });
    const resultBefore = measurementLength(initial);
    await renderApp(initial);

    openSetRatio("Survey correction");
    saveXyRatio(80, 40);

    expect(currentSession().pages[1]!.calibrations[0]).toEqual(initial.pages[1]!.calibrations[0]);
    expect(document.querySelector("dialog")?.textContent).toContain(
      "1 measurement uses this scale",
    );
    act(() => dialogButtonByText("Set ratio").click());

    const page = currentSession().pages[1]!;
    expect(page.calibrations[0]).toEqual({
      id: "target-scale",
      name: "Survey correction",
      ...createPageCalibrationFromRatio({ mode: "xy", xDenominator: 80, yDenominator: 40 }),
    });
    expect(page.measurements[0]!.calibrationId).toBe("target-scale");
    expect(measurementLength(currentSession())).not.toBe(resultBefore);
  });

  it("fails safely if the pending target disappears before confirmation", async () => {
    const initial = buildSession(uniformScale(), { withMeasurement: true, withOtherScale: true });
    await renderApp(initial);
    const otherBefore = initial.pages[1]!.calibrations.find(
      (calibration) => calibration.id === "other-scale",
    )!;

    act(() => buttonByLabel("Expand scale Ground floor").click());
    act(() => buttonByLabel("Set ratio for scale Ground floor").click());
    saveUniformRatio(60);

    const staleSession: CurrentSession = {
      ...currentSession(),
      pages: {
        ...currentSession().pages,
        1: {
          ...currentSession().pages[1]!,
          calibrations: currentSession().pages[1]!.calibrations.filter(
            (calibration) => calibration.id !== "target-scale",
          ),
          activeCalibrationId: "other-scale",
          measurements: [],
        },
      },
    };
    act(() => lifecycleHarness.loadSession?.(staleSession));
    act(() => dialogButtonByText("Set ratio").click());

    const page = currentSession().pages[1]!;
    expect(page.calibrations).toEqual([otherBefore]);
    expect(page.calibrations[0]).toEqual(otherBefore);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "The scale to update is no longer available.",
    );
  });
});


describe("App multiple measurement selection", () => {
  function assignedSession() {
    const session = twoPageSession();
    for (const page of Object.values(session.pages)) page.measurements = [{ id: page.pageNumber === 1 ? "page-one-line" : "page-two-line", name: "Line", type: "line", calibrationId: "scale", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], visible: true, classificationValueIds: [] }];
    return session;
  }

  it("duplicates and copies a same-page group while rejecting mixed-page copies", async () => {
    const session = assignedSession();
    session.pages[1]!.calibrations = [{ ...uniformScale(), id: "scale" }];
    session.pages[1]!.activeCalibrationId = "scale";
    session.pages[1]!.measurements.push({ ...session.pages[1]!.measurements[0]!, id: "page-one-second", points: [{ x: 20, y: 20 }, { x: 30, y: 20 }] });
    await renderApp(session);
    act(() => buttonByText("Toggle page 1 measurement").click());
    act(() => buttonByText("Toggle second page 1 measurement").click());
    expect(buttonByText("Duplicate").disabled).toBe(false);
    act(() => buttonByText("Duplicate").click());
    expect(currentSession().pages[1]!.measurements).toHaveLength(4);
    const newIds = currentSession().pages[1]!.measurements.slice(2).map((measurement) => measurement.id);
    expect(container!.querySelector('[data-testid="selected-measurements"]')!.textContent).toBe(newIds.join(","));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true })));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true })));
    expect(currentSession().pages[1]!.measurements).toHaveLength(6);
    act(() => buttonByText("Toggle page 2 measurement").click());
    expect(buttonByText("Duplicate").disabled).toBe(true);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true })));
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("single page");
    expect(currentSession().pages[1]!.measurements).toHaveLength(6);
  });

  it("keeps cross-page additive selections and confirms deleting the captured selection", async () => {
    await renderApp(assignedSession());
    act(() => buttonByText("Toggle page 1 measurement").click());
    act(() => buttonByText("Toggle page 2 measurement").click());
    expect(currentSession().currentPage).toBe(1);
    expect(container!.querySelector('[data-testid="selected-measurements"]')!.textContent).toBe("page-one-line,page-two-line");
    act(() => buttonByText("Delete").click());
    expect(document.querySelector("dialog")!.textContent).toContain("Delete 2 measurements?");
    act(() => dialogButtonByText("Cancel").click());
    expect(currentSession().pages[1]!.measurements).toHaveLength(1);
    expect(currentSession().pages[2]!.measurements).toHaveLength(1);
    act(() => buttonByText("Delete").click());
    act(() => dialogButtonByText("Delete").click());
    expect(currentSession().pages[1]!.measurements).toEqual([]);
    expect(currentSession().pages[2]!.measurements).toEqual([]);
    expect(container!.querySelector('[data-testid="selected-measurements"]')!.textContent).toBe("");
  });

  it("deletes a single additive selection on another page via keyboard", async () => {
    await renderApp(assignedSession());
    act(() => buttonByText("Toggle page 2 measurement").click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
    expect(document.querySelector("dialog")!.textContent).toContain("Delete 1 measurement?");
    act(() => dialogButtonByText("Delete").click());
    expect(currentSession().pages[1]!.measurements).toHaveLength(1);
    expect(currentSession().pages[2]!.measurements).toEqual([]);
  });
});


describe("App autosave recovery actions", () => {
  it("hides status in an empty workspace and connects backup and retry to the existing lifecycle actions", async () => {
    const store = createSaveStatusStore();
    lifecycleHarness.saveStatusStore = store;
    await act(async () => {
      root!.render(<App />);
    });
    expect(container!.querySelector('[role="status"]')).toBeNull();
    store.set("failed");
    act(() => lifecycleHarness.loadSession!(buildSession(uniformScale())));
    const trigger = container!.querySelector<HTMLButtonElement>(
      'button[aria-label="Couldn\'t save. Save status and backups"]',
    )!;
    act(() => trigger.click());
    act(() => buttonByText("Export backup (.planmeasure)").click());
    expect(lifecycleHarness.exportProject).toHaveBeenCalledOnce();
    expect(lifecycleHarness.exportProject).toHaveBeenCalledWith();
    act(() => buttonByText("Retry saving").click());
    expect(lifecycleHarness.retryAutosave).toHaveBeenCalledOnce();
  });
  it.each([true, false])(
    "offers export and confirmed reload with retry available=%s",
    async (canRetry) => {
      lifecycleHarness.autosaveFailed = true;
      lifecycleHarness.canRetryAutosave = canRetry;
      await renderApp(buildSession(uniformScale()));
      const original = currentSession();
      const retryButton = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Retry saving",
      );
      expect(Boolean(retryButton)).toBe(canRetry);
      if (retryButton) {
        act(() => retryButton.click());
        expect(lifecycleHarness.retryAutosave).toHaveBeenCalledOnce();
      }
      act(() => buttonByText("Export project").click());
      expect(lifecycleHarness.exportProject).toHaveBeenCalledOnce();
      act(() => buttonByText("Reload saved projects").click());
      expect(document.querySelector("dialog")?.open).toBe(true);
      expect(document.querySelector("dialog")?.textContent).toContain(
        "discards edits that have not been saved",
      );
      act(() => dialogButtonByText("Keep editing").click());
      expect(document.querySelector("dialog")?.open ?? false).toBe(false);
      expect(currentSession()).toEqual(original);
    },
  );

  it("disables recovery controls while a project operation is pending", async () => {
    lifecycleHarness.autosaveFailed = true;
    lifecycleHarness.projectOperationPending = true;
    await renderApp(buildSession(uniformScale()));
    for (const label of ["Retry saving", "Export project", "Reload saved projects"]) {
      expect(buttonByText(label).disabled).toBe(true);
    }
  });
});


describe("App Takeoff source navigation", () => {
  function sourceSession() {
    const session = twoPageSession();
    session.pages[2]!.measurements = [{id: "hidden-source", name: "Hidden source", type: "line", calibrationId: "gone", points: [{x:0,y:0},{x:10,y:0}], visible: false, classificationValueIds: []}];
    return session;
  }
  it("navigates to an excluded hidden source and opens details without changing it", async () => {
    const session = sourceSession();
    const before = structuredClone(session.pages);
    await renderApp(session);
    act(() => buttonByLabel("Inspect excluded measurements").click());
    act(() => buttonByLabel("Open Hidden source on page 2").click());
    expect(currentSession().currentPage).toBe(2);
    expect(container!.querySelector('[data-testid="selected-measurements"]')!.textContent).toBe("hidden-source");
    expect(container!.querySelector('[data-testid="details-open"]')!.textContent).toBe("true");
    expect(currentSession().pages).toEqual(before);
  });
  it("preserves a pending drawing when source navigation is attempted", async () => {
    await renderApp(sourceSession());
    act(() => buttonByLabel("Show measurements in Project totals").click());
    act(() => buttonByText("Start pending drawing").click());
    expect(buttonByLabel("Open Hidden source on page 2").disabled).toBe(true);
    act(() => buttonByLabel("Open Hidden source on page 2").click());
    expect(currentSession().currentPage).toBe(1);
    expect(container!.querySelector('[data-testid="pending-draft"]')!.textContent).toBe("path:1");
    expect(container!.querySelector('[data-testid="details-open"]')!.textContent).toBe("false");
  });
});

describe("App scale check", () => {
  async function startCheck(initial: CurrentSession) {
    await renderApp(initial);
    lifecycleHarness.autosave.mockClear();
    const name = initial.pages[1]!.calibrations[0]!.name;
    if (initial.pages[1]!.activeCalibrationId !== initial.pages[1]!.calibrations[0]!.id)
      act(() => buttonByLabel(`Expand scale ${name}`).click());
    await act(async () => {
      buttonByLabel(`Check scale ${name}`).click();
      await import("../features/calibration/ScaleCheckPanel");
    });
  }
  function submitDistance(value: string) {
    setInputValue(document.querySelector<HTMLInputElement>("#calibration-distance")!, value);
    act(() =>
      document
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
  }
  it.each([uniformScale(), xyScale()])(
    "checks $mode without changing session, history, autosave or measurement renders",
    async (scale) => {
      const initial = buildSession(scale, { withMeasurement: true });
      const before = structuredClone(initial);
      await startCheck(initial);
      const persisted = currentSession();
      act(() => buttonByText("Mark check points").click());
      expect(document.querySelector("dialog")?.textContent).toContain("Check scale");
      const renders = lifecycleHarness.measurementRenders.mock.calls.length;
      submitDistance("1");
      expect(lifecycleHarness.measurementRenders).toHaveBeenCalledTimes(renders);
      const status = document.querySelector('[role="status"][aria-live="polite"]');
      expect(status?.textContent).toContain("Measured distance:");
      expect(status?.textContent).toContain("Real distance: 1.00 m");
      expect(status?.textContent).toContain("Difference (measured − real):");
      expect(status?.getAttribute("aria-atomic")).toBe("true");
      expect(document.querySelector('[data-layout-slot="scale-check-interaction-shield"]')).toBeNull();
      expect(document.querySelector("dialog")).toBeNull();
      expect(document.querySelector(`[role="group"][aria-label="Scale check: ${scale.name}"]`)).not.toBeNull();
      expect(currentSession()).toEqual(before);
      expect(currentSession()).toBe(persisted);
      expect(container!.querySelector('[data-testid="history"]')!.textContent).toBe("false:false");
      expect(lifecycleHarness.autosave).not.toHaveBeenCalled();
      act(() => buttonByText("Dismiss").click());
      expect(document.querySelector("dialog")).toBeNull();
      expect(currentSession()).toBe(persisted);
      expect(lifecycleHarness.autosave).not.toHaveBeenCalled();
    },
  );
  it.each(["mm", "cm", "m", "in", "ft", "ft-in"])(
    "uses the calibration parser for %s input",
    async (unit) => {
      await startCheck(buildSession(uniformScale()));
      expect(
        document.querySelector('[data-layout-slot="scale-check-interaction-shield"]'),
      ).toBeNull();
      expect(document.querySelector('[role="status"][aria-live="polite"]')?.textContent).toBe("");
      act(() => buttonByText("Mark check points").click());
      expect(
        document.querySelector('[data-layout-slot="scale-check-interaction-shield"]'),
      ).not.toBeNull();
      const select = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Calibration unit"]',
      )!;
      act(() => {
        select.value = unit;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      if (unit === "ft-in") {
        setInputValue(document.querySelector<HTMLInputElement>("#calibration-feet")!, "1");
        setInputValue(document.querySelector<HTMLInputElement>("#calibration-inches")!, "6");
        act(() =>
          document
            .querySelector("form")!
            .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
        );
      } else submitDistance("1.5");
      const real = formatLinearValue(
        unit === "ft-in" ? 457.2 : toMillimetres(1.5, unit as LinearUnit),
        "m",
      );
      expect(document.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain(
        `Real distance: ${real}`,
      );
    },
  );
  it("clears a pending check when another tool is selected", async () => {
    await startCheck(buildSession(uniformScale()));
    act(() => buttonByText("Choose hand tool").click());
    expect(document.querySelector('[aria-label="Check scale controls"]')).toBeNull();
    expect(lifecycleHarness.autosave).not.toHaveBeenCalled();
  });
  it("handles Escape before the deferred panel can mount", async () => {
    await renderApp(buildSession(uniformScale()));
    lifecycleHarness.autosave.mockClear();
    act(() => {
      buttonByLabel("Check scale Ground floor").click();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await act(async () => {
      await import("../features/calibration/ScaleCheckPanel");
    });
    expect(document.querySelector('[aria-label="Check scale controls"]')).toBeNull();
    expect(document.querySelector("dialog")).toBeNull();
    expect(lifecycleHarness.autosave).not.toHaveBeenCalled();
  });
  it("does not create history when completing a check", async () => {
    await startCheck(buildSession(uniformScale(), { withMeasurement: true }));
    act(() => buttonByText("Mark check points").click());
    submitDistance("1");
    expect(container!.querySelector('[data-testid="history"]')!.textContent).toBe("false:false");
  });
  it("does not consume Escape needed by the viewer to cancel a measurement drag", async () => {
    await startCheck(buildSession(uniformScale(), { withMeasurement: true }));
    act(() => buttonByText("Mark check points").click());
    submitDistance("1");
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => window.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(false);
    expect(document.querySelector('[role="group"][aria-label="Scale check: Ground floor"]')).toBeNull();
    expect(lifecycleHarness.autosave).not.toHaveBeenCalled();
  });
  it("does not enqueue autosave when completing a check", async () => {
    await startCheck(buildSession(uniformScale(), { withMeasurement: true }));
    act(() => buttonByText("Mark check points").click());
    submitDistance("1");
    expect(lifecycleHarness.autosave).not.toHaveBeenCalled();
  });
  it("validates the shared input and cancels both marking and the result with Escape", async () => {
    const initial = buildSession(uniformScale());
    await startCheck(initial);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[aria-label="Check scale controls"]')).toBeNull();
    await act(async () => buttonByLabel("Check scale Ground floor").click());
    act(() => buttonByText("Mark check points").click());
    for (const value of ["0", "-1", "text"]) {
      submitDistance(value);
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "Enter a distance greater than zero.",
      );
    }
    submitDistance("1e308");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Enter a valid distance that is not excessively large.",
    );
    submitDistance("1e-300");
    expect(document.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain(
      "Unavailable:",
    );
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector("dialog")).toBeNull();
    expect(lifecycleHarness.autosave).not.toHaveBeenCalled();
  });
  it.each(["page", "scale", "project"])("clears a result on %s changes", async (change) => {
    const initial = buildSession(uniformScale(), { withOtherScale: true });
    initial.pages[1]!.activeCalibrationId = "target-scale";
    initial.pageCount = 2;
    initial.pages[2] = { ...initial.pages[1]!, pageNumber: 2 };
    await startCheck(initial);
    act(() => buttonByText("Mark check points").click());
    submitDistance("1");
    if (change === "page") act(() => buttonByText("Next viewer page").click());
    else {
      const next = structuredClone(currentSession());
      if (change === "scale") next.pages[1]!.activeCalibrationId = "other-scale";
      else next.pdf.name = "another.pdf";
      act(() => lifecycleHarness.loadSession!(next));
    }
    expect(document.querySelector("dialog")).toBeNull();
  });
});


describe("App page browser navigation purity", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
  afterEach(() => vi.unstubAllGlobals());
  it("keeps opening/search local and uses the same navigation effects as the viewer controls", async () => {
    const session = buildSession(uniformScale(), { withMeasurement: true });
    session.pageCount = 2;
    session.pages[2] = { ...session.pages[1]!, pageNumber: 2, measurements: [] };
    const pagesBefore = structuredClone(session.pages);
    await renderApp(session);
    await act(async () => vi.dynamicImportSettled());
    lifecycleHarness.autosave.mockClear();
    act(() => buttonByText("Pages").click());
    const search = container!.querySelector<HTMLInputElement>('[aria-label="Search labels"]')!;
    setInputValue(search, " ii ");
    expect(currentSession().pages).toEqual(pagesBefore);
    expect(container!.querySelector('[data-testid="history"]')!.textContent).toBe("false:false");
    expect(lifecycleHarness.autosave).not.toHaveBeenCalled();
    act(() => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(currentSession().currentPage).toBe(2);
    expect(currentSession().pages).toEqual(pagesBefore);
    expect(container!.querySelector('[data-testid="history"]')!.textContent).toBe("false:false");
    expect(container!.querySelector('[data-testid="selected-measurements"]')!.textContent).toBe("");
    expect(lifecycleHarness.autosave).toHaveBeenCalledTimes(1);
    expect(lifecycleHarness.autosave).toHaveBeenLastCalledWith(currentSession());
  });
  it("blocks page-browser navigation during a draft exactly as the existing previous/next controls", async () => {
    await renderApp(twoPageSession());
    await act(async () => vi.dynamicImportSettled());
    act(() => buttonByText("Pages").click());
    act(() => buttonByText("Start pending drawing").click());
    const search = container!.querySelector<HTMLInputElement>('[aria-label="Search labels"]')!;
    setInputValue(search, "ii");
    lifecycleHarness.autosave.mockClear();
    act(() => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(currentSession().currentPage).toBe(1);
    expect(container!.querySelector('[data-testid="pending-draft"]')!.textContent).toBe("path:1");
    expect(lifecycleHarness.autosave).not.toHaveBeenCalled();
    act(() => buttonByText("Next viewer page").click());
    expect(currentSession().currentPage).toBe(2);
    expect(container!.querySelector('[data-testid="pending-draft"]')!.textContent).toBe("");
    expect(container!.querySelector('[data-testid="history"]')!.textContent).toBe("false:false");
  });
});
