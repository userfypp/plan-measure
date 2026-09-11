/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SYSTEM_THEME_QUERY,
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
  type ThemePreference,
} from "./themeState";

class MatchMediaController {
  private dark = false;
  private readonly listeners = new Set<(event: MediaQueryListEvent) => void>();

  constructor(initialDark = false) {
    this.dark = initialDark;
  }

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

function ThemeProbe() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <output data-testid="theme-state">{`${preference}:${resolvedTheme}`}</output>
      {(["system", "light", "dark"] as ThemePreference[]).map((nextPreference) => (
        <button key={nextPreference} type="button" onClick={() => setPreference(nextPreference)}>
          {nextPreference}
        </button>
      ))}
    </div>
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let media: MatchMediaController;

function installMatchMedia(initialDark = false) {
  media = new MatchMediaController(initialDark);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: media.matchMedia,
  });
}

function renderThemeProvider() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
  });
}

function stateText(): string {
  return container?.querySelector('[data-testid="theme-state"]')?.textContent ?? "";
}

function choose(preference: ThemePreference) {
  const button = Array.from(container?.querySelectorAll("button") ?? []).find(
    (candidate) => candidate.textContent === preference,
  );
  if (!button) throw new Error(`Theme button ${preference} was not rendered.`);
  act(() => button.click());
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-preference");
  document.documentElement.style.colorScheme = "";
  installMatchMedia(false);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ThemeProvider", () => {
  it("defaults a missing preference to System", () => {
    renderThemeProvider();

    expect(stateText()).toBe("system:light");
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("sanitizes an invalid stored preference to System", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    renderThemeProvider();

    expect(stateText()).toBe("system:light");
  });

  it.each(["light", "dark"] as const)("restores explicit %s", (preference) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    renderThemeProvider();

    expect(stateText()).toBe(`${preference}:${preference}`);
    expect(document.documentElement.dataset.theme).toBe(preference);
    expect(document.documentElement.style.colorScheme).toBe(preference);
  });

  it("persists an explicit preference outside document state", () => {
    renderThemeProvider();
    choose("dark");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(stateText()).toBe("dark:dark");
  });

  it("resolves the initial System preference from the OS", () => {
    installMatchMedia(true);
    renderThemeProvider();

    expect(stateText()).toBe("system:dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("updates live when the OS changes while System is selected", () => {
    renderThemeProvider();

    act(() => media.setDark(true));

    expect(stateText()).toBe("system:dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("reconciles an OS change that happens between the initial snapshot and subscription", () => {
    let dark = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQuery = {
      media: SYSTEM_THEME_QUERY,
      get matches() {
        return dark;
      },
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        dark = true;
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    } as MediaQueryList;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => mediaQuery,
    });

    renderThemeProvider();

    expect(stateText()).toBe("system:dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ignores later OS changes while an explicit preference is selected", () => {
    renderThemeProvider();
    choose("light");

    act(() => media.setDark(true));

    expect(stateText()).toBe("light:light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
