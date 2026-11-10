import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSymbolCount,
  setSymbolCount,
  startSymbolCount,
  subscribeSymbolCount,
} from "./symbolCountStore";

afterEach(() => setSymbolCount({ active: false }));

describe("symbol count store", () => {
  it("starts and stops, telling subscribers on each change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSymbolCount(listener);
    expect(getSymbolCount().active).toBe(false);
    startSymbolCount();
    expect(getSymbolCount().active).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setSymbolCount({ active: false });
    expect(getSymbolCount().active).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    startSymbolCount();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
