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

const STATS = {
  zoomPercent: 96.6,
  raster: { width: 2480, height: 1754 },
  cacheEntries: 1,
  cacheMaxEntries: 2,
  cachePixels: 3_700_000,
  cacheMaxPixels: 8_388_608,
  lastRenderMs: 41.6,
  canvasNodes: 1234,
};

function rows(): Record<string, string | undefined> {
  return Object.fromEntries(
    Array.from(container.querySelectorAll("dt"), (term) => [
      term.textContent,
      term.nextElementSibling?.textContent,
    ]),
  );
}

describe("DebugOverlay", () => {
  it("is hidden from assistive tech and refreshes at most twice a second", () => {
    const getStats = vi.fn(() => STATS);
    act(() => root.render(<DebugOverlay getStats={getStats} />));
    const overlay = container.querySelector('[data-testid="debug-overlay"]')!;
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    // No frame rate is claimed before a half second has been measured.
    expect(rows()["Frame rate"]).toBe("–");

    const callsBefore = getStats.mock.calls.length;
    for (let time = 100; time < 500; time += 100) frame(time);
    expect(getStats.mock.calls.length).toBe(callsBefore);
    frame(500);
    expect(getStats.mock.calls.length).toBe(callsBefore + 1);
    expect(rows()["Frame rate"]).toBe("10 fps");
  });

  it("reports the slowest frame, the page, the cache and the canvas", () => {
    act(() => root.render(<DebugOverlay getStats={() => STATS} />));
    frame(16);
    frame(116);
    frame(500);
    const shown = rows();
    expect(shown["Slowest frame"]).toBe("384 ms");
    expect(shown["Page render"]).toBe("42 ms");
    expect(shown["Page bitmap"]).toBe("2,480 × 1,754 px");
    expect(shown["Raster cache"]).toBe("1/2 · 3.7/8.4 Mpx");
    expect(shown["Canvas nodes"]).toBe("1,234");
    expect(shown["Zoom"]).toBe("97%");
  });

  it("shows dashes before the first render and omits memory where the browser hides it", () => {
    act(() =>
      root.render(
        <DebugOverlay getStats={() => ({ ...STATS, raster: null, lastRenderMs: null })} />,
      ),
    );
    expect(rows()["Page render"]).toBe("–");
    expect(rows()["Page bitmap"]).toBe("–");
    expect(rows()["JS memory"]).toBeUndefined();
  });
});
