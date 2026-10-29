import { describe, expect, it } from "vitest";
import type { PageCalibration, Point, UniformPageCalibration } from "../../types/domain";
import {
  constrainMeasurementTranslation,
  translateMeasurementPoints,
} from "../viewer/measurementDrag";
import { calibrationScaleX, calibrationScaleY, millimetresPerPageUnit } from "../../utils/geometry";
import { fromMillimetres, fromSquareMillimetres, toMillimetres } from "../../utils/units";
import {
  copyCalibrationToPage,
  createPageCalibrationFromRatio,
  isValidScaleRatioDenominator,
  scaleRatioSpecFromCalibration,
} from "./ratioCalibration";

const MIN_NORMAL = 2 ** -1022;
// Accepted denominators with up to 15 significant digits, the precision Set ratio shows,
// from near the smallest normal value to near the largest finite calibration.
const SMALLEST_RATIO = 2.3e-308;
const LARGEST_RATIO = 7e306;
const DENOMINATORS = [
  SMALLEST_RATIO,
  1e-300,
  1e-6,
  0.5,
  1,
  20,
  62.5125,
  1234.5678,
  1e15,
  1e100,
  LARGEST_RATIO,
];

function named(calibration: Omit<PageCalibration, "id" | "name">): PageCalibration {
  return { id: "scale", name: "Scale", ...calibration } as PageCalibration;
}

describe("numerical conservation", () => {
  it("accepts every tested ratio denominator", () => {
    for (const denominator of DENOMINATORS)
      expect(isValidScaleRatioDenominator(denominator)).toBe(true);
  });

  it.each(DENOMINATORS)(
    "saves an unchanged uniform 1:%s ratio as the same calibration",
    (denominator) => {
      const calibration = createPageCalibrationFromRatio({ mode: "uniform", denominator });
      const spec = scaleRatioSpecFromCalibration(named(calibration));

      expect(spec).toEqual({ mode: "uniform", denominator });
      expect(
        createPageCalibrationFromRatio(spec as { mode: "uniform"; denominator: number }),
      ).toEqual(calibration);
    },
  );

  it("saves an unchanged X/Y ratio as the same calibration at both extremes", () => {
    const calibration = createPageCalibrationFromRatio({
      mode: "xy",
      xDenominator: SMALLEST_RATIO,
      yDenominator: LARGEST_RATIO,
    });
    const spec = scaleRatioSpecFromCalibration(named(calibration));

    expect(spec).toEqual({ mode: "xy", xDenominator: SMALLEST_RATIO, yDenominator: LARGEST_RATIO });
    expect(
      createPageCalibrationFromRatio(
        spec as { mode: "xy"; xDenominator: number; yDenominator: number },
      ),
    ).toEqual(calibration);
  });

  it.each(DENOMINATORS)(
    "copies a 1:%s scale to another page without changing its factor",
    (denominator) => {
      const uniform: UniformPageCalibration = {
        id: "uniform",
        name: "Uniform",
        ...createPageCalibrationFromRatio({ mode: "uniform", denominator }),
      };
      expect(millimetresPerPageUnit(copyCalibrationToPage(uniform))).toBe(
        millimetresPerPageUnit(uniform),
      );

      const xy = named(
        createPageCalibrationFromRatio({ mode: "xy", xDenominator: denominator, yDenominator: 50 }),
      );
      const copy = named(copyCalibrationToPage(xy));
      expect(calibrationScaleX(copy)).toBe(calibrationScaleX(xy));
      expect(calibrationScaleY(copy)).toBe(calibrationScaleY(xy));
    },
  );

  it("copies a scale drawn from arbitrary points without changing its factor", () => {
    const drawn: UniformPageCalibration = {
      id: "drawn",
      name: "Drawn",
      mode: "uniform",
      start: { x: 3.25, y: 4 },
      end: { x: 13.5, y: 4 },
      referenceDistanceMm: 1234.5,
    };
    expect(millimetresPerPageUnit(copyCalibrationToPage(drawn))).toBe(
      millimetresPerPageUnit(drawn),
    );
  });

  it.each([
    [500, { x: 0.30000000000000004, y: 0 }],
    [1e20, { x: 2 ** 20, y: -(2 ** 20) }],
    [Number.MAX_VALUE, { x: Number.MAX_VALUE, y: -Number.MAX_VALUE }],
  ])("keeps a translated measurement inside a %s-wide page", (size, proposed) => {
    const bounds = { width: size, height: size, rotation: 0 as const };
    const points: Point[] = [
      { x: size * 0.25, y: size * 0.5 },
      { x: size * 0.75, y: size * 0.75 },
    ];

    const delta = constrainMeasurementTranslation(points, proposed, bounds);
    const moved = translateMeasurementPoints(points, delta);

    expect(Number.isFinite(delta.x) && Number.isFinite(delta.y)).toBe(true);
    for (const point of moved) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(size);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(size);
    }
  });

  it("translates by a delta that fits exactly", () => {
    const points = [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ];
    const delta = constrainMeasurementTranslation(
      points,
      { x: 2.5, y: -7.25 },
      { width: 100, height: 100, rotation: 0 },
    );
    expect(delta).toEqual({ x: 2.5, y: -7.25 });
    expect(translateMeasurementPoints(points, delta)).toEqual([
      { x: 12.5, y: 12.75 },
      { x: 32.5, y: 32.75 },
    ]);
  });

  it("keeps positive quantities positive and finite when the converted value is representable", () => {
    const units = ["mm", "cm", "m", "in", "ft"] as const;
    for (const value of [MIN_NORMAL, 1e-300, 1, 1e300, Number.MAX_VALUE / 1000]) {
      for (const unit of units) {
        for (const converted of [
          toMillimetres(value, unit),
          fromMillimetres(value, unit),
          fromSquareMillimetres(value, unit),
        ]) {
          expect(converted).toBeGreaterThan(0);
          expect(Number.isFinite(converted)).toBe(true);
        }
      }
    }
  });
});
