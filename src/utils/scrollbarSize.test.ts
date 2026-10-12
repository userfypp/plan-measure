// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchScrollbarSize } from "./scrollbarSize";

describe("watchScrollbarSize", () => {
  afterEach(() => vi.useRealTimers());

  it("publishes, re-measures on debounced resize and pointer change, and cleans up", () => {
    vi.useFakeTimers();
    const listeners: Record<string, () => void> = {};
    const remove = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
      removeEventListener: remove,
    }) as unknown as typeof window.matchMedia;
    const spy = vi.spyOn(document.documentElement.style, "setProperty");
    const stop = watchScrollbarSize(window, 150);
    expect(spy).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(149);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(2);
    listeners.change!();
    vi.advanceTimersByTime(150);
    expect(spy).toHaveBeenCalledTimes(3);
    stop();
    expect(remove).toHaveBeenCalled();
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
