/* @vitest-environment jsdom */

// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptySession,
  initialSessionState,
  sessionReducer,
  type SessionCommandResult,
} from "../../app/sessionState";
import type { PageCalibration } from "../../types/domain";
import { ViewerDock, type ViewerDockProps } from "./ViewerDock";

const dockCss = readFileSync("src/features/viewer/ViewerDock.module.css", "utf8");
const buttonCss = readFileSync("src/components/ui/Button.module.css", "utf8");
const popoverCss = readFileSync("src/components/ui/Popover.module.css", "utf8");

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const uniform: PageCalibration = {
  id: "ground-floor",
  name: "Ground floor",
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 72, y: 0 },
  referenceDistanceMm: 2540,
};

const xy: PageCalibration = {
  id: "survey-correction",
  name: "Survey correction",
  mode: "xy",
  xReference: {
    start: { x: 0, y: 0 },
    end: { x: 72, y: 0 },
    referenceDistanceMm: 2540,
  },
  yReference: {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 72 },
    referenceDistanceMm: 2489.2,
  },
};

function createProps(overrides: Partial<ViewerDockProps> = {}): ViewerDockProps {
  return {
    navigation: {
      pageNumber: 1,
      pageCount: 3,
      zoom: 1,
      onPageChange: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onFit: vi.fn(),
    },
    calibrations: [uniform, xy],
    activeCalibrationId: uniform.id,
    settings: {
      displayUnit: "m",
      showLabels: true,
      showMeasurements: true,
      showCalibration: true,
    },
    onScaleChange: vi.fn(),
    onSettingsChange: vi.fn(),
    ...overrides,
  };
}

