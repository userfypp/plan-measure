// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../../app/themeState";
import { useCanvasVisualRoles } from "./canvasVisualRoles";

function CanvasThemeProbe() {
  const roles = useCanvasVisualRoles();
  const { setPreference } = useTheme();
  return (
    <>
      <output data-testid="canvas-theme">
        {roles.theme}:{roles.measurementDefaultStroke}:{roles.measurementSelectedStroke}:
        {roles.labelBackground}
      </output>
      <button type="button" onClick={() => setPreference("light")}>
        Light canvas
      </button>
      <button type="button" onClick={() => setPreference("dark")}>
        Dark canvas
      </button>
    </>
  );
}

describe("canvas visual role theme bridge", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("updates with the resolved Light/Dark theme without recoloring document overlays", () => {
    act(() => {
      root.render(
        <ThemeProvider>
          <CanvasThemeProbe />
        </ThemeProvider>,
      );
    });

    const output = () => container.querySelector('[data-testid="canvas-theme"]')?.textContent;
    expect(output()).toBe("light:#258a88:#2465c7:#242a31");

    const dark = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Dark canvas",
    );
    if (!dark) throw new Error("Dark canvas button was not rendered.");
    act(() => dark.click());
    expect(output()).toBe("dark:#258a88:#2465c7:#242a31");

    const light = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Light canvas",
    );
    if (!light) throw new Error("Light canvas button was not rendered.");
    act(() => light.click());
    expect(output()).toBe("light:#258a88:#2465c7:#242a31");
  });
});
