import { describe, expect, it } from "vitest";
import type { Calibration, MeasurementType, Point } from "../types/domain";
import {
  areEffectivelyIdentical,
  calibrationPointTolerance,
  hasValidMeasurementPoints,
  measurementResultsMm,
} from "./geometry";

const p = (x: number, y: number): Point => ({ x, y });
const ring = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  p(x0, y0),
  p(x1, y0),
  p(x1, y1),
  p(x0, y1),
];

describe("hasValidMeasurementPoints", () => {
  const cases: [MeasurementType, string, Point[], boolean][] = [
    ["count", "no points", [], false],
    ["count", "one point", [p(1, 1)], true],
    ["count", "repeated points are separate items", [p(1, 1), p(1, 1), p(1, 1)], true],
    ["count", "NaN", [p(NaN, 1)], false],
    ["line", "one point", [p(0, 0)], false],
    ["line", "two points", [p(0, 0), p(1, 0)], true],
    ["line", "three points", [p(0, 0), p(1, 0), p(2, 0)], false],
    ["line", "identical ends", [p(3, 3), p(3, 3)], false],
    ["line", "NaN", [p(0, 0), p(NaN, 0)], false],
    ["line", "Infinity", [p(0, 0), p(Infinity, 0)], false],
    ["line", "-Infinity", [p(0, -Infinity), p(1, 0)], false],
    ["polyline", "one point", [p(0, 0)], false],
    ["polyline", "two points", [p(0, 0), p(1, 0)], true],
    ["polyline", "may come back to a vertex it left", [p(0, 0), p(1, 0), p(0, 0)], true],
    ["polyline", "consecutive duplicate", [p(0, 0), p(1, 0), p(1, 0), p(2, 0)], false],
    ["polygon", "two points", [p(0, 0), p(1, 0)], false],
    ["polygon", "triangle", [p(0, 0), p(4, 0), p(0, 3)], true],
    ["polygon", "last point repeats the first", [p(0, 0), p(4, 0), p(0, 3), p(0, 0)], false],
    ["polygon", "consecutive duplicate", [p(0, 0), p(4, 0), p(4, 0), p(0, 3)], false],
    ["polygon", "NaN", [p(0, 0), p(4, 0), p(NaN, 3)], false],
    ["polygon", "bow-tie", [p(0, 0), p(2, 2), p(2, 0), p(0, 2)], false],
    ["cloud", "two points", [p(0, 0), p(1, 0)], false],
    ["cloud", "triangle", [p(0, 0), p(4, 0), p(0, 3)], true],
    ["cloud", "last point repeats the first", [p(0, 0), p(4, 0), p(0, 3), p(0, 0)], false],
    ["rectangle", "axis-aligned ring", ring(0, 0, 4, 3), true],
    ["rectangle", "reversed winding", [...ring(0, 0, 4, 3)].reverse(), true],
    ["rectangle", "three points", ring(0, 0, 4, 3).slice(0, 3), false],
    ["rectangle", "five points", [...ring(0, 0, 4, 3), p(0, 0)], false],
    ["rectangle", "skewed", [p(0, 0), p(4, 0), p(5, 3), p(0, 3)], false],
    ["rectangle", "no width", ring(2, 0, 2, 3), false],
    ["ellipse", "axis-aligned ring", ring(0, 0, 4, 3), true],
    ["ellipse", "skewed", [p(0, 0), p(4, 1), p(4, 3), p(0, 3)], false],
    ["ellipse", "no height", ring(0, 5, 4, 5), false],
  ];

  it.each(cases)("%s: %s", (type, _label, points, expected) => {
    expect(hasValidMeasurementPoints(type, points)).toBe(expected);
  });
});

describe("areEffectivelyIdentical", () => {
  it("accepts a gap up to 32 machine epsilons at the unit scale and rejects a larger one", () => {
    const tolerance = calibrationPointTolerance(p(0, 0), p(0, 0));
    expect(tolerance).toBe(32 * Number.EPSILON);
    expect(areEffectivelyIdentical(p(0, 0), p(tolerance, 0))).toBe(true);
    expect(areEffectivelyIdentical(p(0, 0), p(0, -tolerance))).toBe(true);
    expect(areEffectivelyIdentical(p(0, 0), p(tolerance * 1.001, 0))).toBe(false);
  });

  it("measures the gap along the diagonal, not per axis", () => {
    const tolerance = calibrationPointTolerance(p(0, 0), p(0, 0));
    const inside = (tolerance / Math.SQRT2) * 0.99;
    const outside = (tolerance / Math.SQRT2) * 1.01;
    expect(areEffectivelyIdentical(p(0, 0), p(inside, inside))).toBe(true);
    expect(areEffectivelyIdentical(p(0, 0), p(outside, outside))).toBe(false);
  });

  it("widens the tolerance with the size of the coordinates", () => {
    const far = 1e6;
    expect(calibrationPointTolerance(p(far, far), p(far, far))).toBe(32 * Number.EPSILON * far);
    // 5e-9 is below 32 * epsilon * 1e6 (about 7.1e-9) but far above it for coordinates near 0.
    expect(areEffectivelyIdentical(p(far, far), p(far + 5e-9, far))).toBe(true);
    expect(areEffectivelyIdentical(p(far, far), p(far + 1e-8, far))).toBe(false);
    expect(areEffectivelyIdentical(p(0, 0), p(5e-9, 0))).toBe(false);
  });

  it("is symmetric and treats equal points as identical", () => {
    expect(areEffectivelyIdentical(p(2, 3), p(2, 3))).toBe(true);
    expect(areEffectivelyIdentical(p(2, 3), p(2, 3.001))).toBe(false);
    expect(areEffectivelyIdentical(p(2, 3.001), p(2, 3))).toBe(false);
  });
});

