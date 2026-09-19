import { describe, expect, it } from "vitest";
import {
  calibrationScaleX,
  calibrationScaleY,
  lineLengthMm,
  millimetresPerPageUnit,
  polygonResultsMm,
} from "../../utils/geometry";
import { scaleByRatio, toMillimetres } from "../../utils/units";
import { createStandardScalePreset, STANDARD_SCALE_PRESET_RATIOS } from "./standardScalePresets";
import {
  createPageCalibrationFromRatio,
  isValidScaleRatioDenominator,
  scaleRatioSpecFromCalibration,
} from "./ratioCalibration";

describe("ratio calibration", () => {
  it.each([1, 20, 50, 60, 62.5, 62.5125, 100, 100.125])(
    "creates canonical Uniform calibration for 1:%s",
    (denominator) => {
      const calibration = createPageCalibrationFromRatio({ mode: "uniform", denominator });

      expect(calibration).toEqual({
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 72, y: 0 },
        referenceDistanceMm: toMillimetres(denominator, "in"),
      });
      expect(millimetresPerPageUnit(calibration)).toBeCloseTo(
        scaleByRatio(denominator, 127, 360),
        13,
      );
    },
  );

  it("keeps the canonical 1:60 reference exactly at 1524 mm", () => {
    expect(
      createPageCalibrationFromRatio({ mode: "uniform", denominator: 60 }).referenceDistanceMm,
    ).toBe(1524);
  });

  it.each(STANDARD_SCALE_PRESET_RATIOS)(
    "makes preset 1:%s converge exactly on the shared ratio helper",
    (denominator) => {
      expect(createStandardScalePreset(denominator)).toEqual(
        createPageCalibrationFromRatio({ mode: "uniform", denominator }),
      );
    },
  );

  it("creates independent canonical X and Y references without swapping axes", () => {
    const calibration = {
      id: "xy-ratio",
      name: "X/Y ratio",
      ...createPageCalibrationFromRatio({ mode: "xy", xDenominator: 70, yDenominator: 30 }),
    };

    expect(calibration.xReference).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 72, y: 0 },
      referenceDistanceMm: 1778,
    });
    expect(calibration.yReference).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 0, y: 72 },
      referenceDistanceMm: 762,
    });
    expect(calibrationScaleX(calibration)).toBeCloseTo(scaleByRatio(70, 127, 360), 13);
    expect(calibrationScaleY(calibration)).toBeCloseTo(scaleByRatio(30, 127, 360), 13);
  });

  it("derives a clean effective ratio from non-canonical Uniform reference points", () => {
    const denominator = 65.345;
    const pageDistance = 40;
    const calibration = {
      id: "point-uniform",
      name: "Point calibrated",
      mode: "uniform" as const,
      start: { x: 13, y: 7 },
      end: { x: 53, y: 7 },
      referenceDistanceMm: pageDistance * scaleByRatio(denominator, 127, 360),
    };

    expect(scaleRatioSpecFromCalibration(calibration)).toEqual({
      mode: "uniform",
      denominator: 65.345,
    });
  });

  it("derives X/Y ratios independently from effective axis factors", () => {
    const calibration = {
      id: "point-xy",
      name: "Point X/Y",
      mode: "xy" as const,
      xReference: {
        start: { x: 5, y: 9 },
        end: { x: 45, y: 9 },
        referenceDistanceMm: 40 * scaleByRatio(70, 127, 360),
      },
      yReference: {
        start: { x: 11, y: 3 },
        end: { x: 11, y: 53 },
        referenceDistanceMm: 50 * scaleByRatio(30, 127, 360),
      },
    };

    expect(scaleRatioSpecFromCalibration(calibration)).toEqual({
      mode: "xy",
      xDenominator: 70,
      yDenominator: 30,
    });
  });

  it("feeds existing X/Y geometry math for horizontal, vertical, diagonal, perimeter, and area", () => {
    const calibration = {
      id: "xy-ratio",
      name: "X/Y ratio",
      ...createPageCalibrationFromRatio({ mode: "xy", xDenominator: 70, yDenominator: 30 }),
    };
    const pageUnitsPerMillimetre = scaleByRatio(1, 360, 127);
    const width = 60 * pageUnitsPerMillimetre;
    const height = 40 * pageUnitsPerMillimetre;

    expect(lineLengthMm([{ x: 0, y: 0 }, { x: width, y: 0 }], calibration)).toBeCloseTo(4200, 10);
    expect(lineLengthMm([{ x: 0, y: 0 }, { x: 0, y: height }], calibration)).toBeCloseTo(1200, 10);
    expect(lineLengthMm([{ x: 0, y: 0 }, { x: width, y: height }], calibration)).toBeCloseTo(
      Math.hypot(4200, 1200),
      10,
    );

    const polygon = polygonResultsMm(
      {
        points: [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height },
        ],
      },
      calibration,
    );
    expect(polygon.perimeterMm).toBeCloseTo(10_800, 9);
    expect(polygon.areaMm2).toBeCloseTo(5_040_000, 7);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["overflow", Number.MAX_VALUE],
    ["underflow", Number.MIN_VALUE],
  ])("rejects %s denominator", (_case, denominator) => {
    expect(isValidScaleRatioDenominator(denominator)).toBe(false);
    expect(() => createPageCalibrationFromRatio({ mode: "uniform", denominator })).toThrow(RangeError);
  });

  it.each([0.5, 1, 1.5, 60, 62.5, 100.125])("accepts finite positive decimal denominator %s", (denominator) => {
    expect(isValidScaleRatioDenominator(denominator)).toBe(true);
  });

  it("rejects either invalid X/Y denominator independently", () => {
    expect(() =>
      createPageCalibrationFromRatio({ mode: "xy", xDenominator: 0, yDenominator: 30 }),
    ).toThrow(RangeError);
    expect(() =>
      createPageCalibrationFromRatio({ mode: "xy", xDenominator: 70, yDenominator: Number.MAX_VALUE }),
    ).toThrow(RangeError);
    expect(() =>
      createPageCalibrationFromRatio({ mode: "xy", xDenominator: 0, yDenominator: 0 }),
    ).toThrow(RangeError);
  });
});
