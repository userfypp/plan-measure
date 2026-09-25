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
    sourcePageLabel: "A-1",
    customPageLabel: null,
    effectivePageLabel: "A-1",
    calibrations: [uniform, xy],
    activeCalibrationId: uniform.id,
    settings: {
      displayUnit: "m",
      areaDisplay: "auto",
      showLabels: true,
      showMeasurements: true,
      showCalibration: true,
    },
    onScaleChange: vi.fn(),
    onApplyCopiedScale: vi.fn(),
    onSetPageLabelOverride: vi.fn(),
    onRemovePageLabelOverride: vi.fn(),
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

function press(key: string) {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

function activeScaleTrigger(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.getAttribute("aria-label")?.startsWith("Active scale:"),
  );
  if (!button) throw new Error("Active scale trigger was not rendered.");
  return button;
}

function pageLabelTrigger(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => {
      const label = candidate.getAttribute("aria-label") ?? "";
      return label.includes("page label") || label.startsWith("Page label:");
    },
  );
  if (!button) throw new Error("Page label trigger was not rendered.");
  return button;
}

function pageLabelDialog(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Page label"]');
  if (!dialog) throw new Error("Page label dialog was not rendered.");
  return dialog;
}

function pageLabelInput(): HTMLInputElement {
  const input = pageLabelDialog().querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) throw new Error("Page label input was not rendered.");
  return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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
  document
    .querySelectorAll('[role="menu"], [role="dialog"]')
    .forEach((element) => element.remove());
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
    const items = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
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

  it("handles zero and one scale without changing the active-scale selector semantics", () => {
    renderDock(createProps({ calibrations: [], activeCalibrationId: null }));
    let trigger = activeScaleTrigger();
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent).toContain("No active scale");
    expect(trigger.textContent).toContain("Create a scale to measure");
    expect(trigger.getAttribute("aria-label")).toBe(
      "Active scale: none. Create a scale to measure.",
    );

    renderDock(createProps({ calibrations: [uniform], activeCalibrationId: uniform.id }));
    trigger = activeScaleTrigger();
    expect(trigger.disabled).toBe(false);
    expect(trigger.textContent).toContain("Ground floor");
    expect(trigger.textContent).toContain("1:100 · Uniform");
    act(() => trigger.click());
    const items = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.getAttribute("aria-checked")).toBe("true");
    expect(items[0]?.getAttribute("aria-current")).toBe("true");
  });

  it("shows a visible apply action in the Viewer Dock for a copied scale", () => {
    const props = createProps({ copiedScaleName: "Ground floor" });
    renderDock(props);

    const apply = buttonByLabel("Apply copied scale to this page");
    expect(apply.textContent).toContain("Apply copied scale");
    expect(apply.title).toContain("Ground floor");
    act(() => apply.click());
    expect(props.onApplyCopiedScale).toHaveBeenCalledOnce();

    renderDock(createProps());
    expect(document.querySelector('button[aria-label="Apply copied scale to this page"]')).toBeNull();
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

  it("exposes one sequential Tab stop per Dock toolbar and preserves individual menu triggers", () => {
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
      "Page label: A-1. Page 2 of 3. Edit page label",
      "Next page",
      "Zoom out",
      "Zoom in",
      "Fit page to viewer",
      expect.stringMatching(/^Active scale:/),
      "View options",
    ]);
    expect(
      controls
        .filter((button) => button.tabIndex === 0)
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Previous page",
      "Zoom out",
      expect.stringMatching(/^Active scale:/),
      "View options",
    ]);
    expect(
      Array.from(dock.querySelectorAll<HTMLElement>("[role='toolbar']")).map((toolbar) => ({
        label: toolbar.getAttribute("aria-label"),
        tabStops: Array.from(toolbar.querySelectorAll<HTMLElement>("button")).filter(
          (button) => button.tabIndex === 0,
        ).length,
      })),
    ).toEqual([
      { label: "Page navigation", tabStops: 1 },
      { label: "Zoom controls", tabStops: 1 },
    ]);
    expect(controls.some((button) => button.tabIndex > 0)).toBe(false);
    for (const control of controls) {
      act(() => control.focus());
      expect(document.activeElement).toBe(control);
    }
    expect(buttonCss).toMatch(
      /\.button:focus-visible\s*\{[^}]*outline:\s*var\(--focus-outline\);/s,
    );
    expect(popoverCss).toMatch(
      /\.trigger:focus-visible\s*\{[^}]*outline:\s*var\(--focus-outline\);/s,
    );
  });

  it("moves through page and zoom commands with arrows, Home, and End", () => {
    renderDock(
      createProps({
        navigation: { ...createProps().navigation, pageNumber: 2 },
      }),
    );
    const previous = buttonByLabel("Previous page");
    const page = pageLabelTrigger();
    const next = buttonByLabel("Next page");

    expect(previous.tabIndex).toBe(0);
    act(() => previous.focus());
    press("ArrowRight");
    expect(document.activeElement).toBe(page);
    press("ArrowRight");
    expect(document.activeElement).toBe(next);
    press("Home");
    expect(document.activeElement).toBe(previous);
    press("End");
    expect(document.activeElement).toBe(next);
    expect([previous, page, next].filter((control) => control.tabIndex === 0)).toEqual([next]);

    const zoomOut = buttonByLabel("Zoom out");
    const zoomIn = buttonByLabel("Zoom in");
    const fit = buttonByLabel("Fit page to viewer");
    expect(zoomOut.tabIndex).toBe(0);
    act(() => zoomOut.focus());
    press("ArrowRight");
    expect(document.activeElement).toBe(zoomIn);
    press("ArrowRight");
    expect(document.activeElement).toBe(fit);
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
    expect(dockCss).toMatch(/\.pageTriggerText strong\s*\{[^}]*text-overflow:\s*ellipsis;/s);
    expect(dockCss).not.toMatch(/\.pageTrigger[^}]*display:\s*none/s);
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
    act(() => pageLabelTrigger().click());
    expect(pageLabelDialog()).toBeTruthy();
  });

  it("shows the effective label and physical page reference, including the no-label state", () => {
    renderDock(createProps());
    let trigger = pageLabelTrigger();
    expect(trigger.textContent).toContain("A-1");
    expect(trigger.textContent).toContain("1 / 3");
    expect(trigger.getAttribute("aria-label")).toBe(
      "Page label: A-1. Page 1 of 3. Edit page label",
    );
    expect(trigger.title).toBe("A-1");

    renderDock(
      createProps({ sourcePageLabel: null, customPageLabel: null, effectivePageLabel: "" }),
    );
    trigger = pageLabelTrigger();
    expect(trigger.textContent).toContain("No label");
    expect(trigger.textContent).toContain("1 / 3");
    expect(trigger.getAttribute("aria-label")).toBe("Page 1 of 3. No page label. Set page label");
  });

  it("opens the page-label editor with focused selected effective content and source metadata", () => {
    renderDock(createProps());
    act(() => pageLabelTrigger().click());

    const input = pageLabelInput();
    expect(input.value).toBe("A-1");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(3);
    expect(pageLabelDialog().textContent).toContain("PDF label: A-1");
    expect(pageLabelDialog().querySelector("button")?.textContent).not.toContain("Restore");
  });

  it("saves a trimmed custom label with Save and restores focus", () => {
    const props = createProps();
    renderDock(props);
    const trigger = pageLabelTrigger();
    act(() => trigger.click());
    setInputValue(pageLabelInput(), "  A-101  ");
    const save = Array.from(pageLabelDialog().querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Save",
    );
    if (!save) throw new Error("Save button was not rendered.");
    act(() => save.click());

    expect(props.onSetPageLabelOverride).toHaveBeenCalledWith("A-101");
    expect(props.onRemovePageLabelOverride).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"][aria-label="Page label"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("saves with Enter", () => {
    const props = createProps({ sourcePageLabel: null, effectivePageLabel: "" });
    renderDock(props);
    act(() => pageLabelTrigger().click());
    const input = pageLabelInput();
    setInputValue(input, "Δ-2");
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(props.onSetPageLabelOverride).toHaveBeenCalledWith("Δ-2");
    expect(document.querySelector('[role="dialog"][aria-label="Page label"]')).toBeNull();
  });

  it("discards draft on Escape and Cancel and restores focus", () => {
    const props = createProps();
    renderDock(props);
    const trigger = pageLabelTrigger();
    act(() => trigger.click());
    setInputValue(pageLabelInput(), "Discard me");
    act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(props.onSetPageLabelOverride).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);

    act(() => trigger.click());
    setInputValue(pageLabelInput(), "Discard again");
    const cancel = Array.from(pageLabelDialog().querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Cancel",
    );
    if (!cancel) throw new Error("Cancel button was not rendered.");
    act(() => cancel.click());
    expect(props.onSetPageLabelOverride).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("discards the draft when focus leaves the page-label popover", () => {
    const props = createProps();
    renderDock(props);
    act(() => pageLabelTrigger().click());
    setInputValue(pageLabelInput(), "Discard on focus leave");

    act(() => buttonByLabel("Zoom in").focus());

    expect(document.querySelector('[role="dialog"][aria-label="Page label"]')).toBeNull();
    expect(props.onSetPageLabelOverride).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(buttonByLabel("Zoom in"));

    act(() => pageLabelTrigger().click());
    expect(pageLabelInput().value).toBe("A-1");
  });

  it("restores the PDF label or removes a custom-only label immediately", () => {
    const restoreProps = createProps({ customPageLabel: "Custom", effectivePageLabel: "Custom" });
    renderDock(restoreProps);
    let trigger = pageLabelTrigger();
    act(() => trigger.click());
    const restore = Array.from(
      pageLabelDialog().querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Restore PDF label");
    if (!restore) throw new Error("Restore PDF label button was not rendered.");
    act(() => restore.click());
    expect(restoreProps.onRemovePageLabelOverride).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);

    const removeProps = createProps({
      sourcePageLabel: null,
      customPageLabel: "Custom",
      effectivePageLabel: "Custom",
    });
    renderDock(removeProps);
    trigger = pageLabelTrigger();
    act(() => trigger.click());
    const remove = Array.from(pageLabelDialog().querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Remove label",
    );
    if (!remove) throw new Error("Remove label button was not rendered.");
    expect(pageLabelDialog().textContent).toContain("PDF label: None");
    act(() => remove.click());
    expect(removeProps.onRemovePageLabelOverride).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });

  it("avoids source-equal and unchanged-source overrides", () => {
    const sourceEqual = createProps();
    renderDock(sourceEqual);
    act(() => pageLabelTrigger().click());
    setInputValue(pageLabelInput(), "  A-1  ");
    const save = Array.from(pageLabelDialog().querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Save",
    );
    if (!save) throw new Error("Save button was not rendered.");
    act(() => save.click());
    expect(sourceEqual.onSetPageLabelOverride).not.toHaveBeenCalled();
    expect(sourceEqual.onRemovePageLabelOverride).not.toHaveBeenCalled();

    const spaced = createProps({ sourcePageLabel: " A ", effectivePageLabel: " A " });
    renderDock(spaced);
    act(() => pageLabelTrigger().click());
    const unchangedSave = Array.from(
      pageLabelDialog().querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Save");
    if (!unchangedSave) throw new Error("Save button was not rendered.");
    act(() => unchangedSave.click());
    expect(spaced.onSetPageLabelOverride).not.toHaveBeenCalled();
    expect(spaced.onRemovePageLabelOverride).not.toHaveBeenCalled();
  });

  it("keeps a long full label accessible while the visual label is bounded", () => {
    const label = "A very long page label that must not expand the Viewer Dock indefinitely";
    renderDock(createProps({ sourcePageLabel: label, effectivePageLabel: label }));
    const trigger = pageLabelTrigger();
    expect(trigger.title).toBe(label);
    expect(trigger.getAttribute("aria-label")).toContain(label);
    expect(dockCss).toMatch(/\.pageTrigger\s*\{[^}]*max-width:/s);
  });

  it("closes and discards the draft when the physical page changes", () => {
    const props = createProps();
    renderDock(props);
    act(() => pageLabelTrigger().click());
    setInputValue(pageLabelInput(), "Page one draft");

    renderDock(
      createProps({
        navigation: { ...props.navigation, pageNumber: 2 },
        sourcePageLabel: "B-2",
        effectivePageLabel: "B-2",
      }),
    );
    expect(document.querySelector('[role="dialog"][aria-label="Page label"]')).toBeNull();
    expect(props.onSetPageLabelOverride).not.toHaveBeenCalled();

    act(() => pageLabelTrigger().click());
    expect(pageLabelInput().value).toBe("B-2");
  });

  it("moves the existing View settings into a Popover without changing their commands", () => {
    const props = createProps();
    renderDock(props);
    const trigger = buttonByLabel("View options");

    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[role="dialog"][aria-label="View options"]')).not.toBeNull();

    const selects = Array.from(
      document.querySelectorAll<HTMLSelectElement>('[role="dialog"] select'),
    );
    const [select, areaSelect] = selects;
    if (!select || !areaSelect) throw new Error("View selectors were not rendered.");
    expect(Array.from(select.options).map((option) => [option.value, option.textContent])).toEqual([
      ["mm", "Millimetres"],
      ["cm", "Centimetres"],
      ["m", "Metres"],
      ["in", "Inches"],
      ["ft", "Feet"],
      ["ft-in", "Feet & inches"],
    ]);
    expect(
      Array.from(areaSelect.options).map((option) => [option.value, option.textContent]),
    ).toEqual([
      ["auto", "Auto"],
      ["ac", "Acres"],
    ]);
    act(() => {
      select.value = "ft-in";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ displayUnit: "ft-in" });
    expect(document.querySelector('[role="dialog"][aria-label="View options"]')).not.toBeNull();

    act(() => {
      areaSelect.value = "ac";
      areaSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ areaDisplay: "ac" });
    expect(document.querySelector('[role="dialog"][aria-label="View options"]')).not.toBeNull();

    const labelsSwitch = Array.from(
      document.querySelectorAll<HTMLInputElement>('[role="switch"]'),
    )[0];
    if (!labelsSwitch) throw new Error("Labels switch was not rendered.");
    const labelsText = Array.from(labelsSwitch.labels ?? []).find((label) =>
      label.textContent?.includes("Labels"),
    );
    if (!labelsText) throw new Error("Labels text label was not rendered.");
    act(() => labelsText.click());
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
    expect(
      state.session!.pages[1]!.measurements.map((measurement) => measurement.calibrationId),
    ).toEqual(["scale-1", "scale-2"]);
  });

  it("reflects a renamed active scale without changing its calibration ID", () => {
    let state: SessionCommandResult = {
      ...initialSessionState,
      session: createEmptySession({ name: "plan.pdf", size: 100, lastModified: 1 }, 1),
    };
    state = sessionReducer(state, {
      type: "ADD_CALIBRATION",
      pageNumber: 1,
      id: "scale-1",
      name: "Ground floor",
      calibration: {
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    });
    const beforeId = state.session!.pages[1]!.activeCalibrationId;
    renderDock(
      createProps({
        calibrations: state.session!.pages[1]!.calibrations,
        activeCalibrationId: beforeId,
      }),
    );
    expect(activeScaleTrigger().getAttribute("aria-label")).toContain("Ground floor");

    state = sessionReducer(state, {
      type: "RENAME_CALIBRATION",
      pageNumber: 1,
      calibrationId: "scale-1",
      name: "Ground floor revised",
    });
    renderDock(
      createProps({
        calibrations: state.session!.pages[1]!.calibrations,
        activeCalibrationId: state.session!.pages[1]!.activeCalibrationId,
      }),
    );

    expect(activeScaleTrigger().getAttribute("aria-label")).toContain("Ground floor revised");
    expect(state.session!.pages[1]!.activeCalibrationId).toBe(beforeId);
  });
});
