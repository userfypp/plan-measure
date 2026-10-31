/* @vitest-environment jsdom */

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAppPreferences, setAppPreference } from "../../utils/appPreferences";
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
  resetAppPreferences();
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

  it("places the tooltip against an external anchor instead of the trigger", () => {
    const anchorRef = createRef<HTMLDivElement>();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute("role") === "tooltip") return rect(0, 0, 160, 32);
      return this.hasAttribute("data-anchor") ? rect(100, 200, 160, 40) : rect(240, 224, 16, 16);
    });
    act(() =>
      root.render(
        <div ref={anchorRef} data-anchor="">
          <Tooltip content="Help" delay={0} anchorRef={anchorRef}>
            <button>?</button>
          </Tooltip>
        </div>,
      ),
    );
    showTooltip();
    expectPosition(100, 160);
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

describe("Tooltip delay preference", () => {
  function renderDefaultDelay() {
    act(() =>
      root.render(
        <Tooltip content="Hide measurement">
          <button>Hide</button>
        </Tooltip>,
      ),
    );
  }

  it.each([
    ["instant", 0],
    ["fast", 150],
    ["normal", 300],
    ["slow", 600],
  ] as const)("waits %s (%i ms) when the caller sets no delay", (preference, ms) => {
    setAppPreference("tooltipDelay", preference);
    renderDefaultDelay();
    showTooltip();
    if (ms > 0) {
      act(() => vi.advanceTimersByTime(ms - 1));
      expect(tooltip()).toBeNull();
      act(() => vi.advanceTimersByTime(1));
    }
    expect(tooltip()).not.toBeNull();
  });

  it("keeps an explicit delay regardless of the preference", () => {
    setAppPreference("tooltipDelay", "slow");
    renderTooltip("top", "Hide measurement", 0);
    showTooltip();
    expect(tooltip()).not.toBeNull();
  });
});

describe("Tooltip fit to text", () => {
  function mockLines(widths: number[], paddingAndBorder = { padding: 10, border: 1 }) {
    Range.prototype.getClientRects = () =>
      widths.map((width) => rect(0, 0, width, 16)) as unknown as DOMRectList;
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      paddingLeft: `${paddingAndBorder.padding}px`,
      paddingRight: `${paddingAndBorder.padding}px`,
      borderLeftWidth: `${paddingAndBorder.border}px`,
      borderRightWidth: `${paddingAndBorder.border}px`,
    } as CSSStyleDeclaration);
  }

  it("includes padding and border of the border-box bubble in the fitted width", () => {
    mockLines([60, 40]);
    renderTooltip();
    showTooltip();
    // ceil(60 + 2 * 10 + 2 * 1) + 1 safety pixel
    expect(tooltip().style.width).toBe("83px");
  });

  it("keeps the natural width when the fitted width is not narrower", () => {
    mockLines([150]);
    renderTooltip();
    showTooltip();
    expect(tooltip().style.width).toBe("");
  });

  it("undoes the fit when it would make the bubble taller", () => {
    mockLines([60]);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute("role") !== "tooltip") return triggerRect;
      return rect(0, 0, tooltipSize.width, this.style.width ? 64 : 32);
    });
    renderTooltip();
    showTooltip();
    expect(tooltip().style.width).toBe("");
  });
});

// Last on purpose: after a key event jsdom no longer reports a script focus as :focus-visible.
describe("Tooltip dismissal", () => {
  it("dismisses on Escape while the trigger keeps focus", () => {
    renderTooltip();
    showTooltip();
    expect(tooltip()).not.toBeNull();
    const press = (init: KeyboardEventInit) =>
      act(() => {
        container
          .querySelector("button")!
          .dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
      });
    press({ key: "Escape", isComposing: true });
    expect(tooltip()).not.toBeNull();
    press({ key: "Enter" });
    expect(tooltip()).not.toBeNull();
    press({ key: "Escape" });
    expect(tooltip()).toBeNull();
    expect(container.querySelector("button")!.getAttribute("aria-describedby")).toBe(
      "existing-description",
    );
    expect(document.activeElement).toBe(container.querySelector("button"));
  });
});
