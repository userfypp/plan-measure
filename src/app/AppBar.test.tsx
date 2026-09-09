/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  onOpenPdf = vi.fn(),
  onExport = vi.fn(),
}: {
  documentName?: string | null;
  canExport?: boolean;
  onOpenPdf?: () => void;
  onExport?: () => void;
} = {}) {
  act(() => {
    root!.render(
      <ThemeProvider>
        <AppBar
          documentName={documentName}
          canExport={canExport}
          onOpenPdf={onOpenPdf}
          onExport={onExport}
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
    expect(buttonByLabel("More actions")).toBeTruthy();
  });

  it("exposes System, Light, and Dark through the ThemeProvider with radio semantics", () => {
    renderAppBar();
    openSettings();

    let items = settingsItems();
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent?.trim())).toEqual(["✓System", "Light", "Dark"]);
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

  it("moves Feedback into the bounded global More menu and keeps its destination", () => {
    renderAppBar();
    const trigger = buttonByLabel("More actions");
    act(() => trigger.click());

    const moreMenu = document.querySelector('[role="menu"][aria-label="More actions"]');
    const items = Array.from(moreMenu?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? []);
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain("Feedback");
    expect(items[0]?.href).toBe("https://github.com/userfypp/plan-measure/discussions/1");
    expect(items[0]?.target).toBe("_blank");
    expect(items[0]?.rel).toBe("noopener noreferrer");

    items[0]?.addEventListener("click", (event) => event.preventDefault(), { once: true });
    act(() => {
      items[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(document.querySelector('[role="menu"][aria-label="More actions"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Export unavailable before a document is open while retaining global Settings and More", () => {
    renderAppBar({ documentName: null, canExport: false });

    expect(container?.textContent).toContain("No PDF loaded");
    expect(container?.textContent).not.toContain("Export");
    expect(buttonByLabel("Settings")).toBeTruthy();
    expect(buttonByLabel("More actions")).toBeTruthy();
  });
});
