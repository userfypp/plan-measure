import { describe, expect, it } from "vitest";
import type { PageCalibration } from "../../types/domain";
import { scaleDisplayMetadata } from "./scaleDisplay";

const uniform: PageCalibration = {
  id: "ground-floor",
  name: "Ground floor",
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 72, y: 0 },
  referenceDistanceMm: 2540,
};

const xy: PageCalibration = {
  id: "survey-correction",
  name: "Survey correction",
  mode: "xy",
  xReference: {
    start: { x: 0, y: 0 },
    end: { x: 72, y: 0 },
    referenceDistanceMm: 2540,
  },
  yReference: {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 72 },
    referenceDistanceMm: 2489.2,
  },
};

describe("scaleDisplayMetadata", () => {
  it("derives a presentation-only uniform scale ratio from existing calibration math", () => {
    expect(scaleDisplayMetadata(uniform)).toEqual({
      ratioLabel: "1:100",
      modeLabel: "Uniform",
      detailLabel: "1:100 · Uniform",
    });
  });

  it("keeps distinct X and Y ratios explicit", () => {
    expect(scaleDisplayMetadata(xy)).toEqual({
      ratioLabel: "X 1:100 · Y 1:98",
      modeLabel: "X/Y",
      detailLabel: "X 1:100 · Y 1:98 · X/Y",
    });
  });

  it("uses deterministic display precision without persisting a ratio", () => {
    expect(
      scaleDisplayMetadata({
        ...uniform,
        referenceDistanceMm: 25.4 * 100.5,
      }).detailLabel,
    ).toBe("1:100.5 · Uniform");
  });
});
