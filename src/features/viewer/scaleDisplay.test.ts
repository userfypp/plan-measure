import { describe, expect, it } from "vitest";
import { createPageCalibrationFromRatio } from "../calibration/ratioCalibration";
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

  it.each([20, 50, 60, 62.5, 62.5125, 62.5123456789012, 100, 100.125])(
    "round-trips effective custom ratio 1:%s without two-decimal truncation",
    (denominator) => {
      const calibration: PageCalibration = {
        id: `ratio-${denominator}`,
        name: "Custom ratio",
        ...createPageCalibrationFromRatio({ mode: "uniform", denominator }),
      };
      expect(scaleDisplayMetadata(calibration).ratioLabel).toBe(`1:${denominator}`);
    },
  );

  it("round-trips independent X/Y ratios from effective calibration", () => {
    const calibration: PageCalibration = {
      id: "xy-ratio",
      name: "Custom X/Y",
      ...createPageCalibrationFromRatio({ mode: "xy", xDenominator: 70, yDenominator: 30 }),
    };
    expect(scaleDisplayMetadata(calibration)).toEqual({
      ratioLabel: "X 1:70 · Y 1:30",
      modeLabel: "X/Y",
      detailLabel: "X 1:70 · Y 1:30 · X/Y",
    });
  });

  it("suppresses floating-point noise near a clean ratio without erasing meaningful decimals", () => {
    const noisy: PageCalibration = {
      ...uniform,
      referenceDistanceMm: (49.999999999999986 * 127) / 5,
    };
    const precise: PageCalibration = {
      ...uniform,
      referenceDistanceMm: (62.5125 * 127) / 5,
    };

    expect(scaleDisplayMetadata(noisy).ratioLabel).toBe("1:50");
    expect(scaleDisplayMetadata(precise).ratioLabel).toBe("1:62.5125");
  });

  it("keeps legacy two-decimal presentation for complex ratios derived from normal point calibration", () => {
    const pointCalibration: PageCalibration = {
      id: "point-calibration",
      name: "Point calibration",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    };

    expect(scaleDisplayMetadata(pointCalibration).ratioLabel).toBe("1:283.46");
  });
});
