/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebugOverlay } from "./DebugOverlay";

let container: HTMLDivElement;
let root: Root;
let now = 0;
let rafCallbacks: Array<(time: number) => void> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  now = 0;
  rafCallbacks = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function frame(time: number) {
  now = time;
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  act(() => callbacks.forEach((callback) => callback(time)));
}

describe("DebugOverlay", () => {
  it("is hidden from assistive tech and shows FPS, cache and render time at most twice a second", () => {
    const getStats = vi.fn(() => ({ cacheEntries: 2, cachePixels: 3_500_000, lastRenderMs: 41.6 }));
    act(() => root.render(<DebugOverlay getStats={getStats} />));
    const overlay = container.querySelector('[data-testid="debug-overlay"]')!;
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.textContent).toContain("Cache 2 · 3.5 Mpx");
    expect(overlay.textContent).toContain("Render 42 ms");

    const callsBefore = getStats.mock.calls.length;
    for (let time = 100; time < 500; time += 100) frame(time);
    expect(getStats.mock.calls.length).toBe(callsBefore);
    frame(500);
    expect(getStats.mock.calls.length).toBe(callsBefore + 1);
    expect(overlay.textContent).toContain("10 FPS");
  });
});