function renderDock(props: ViewerDockProps) {
  act(() => root!.render(<ViewerDock {...props} />));
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button with label ${label} was not rendered.`);
  return button;
}

function activeScaleTrigger(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith("Active scale:"),
  );
  if (!button) throw new Error("Active scale trigger was not rendered.");
  return button;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll('[role="menu"], [role="dialog"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("ViewerDock", () => {
  it("wires page, zoom, and Fit commands while disabling page boundaries", () => {
    const props = createProps();
    renderDock(props);

    expect(buttonByLabel("Previous page").disabled).toBe(true);
    act(() => buttonByLabel("Next page").click());
    expect(props.navigation.onPageChange).toHaveBeenCalledWith(2);
    act(() => buttonByLabel("Zoom out").click());
    act(() => buttonByLabel("Zoom in").click());
    act(() => buttonByLabel("Fit page to viewer").click());
    expect(props.navigation.onZoomOut).toHaveBeenCalledOnce();
    expect(props.navigation.onZoomIn).toHaveBeenCalledOnce();
    expect(props.navigation.onFit).toHaveBeenCalledOnce();

    renderDock(
      createProps({
        navigation: { ...props.navigation, pageNumber: 3 },
      }),
    );
    expect(buttonByLabel("Next page").disabled).toBe(true);
  });

  it("shows unambiguous active-scale identity and switches through a radio menu", () => {
    const props = createProps();
    renderDock(props);
    const trigger = activeScaleTrigger();

    expect(trigger.textContent).toContain("Ground floor");
    expect(trigger.textContent).toContain("1:100 · Uniform");
    expect(trigger.getAttribute("aria-label")).toContain("Ground floor");
    expect(trigger.querySelector<HTMLElement>("[data-scale-full-name]")?.textContent).toBe(
      "Ground floor",
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    act(() => trigger.click());
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("aria-checked")).toBe("true");
    expect(items[0]?.getAttribute("aria-current")).toBe("true");
    expect(items[0]?.querySelector("svg")).not.toBeNull();
    expect(items[1]?.querySelector("svg")).toBeNull();
    expect(items[1]?.textContent).toContain("Survey correction");
    expect(items[1]?.textContent).toContain("X 1:100 · Y 1:98 · X/Y");

    act(() => items[1]?.click());
    expect(props.onScaleChange).toHaveBeenCalledWith("survey-correction");
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("keeps every essential Dock command present for deterministic visual condensation", () => {
    renderDock(createProps());

    expect(buttonByLabel("Previous page")).toBeTruthy();
    expect(buttonByLabel("Next page")).toBeTruthy();
    expect(buttonByLabel("Zoom out")).toBeTruthy();
    expect(buttonByLabel("Zoom in")).toBeTruthy();
    expect(buttonByLabel("Fit page to viewer")).toBeTruthy();
    expect(activeScaleTrigger()).toBeTruthy();
    expect(buttonByLabel("View options")).toBeTruthy();
  });

  it("keeps the Dock in native sequential focus order with shared focus-visible states", () => {
    renderDock(
      createProps({
        navigation: {
          ...createProps().navigation,
          pageNumber: 2,
        },
      }),
    );

    const dock = document.querySelector<HTMLElement>('nav[aria-label="Viewer controls"]');
    if (!dock) throw new Error("Viewer Dock was not rendered.");
    const controls = Array.from(dock.querySelectorAll<HTMLButtonElement>("button"));
    expect(controls.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Previous page",
      "Next page",
      "Zoom out",
      "Zoom in",
      "Fit page to viewer",
      expect.stringMatching(/^Active scale:/),
      "View options",
    ]);
    expect(controls.every((button) => button.tabIndex === 0)).toBe(true);
    expect(controls.some((button) => button.tabIndex > 0)).toBe(false);
    for (const control of controls) {
      act(() => control.focus());
      expect(document.activeElement).toBe(control);
    }
    expect(buttonCss).toMatch(/\.button:focus-visible\s*\{[^}]*outline:\s*var\(--focus-outline\);/s);
    expect(popoverCss).toMatch(/\.trigger:focus-visible\s*\{[^}]*outline:\s*var\(--focus-outline\);/s);
  });

  it("uses bounded content sizing and deterministic condensation instead of hidden scrolling", () => {
    expect(dockCss).toContain("width: fit-content");
    expect(dockCss).toContain("width: auto");
    expect(dockCss).toContain("max-width: min(220px, 30vw)");
    expect(dockCss).not.toContain("overflow-x: auto");
    expect(dockCss).not.toContain("scrollbar-width: none");
    expect(dockCss).toContain("@container (max-width: 600px)");
    expect(dockCss).toContain("@container (max-width: 500px)");
    expect(dockCss).toContain("@container (max-width: 460px)");
    expect(dockCss).toContain("@container (max-width: 360px)");
  });

  it("locks active-scale switching during calibration/reference workflows", () => {
    renderDock(createProps({ scaleSwitchDisabled: true }));

    expect(activeScaleTrigger().disabled).toBe(false);
    expect(activeScaleTrigger().getAttribute("aria-disabled")).toBe("true");
    expect(activeScaleTrigger().getAttribute("aria-label")).toContain("Switching unavailable");
    expect(activeScaleTrigger().title).toBe(
      "Finish or cancel the current scale workflow before switching active scale.",
    );
    expect(activeScaleTrigger().querySelector("strong")?.getAttribute("title")).toBeNull();
    act(() => activeScaleTrigger().click());
    expect(document.querySelector('[role="menu"][aria-label="Active scale"]')).toBeNull();
  });

  it("keeps camera controls available while page changes are locked by an in-progress workflow", () => {
    const props = createProps({ pageNavigationDisabled: true });
    renderDock(props);

    expect(buttonByLabel("Previous page").disabled).toBe(false);
    expect(buttonByLabel("Next page").disabled).toBe(false);
    expect(buttonByLabel("Previous page").getAttribute("aria-disabled")).toBe("true");
    expect(buttonByLabel("Next page").getAttribute("aria-disabled")).toBe("true");
    const nextReason = buttonByLabel("Next page").getAttribute("aria-describedby");
    expect(document.getElementById(nextReason!)?.textContent).toContain("Finish or cancel");
    act(() => buttonByLabel("Next page").click());
    expect(props.navigation.onPageChange).not.toHaveBeenCalled();
    expect(buttonByLabel("Zoom out").disabled).toBe(false);
    expect(buttonByLabel("Zoom in").disabled).toBe(false);
    expect(buttonByLabel("Fit page to viewer").disabled).toBe(false);
    expect(buttonByLabel("View options").disabled).toBe(false);
  });

  it("moves the existing View settings into a Popover without changing their commands", () => {
    const props = createProps();
    renderDock(props);
    const trigger = buttonByLabel("View options");

    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[role="dialog"][aria-label="View options"]')).not.toBeNull();

    const select = document.querySelector<HTMLSelectElement>('[role="dialog"] select');
    if (!select) throw new Error("Display unit select was not rendered.");
    act(() => {
      select.value = "cm";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ displayUnit: "cm" });

    const labelsSwitch = Array.from(document.querySelectorAll<HTMLInputElement>('[role="switch"]'))[0];
    if (!labelsSwitch) throw new Error("Labels switch was not rendered.");
    act(() => labelsSwitch.click());
    expect(props.onSettingsChange).toHaveBeenCalledWith({ showLabels: false });
  });

  it("closes View when focus moves to another Dock control and preserves that focus", () => {
    renderDock(createProps());
    const view = buttonByLabel("View options");
    const zoomIn = buttonByLabel("Zoom in");

    act(() => view.click());
    expect(view.getAttribute("aria-expanded")).toBe("true");

    act(() => zoomIn.focus());

    expect(document.querySelector('[role="dialog"][aria-label="View options"]')).toBeNull();
    expect(view.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(zoomIn);
  });

  it("returns focus to the View trigger when View closes with Escape", () => {
    renderDock(createProps());
    const view = buttonByLabel("View options");
    act(() => view.click());

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.querySelector('[role="dialog"][aria-label="View options"]')).toBeNull();
    expect(document.activeElement).toBe(view);
  });

  it("switching the Dock active scale preserves existing measurement calibration links", () => {
    let state: SessionCommandResult = {
      ...initialSessionState,
      session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1),
    };
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Scale 1",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-a",
      measurementType: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-2",
      name: "Scale 2",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 5000,
      },
    });
    state = sessionReducer(state, {
      type: "SET_ACTIVE_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
    });
    const page = state.session!.pages[1]!;

    renderDock(
      createProps({
        calibrations: page.calibrations,
        activeCalibrationId: page.activeCalibrationId,
        onScaleChange: (calibrationId) => {
          state = sessionReducer(state, {
            type: "SET_ACTIVE_CALIBRATION",
            pageNumber: 1,
            calibrationId,
          });
        },
      }),
    );
    act(() => activeScaleTrigger().click());
    const scaleTwo = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    ).find((item) => item.textContent?.includes("Scale 2"));
    if (!scaleTwo) throw new Error("Scale 2 item was not rendered.");
    act(() => scaleTwo.click());

    expect(state.session!.pages[1]!.activeCalibrationId).toBe("scale-2");
    expect(state.session!.pages[1]!.measurements[0]!.calibrationId).toBe("scale-1");

    state = sessionReducer(state, {
      type: "ADD_MEASUREMENT",
      pageNumber: 1,
      id: "line-b",
      measurementType: "line",
      points: [
        { x: 0, y: 1 },
        { x: 10, y: 1 },
      ],
    });
    expect(state.session!.pages[1]!.measurements.map((measurement) => measurement.calibrationId)).toEqual([
      "scale-1",
      "scale-2",
    ]);
  });
});
