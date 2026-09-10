import { describe, expect, it } from "vitest";
import {
  AUTHORING_MIN_USABLE_HEIGHT,
  AUTHORING_MIN_USABLE_WIDTH,
  computeAuthoringCapability,
} from "./AuthoringCapability";

function capability(
  width: number,
  height: number,
  options: { rightObstruction?: number; bottomExclusion?: number; finePointer?: boolean } = {},
) {
  return computeAuthoringCapability({
    viewerSize: { width, height },
    rightObstruction: options.rightObstruction ?? 0,
    bottomExclusion: options.bottomExclusion ?? 0,
    finePointer: options.finePointer ?? true,
  });
}

describe("precision authoring capability", () => {
  it("uses inclusive 480 × 360 geometry thresholds", () => {
    expect(AUTHORING_MIN_USABLE_WIDTH).toBe(480);
    expect(AUTHORING_MIN_USABLE_HEIGHT).toBe(360);
    expect(capability(479, 360).available).toBe(false);
    expect(capability(480, 360).available).toBe(true);
    expect(capability(480, 359).available).toBe(false);
  });

  it("requires a real fine pointer independently of viewer size", () => {
    expect(capability(1200, 800, { finePointer: false }).available).toBe(false);
    expect(capability(1200, 800, { finePointer: true }).available).toBe(true);
  });

  it("counts the Narrow drawer as obstruction without changing the physical Viewer rect", () => {
    const physicalWidth = 768;
    const open = capability(physicalWidth, 600, { rightObstruction: 304 });
    const closed = capability(physicalWidth, 600);

    expect(open.viewerSize.width).toBe(physicalWidth);
    expect(open.usableSize.width).toBe(464);
    expect(open.available).toBe(false);
    expect(closed.viewerSize.width).toBe(physicalWidth);
    expect(closed.usableSize.width).toBe(physicalWidth);
    expect(closed.available).toBe(true);
  });

  it("subtracts the Dock exclusion exactly once at the height boundary", () => {
    const exact = capability(800, 420, { bottomExclusion: 60 });
    const below = capability(800, 420, { bottomExclusion: 61 });

    expect(exact.usableSize.height).toBe(360);
    expect(exact.available).toBe(true);
    expect(below.usableSize.height).toBe(359);
    expect(below.available).toBe(false);
  });

  it("clamps pathological obstructions and does not fabricate usable space", () => {
    const result = capability(100, 100, { rightObstruction: 304, bottomExclusion: 500 });
    expect(result.rightObstruction).toBe(100);
    expect(result.bottomExclusion).toBe(100);
    expect(result.usableSize).toEqual({ width: 0, height: 0 });
    expect(result.available).toBe(false);
  });

  it("does not report an unmeasured zero-size mount as a user-facing failure", () => {
    const result = capability(0, 0);
    expect(result.measured).toBe(false);
    expect(result.available).toBe(false);
    expect(result.unavailableReason).toBeNull();
  });
});
