import { describe, expect, it } from "vitest";
import type { Calibration, PageCalibration, Point } from "../types/domain";
import {
  areEffectivelyIdentical,
  constrainOrthogonal,
  distance,
  isValidCalibration,
  lineLengthMm,
  millimetresPerPageUnit,
  polygonAreaPageUnitsSquared,
  polygonPerimeterPageUnits,
  polygonResultsMm,
  calibrationScaleX,
  calibrationScaleY,
  isPredominantlyHorizontal,
  isPredominantlyVertical,
  isOrthogonalSegment,
  pathLengthMm,
} from "./geometry";

const calibration: Calibration = {
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },
  referenceDistanceMm: 1000,
};

describe("path geometry", () => {
  it("accumulates open path length without adding a closing segment", () => {
    expect(
      pathLengthMm(
        [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 3, y: 4 },
        ],
        { ...calibration, referenceDistanceMm: 10 },
        false,
      ),
    ).toBe(7);
  });

  it("constrains a candidate point to the dominant orthogonal axis", () => {
    expect(constrainOrthogonal({ x: 10, y: 20 }, { x: 30, y: 24 })).toEqual({ x: 30, y: 20 });
    expect(constrainOrthogonal({ x: 10, y: 20 }, { x: 13, y: 40 })).toEqual({ x: 10, y: 40 });
    expect(isOrthogonalSegment({ x: 0, y: 0 }, { x: 0, y: 9 })).toBe(true);
    expect(isOrthogonalSegment({ x: 0, y: 0 }, { x: 3, y: 9 })).toBe(false);
  });
});

const uniform: PageCalibration = {
  id: "uniform",
  name: "Uniform",
  mode: "uniform",
  ...calibration,
};
const xy: PageCalibration = {
  id: "xy",
  name: "X/Y",
  mode: "xy",
  xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 1 }, referenceDistanceMm: 100 },
  yReference: { start: { x: 0, y: 0 }, end: { x: 1, y: 10 }, referenceDistanceMm: 200 },
};

const logicalPageWidth = 10;
const logicalPageHeight = 12;
const asymmetricPolygon: Point[] = [
  { x: 1, y: 1 },
  { x: 5, y: 1 },
  { x: 5, y: 3 },
  { x: 3, y: 5 },
  { x: 1, y: 4 },
];
const asymmetricLine: [Point, Point] = [
  { x: 1, y: 1 },
  { x: 5, y: 3 },
];

const quarterTurns = [
  { rotation: 0 as const, transform: (point: Point): Point => ({ ...point }) },
  {
    rotation: 90 as const,
    transform: (point: Point): Point => ({
      x: logicalPageHeight - point.y,
      y: point.x,
    }),
  },
  {
    rotation: 180 as const,
    transform: (point: Point): Point => ({
      x: logicalPageWidth - point.x,
      y: logicalPageHeight - point.y,
    }),
  },
  {
    rotation: 270 as const,
    transform: (point: Point): Point => ({
      x: point.y,
      y: logicalPageWidth - point.x,
    }),
  },
] as const;

const xyBase: Extract<PageCalibration, { mode: "xy" }> = {
  id: "xy-base",
  name: "X/Y base",
  mode: "xy",
  xReference: {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    referenceDistanceMm: 100,
  },
  yReference: {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 10 },
    referenceDistanceMm: 200,
  },
};

function mapPoints(points: readonly Point[], transform: (point: Point) => Point): Point[] {
  return points.map((point) => transform(point));
}

function signedArea(points: readonly Point[]): number {
  return (
    points.reduce((total, point, index) => {
      const next = points[(index + 1) % points.length];
      return next ? total + point.x * next.y - next.x * point.y : total;
    }, 0) / 2
  );
}

