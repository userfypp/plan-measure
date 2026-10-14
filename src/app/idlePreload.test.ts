// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { preloadWhenIdle } from "./idlePreload";

afterEach(() => vi.useRealTimers());

it("runs preloads one at a time and continues after a failure", async () => {
  vi.useFakeTimers();
  const order: string[] = [];
  const cancel = preloadWhenIdle([
    () => (order.push("a"), Promise.reject(new Error("offline"))),
    () => (order.push("b"), Promise.resolve()),
  ]);
  expect(order).toEqual([]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(order).toEqual(["a"]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(order).toEqual(["a", "b"]);
  cancel();
});

it("stops scheduling once cancelled", async () => {
  vi.useFakeTimers();
  const task = vi.fn(() => Promise.resolve());
  preloadWhenIdle([task])();
  await vi.advanceTimersByTimeAsync(5000);
  expect(task).not.toHaveBeenCalled();
});
