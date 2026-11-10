import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPlanCompare,
  startPlanCompare,
  stopPlanCompare,
  subscribePlanCompare,
} from "./planCompareStore";

afterEach(() => stopPlanCompare());

describe("plan compare store", () => {
  it("starts with a file and stops, telling subscribers on each change", () => {
    const file = new File(["%PDF"], "rev-b.pdf", { type: "application/pdf" });
    const listener = vi.fn();
    const unsubscribe = subscribePlanCompare(listener);
    expect(getPlanCompare().active).toBe(false);
    startPlanCompare(file);
    expect(getPlanCompare().active).toBe(true);
    expect(getPlanCompare().file).toBe(file);
    expect(listener).toHaveBeenCalledTimes(1);
    stopPlanCompare();
    expect(getPlanCompare().active).toBe(false);
    expect(getPlanCompare().file).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    startPlanCompare(file);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
