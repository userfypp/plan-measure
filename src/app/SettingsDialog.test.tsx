/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassificationDimension, MeasurementDecimalPlaces } from "../types/domain";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { SettingsButton } from "./SettingsButton";
import type { ProjectViewSettings } from "./SettingsDialog";
import {
  APP_PREFERENCES_STORAGE_KEY,
  reloadAppPreferencesFromStorage,
} from "../utils/appPreferences";
import { SHORTCUT_GROUPS } from "../utils/shortcutReference";
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
  classificationDimensions?: ClassificationDimension[];
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
  classificationDimensions = [],
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
        <SettingsButton
          trigger={<span>gear</span>}
          measurementDecimalPlaces={measurementDecimalPlaces}
          viewSettings={viewSettings}
          classificationDimensions={classificationDimensions}
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

async function openSettings() {
  await import("./SettingsDialog");
  await act(async () => {
    trigger().click();
  });
}

function dialog(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!element) throw new Error("Settings dialog was not rendered.");
  return element;
}

function selectByLabel(label: string): HTMLButtonElement {
  const labelElement = Array.from(
    dialog().querySelectorAll<HTMLElement>("[class*='settingLabel']"),
  ).find((candidate) => candidate.textContent?.trim() === label);
  const control = labelElement?.id
    ? dialog().querySelector(`button[aria-labelledby~="${labelElement.id}"]`)
    : null;
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
  document.documentElement.removeAttribute("data-focus-ring");
  document.documentElement.removeAttribute("data-text-size");
  document.documentElement.removeAttribute("data-contrast");
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
  it("renders a labelled dialog with a vertical tablist of eight sections", async () => {
    renderSettings();
    await openSettings();

    const settingsDialog = dialog();
    const heading = settingsDialog.querySelector("h2");
    expect(heading?.textContent).toBe("Settings");
    expect(settingsDialog.getAttribute("aria-labelledby")).toBe(heading?.id);
    const tabs = Array.from(settingsDialog.querySelectorAll('[role="tab"]'));
    expect(tabs.map((candidate) => candidate.textContent)).toEqual([
      "Interface",
      "Accessibility",
      "Measurements",
      "Drawing",
      "View",
      "Canvas",
      "Confirmations",
      "Shortcuts",
      "Performance",
      "Advanced",
    ]);
    expect(tabs.map((candidate) => candidate.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
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

  it("switches sections by click and by arrow keys with a roving tabindex", async () => {
    renderSettings();
    await openSettings();

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
    act(() => {
      tab("Interface").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(tab("Accessibility").getAttribute("aria-selected")).toBe("true");
    act(() => {
      tab("Accessibility").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }),
      );
    });
    expect(tab("Interface").getAttribute("aria-selected")).toBe("true");
  });

  it("lists every shortcut in a read-only Shortcuts section", async () => {
    renderSettings();
    await openSettings();
    openTab("Shortcuts");

    const panel = dialog().querySelector('[role="tabpanel"]');
    expect(panel?.querySelectorAll("h3")).toHaveLength(SHORTCUT_GROUPS.length);
    expect(panel?.querySelectorAll("button, input, select, a, [tabindex]")).toHaveLength(0);
    const rows = Array.from(panel?.querySelectorAll("dl > div") ?? []).map((row) => [
      row.querySelector("dt")?.textContent,
      row.querySelector("kbd")?.textContent,
    ]);
    expect(rows).toEqual(
      SHORTCUT_GROUPS.flatMap((group) => group.entries.map((entry) => [entry.label, entry.keys])),
    );
  });

  it("toggles larger touch targets on <html> from the Accessibility section", async () => {
    renderSettings();
    await openSettings();
    openTab("Accessibility");

    act(() => switchControl("Larger touch targets")?.click());
    expect(document.documentElement.dataset.targets).toBe("large");
    act(() => switchControl("Larger touch targets")?.click());
    expect(document.documentElement.dataset.targets).toBeUndefined();
  });

  it("shows project view settings under View and writes them back", async () => {
    const { onViewSettingsChange } = renderSettings({
      viewSettings: {
        displayUnit: "m",
        areaDisplay: "auto",
        showLabels: true,
        showMeasurements: true,
        showCalibration: false,
        labelClassificationDimensionId: null,
        measureClouds: false,
      },
    });
    await openSettings();
    openTab("View");

    expect(selectByLabel("Display unit").textContent).toBe("Metres");
    choose("Display unit", "Feet");
    expect(onViewSettingsChange).toHaveBeenLastCalledWith({ displayUnit: "ft" });
    choose("Polygon area", "Acres");
    expect(onViewSettingsChange).toHaveBeenLastCalledWith({ areaDisplay: "ac" });
    expect(switchControl("Calibration").checked).toBe(false);
    act(() => switchControl("Calibration").click());
    expect(onViewSettingsChange).toHaveBeenLastCalledWith({ showCalibration: true });
    expect(switchControl("Measure clouds").checked).toBe(false);
    expect(dialog().textContent).toContain("so they may not be exact");
    act(() => switchControl("Measure clouds").click());
    expect(onViewSettingsChange).toHaveBeenLastCalledWith({ measureClouds: true });
  });

  describe("Label classification", () => {
    const viewSettings = {
      displayUnit: "m" as const,
      areaDisplay: "auto" as const,
      showLabels: true,
      showMeasurements: true,
      showCalibration: true,
      labelClassificationDimensionId: null,
      measureClouds: false,
    };
    const dimensions: ClassificationDimension[] = [
      { id: "trade", name: "Trade", archived: false, values: [] },
      { id: "old", name: "Old phase", archived: true, values: [] },
    ];

    it("lists active dimensions and writes the choice back", async () => {
      const { onViewSettingsChange } = renderSettings({
        viewSettings,
        classificationDimensions: dimensions,
      });
      await openSettings();
      openTab("View");

      expect(selectByLabel("Label classification").textContent).toBe("None");
      choose("Label classification", "Trade");
      expect(onViewSettingsChange).toHaveBeenLastCalledWith({
        labelClassificationDimensionId: "trade",
      });
      expect(dialog().textContent).not.toContain("Old phase");
    });

    it("keeps an archived selected dimension and can reset to None", async () => {
      const { onViewSettingsChange } = renderSettings({
        viewSettings: { ...viewSettings, labelClassificationDimensionId: "old" },
        classificationDimensions: dimensions,
      });
      await openSettings();
      openTab("View");

      expect(selectByLabel("Label classification").textContent).toBe("Old phase");
      choose("Label classification", "None");
      expect(onViewSettingsChange).toHaveBeenLastCalledWith({
        labelClassificationDimensionId: null,
      });
    });

    it("is disabled without classification dimensions", async () => {
      renderSettings({ viewSettings });
      await openSettings();
      openTab("View");

      expect(selectByLabel("Label classification").hasAttribute("disabled")).toBe(true);
    });
  });

  it("stores line thickness and label size per device and explains missing projects", async () => {
    renderSettings({ viewSettings: null });
    await openSettings();
    openTab("View");

    expect(dialog().textContent).toContain("Open a plan to change its display unit");
    openTab("Canvas");
    choose("Line thickness", "Thick");
    choose("Label size", "Small");
    const stored = JSON.parse(window.localStorage.getItem("plan-measure.preferences") ?? "{}");
    expect(stored.lineThickness).toBe("thick");
    expect(stored.labelSize).toBe("small");
  });

  it("stores fill, handle, label background, after-finishing and zoom step per device", async () => {
    renderSettings({ viewSettings: null });
    await openSettings();
    openTab("Canvas");
    choose("Fill opacity", "Strong");
    choose("Handle size", "Large");
    choose("Label background", "Translucent");
    expect(selectByLabel("Label text").textContent).toBe("Auto");
    choose("Label text", "Red");
    openTab("Drawing");
    choose("After finishing", "Select");
    openTab("Interface");
    choose("Zoom step", "Coarse");
    const stored = JSON.parse(window.localStorage.getItem("plan-measure.preferences") ?? "{}");
    expect(stored).toMatchObject({
      fillOpacity: "strong",
      handleSize: "large",
      labelBackground: "translucent",
      labelTextColor: "red",
      afterFinishing: "select",
      zoomStep: "coarse",
    });
  });

  it("stores the interface, drawing, label content and grid preferences per device", async () => {
    renderSettings({ viewSettings: null });
    await openSettings();
    choose("Default zoom", "Fit width");
    choose("Mouse wheel", "Scroll");
    choose("Date format", "With time");
    act(() => switchControl("Wider sidebar").click());
    openTab("Drawing");
    act(() => switchControl("Crosshair cursor").click());
    act(() => switchControl("Live segment length").click());
    act(() => switchControl("Finish on double-click").click());
    openTab("Measurements");
    choose("Label content", "Name and value");
    openTab("Canvas");
    choose("Page grid", "Fine");
    const stored = JSON.parse(window.localStorage.getItem("plan-measure.preferences") ?? "{}");
    expect(stored).toMatchObject({
      defaultZoom: "fit-width",
      wheelBehavior: "pan",
      dateFormat: "with-time",
      widerSidebar: true,
      crosshairCursor: false,
      liveLength: true,
      finishOnDoubleClick: true,
      labelContent: "name-value",
      pageGrid: "fine",
    });
  });

  it("renders Appearance as a Select and persists the change while keeping Settings open", async () => {
    renderSettings({ theme: "dark" });
    await openSettings();

    const select = selectByLabel("Appearance");
    expect(select.textContent).toBe("Dark");
    act(() => select.click());
    expect(selectItems().map((option) => option.textContent)).toEqual(["System", "Light", "Dark"]);
    act(() => selectItems()[1]!.click());
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(select.textContent).toBe("Light");
    expect((dialog() as HTMLDialogElement).open).toBe(true);
  });

  it("keeps explanations out of the rows and exposes them from a help button", async () => {
    renderSettings({ onKeyboardAuthoringEnabledChange: vi.fn() });
    await openSettings();

    const help = dialog().querySelector<HTMLButtonElement>(
      'button[aria-label="About Keyboard drawing and editing"]',
    );
    expect(help).not.toBeNull();
    const description = document.getElementById(help!.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Space to place points");
    // Names are plain text, not <label for>, so clicking one never activates its control.
    expect(dialog().querySelector("label[for]")).toBeNull();
    // No description text is rendered visibly inside any row.
    expect(
      Array.from(dialog().querySelectorAll("p")).some((p) =>
        p.textContent?.includes("Space to place points"),
      ),
    ).toBe(false);
  });

  it("offers every ambiguous advanced and drawing setting a help button", async () => {
    renderSettings();
    await openSettings();
    openTab("Drawing");
    for (const label of ["Snap on by default", "Ortho on by default", "Snap sensitivity"]) {
      expect(dialog().querySelector(`button[aria-label="About ${label}"]`)).not.toBeNull();
    }
    openTab("Performance");
    for (const label of ["Maximum zoom", "Undo history", "Render delay"]) {
      expect(dialog().querySelector(`button[aria-label="About ${label}"]`)).not.toBeNull();
    }
  });

  it("renders decimal places as options 0 through 8 and reports the change", async () => {
    const { onMeasurementDecimalPlacesChange } = renderSettings();
    await openSettings();
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

  it("does not activate a control when its name is clicked", async () => {
    renderSettings();
    await openSettings();
    openTab("Accessibility");
    const name = Array.from(dialog().querySelectorAll<HTMLElement>("[class*='settingLabel']")).find(
      (candidate) => candidate.textContent === "High contrast",
    );
    const toggle = dialog().querySelector<HTMLInputElement>(
      'input[role="switch"][aria-label="High contrast"]',
    );
    expect(name).toBeTruthy();
    act(() => name?.click());
    expect(toggle?.checked).toBe(false);
  });

  it("gives the storage usage output its row name", async () => {
    renderSettings();
    await openSettings();
    openTab("Advanced");
    const output = Array.from(dialog().querySelectorAll<HTMLOutputElement>("output")).find(
      (candidate) => candidate.className.includes("storageUsage"),
    );
    const labelId = output?.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)?.textContent).toBe("Storage used");
  });

  it("omits decimal places when there is no current session", async () => {
    renderSettings({ measurementDecimalPlaces: null });
    await openSettings();
    openTab("Measurements");
    expect(
      Array.from(dialog().querySelectorAll("[class*='settingLabel']")).some(
        (label) => label.textContent === "Decimal places",
      ),
    ).toBe(false);
  });

  it("applies number separators to the live preview and persists them per device", async () => {
    renderSettings();
    await openSettings();
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

  it("toggles reduce motion and tooltips through document attributes", async () => {
    renderSettings();
    await openSettings();
    openTab("Accessibility");

    choose("Reduce motion", "Always reduce");
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
    const tooltips = switchControl("Show tooltips");
    expect(tooltips.checked).toBe(true);
    act(() => tooltips.click());
    expect(document.documentElement.getAttribute("data-tooltips")).toBe("off");
  });

  it("sets the focus ring attribute only when it is not the default", async () => {
    renderSettings();
    await openSettings();
    openTab("Accessibility");

    expect(document.documentElement.hasAttribute("data-focus-ring")).toBe(false);
    choose("Focus ring", "Thick");
    expect(document.documentElement.getAttribute("data-focus-ring")).toBe("thick");
    choose("Focus ring", "Normal");
    expect(document.documentElement.hasAttribute("data-focus-ring")).toBe(false);
  });

  it("sets the text size attribute only when it is not 100%", async () => {
    renderSettings();
    await openSettings();
    openTab("Accessibility");

    expect(document.documentElement.hasAttribute("data-text-size")).toBe(false);
    choose("Text size", "125%");
    expect(document.documentElement.getAttribute("data-text-size")).toBe("125");
    choose("Text size", "110%");
    expect(document.documentElement.getAttribute("data-text-size")).toBe("110");
    choose("Text size", "100%");
    expect(document.documentElement.hasAttribute("data-text-size")).toBe(false);
  });

  it("sets the contrast attribute only while High contrast is on", async () => {
    renderSettings();
    await openSettings();
    openTab("Accessibility");

    const contrast = switchControl("High contrast");
    expect(contrast.checked).toBe(false);
    expect(document.documentElement.hasAttribute("data-contrast")).toBe(false);
    act(() => contrast.click());
    expect(document.documentElement.getAttribute("data-contrast")).toBe("more");
    act(() => contrast.click());
    expect(document.documentElement.hasAttribute("data-contrast")).toBe(false);
  });

  it("stores advanced values as numbers and resets everything after confirmation", async () => {
    renderSettings();
    await openSettings();
    openTab("Performance");

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

    openTab("Advanced");
    const reset = Array.from(dialog().querySelectorAll("button")).find(
      (button) => button.textContent === "Reset…",
    )!;
    act(() => reset.click());
    const confirm = Array.from(dialog().querySelectorAll("button")).find(
      (button) => button.textContent === "Reset",
    )!;
    act(() => confirm.click());
    openTab("Performance");
    expect(selectByLabel("Maximum zoom").textContent).toBe("8×");
    expect(selectByLabel("Undo history").textContent).toBe("100 steps");
    expect(selectByLabel("Render delay").textContent).toBe("90 ms");
  });

  it("stores the performance options, shows them under Performance and resets them", async () => {
    renderSettings();
    await openSettings();
    openTab("Performance");
    expect(selectByLabel("Render quality").textContent).toBe("Balanced");
    expect(selectByLabel("Raster cache").textContent).toBe("Normal");
    expect(selectByLabel("Click tolerance").textContent).toBe("Normal");
    expect(switchControl("Debug overlay").checked).toBe(false);
    choose("Render quality", "Fast");
    choose("Raster cache", "Large");
    choose("Click tolerance", "Wide");
    act(() => switchControl("Debug overlay").click());
    expect(
      JSON.parse(window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({
      renderQuality: "fast",
      rasterCache: "large",
      hitTolerance: "wide",
      debugOverlay: true,
    });
    openTab("Advanced");
    act(() =>
      Array.from(dialog().querySelectorAll("button"))
        .find((button) => button.textContent === "Reset…")!
        .click(),
    );
    act(() =>
      Array.from(dialog().querySelectorAll("button"))
        .find((button) => button.textContent === "Reset")!
        .click(),
    );
    openTab("Performance");
    expect(selectByLabel("Render quality").textContent).toBe("Balanced");
    expect(selectByLabel("Raster cache").textContent).toBe("Normal");
    expect(selectByLabel("Click tolerance").textContent).toBe("Normal");
    expect(switchControl("Debug overlay").checked).toBe(false);
  });

  it("cancels a pending reset without changing anything", async () => {
    renderSettings();
    await openSettings();
    openTab("Performance");
    choose("Maximum zoom", "4×");
    openTab("Advanced");
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
    openTab("Performance");
    expect(selectByLabel("Maximum zoom").textContent).toBe("4×");
    openTab("Advanced");
    expect(
      Array.from(dialog().querySelectorAll("button")).some((b) => b.textContent === "Reset…"),
    ).toBe(true);
  });

  it("exposes independent deletion confirmation switches in Confirmations", async () => {
    const { onConfirmMeasurementDeletionChange } = renderSettings({
      onConfirmValueDeletionChange: vi.fn(),
      onConfirmDimensionDeletionChange: vi.fn(),
    });
    await openSettings();
    openTab("Confirmations");

    expect(switchControl("Confirm before deleting values")).not.toBeNull();
    expect(switchControl("Confirm before deleting dimensions")).not.toBeNull();
    const measurements = switchControl("Confirm before deleting measurements");
    expect(measurements.checked).toBe(true);
    act(() => measurements.click());
    expect(onConfirmMeasurementDeletionChange).toHaveBeenCalledWith(false);
    expect((dialog() as HTMLDialogElement).open).toBe(true);
  });

  it("renders the recovered workspace select with exact options", async () => {
    const { onRecoveredPlanStartupWorkspaceChange } = renderSettings();
    await openSettings();

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

  it("closes on Escape, on Done, and restores focus to the gear", async () => {
    renderSettings();
    trigger().focus();
    await openSettings();
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

    await openSettings();
    act(() =>
      Array.from(dialog().querySelectorAll("button"))
        .find((button) => button.textContent === "Done")!
        .click(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the help button only on settings that are not self-explanatory", async () => {
    renderSettings({
      onKeyboardAuthoringEnabledChange: vi.fn(),
      onRecoveredPlanStartupWorkspaceChange: vi.fn(),
      viewSettings: {
        displayUnit: "m",
        areaDisplay: "auto",
        showLabels: true,
        showMeasurements: true,
        showCalibration: true,
        labelClassificationDimensionId: null,
        measureClouds: false,
      },
    });
    await openSettings();
    const helpLabels = () =>
      Array.from(dialog().querySelectorAll("button[aria-label^='About ']")).map((button) =>
        button.getAttribute("aria-label"),
      );
    expect(helpLabels()).toEqual([
      "About Keyboard drawing and editing",
      "About Recovered plan workspace",
    ]);
    openTab("View");
    expect(helpLabels()).toEqual([
      "About Polygon area",
      "About Measure clouds",
      "About Label classification",
      "About Labels",
      "About Measurements",
      "About Calibration",
    ]);
    // Where canvas appearance lives is told in the visibility tooltips, not in a note below them.
    expect(dialog().textContent).not.toContain("appearance settings are in");
    openTab("Canvas");
    expect(helpLabels()).toEqual(["About Label text"]);
    openTab("Confirmations");
    expect(helpLabels()).toEqual([]);
    openTab("Performance");
    expect(helpLabels()).toEqual([
      "About Maximum zoom",
      "About Undo history",
      "About Render delay",
      "About Render quality",
      "About Raster cache",
      "About Click tolerance",
      "About Debug overlay",
    ]);
    openTab("Advanced");
    expect(helpLabels()).toEqual([]);
  });

  it("stores the autosave delay, projects shown and closing confirmation", async () => {
    renderSettings();
    await openSettings();
    openTab("Advanced");
    expect(selectByLabel("Autosave delay").textContent).toBe("0.3 s");
    act(() => selectByLabel("Autosave delay").click());
    expect(selectItems().map((option) => option.textContent)).toEqual([
      "0.3 s",
      "1 s",
      "3 s",
      "10 s",
    ]);
    act(() => selectItems()[0]!.click());
    choose("Autosave delay", "3 s");
    expect(selectByLabel("Saved projects shown").textContent).toBe("All");
    choose("Saved projects shown", "10");
    openTab("Confirmations");
    expect(switchControl("Confirm before closing unsaved work").checked).toBe(false);
    act(() => switchControl("Confirm before closing unsaved work").click());
    expect(
      JSON.parse(window.localStorage.getItem("plan-measure.preferences") ?? "{}"),
    ).toMatchObject({
      autosaveDelayMs: 3000,
      projectsShown: "10",
      confirmBeforeClosing: true,
    });
  });

  it("exports the settings file and imports one, ignoring invalid values", async () => {
    renderSettings();
    await openSettings();
    openTab("Advanced");
    const createObjectURL = vi.fn(() => "blob:settings");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const button = (label: string) =>
      Array.from(dialog().querySelectorAll("button")).find((b) => b.textContent === label)!;
    act(() => button("Export settings").click());
    expect(click).toHaveBeenCalledOnce();
    const exportedBlob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(exportedBlob.type).toContain("application/json");

    const input = dialog().querySelector<HTMLInputElement>('input[type="file"]')!;
    const status = () => dialog().querySelector('[role="status"]')!.textContent;
    const importFile = async (contents: string) => {
      const file = new File([contents], "settings.json", { type: "application/json" });
      Object.defineProperty(file, "text", { value: () => Promise.resolve(contents) });
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    expect(status()).toBe("");
    await importFile(
      JSON.stringify({ version: 1, preferences: { lineThickness: "thick", labelSize: "huge" } }),
    );
    expect(status()).toBe("Settings imported");
    expect(
      JSON.parse(window.localStorage.getItem("plan-measure.preferences") ?? "{}"),
    ).toMatchObject({
      lineThickness: "thick",
      labelSize: "normal",
    });
    await importFile("{broken");
    expect(status()).toBe("Couldn't import: not a valid settings file");
    expect(
      JSON.parse(window.localStorage.getItem("plan-measure.preferences") ?? "{}"),
    ).toMatchObject({
      lineThickness: "thick",
    });
  });

  it("shows read-only storage usage with a fallback when the API is missing", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        estimate: () => Promise.resolve({ usage: 5.25 * 1024 * 1024, quota: 2048 * 1024 * 1024 }),
      },
    });
    renderSettings();
    await openSettings();
    openTab("Advanced");
    await act(async () => undefined);
    expect(dialog().textContent).toContain("Using 5.3 MB of 2048 MB");
    expect(
      Array.from(dialog().querySelectorAll("button")).some((b) =>
        /clear|delete/i.test(b.textContent ?? ""),
      ),
    ).toBe(false);

    Reflect.deleteProperty(navigator, "storage");
    openTab("Interface");
    openTab("Advanced");
    await act(async () => undefined);
    expect(dialog().textContent).toContain("Not available in this browser");
  });
});
