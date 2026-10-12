/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeasurementDecimalPlaces } from "../types/domain";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { SettingsDialog, type ProjectViewSettings } from "./SettingsDialog";
import {
  APP_PREFERENCES_STORAGE_KEY,
  reloadAppPreferencesFromStorage,
} from "../utils/appPreferences";
import { THEME_STORAGE_KEY, ThemeProvider, type ThemePreference } from "./themeState";

class MatchMediaController {
  readonly matchMedia = (query: string): MediaQueryList =>
    ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }) as MediaQueryList;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

interface RenderOptions {
  theme?: ThemePreference;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  viewSettings?: ProjectViewSettings | null;
  onViewSettingsChange?: (settings: Partial<ProjectViewSettings>) => void;
  keyboardAuthoringEnabled?: boolean;
  confirmMeasurementDeletion?: boolean;
  confirmValueDeletion?: boolean;
  confirmDimensionDeletion?: boolean;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onKeyboardAuthoringEnabledChange?: (enabled: boolean) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
  onConfirmValueDeletionChange?: (enabled: boolean) => void;
  onConfirmDimensionDeletionChange?: (enabled: boolean) => void;
  onRecoveredPlanStartupWorkspaceChange?: (workspace: RecoveredPlanStartupWorkspace) => void;
}

function renderSettings({
  theme = "system",
  measurementDecimalPlaces = 2,
  viewSettings = null,
  onViewSettingsChange = vi.fn(),
  keyboardAuthoringEnabled = false,
  confirmMeasurementDeletion = true,
  confirmValueDeletion = true,
  confirmDimensionDeletion = true,
  recoveredPlanStartupWorkspace = "scales",
  onMeasurementDecimalPlacesChange = vi.fn(),
  onKeyboardAuthoringEnabledChange,
  onConfirmMeasurementDeletionChange = vi.fn(),
  onConfirmValueDeletionChange,
  onConfirmDimensionDeletionChange,
  onRecoveredPlanStartupWorkspaceChange = vi.fn(),
}: RenderOptions = {}) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  act(() => {
    root!.render(
      <ThemeProvider>
        <SettingsDialog
          trigger={<span>gear</span>}
          measurementDecimalPlaces={measurementDecimalPlaces}
          viewSettings={viewSettings}
          onViewSettingsChange={onViewSettingsChange}
          keyboardAuthoringEnabled={keyboardAuthoringEnabled}
          confirmMeasurementDeletion={confirmMeasurementDeletion}
          confirmValueDeletion={confirmValueDeletion}
          confirmDimensionDeletion={confirmDimensionDeletion}
          recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
          onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
          onKeyboardAuthoringEnabledChange={onKeyboardAuthoringEnabledChange}
          onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
          onConfirmValueDeletionChange={onConfirmValueDeletionChange}
          onConfirmDimensionDeletionChange={onConfirmDimensionDeletionChange}
          onRecoveredPlanStartupWorkspaceChange={onRecoveredPlanStartupWorkspaceChange}
        />
        <button type="button">After settings</button>
      </ThemeProvider>,
    );
  });
  return {
    onViewSettingsChange,
    onMeasurementDecimalPlacesChange,
    onConfirmMeasurementDeletionChange,
    onRecoveredPlanStartupWorkspaceChange,
  };
}

function trigger(): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
  if (!element) throw new Error("Settings trigger was not rendered.");
  return element;
}

function openSettings() {
  act(() => trigger().click());
}

function dialog(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!element) throw new Error("Settings dialog was not rendered.");
  return element;
}

function selectByLabel(label: string): HTMLButtonElement {
  const labelElement = Array.from(dialog().querySelectorAll<HTMLLabelElement>("label")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  const control = labelElement?.htmlFor ? document.getElementById(labelElement.htmlFor) : null;
  if (!(control instanceof HTMLButtonElement)) {
    throw new Error(`Select ${label} was not rendered.`);
  }
  return control;
}

function selectItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
}

function switchControl(label: string): HTMLInputElement {
  const input = dialog().querySelector<HTMLInputElement>(
    `input[role="switch"][aria-label="${label}"]`,
  );
  if (!input) throw new Error(`Switch ${label} was not rendered.`);
  return input;
}

function tab(label: string): HTMLButtonElement {
  const element = Array.from(dialog().querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!element) throw new Error(`Tab ${label} was not rendered.`);
  return element;
}

function openTab(label: string) {
  act(() => tab(label).click());
}

function choose(label: string, option: string) {
  act(() => selectByLabel(label).click());
  const item = selectItems().find((candidate) => candidate.textContent === option);
  if (!item) throw new Error(`Option ${option} was not rendered.`);
  act(() => item.click());
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
  window.localStorage.clear();
  reloadAppPreferencesFromStorage();
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("data-tooltips");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-preference");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: new MatchMediaController().matchMedia,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  root = null;
  container = null;
});

