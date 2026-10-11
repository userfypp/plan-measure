/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip, type TooltipPosition } from "./Tooltip";

let root: Root;
let container: HTMLDivElement;
let triggerRect: DOMRect;
let tooltipSize: { width: number; height: number };
let resizeCallback: ResizeObserverCallback;
const disconnect = vi.fn();

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return new DOMRect(x, y, width, height);
}

function renderTooltip(position: TooltipPosition = "top", content = "Hide measurement", delay = 0) {
  act(() =>
    root.render(
      <Tooltip content={content} position={position} delay={delay}>
        <button aria-describedby="existing-description">Hide</button>
      </Tooltip>,
    ),
  );
}

function showTooltip() {
  act(() => container.querySelector("button")!.focus());
}

function tooltip(): HTMLSpanElement {
  return document.querySelector<HTMLSpanElement>('[role="tooltip"]')!;
}

function expectPosition(x: number, y: number) {
  expect(tooltip().style.left).toBe(`${x}px`);
  expect(tooltip().style.top).toBe(`${y}px`);
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
  triggerRect = rect(4, 100, 24, 24);
  tooltipSize = { width: 160, height: 32 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute("role") === "tooltip"
      ? rect(0, 0, tooltipSize.width, tooltipSize.height)
      : triggerRect;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  disconnect.mockClear();
});

describe("Tooltip viewport placement", () => {
  it("keeps the Measurements tooltip inside the left edge at 375px", () => {
    renderTooltip();
    showTooltip();
    expectPosition(8, 60);
    expect(tooltip().parentElement).toBe(document.body);
    expect(container.querySelector("button")!.getAttribute("aria-describedby")).toBe(
      `existing-description ${tooltip().id}`,
    );
  });

  it.each([
    ["top", 160, 2, 92, 8],
    ["bottom", 160, 580, 92, 560],
    ["left", 2, 280, 8, 276],
    ["right", 350, 280, 207, 276],
  ] as const)("clamps %s tooltips at their nearest viewport edge", (position, x, y, left, top) => {
    triggerRect = rect(x, y, 24, 24);
    renderTooltip(position);
    showTooltip();
    expectPosition(left, top);
  });

  it.each([
    ["top", 96, 160],
    ["bottom", 96, 232],
    ["left", 52, 196],
    ["right", 200, 196],
  ] as const)("preserves %s placement when there is room", (position, left, top) => {
    triggerRect = rect(160, 200, 32, 24);
    if (position === "left") tooltipSize.width = 100;
    renderTooltip(position);
    showTooltip();
    expectPosition(left, top);
  });

  it("repositions on resize and nested scroll", () => {
    triggerRect = rect(340, 100, 24, 24);
    renderTooltip();
    showTooltip();
    expectPosition(207, 60);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    act(() => window.dispatchEvent(new Event("resize")));
    expectPosition(152, 60);
    triggerRect = rect(10, 200, 24, 24);
    act(() => container.dispatchEvent(new Event("scroll")));
    expectPosition(8, 160);
  });

  it("remeasures changing content and observed sizes", () => {
    triggerRect = rect(300, 100, 24, 24);
    renderTooltip();
    showTooltip();
    tooltipSize = { width: 240, height: 64 };
    renderTooltip("top", "A longer description");
    expectPosition(127, 28);
    tooltipSize = { width: 180, height: 48 };
    act(() => resizeCallback([], {} as ResizeObserver));
    expectPosition(187, 44);
    act(() => container.querySelector("button")!.blur());
    expect(disconnect).toHaveBeenCalled();
  });

  it("preserves the show delay and removes its description on blur", () => {
    renderTooltip("top", "Hide measurement", 300);
    showTooltip();
    expect(tooltip()).toBeNull();
    act(() => vi.advanceTimersByTime(299));
    expect(tooltip()).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(tooltip()).not.toBeNull();
    act(() => container.querySelector("button")!.blur());
    expect(tooltip()).toBeNull();
    expect(container.querySelector("button")!.getAttribute("aria-describedby")).toBe(
      "existing-description",
    );
  });
});
