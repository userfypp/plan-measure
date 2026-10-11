/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeasurementDecimalPlaces } from "../types/domain";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { SettingsPopover } from "./SettingsPopover";
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
        <SettingsPopover
          trigger={<span>gear</span>}
          measurementDecimalPlaces={measurementDecimalPlaces}
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

function switchControl(): HTMLInputElement {
  const input = dialog().querySelector<HTMLInputElement>(
    'input[role="switch"][aria-label="Confirm before deleting measurements"]',
  );
  if (!input) throw new Error("Deletion confirmation switch was not rendered.");
  return input;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
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
  root = null;
  container = null;
});

describe("SettingsPopover", () => {
  it("renders a heading-labelled dialog with two sections and no menu semantics", () => {
    renderSettings();
    openSettings();

    const settingsDialog = dialog();
    const heading = Array.from(settingsDialog.querySelectorAll("h2")).find(
      (candidate) => candidate.textContent === "Settings",
    );
    expect(heading).not.toBeUndefined();
    expect(settingsDialog.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(settingsDialog.textContent).toContain("INTERFACE");
    expect(settingsDialog.textContent).toContain("MEASUREMENTS");
    expect(settingsDialog.querySelector('[role="menu"]')).toBeNull();
    expect(settingsDialog.querySelector('[role^="menuitem"]')).toBeNull();
  });

  it("renders Appearance as a Select reflecting the current preference", () => {
    renderSettings({ theme: "dark" });
    openSettings();

    const select = selectByLabel("Appearance");
    expect(dialog().querySelector('[role="radiogroup"], [role="radio"]')).toBeNull();
    expect(select.textContent).toBe("Dark");
    act(() => select.click());
    expect(selectItems().map((option) => option.textContent)).toEqual(["System", "Light", "Dark"]);
    expect(selectItems().map((option) => option.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
    ]);
  });

  it("changes Appearance through the Select, persists it and keeps Settings open", () => {
    renderSettings();
    openSettings();
    const select = selectByLabel("Appearance");
    expect(document.activeElement).toBe(select);

    act(() => select.click());
    act(() => selectItems()[1]!.click());
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(select.textContent).toBe("Light");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("keeps long explanations out of the rows and exposes them from a help button tooltip", () => {
    renderSettings({ onKeyboardAuthoringEnabledChange: vi.fn() });
    openSettings();
    const help = dialog().querySelector<HTMLButtonElement>(
      'button[aria-label="About Keyboard drawing and editing"]',
    )!;
    const description = document.getElementById(help.getAttribute("aria-describedby")!)!;
    expect(description.textContent).toBe(
      "Use arrows to move a cursor, Space to place points and E to edit measurements.",
    );
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    vi.useFakeTimers();
    try {
      act(() => help.focus());
      act(() => {
        vi.advanceTimersByTime(400);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(description.textContent);
    expect(dialog().querySelector('[aria-label="About Recovered plan workspace"]')).not.toBeNull();
  });

  it.each([false, true])("exposes keyboard drawing with current state %s and can toggle it", (enabled) => {
    const onChange = vi.fn();
    renderSettings({ keyboardAuthoringEnabled: enabled, onKeyboardAuthoringEnabledChange: onChange });
    openSettings();
    const control = dialog().querySelector<HTMLInputElement>(
      'input[role="switch"][aria-label="Keyboard drawing and editing"]',
    )!;
    const label = dialog().querySelector<HTMLLabelElement>(`label[for="${control.id}"]`)!;
    const description = document.getElementById(control.getAttribute("aria-describedby")!);
    expect(control.checked).toBe(enabled);
    expect(label.textContent?.trim()).toBe("Keyboard drawing and editing");
    expect(description?.textContent).toContain("arrows to move a cursor");
    expect(description?.textContent).toContain("Space to place points and E to edit measurements");
    act(() => label.click());
    expect(onChange).toHaveBeenCalledWith(!enabled);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("defaults keyboard drawing to disabled when its setting is available", () => {
    renderSettings({ onKeyboardAuthoringEnabledChange: vi.fn() });
    openSettings();
    expect(dialog().querySelector<HTMLInputElement>('input[aria-label="Keyboard drawing and editing"]')?.checked).toBe(false);
  });

  it("renders the recovered workspace select with exact options and keeps the dialog open", () => {
    const callbacks = renderSettings({ recoveredPlanStartupWorkspace: "measurements" });
    openSettings();
    const select = selectByLabel("Recovered plan workspace");

    expect(select.textContent).toBe("Measurements");
    act(() => select.click());
    expect(selectItems().map((option) => option.textContent)).toEqual([
      "Scales",
      "Measurements",
      "Takeoff",
      "Classifications",
    ]);

    act(() => selectItems()[2]!.click());
    expect(callbacks.onRecoveredPlanStartupWorkspaceChange).toHaveBeenCalledWith("takeoff");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("closes only the select list on Escape and keeps the dialog open with focus on the select", () => {
    renderSettings();
    openSettings();
    const select = selectByLabel("Decimal places");
    act(() => select.click());
    expect(selectItems()).toHaveLength(7);
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(selectItems()).toHaveLength(0);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(select);
  });

  it("renders decimal places as numeric options 0 through 6 and keeps the dialog open", () => {
    const callbacks = renderSettings({ measurementDecimalPlaces: 2 });
    openSettings();
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
    ]);

    act(() => selectItems()[6]!.click());
    expect(callbacks.onMeasurementDecimalPlacesChange).toHaveBeenCalledWith(6);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("omits decimal places when there is no current session", () => {
    renderSettings({ measurementDecimalPlaces: null });
    openSettings();

    expect(
      Array.from(dialog().querySelectorAll("label")).some(
        (candidate) => candidate.textContent?.trim() === "Decimal places",
      ),
    ).toBe(false);
    expect(dialog().textContent).not.toContain("Decimal places");
  });

  it("exposes deletion confirmation as a named switch and keeps the dialog open", () => {
    const callbacks = renderSettings({ confirmMeasurementDeletion: false });
    openSettings();
    const control = switchControl();
    const visibleLabel = dialog().querySelector<HTMLLabelElement>(`label[for="${control.id}"]`);

    expect(control.checked).toBe(false);
    expect(control.getAttribute("aria-label")).toBe("Confirm before deleting measurements");
    expect(visibleLabel?.textContent).toBe("Confirm before deleting measurements");

    act(() => visibleLabel?.click());
    expect(callbacks.onConfirmMeasurementDeletionChange).toHaveBeenCalledWith(true);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("shows independent classification confirmation switches with matching labels", () => {
    const valueChange = vi.fn();
    const dimensionChange = vi.fn();
    renderSettings({ confirmValueDeletion: false, confirmDimensionDeletion: true,
      onConfirmValueDeletionChange: valueChange, onConfirmDimensionDeletionChange: dimensionChange });
    openSettings();
    expect(dialog().textContent).toContain("CLASSIFICATIONS");
    const values = dialog().querySelector<HTMLInputElement>('input[aria-label="Confirm before deleting values"]')!;
    const dimensions = dialog().querySelector<HTMLInputElement>('input[aria-label="Confirm before deleting dimensions"]')!;
    expect(values.checked).toBe(false);
    expect(dimensions.checked).toBe(true);
    for (const control of [values, dimensions]) {
      const label = dialog().querySelector<HTMLLabelElement>(`label[for="${control.id}"]`)!;
      expect(label.textContent?.trim()).toBe(control.getAttribute("aria-label"));
      act(() => label.click());
    }
    expect(valueChange).toHaveBeenCalledWith(true);
    expect(dimensionChange).toHaveBeenCalledWith(false);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(switchControl().checked).toBe(true);
  });

  it("keeps Appearance first in the logical Tab order, followed by help buttons, selects and switches", () => {
    renderSettings({ theme: "light", onKeyboardAuthoringEnabledChange: vi.fn(), onConfirmValueDeletionChange: vi.fn(), onConfirmDimensionDeletionChange: vi.fn() });
    openSettings();

    const tabbable = Array.from(
      dialog().querySelectorAll<HTMLElement>("button, input"),
    ).filter((element) => element.tabIndex >= 0);
    expect(tabbable).toHaveLength(9);
    expect(tabbable[0]).toBe(selectByLabel("Appearance"));
    expect(tabbable[0]?.textContent).toBe("Light");
    expect(tabbable[1]?.getAttribute("aria-label")).toBe("About Keyboard drawing and editing");
    expect(tabbable[2]?.getAttribute("aria-label")).toBe("Keyboard drawing and editing");
    expect(tabbable[3]?.getAttribute("aria-label")).toBe("About Recovered plan workspace");
    expect(tabbable[4]).toBe(selectByLabel("Recovered plan workspace"));
    expect(tabbable[5]).toBe(selectByLabel("Decimal places"));
    expect(tabbable[6]).toBe(switchControl());
    expect(tabbable[7]?.getAttribute("aria-label")).toBe("Confirm before deleting values");
    expect(tabbable[8]?.getAttribute("aria-label")).toBe("Confirm before deleting dimensions");
  });

  it("closes backward from the first setting and forward from the last setting", () => {
    renderSettings({ onConfirmValueDeletionChange: vi.fn(), onConfirmDimensionDeletionChange: vi.fn() });
    openSettings();
    const settingsTrigger = trigger();
    const first = selectByLabel("Appearance");
    expect(document.activeElement).toBe(first);

    const backwardTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => first.dispatchEvent(backwardTab));
    expect(backwardTab.defaultPrevented).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).not.toBe(settingsTrigger);

    openSettings();
    const last = dialog().querySelector<HTMLInputElement>('input[aria-label="Confirm before deleting dimensions"]')!;
    act(() => last.focus());
    act(() => {
      last.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe("After settings");
  });

  it("closes on Escape and restores focus to the gear", () => {
    renderSettings();
    const settingsTrigger = trigger();
    openSettings();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(settingsTrigger);
  });

  it("closes on an outside pointer interaction", () => {
    renderSettings();
    openSettings();
    const outside = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.textContent === "After settings",
    );
    if (!outside) throw new Error("Outside test control was not rendered.");

    act(() => outside.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("exposes dialog trigger state through aria-haspopup, aria-expanded, and aria-controls", () => {
    renderSettings();
    const settingsTrigger = trigger();
    expect(settingsTrigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(settingsTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(settingsTrigger.getAttribute("aria-controls")).toBeNull();

    openSettings();
    expect(settingsTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(settingsTrigger.getAttribute("aria-controls")).toBe(dialog().id);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(settingsTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(settingsTrigger.getAttribute("aria-controls")).toBeNull();
  });
});