describe("measurementResultsMm with hand-computed values", () => {
  // 10 page units are 1000 mm, so one unit is exactly 100 mm.
  const scale: Calibration = { start: p(0, 0), end: p(10, 0), referenceDistanceMm: 1000 };

  it("measures a line with the 3-4-5 triangle", () => {
    expect(measurementResultsMm({ type: "line", points: [p(0, 0), p(30, 40)] }, scale)).toEqual({
      lengthMm: 5000,
      perimeterMm: null,
      areaMm2: null,
    });
  });

  it("adds every polyline segment and no closing segment", () => {
    expect(
      measurementResultsMm({ type: "polyline", points: [p(0, 0), p(30, 0), p(30, 40)] }, scale),
    ).toEqual({ lengthMm: 7000, perimeterMm: null, areaMm2: null });
  });

  it("measures a polygon: 30 + 40 + 50 = 120 units and 600 square units", () => {
    expect(
      measurementResultsMm({ type: "polygon", points: [p(0, 0), p(30, 0), p(0, 40)] }, scale),
    ).toEqual({ lengthMm: null, perimeterMm: 12000, areaMm2: 6_000_000 });
  });

  it("measures a rectangle: perimeter 2 * (20 + 10) and area 20 * 10", () => {
    expect(measurementResultsMm({ type: "rectangle", points: ring(0, 0, 20, 10) }, scale)).toEqual({
      lengthMm: null,
      perimeterMm: 6000,
      areaMm2: 2_000_000,
    });
  });

  it("gives a circle its exact area and circumference", () => {
    const circle = measurementResultsMm({ type: "ellipse", points: ring(0, 0, 10, 10) }, scale);
    // Radius 500 mm.
    expect(circle.areaMm2).toBeCloseTo(785398.1633974483, 6);
    expect(circle.perimeterMm).toBeCloseTo(3141.592653589793, 9);
  });

  it("gives an ellipse its exact area and a perimeter within the approximation's error", () => {
    const ellipse = measurementResultsMm({ type: "ellipse", points: ring(0, 0, 20, 10) }, scale);
    // Semi-axes 1000 and 500 mm: area is pi * a * b. The reference perimeter, 4844.224110273778,
    // comes from numerical integration; Ramanujan's formula is off by about 5e-10 of it.
    expect(ellipse.areaMm2).toBeCloseTo(Math.PI * 1000 * 500, 6);
    expect(Math.abs(ellipse.perimeterMm! - 4844.224110273778) / 4844.224110273778).toBeLessThan(
      1e-8,
    );
    expect(ellipse.lengthMm).toBeNull();
  });

  it("does not depend on which diagonal corners an ellipse is drawn from", () => {
    const a = measurementResultsMm({ type: "ellipse", points: ring(0, 0, 20, 10) }, scale);
    const b = measurementResultsMm({ type: "ellipse", points: ring(20, 10, 0, 0) }, scale);
    expect(b).toEqual(a);
  });

  it("returns no measures for a count, with or without a scale", () => {
    const none = { lengthMm: null, perimeterMm: null, areaMm2: null };
    expect(measurementResultsMm({ type: "count", points: [p(1, 1), p(5, 5)] }, scale)).toEqual(
      none,
    );
    expect(measurementResultsMm({ type: "count", points: [p(1, 1)] }, null)).toEqual(none);
  });

  it("requires a scale for every measured type, ellipses included", () => {
    expect(() =>
      measurementResultsMm({ type: "ellipse", points: ring(0, 0, 20, 10) }, null),
    ).toThrow(RangeError);
    expect(() => measurementResultsMm({ type: "line", points: [p(0, 0), p(1, 0)] }, null)).toThrow(
      RangeError,
    );
  });

  it("measures a scaled cloud exactly like the polygon of its control points", () => {
    const points = [p(0, 0), p(30, 0), p(0, 40)];
    expect(measurementResultsMm({ type: "cloud", points }, scale)).toEqual(
      measurementResultsMm({ type: "polygon", points }, scale),
    );
  });
});
