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
  confirmMeasurementDeletion?: boolean;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
  onRecoveredPlanStartupWorkspaceChange?: (workspace: RecoveredPlanStartupWorkspace) => void;
}

function renderSettings({
  theme = "system",
  measurementDecimalPlaces = 2,
  confirmMeasurementDeletion = true,
  recoveredPlanStartupWorkspace = "scales",
  onMeasurementDecimalPlacesChange = vi.fn(),
  onConfirmMeasurementDeletionChange = vi.fn(),
  onRecoveredPlanStartupWorkspaceChange = vi.fn(),
}: RenderOptions = {}) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  act(() => {
    root!.render(
      <ThemeProvider>
        <SettingsPopover
          trigger={<span>gear</span>}
          measurementDecimalPlaces={measurementDecimalPlaces}
          confirmMeasurementDeletion={confirmMeasurementDeletion}
          recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
          onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
          onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
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

function radios(): HTMLButtonElement[] {
  return Array.from(dialog().querySelectorAll<HTMLButtonElement>('[role="radio"]'));
}

function selectByLabel(label: string): HTMLSelectElement {
  const labelElement = Array.from(dialog().querySelectorAll<HTMLLabelElement>("label")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  const control = labelElement?.htmlFor ? document.getElementById(labelElement.htmlFor) : null;
  if (!(control instanceof HTMLSelectElement)) {
    throw new Error(`Select ${label} was not rendered.`);
  }
  return control;
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

  it("exposes Appearance as one roving radio group and reflects the current preference", () => {
    renderSettings({ theme: "dark" });
    openSettings();

    const group = dialog().querySelector('[role="radiogroup"]');
    const options = radios();
    expect(group).not.toBeNull();
    expect(options.map((option) => option.textContent)).toEqual(["System", "Light", "Dark"]);
    expect(options.map((option) => option.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
    ]);
    expect(options.map((option) => option.tabIndex)).toEqual([-1, -1, 0]);
    expect(document.activeElement).toBe(options[2]);
  });

  it("changes Appearance with arrow keys, moves focus, and keeps Settings open", () => {
    renderSettings();
    openSettings();
    const options = radios();
    expect(document.activeElement).toBe(options[0]);

    act(() => {
      options[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      );
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(radios()[1]?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios()[1]);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      radios()[1]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.activeElement).toBe(radios()[2]);
  });

  it("renders the recovered workspace select with exact options and keeps the dialog open", () => {
    const callbacks = renderSettings({ recoveredPlanStartupWorkspace: "measurements" });
    openSettings();
    const select = selectByLabel("Recovered plan workspace");

    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      "Scales",
      "Measurements",
      "Takeoff",
      "Classifications",
    ]);
    expect(select.value).toBe("measurements");

    act(() => {
      select.value = "takeoff";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(callbacks.onRecoveredPlanStartupWorkspaceChange).toHaveBeenCalledWith("takeoff");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("renders decimal places as numeric options 0 through 6 and keeps the dialog open", () => {
    const callbacks = renderSettings({ measurementDecimalPlaces: 2 });
    openSettings();
    const select = selectByLabel("Decimal places");

    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(select.value).toBe("2");

    act(() => {
      select.value = "6";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
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
    expect(visibleLabel?.textContent).toBe("Confirm before deleting");

    act(() => visibleLabel?.click());
    expect(callbacks.onConfirmMeasurementDeletionChange).toHaveBeenCalledWith(true);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("keeps exactly one Appearance option in the logical Tab order before the selects and switch", () => {
    renderSettings({ theme: "light" });
    openSettings();

    const tabbable = Array.from(
      dialog().querySelectorAll<HTMLElement>("button, select, input"),
    ).filter((element) => element.tabIndex >= 0);
    expect(tabbable).toHaveLength(4);
    expect(tabbable[0]?.getAttribute("role")).toBe("radio");
    expect(tabbable[0]?.textContent).toBe("Light");
    expect(tabbable[1]).toBe(selectByLabel("Recovered plan workspace"));
    expect(tabbable[2]).toBe(selectByLabel("Decimal places"));
    expect(tabbable[3]).toBe(switchControl());
  });

  it("closes backward from the first setting and forward from the last setting", () => {
    renderSettings();
    openSettings();
    const settingsTrigger = trigger();
    const first = radios()[0]!;
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
    const last = switchControl();
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