describe("SettingsDialog", () => {
  it("renders a labelled dialog with a vertical tablist of six sections", () => {
    renderSettings();
    openSettings();

    const settingsDialog = dialog();
    const heading = settingsDialog.querySelector("h2");
    expect(heading?.textContent).toBe("Settings");
    expect(settingsDialog.getAttribute("aria-labelledby")).toBe(heading?.id);
    const tabs = Array.from(settingsDialog.querySelectorAll('[role="tab"]'));
    expect(tabs.map((candidate) => candidate.textContent)).toEqual([
      "Interface",
      "Measurements",
      "Drawing",
      "View",
      "Confirmations",
      "Advanced",
    ]);
    expect(tabs.map((candidate) => candidate.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
      "false",
    ]);
    expect(settingsDialog.querySelector('[role="tablist"]')?.getAttribute("aria-orientation")).toBe(
      "vertical",
    );
    expect(settingsDialog.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(
      tabs[0]?.id,
    );
    expect(settingsDialog.querySelector('[role="menu"]')).toBeNull();
  });

  it("switches sections by click and by arrow keys with a roving tabindex", () => {
    renderSettings();
    openSettings();

    openTab("Drawing");
    expect(tab("Drawing").getAttribute("aria-selected")).toBe("true");
    expect(tab("Drawing").tabIndex).toBe(0);
    expect(tab("Interface").tabIndex).toBe(-1);
    expect(switchControl("Snap on by default")).not.toBeNull();

    act(() => {
      tab("Drawing").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(tab("View").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("View"));

    act(() => {
      tab("View").dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }),
      );
    });
    expect(tab("Advanced").getAttribute("aria-selected")).toBe("true");
    act(() => {
      tab("Advanced").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(tab("Interface").getAttribute("aria-selected")).toBe("true");
  });

  it("shows project view settings under View and writes them back", () => {
    const { onViewSettingsChange } = renderSettings({
      viewSettings: {
        displayUnit: "m",
        areaDisplay: "auto",
        showLabels: true,
        showMeasurements: true,
        showCalibration: false,
      },
    });
    openSettings();
    openTab("View");

    expect(selectByLabel("Display unit").textContent).toBe("Metres");
    choose("Display unit", "Feet");
    expect(onViewSettingsChange).toHaveBeenLastCalledWith({ displayUnit: "ft" });
    choose("Polygon area", "Acres");
    expect(onViewSettingsChange).toHaveBeenLastCalledWith({ areaDisplay: "ac" });
    expect(switchControl("Calibration").checked).toBe(false);
    act(() => switchControl("Calibration").click());
    expect(onViewSettingsChange).toHaveBeenLastCalledWith({ showCalibration: true });
  });

  it("stores line thickness and label size per device and explains missing projects", () => {
    renderSettings({ viewSettings: null });
    openSettings();
    openTab("View");

    expect(dialog().textContent).toContain("Open a plan to change its display unit");
    choose("Line thickness", "Thick");
    choose("Label size", "Small");
    const stored = JSON.parse(window.localStorage.getItem("plan-measure.preferences") ?? "{}");
    expect(stored.lineThickness).toBe("thick");
    expect(stored.labelSize).toBe("small");
  });

  it("renders Appearance as a Select and persists the change while keeping Settings open", () => {
    renderSettings({ theme: "dark" });
    openSettings();

    const select = selectByLabel("Appearance");
    expect(select.textContent).toBe("Dark");
    act(() => select.click());
    expect(selectItems().map((option) => option.textContent)).toEqual(["System", "Light", "Dark"]);
    act(() => selectItems()[1]!.click());
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(select.textContent).toBe("Light");
    expect((dialog() as HTMLDialogElement).open).toBe(true);
  });

  it("keeps explanations out of the rows and exposes them from a help button", () => {
    renderSettings({ onKeyboardAuthoringEnabledChange: vi.fn() });
    openSettings();

    const help = dialog().querySelector<HTMLButtonElement>(
      'button[aria-label="About Keyboard drawing and editing"]',
    );
    expect(help).not.toBeNull();
    const description = document.getElementById(help!.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Space to place points");
    const label = dialog().querySelector<HTMLLabelElement>('label[for]:not([for=""])');
    expect(label).not.toBeNull();
    // No description text is rendered visibly inside any row.
    expect(
      Array.from(dialog().querySelectorAll("p")).some((p) =>
        p.textContent?.includes("Space to place points"),
      ),
    ).toBe(false);
  });

  it("offers every ambiguous advanced and drawing setting a help button", () => {
    renderSettings();
    openSettings();
    openTab("Drawing");
    for (const label of ["Snap on by default", "Ortho on by default", "Snap sensitivity"]) {
      expect(dialog().querySelector(`button[aria-label="About ${label}"]`)).not.toBeNull();
    }
    openTab("Advanced");
    for (const label of ["Maximum zoom", "Undo history", "Render delay"]) {
      expect(dialog().querySelector(`button[aria-label="About ${label}"]`)).not.toBeNull();
    }
  });

  it("renders decimal places as options 0 through 8 and reports the change", () => {
    const { onMeasurementDecimalPlacesChange } = renderSettings();
    openSettings();
    openTab("Measurements");

    const select = selectByLabel("Decimal places");
    expect(select.textContent).toBe("2");
    act(() => select.click());
    expect(selectItems().map((option) => option.textContent)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
    act(() => selectItems()[5]!.click());
    expect(onMeasurementDecimalPlacesChange).toHaveBeenCalledWith(5);
  });

  it("omits decimal places when there is no current session", () => {
    renderSettings({ measurementDecimalPlaces: null });
    openSettings();
    openTab("Measurements");
    expect(
      Array.from(dialog().querySelectorAll("label")).some(
        (label) => label.textContent === "Decimal places",
      ),
    ).toBe(false);
  });

  it("applies number separators to the live preview and persists them per device", () => {
    renderSettings();
    openSettings();
    openTab("Measurements");

    const preview = () => dialog().querySelector("output")?.textContent;
    expect(preview()).toBe("1234567.89");
    choose("Thousands separator", "Comma");
    expect(preview()).toBe("1,234,567.89");
    choose("Decimal separator", "Comma");
    // Same glyph for both roles is ambiguous, so grouping is dropped.
    expect(preview()).toBe("1234567,89");
    choose("Thousands separator", "Point");
    expect(preview()).toBe("1.234.567,89");
    expect(
      JSON.parse(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({
      thousandsSeparator: "point",
      decimalSeparator: "comma",
    });
  });

  it("toggles reduce motion and tooltips through document attributes", () => {
    renderSettings();
    openSettings();

    choose("Reduce motion", "Always reduce");
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
    const tooltips = switchControl("Show tooltips");
    expect(tooltips.checked).toBe(true);
    act(() => tooltips.click());
    expect(document.documentElement.getAttribute("data-tooltips")).toBe("off");
  });

  it("stores advanced values as numbers and resets everything after confirmation", () => {
    renderSettings();
    openSettings();
    openTab("Advanced");

    choose("Maximum zoom", "16×");
    choose("Undo history", "200 steps");
    choose("Render delay", "150 ms");
    expect(
      JSON.parse(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({
      maxZoom: 16,
      undoDepth: 200,
      renderDelayMs: 150,
    });

    const reset = Array.from(dialog().querySelectorAll("button")).find(
      (button) => button.textContent === "Reset…",
    )!;
    act(() => reset.click());
    expect(selectByLabel("Maximum zoom").textContent).toBe("16×");
    const confirm = Array.from(dialog().querySelectorAll("button")).find(
      (button) => button.textContent === "Reset",
    )!;
    act(() => confirm.click());
    expect(selectByLabel("Maximum zoom").textContent).toBe("8×");
    expect(selectByLabel("Undo history").textContent).toBe("100 steps");
    expect(selectByLabel("Render delay").textContent).toBe("90 ms");
  });

  it("cancels a pending reset without changing anything", () => {
    renderSettings();
    openSettings();
    openTab("Advanced");
    choose("Maximum zoom", "4×");
    act(() =>
      Array.from(dialog().querySelectorAll("button"))
        .find((button) => button.textContent === "Reset…")!
        .click(),
    );
    act(() =>
      Array.from(dialog().querySelectorAll("button"))
        .find((button) => button.textContent === "Cancel")!
        .click(),
    );
    expect(selectByLabel("Maximum zoom").textContent).toBe("4×");
    expect(
      Array.from(dialog().querySelectorAll("button")).some((b) => b.textContent === "Reset…"),
    ).toBe(true);
  });

  it("exposes independent deletion confirmation switches in Confirmations", () => {
    const { onConfirmMeasurementDeletionChange } = renderSettings({
      onConfirmValueDeletionChange: vi.fn(),
      onConfirmDimensionDeletionChange: vi.fn(),
    });
    openSettings();
    openTab("Confirmations");

    expect(switchControl("Confirm before deleting values")).not.toBeNull();
    expect(switchControl("Confirm before deleting dimensions")).not.toBeNull();
    const measurements = switchControl("Confirm before deleting measurements");
    expect(measurements.checked).toBe(true);
    act(() => measurements.click());
    expect(onConfirmMeasurementDeletionChange).toHaveBeenCalledWith(false);
    expect((dialog() as HTMLDialogElement).open).toBe(true);
  });

  it("renders the recovered workspace select with exact options", () => {
    const { onRecoveredPlanStartupWorkspaceChange } = renderSettings();
    openSettings();

    const select = selectByLabel("Recovered plan workspace");
    expect(select.textContent).toBe("Scales");
    act(() => select.click());
    expect(selectItems().map((option) => option.textContent)).toEqual([
      "Scales",
      "Measurements",
      "Takeoff",
      "Classifications",
    ]);
    act(() => selectItems()[2]!.click());
    expect(onRecoveredPlanStartupWorkspaceChange).toHaveBeenCalledWith("takeoff");
  });

  it("closes on Escape, on Done, and restores focus to the gear", () => {
    renderSettings();
    trigger().focus();
    openSettings();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");

    act(() => {
      dialog().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());

    openSettings();
    act(() =>
      Array.from(dialog().querySelectorAll("button"))
        .find((button) => button.textContent === "Done")!
        .click(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
