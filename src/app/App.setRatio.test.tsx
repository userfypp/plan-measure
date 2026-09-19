/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSession, PageCalibration } from "../types/domain";
import { createPageCalibrationFromRatio } from "../features/calibration/ratioCalibration";
import { getMeasurementCalibration } from "../utils/calibration";
import { lineLengthMm } from "../utils/geometry";
import { createEmptySession, sessionReducer, type SessionCommandResult } from "./sessionState";
import { App } from "./App";

const lifecycleHarness = vi.hoisted(() => ({
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
      lifecycleHarness.latestSession = session;
      lifecycleHarness.loadSession = loadSession;
      useEffect(() => {
        if (!session && lifecycleHarness.initialSession) {
          loadSession(lifecycleHarness.initialSession);
        }
      }, [loadSession, session]);
      return {
        activePdf: { document: {} },
        recovery: null,
        recoveryChecked: true,
        recoveryIssue: null,
        confirmDiscardRecovery: false,
        loading: false,
        autosaveWarning: null,
        autosaveUnavailable: false,
        chooseFile: () => undefined,
        continueRecovery: () => undefined,
        discardRecovery: () => undefined,
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
    children,
    statusMessage,
  }: {
    children: ReactNode;
    statusMessage?: string | null;
  }) => (
    <div>
      {statusMessage && <div role="alert">{statusMessage}</div>}
      {children}
    </div>
  ),
  LoadingOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./WorkspaceShell", () => ({
  WorkspaceShell: ({
    workspacePanel,
    emptyState,
  }: {
    workspacePanel?: ReactNode;
    emptyState?: ReactNode;
  }) => <main>{workspacePanel ?? emptyState}</main>,
  EmptyWorkspaceState: () => null,
}));

vi.mock("./WorkspacePanel", () => ({
  WorkspacePanel: ({ scales }: { scales: ReactNode }) => <aside>{scales}</aside>,
}));

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
  if (root) act(() => root?.unmount());
  container?.remove();
  lifecycleHarness.initialSession = null;
  lifecycleHarness.latestSession = null;
  lifecycleHarness.loadSession = null;
  vi.restoreAllMocks();
  root = null;
  container = null;
});

describe("App Set ratio impact confirmation", () => {
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
