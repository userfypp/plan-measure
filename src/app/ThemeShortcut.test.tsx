/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubMatchMedia } from "../test/domTestUtils";
import { resetAppPreferences, setAppPreference } from "../utils/appPreferences";
import { ThemeShortcut } from "./ThemeShortcut";
import { SYSTEM_THEME_QUERY, THEME_STORAGE_KEY, ThemeProvider } from "./themeState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(systemDark: boolean) {
  stubMatchMedia((query) => query === SYSTEM_THEME_QUERY && systemDark);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <ThemeProvider>
        <ThemeShortcut />
      </ThemeProvider>,
    ),
  );
}

function bindToggle() {
  act(() => setAppPreference("shortcutBindings", { "app.toggleTheme": ["Mod+Shift+L"] }));
}

function press() {
  const event = new KeyboardEvent("keydown", {
    key: "l",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
}

const resolvedTheme = () => document.documentElement.dataset.theme;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetAppPreferences();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
});

describe("ThemeShortcut", () => {
  it("switches to the opposite of the resolved theme and stores it explicitly", () => {
    render(false);
    bindToggle();
    expect(resolvedTheme()).toBe("light");

    expect(press().defaultPrevented).toBe(true);
    expect(resolvedTheme()).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    press();
    expect(resolvedTheme()).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("leaves a dark system theme for an explicit light one", () => {
    render(true);
    bindToggle();
    expect(resolvedTheme()).toBe("dark");

    press();

    expect(resolvedTheme()).toBe("light");
    expect(document.documentElement.dataset.themePreference).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("does nothing while a dialog is open or when the action has no key", () => {
    render(false);
    expect(press().defaultPrevented).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    bindToggle();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    expect(press().defaultPrevented).toBe(false);
    dialog.remove();

    expect(resolvedTheme()).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
