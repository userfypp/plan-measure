/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerShell } from "./ViewerShell";

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

class ControlledResizeObserver implements ResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ControlledResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    if (!this.target) this.target = target;
  }
  unobserve(): void {}
  disconnect(): void {}
  emit(width: number, height: number): void {
    if (!this.target) throw new Error("ResizeObserver has no target.");
    this.callback(
      [{ target: this.target, contentRect: rect(width, height) } as ResizeObserverEntry],
      this,
    );
  }
}

function createFinePointerController(initial: boolean) {
  let matches = initial;
  const listeners = new Set<EventListener>();
  const media = {
    get matches() {
      return matches;
    },
    media: "(any-pointer: fine)",
    onchange: null,
    addEventListener: (_type: string, listener: EventListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: EventListener) => listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  } as MediaQueryList;
  return {
    media,
    set(value: boolean) {
      matches = value;
      const event = new Event("change");
      listeners.forEach((listener) => listener(event));
    },
  };
}

describe("ViewerShell authoring geometry", () => {
  let container: HTMLDivElement;
  let root: Root;
  let width: number;
  let height: number;
  let pointer: ReturnType<typeof createFinePointerController>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    width = 768;
    height = 600;
    pointer = createFinePointerController(true);
    ControlledResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
    vi.stubGlobal("matchMedia", vi.fn(() => pointer.media));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.hasAttribute("data-authoring-capability") ? rect(width, height) : rect(0, 0);
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
  });

  function render(rightObstruction = 0) {
    act(() => {
      root.render(
        <ViewerShell rightObstruction={rightObstruction}>
          <div>Viewer content</div>
        </ViewerShell>,
      );
    });
  }

  function frame(): HTMLDivElement {
    const element = container.querySelector<HTMLDivElement>("[data-authoring-capability]");
    if (!element) throw new Error("Viewer frame was not rendered.");
    return element;
  }

  function observer(): ControlledResizeObserver {
    const instance = ControlledResizeObserver.instances[0];
    if (!instance) throw new Error("Viewer ResizeObserver was not installed.");
    return instance;
  }

  it("uses the mounted Viewer rect before the first ResizeObserver delivery", () => {
    width = 480;
    height = 360;
    render();
    expect(frame().dataset.authoringCapability).toBe("available");
    expect(frame().dataset.usableWidth).toBe("480");
    expect(frame().dataset.usableHeight).toBe("360");
  });

  it("responds to real Viewer ResizeObserver geometry at the exact width boundary", () => {
    width = 480;
    height = 500;
    render();
    expect(frame().dataset.authoringCapability).toBe("available");

    width = 479;
    act(() => observer().emit(479, 500));
    expect(frame().dataset.authoringCapability).toBe("gated");

    width = 480;
    act(() => observer().emit(480, 500));
    expect(frame().dataset.authoringCapability).toBe("available");
  });

  it("recomputes immediately for a drawer obstruction without resizing the Viewer", () => {
    render(0);
    expect(frame().dataset.authoringCapability).toBe("available");
    expect(frame().getBoundingClientRect().width).toBe(768);

    render(304);
    expect(frame().getBoundingClientRect().width).toBe(768);
    expect(frame().dataset.usableWidth).toBe("464");
    expect(frame().dataset.authoringCapability).toBe("gated");

    render(0);
    expect(frame().dataset.usableWidth).toBe("768");
    expect(frame().dataset.authoringCapability).toBe("available");
  });

  it("tracks fine-pointer availability independently from geometry", () => {
    render();
    expect(frame().dataset.authoringCapability).toBe("available");

    act(() => pointer.set(false));
    expect(frame().dataset.authoringCapability).toBe("gated");
    expect(frame().textContent).toContain("fine pointer");

    act(() => pointer.set(true));
    expect(frame().dataset.authoringCapability).toBe("available");
  });
});
