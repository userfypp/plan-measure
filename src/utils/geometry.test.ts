import { describe, expect, it } from "vitest";
import type { Calibration } from "../types/domain";
import {
  areEffectivelyIdentical,
  distance,
  isValidCalibration,
  lineLengthMm,
  millimetresPerPageUnit,
  polygonAreaPageUnitsSquared,
  polygonPerimeterPageUnits,
  polygonResultsMm,
} from "./geometry";

const calibration: Calibration = {
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },
  referenceDistanceMm: 1000,
};

describe("geometry", () => {
  it("calculates horizontal, vertical, and diagonal distances", () => {
    expect(distance({ x: 1, y: 2 }, { x: 6, y: 2 })).toBe(5);
    expect(distance({ x: 1, y: 2 }, { x: 1, y: 9 })).toBe(7);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("calculates rectangle perimeter and area", () => {
    const rectangle = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(polygonPerimeterPageUnits(rectangle)).toBe(14);
    expect(polygonAreaPageUnitsSquared(rectangle)).toBe(12);
  });

  it("calculates an irregular polygon area", () => {
    const irregular = [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 4, y: 4 },
      { x: 2, y: 5 },
    ];
    expect(polygonAreaPageUnitsSquared(irregular)).toBe(10.5);
  });

  it("uses calibration for physical line length", () => {
    expect(millimetresPerPageUnit(calibration)).toBe(100);
    expect(
      lineLengthMm(
        [
          { x: 0, y: 0 },
          { x: 25, y: 0 },
        ],
        calibration,
      ),
    ).toBe(2500);
  });

  it("recalibrates values while preserving geometry", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 25, y: 0 },
    ] as const;
    const changed = { ...calibration, referenceDistanceMm: 2000 };
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 25, y: 0 },
    ]);
    expect(lineLengthMm([...points], changed)).toBe(lineLengthMm([...points], calibration) * 2);
  });

  it("scales area by the square of the linear calibration", () => {
    const square = {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    };
    const first = polygonResultsMm(square, calibration);
    const second = polygonResultsMm(square, { ...calibration, referenceDistanceMm: 2000 });
    expect(second.perimeterMm).toBe(first.perimeterMm * 2);
    expect(second.areaMm2).toBe(first.areaMm2 * 4);
  });

  it("rejects only identical or numerically indistinguishable calibration points", () => {
    expect(areEffectivelyIdentical({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
    expect(
      areEffectivelyIdentical({ x: 1e12, y: 1e12 }, { x: 1e12 + Number.EPSILON, y: 1e12 }),
    ).toBe(true);
    expect(areEffectivelyIdentical({ x: 0, y: 0 }, { x: 0.000001, y: 0 })).toBe(false);
  });

  it("rejects invalid canonical calibration distances", () => {
    expect(isValidCalibration(calibration)).toBe(true);
    expect(isValidCalibration({ ...calibration, referenceDistanceMm: 0 })).toBe(false);
    expect(
      isValidCalibration({ ...calibration, referenceDistanceMm: Number.POSITIVE_INFINITY }),
    ).toBe(false);
    expect(() =>
      millimetresPerPageUnit({ ...calibration, referenceDistanceMm: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError);
  });
});
