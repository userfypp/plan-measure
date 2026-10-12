/* @vitest-environment jsdom */

import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOverflowFlag } from "./useOverflowFlag";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ elementRef }: { elementRef: React.RefObject<HTMLDivElement | null> }) {
  useOverflowFlag(elementRef);
  return (
    <div ref={elementRef}>
      <p>content</p>
    </div>
  );
}

describe("useOverflowFlag", () => {
  const originals = globalThis.ResizeObserver;
  afterEach(() => {
    globalThis.ResizeObserver = originals;
  });

  it("toggles data-overflow from scroll/client height and disconnects on unmount", async () => {
    const callbacks: (() => void)[] = [];
    const observed: Element[] = [];
    const disconnect = vi.fn();
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect = disconnect;
    } as unknown as typeof ResizeObserver;

    const ref = createRef<HTMLDivElement>();
    const container = document.createElement("div");
    const root = createRoot(container);
    let scrollHeight = 100;
    await act(async () => {
      root.render(<Probe elementRef={ref} />);
    });
    const element = ref.current!;
    Object.defineProperty(element, "scrollHeight", { get: () => scrollHeight, configurable: true });
    Object.defineProperty(element, "clientHeight", { get: () => 80, configurable: true });
    expect(observed).toEqual([element, element.firstElementChild]);

    callbacks.at(-1)!();
    expect(element.hasAttribute("data-overflow")).toBe(true);
    scrollHeight = 80;
    callbacks.at(-1)!();
    expect(element.hasAttribute("data-overflow")).toBe(false);

    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalled();
  });
});