function xyCalibrationAtVisualRotation(
  rotation: (typeof quarterTurns)[number]["rotation"],
): PageCalibration {
  const transform = quarterTurns.find((turn) => turn.rotation === rotation)?.transform;
  if (!transform) throw new Error(`Missing transform for ${rotation} degrees.`);

  const axesSwap = rotation === 90 || rotation === 270;
  const xSource = axesSwap ? xyBase.yReference : xyBase.xReference;
  const ySource = axesSwap ? xyBase.xReference : xyBase.yReference;
  return {
    id: `xy-${rotation}`,
    name: `X/Y ${rotation}`,
    mode: "xy",
    xReference: {
      start: transform(xSource.start),
      end: transform(xSource.end),
      referenceDistanceMm: xSource.referenceDistanceMm,
    },
    yReference: {
      start: transform(ySource.start),
      end: transform(ySource.end),
      referenceDistanceMm: ySource.referenceDistanceMm,
    },
  };
}

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

  it("keeps uniform line, perimeter, and area results exactly identical to the legacy formula", () => {
    const line: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ];
    const polygon = {
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    };
    expect(calibrationScaleX(uniform)).toBe(millimetresPerPageUnit(calibration));
    expect(calibrationScaleY(uniform)).toBe(millimetresPerPageUnit(calibration));
    expect(lineLengthMm(line, uniform)).toBe(lineLengthMm(line, calibration));
    expect(polygonResultsMm(polygon, uniform)).toEqual(polygonResultsMm(polygon, calibration));
  });

  it("keeps uniform line, perimeter, and area invariant under quarter-turns", () => {
    const baseLineMm = lineLengthMm(asymmetricLine, uniform);
    const basePolygonMm = polygonResultsMm({ points: asymmetricPolygon }, uniform);

    for (const { transform } of quarterTurns) {
      const rotatedLine = mapPoints(asymmetricLine, transform) as [Point, Point];
      const rotatedPolygon = mapPoints(asymmetricPolygon, transform);
      const rotatedResults = polygonResultsMm({ points: rotatedPolygon }, uniform);

      expect(lineLengthMm(rotatedLine, uniform)).toBeCloseTo(baseLineMm, 10);
      expect(rotatedResults.perimeterMm).toBeCloseTo(basePolygonMm.perimeterMm, 10);
      expect(rotatedResults.areaMm2).toBeCloseTo(basePolygonMm.areaMm2, 10);
    }
  });

  it("keeps measurements invariant under horizontal/vertical mirrors and vertex winding", () => {
    const mirrors = [
      {
        name: "mirrorX",
        // Flip the horizontal screen coordinate (left/right).
        transform: (point: Point): Point => ({
          x: logicalPageWidth - point.x,
          y: point.y,
        }),
      },
      {
        name: "mirrorY",
        // Flip the vertical screen coordinate (top/bottom).
        transform: (point: Point): Point => ({
          x: point.x,
          y: logicalPageHeight - point.y,
        }),
      },
    ];
    const baseUniformLineMm = lineLengthMm(asymmetricLine, uniform);
    const baseUniformPolygonMm = polygonResultsMm({ points: asymmetricPolygon }, uniform);
    const baseXyLineMm = lineLengthMm(asymmetricLine, xyBase);
    const baseXyPolygonMm = polygonResultsMm({ points: asymmetricPolygon }, xyBase);

    for (const { transform } of mirrors) {
      const mirroredLine = mapPoints(asymmetricLine, transform) as [Point, Point];
      const mirroredPolygon = mapPoints(asymmetricPolygon, transform);
      const mirroredUniformResults = polygonResultsMm({ points: mirroredPolygon }, uniform);
      const mirroredXyResults = polygonResultsMm({ points: mirroredPolygon }, xyBase);

      expect(lineLengthMm(mirroredLine, uniform)).toBeCloseTo(baseUniformLineMm, 10);
      expect(mirroredUniformResults.perimeterMm).toBeCloseTo(baseUniformPolygonMm.perimeterMm, 10);
      expect(mirroredUniformResults.areaMm2).toBeCloseTo(baseUniformPolygonMm.areaMm2, 10);
      expect(lineLengthMm(mirroredLine, xyBase)).toBeCloseTo(baseXyLineMm, 10);
      expect(mirroredXyResults.perimeterMm).toBeCloseTo(baseXyPolygonMm.perimeterMm, 10);
      expect(mirroredXyResults.areaMm2).toBeCloseTo(baseXyPolygonMm.areaMm2, 10);

      expect(signedArea(mirroredPolygon)).toBeCloseTo(-signedArea(asymmetricPolygon), 10);
      const reversed = [...mirroredPolygon].reverse();
      expect(signedArea(reversed)).toBeCloseTo(-signedArea(mirroredPolygon), 10);
      expect(polygonAreaPageUnitsSquared(reversed)).toBeCloseTo(
        polygonAreaPageUnitsSquared(mirroredPolygon),
        10,
      );
      expect(polygonResultsMm({ points: reversed }, xyBase).areaMm2).toBeCloseTo(
        baseXyPolygonMm.areaMm2,
        10,
      );
    }
  });

  it("uses independent X/Y scales for diagonal, horizontal, vertical, perimeter, and area", () => {
    expect(calibrationScaleX(xy)).toBe(10);
    expect(calibrationScaleY(xy)).toBe(20);
    expect(
      lineLengthMm(
        [
          { x: 0, y: 0 },
          { x: 3, y: 4 },
        ],
        xy,
      ),
    ).toBeCloseTo(Math.hypot(30, 80));
    expect(
      lineLengthMm(
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        xy,
      ),
    ).toBe(50);
    expect(
      lineLengthMm(
        [
          { x: 0, y: 0 },
          { x: 0, y: 5 },
        ],
        xy,
      ),
    ).toBe(100);
    const rectangle = {
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 },
        { x: 0, y: 4 },
      ],
    };
    expect(polygonResultsMm(rectangle, xy)).toEqual({ perimeterMm: 220, areaMm2: 2400 });
  });

  it("does not use an average X/Y scale for diagonal lines or perimeters", () => {
    const diagonal = lineLengthMm(
      [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
      xy,
    );
    expect(diagonal).not.toBe(Math.hypot(3, 4) * 15);
    const rectangle = {
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 },
        { x: 0, y: 4 },
      ],
    };
    expect(polygonResultsMm(rectangle, xy).perimeterMm).not.toBe(
      polygonPerimeterPageUnits(rectangle.points) * 15,
    );
  });

  it("uses visual X/Y references after rotation, swapping scales only for 90/270 degrees", () => {
    const baseLineMm = lineLengthMm(asymmetricLine, xyBase);
    const basePolygonMm = polygonResultsMm({ points: asymmetricPolygon }, xyBase);

    for (const { rotation, transform } of quarterTurns) {
      const visualCalibration = xyCalibrationAtVisualRotation(rotation);
      const rotatedLine = mapPoints(asymmetricLine, transform) as [Point, Point];
      const rotatedPolygon = mapPoints(asymmetricPolygon, transform);
      const rotatedResults = polygonResultsMm({ points: rotatedPolygon }, visualCalibration);
      const expectedScaleX = rotation === 90 || rotation === 270 ? 20 : 10;
      const expectedScaleY = rotation === 90 || rotation === 270 ? 10 : 20;

      expect(calibrationScaleX(visualCalibration)).toBe(expectedScaleX);
      expect(calibrationScaleY(visualCalibration)).toBe(expectedScaleY);
      expect(lineLengthMm(rotatedLine, visualCalibration)).toBeCloseTo(baseLineMm, 10);
      expect(rotatedResults.perimeterMm).toBeCloseTo(basePolygonMm.perimeterMm, 10);
      expect(rotatedResults.areaMm2).toBeCloseTo(basePolygonMm.areaMm2, 10);
    }

    // Reusing the unrotated anisotropic axes after a 90° visual rotation is
    // intentionally not invariant for lengths/perimeters. The app's X/Y
    // references are selected in the current visual viewport, so the physical
    // reference distances must follow the visual axes instead.
    const naive90 = polygonResultsMm(
      { points: mapPoints(asymmetricPolygon, quarterTurns[1]!.transform) },
      xyBase,
    );
    expect(naive90.perimeterMm).not.toBeCloseTo(basePolygonMm.perimeterMm, 8);
    expect(naive90.areaMm2).toBeCloseTo(basePolygonMm.areaMm2, 10);
  });

  it("accepts small reference click deviation only in the intended primary axis", () => {
    expect(isPredominantlyHorizontal({ x: 0, y: 0 }, { x: 10, y: 1 })).toBe(true);
    expect(isPredominantlyHorizontal({ x: 0, y: 0 }, { x: 1, y: 10 })).toBe(false);
    expect(isPredominantlyVertical({ x: 0, y: 0 }, { x: 1, y: 10 })).toBe(true);
    expect(isPredominantlyVertical({ x: 0, y: 0 }, { x: 10, y: 1 })).toBe(false);
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
