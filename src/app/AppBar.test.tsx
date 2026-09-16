/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import buttonStyles from "../components/ui/Button.module.css";
import type { MeasurementDecimalPlaces } from "../types/domain";
import type { RecoveredPlanStartupWorkspace } from "./recoveredPlanStartupPreference";
import { ThemeProvider, SYSTEM_THEME_QUERY, THEME_STORAGE_KEY } from "./themeState";
import { AppBar } from "./AppBar";

class MatchMediaController {
  private dark = false;
  private readonly listeners = new Set<(event: MediaQueryListEvent) => void>();

  readonly matchMedia = (query: string): MediaQueryList => {
    const getMatches = () => (query === SYSTEM_THEME_QUERY ? this.dark : false);
    return {
      media: query,
      get matches() {
        return getMatches();
      },
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        this.listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        this.listeners.delete(listener);
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    } as MediaQueryList;
  };

  setDark(dark: boolean) {
    this.dark = dark;
    const event = { matches: dark, media: SYSTEM_THEME_QUERY } as MediaQueryListEvent;
    for (const listener of this.listeners) listener(event);
  }
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let media: MatchMediaController;

function buttonByLabel(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button ${label} was not rendered.`);
  return button;
}

function settingsItems(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="menu"][aria-label="Settings"] [role="menuitemradio"]'),
  );
}

function settingsCheckboxItems(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      '[role="menu"][aria-label="Settings"] [role="menuitemcheckbox"]',
    ),
  );
}

function openSettings() {
  act(() => buttonByLabel("Settings").click());
}

function chooseTheme(label: string) {
  const item = settingsItems().find((candidate) => candidate.textContent?.includes(label));
  if (!item) throw new Error(`Theme item ${label} was not rendered.`);
  act(() => item.click());
}

function renderAppBar({
  documentName = "North Studio — Level 01.pdf",
  canExport = true,
  measurementDecimalPlaces,
  onOpenPdf = vi.fn(),
  onExport = vi.fn(),
  onMeasurementDecimalPlacesChange,
  confirmMeasurementDeletion,
  onConfirmMeasurementDeletionChange,
  recoveredPlanStartupWorkspace,
  onRecoveredPlanStartupWorkspaceChange,
}: {
  documentName?: string | null;
  canExport?: boolean;
  measurementDecimalPlaces?: MeasurementDecimalPlaces;
  onOpenPdf?: () => void;
  onExport?: () => void;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  confirmMeasurementDeletion?: boolean;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
  recoveredPlanStartupWorkspace?: RecoveredPlanStartupWorkspace;
  onRecoveredPlanStartupWorkspaceChange?: (workspace: RecoveredPlanStartupWorkspace) => void;
} = {}) {
  act(() => {
    root!.render(
      <ThemeProvider>
        <AppBar
          documentName={documentName}
          canExport={canExport}
          measurementDecimalPlaces={measurementDecimalPlaces}
          onOpenPdf={onOpenPdf}
          onExport={onExport}
          onMeasurementDecimalPlacesChange={onMeasurementDecimalPlacesChange}
          confirmMeasurementDeletion={confirmMeasurementDeletion}
          onConfirmMeasurementDeletionChange={onConfirmMeasurementDeletionChange}
          recoveredPlanStartupWorkspace={recoveredPlanStartupWorkspace}
          onRecoveredPlanStartupWorkspaceChange={onRecoveredPlanStartupWorkspaceChange}
        />
      </ThemeProvider>,
    );
  });
  return { onOpenPdf, onExport };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-preference");
  media = new MatchMediaController();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: media.matchMedia,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll('[role="menu"]').forEach((element) => element.remove());
  vi.restoreAllMocks();
  root = null;
  container = null;
});

describe("AppBar", () => {
  it("owns document/global actions without reintroducing Viewer Dock responsibilities", () => {
    const callbacks = renderAppBar();

    expect(container?.textContent).toContain("Plan Measure");
    expect(container?.textContent).toContain("North Studio — Level 01.pdf");
    expect(container?.textContent).not.toContain("View");
    expect(container?.textContent).not.toContain("Active scale");

    const open = Array.from(container?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Open PDF",
    );
    const exportButton = Array.from(container?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Export",
    );
    if (!open || !exportButton) throw new Error("App Bar document actions were not rendered.");
    act(() => open.click());
    act(() => exportButton.click());

    expect(callbacks.onOpenPdf).toHaveBeenCalledOnce();
    expect(callbacks.onExport).toHaveBeenCalledOnce();
    expect(buttonByLabel("Settings")).toBeTruthy();
    expect(document.querySelector('button[aria-label="More actions"]')).toBeNull();
    expect(
      Array.from(container!.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("header button, header a")).map(
        (action) => action.textContent?.trim() || action.getAttribute("aria-label"),
      ),
    ).toEqual(["Open PDF", "Export", "Feedback", "Settings"]);
    const feedback = container?.querySelector<HTMLAnchorElement>('a[href="https://github.com/userfypp/plan-measure/discussions/1"]');
    expect(feedback?.textContent).toBe("Feedback");
    expect(feedback?.target).toBe("_blank");
    expect(feedback?.rel).toBe("noopener noreferrer");
  });

  it("uses the same ghost command hierarchy for Open PDF and Export", () => {
    renderAppBar();
    const actions = Array.from(container!.querySelectorAll<HTMLButtonElement>("header button"));
    const open = actions.find((button) => button.textContent === "Open PDF");
    const exportButton = actions.find((button) => button.textContent === "Export");
    if (!open || !exportButton) throw new Error("App Bar document actions were not rendered.");

    expect(open.classList.contains(buttonStyles.ghost!)).toBe(true);
    expect(exportButton.classList.contains(buttonStyles.ghost!)).toBe(true);
    expect(open.classList.contains(buttonStyles.secondary!)).toBe(false);
    expect(exportButton.classList.contains(buttonStyles.secondary!)).toBe(false);
  });

  it("exposes System, Light, and Dark through the ThemeProvider with radio semantics", () => {
    renderAppBar();
    openSettings();

    let items = settingsItems();
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent?.trim())).toEqual(["System", "Light", "Dark"]);
    expect(items[0]?.querySelector("svg")).not.toBeNull();
    expect(items[1]?.querySelector("svg")).toBeNull();
    expect(items[2]?.querySelector("svg")).toBeNull();
    expect(items[0]?.getAttribute("aria-checked")).toBe("true");

    chooseTheme("Light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.themePreference).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    openSettings();
    chooseTheme("Dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    openSettings();
    chooseTheme("System");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => media.setDark(true));
    expect(document.documentElement.dataset.theme).toBe("dark");

    openSettings();
    items = settingsItems();
    expect(items[0]?.getAttribute("aria-checked")).toBe("true");
  });

  it("groups Appearance and measurement decimals while preserving checked radio options", () => {
    const onMeasurementDecimalPlacesChange = vi.fn();
    renderAppBar({
      measurementDecimalPlaces: 2,
      onMeasurementDecimalPlacesChange,
    });
    openSettings();

    const items = settingsItems();
    const sectionLabels = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="menu"][aria-label="Settings"] [data-menu-section-label="true"]',
      ),
    );
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      "System",
      "Light",
      "Dark",
      "0 decimals",
      "1 decimal",
      "2 decimals",
      "3 decimals",
      "4 decimals",
      "5 decimals",
      "6 decimals",
    ]);
    expect(sectionLabels.map((label) => label.textContent)).toEqual([
      "Appearance",
      "Measurement decimals",
    ]);
    expect(sectionLabels.every((label) => label.getAttribute("role") === "separator")).toBe(true);
    expect(sectionLabels.every((label) => label.getAttribute("tabindex") === null)).toBe(true);
    expect(items[0]?.getAttribute("aria-checked")).toBe("true");
    expect(items[0]?.querySelector("svg")).not.toBeNull();
    expect(items[5]?.getAttribute("aria-checked")).toBe("true");
    expect(items[5]?.querySelector("svg")).not.toBeNull();

    act(() => items[9]?.click());
    expect(onMeasurementDecimalPlacesChange).toHaveBeenCalledWith(6);
  });

  it("navigates all Settings options in order while skipping both section labels", () => {
    renderAppBar({
      measurementDecimalPlaces: 2,
      onMeasurementDecimalPlacesChange: vi.fn(),
    });
    openSettings();

    const items = settingsItems();
    const sectionLabels = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="menu"][aria-label="Settings"] [data-menu-section-label="true"]',
      ),
    );
    expect(document.activeElement).toBe(items[0]);

    for (let index = 1; index < items.length; index += 1) {
      act(() =>
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
        ),
      );
      expect(document.activeElement).toBe(items[index]);
      expect(sectionLabels).not.toContain(document.activeElement);
    }
    expect(items.map((item) => item.tabIndex)).toEqual([
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
    ]);
  });

  it("exposes the reversible measurement deletion confirmation preference as a checkbox item", () => {
    const onConfirmMeasurementDeletionChange = vi.fn();
    renderAppBar({
      confirmMeasurementDeletion: false,
      onConfirmMeasurementDeletionChange,
    });
    openSettings();

    const checkboxItems = settingsCheckboxItems();
    expect(checkboxItems).toHaveLength(1);
    expect(checkboxItems[0]?.textContent?.trim()).toBe("Confirm before deleting measurements");
    expect(checkboxItems[0]?.getAttribute("aria-checked")).toBe("false");
    expect(
      document.querySelector('[role="separator"][aria-label="Measurement deletion"]'),
    ).not.toBeNull();

    act(() => checkboxItems[0]?.click());
    expect(onConfirmMeasurementDeletionChange).toHaveBeenCalledWith(true);
  });

  it("exposes the recovered-plan startup workspace as a checked radio group", () => {
    const onRecoveredPlanStartupWorkspaceChange = vi.fn();
    renderAppBar({
      recoveredPlanStartupWorkspace: "measurements",
      onRecoveredPlanStartupWorkspaceChange,
    });
    openSettings();

    const items = settingsItems();
    const startupItems = items.filter((item) =>
      ["Scales", "Measurements", "Classifications"].includes(item.textContent?.trim() ?? ""),
    );
    expect(startupItems.map((item) => item.textContent?.trim())).toEqual([
      "Scales",
      "Measurements",
      "Classifications",
    ]);
    expect(startupItems.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(
      document.querySelector('[role="separator"][aria-label="Open recovered plans in"]'),
    ).not.toBeNull();

    act(() => startupItems[2]?.click());
    expect(onRecoveredPlanStartupWorkspaceChange).toHaveBeenCalledWith("classifications");
  });

  it("supports keyboard selection for the recovered-plan startup workspace", () => {
    const onRecoveredPlanStartupWorkspaceChange = vi.fn();
    renderAppBar({
      recoveredPlanStartupWorkspace: "scales",
      onRecoveredPlanStartupWorkspaceChange,
    });
    openSettings();

    const classifications = settingsItems().find(
      (item) => item.textContent?.trim() === "Classifications",
    );
    if (!classifications) throw new Error("Classifications startup option was not rendered.");
    act(() => classifications.focus());
    act(() =>
      classifications.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );

    expect(onRecoveredPlanStartupWorkspaceChange).toHaveBeenCalledWith("classifications");
    expect(document.querySelector('[role="menu"][aria-label="Settings"]')).toBeNull();
  });

  it("supports menu keyboard navigation and Escape focus return", () => {
    renderAppBar();
    const trigger = buttonByLabel("Settings");
    openSettings();
    const items = settingsItems();
    expect(document.activeElement).toBe(items[0]);

    act(() => {
      items[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.activeElement).toBe(items[1]);
    act(() => {
      items[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.querySelector('[role="menu"][aria-label="Settings"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    openSettings();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="menu"][aria-label="Settings"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Feedback first-level with its destination and removes the empty More menu", () => {
    renderAppBar();
    const feedback = container?.querySelector<HTMLAnchorElement>("a");
    expect(feedback?.textContent).toBe("Feedback");
    expect(feedback?.href).toBe("https://github.com/userfypp/plan-measure/discussions/1");
    expect(feedback?.target).toBe("_blank");
    expect(feedback?.rel).toBe("noopener noreferrer");
    expect(buttonByLabel("Settings")).toBeTruthy();
    expect(document.querySelector('button[aria-label="More actions"]')).toBeNull();
  });

  it("keeps Export unavailable before a document is open while retaining Feedback and Settings", () => {
    renderAppBar({ documentName: null, canExport: false });

    expect(container?.textContent).toContain("No PDF loaded");
    expect(container?.textContent).not.toContain("Export");
    expect(container?.textContent).toContain("Feedback");
    expect(buttonByLabel("Settings")).toBeTruthy();
    expect(document.querySelector('button[aria-label="More actions"]')).toBeNull();
  });
});
