import { describe, expect, it } from "vitest";
import type { Calibration, Point } from "../types/domain";
import {
  applyMeasurementVertexEdit,
  boxFromCorners,
  ellipseParams,
  ellipseResultsMm,
  isAxisAlignedBoxRing,
  moveBoxVertex,
  placeholderPointsFor,
} from "./quickShapesCore";
import {
  cloudArcs,
  measurementOutlineBounds,
  measurementOutlinePoints,
  traceMeasurementOutline,
} from "./quickShapesOutline";
import { hasValidMeasurementPoints, measurementResultsMm } from "./geometry";

const box: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 6 },
  { x: 0, y: 6 },
];

// 1 page unit = 1 mm
const unitCalibration: Calibration = {
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },
  referenceDistanceMm: 10,
};

describe("boxFromCorners", () => {
  it("builds a four point ring from opposite corners", () => {
    expect(boxFromCorners({ x: 0, y: 0 }, { x: 10, y: 6 })).toEqual(box);
  });

  it("returns null for a degenerate box", () => {
    expect(boxFromCorners({ x: 3, y: 3 }, { x: 3, y: 9 })).toBeNull();
    expect(boxFromCorners({ x: 3, y: 3 }, { x: 9, y: 3 })).toBeNull();
  });

  it("makes a square with the larger side keeping each axis sign", () => {
    expect(boxFromCorners({ x: 10, y: 10 }, { x: 6, y: 20 }, true)).toEqual([
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 20 },
      { x: 10, y: 20 },
    ]);
  });

  it("clips a square to the page bounds", () => {
    const ring = boxFromCorners({ x: 90, y: 10 }, { x: 190, y: 30 }, true, {
      width: 100,
      height: 100,
    })!;
    expect(ring[2]).toEqual({ x: 100, y: 20 });
  });
});

describe("box ring helpers", () => {
  it("accepts only non degenerate axis aligned rings", () => {
    expect(isAxisAlignedBoxRing(box)).toBe(true);
    expect(isAxisAlignedBoxRing(box.slice(0, 3))).toBe(false);
    expect(isAxisAlignedBoxRing([box[0]!, box[1]!, { x: 10.5, y: 6 }, box[3]!])).toBe(false);
    expect(isAxisAlignedBoxRing([box[0]!, box[0]!, box[0]!, box[0]!])).toBe(false);
    expect(isAxisAlignedBoxRing([{ x: NaN, y: 0 }, box[1]!, box[2]!, box[3]!])).toBe(false);
  });

  it("moves one corner dragging its neighbours and keeping the opposite fixed", () => {
    expect(moveBoxVertex(box, 2, { x: 14, y: 9 })).toEqual([
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 9 },
      { x: 0, y: 9 },
    ]);
    expect(moveBoxVertex(box, 0, { x: -2, y: -1 })).toEqual([
      { x: -2, y: -1 },
      { x: 10, y: -1 },
      { x: 10, y: 6 },
      { x: -2, y: 6 },
    ]);
  });

  it("dispatches vertex edits by measurement type", () => {
    expect(applyMeasurementVertexEdit("rectangle", box, 2, { x: 12, y: 8 })).toEqual(
      moveBoxVertex(box, 2, { x: 12, y: 8 }),
    );
    expect(
      applyMeasurementVertexEdit("polygon", box.slice(0, 3), 1, { x: 11, y: 1 }),
    ).toEqual([box[0], { x: 11, y: 1 }, box[2]]);
  });

  it("validates rectangles, ellipses and clouds", () => {
    expect(hasValidMeasurementPoints("rectangle", box)).toBe(true);
    expect(hasValidMeasurementPoints("ellipse", box)).toBe(true);
    expect(hasValidMeasurementPoints("rectangle", [...box.slice(0, 3), { x: 1, y: 6 }])).toBe(false);
    expect(hasValidMeasurementPoints("cloud", box.slice(0, 3))).toBe(true);
    expect(hasValidMeasurementPoints("cloud", box.slice(0, 2))).toBe(false);
  });

  it("provides valid placeholders for every type", () => {
    for (const type of ["line", "polyline", "polygon", "rectangle", "ellipse", "cloud"] as const) {
      expect(hasValidMeasurementPoints(type, placeholderPointsFor(type))).toBe(true);
    }
  });
});

describe("ellipse results", () => {
  const square = (r: number): Point[] => [
    { x: -r, y: -r },
    { x: r, y: -r },
    { x: r, y: r },
    { x: -r, y: r },
  ];

  it("derives centre and radii from the bounding box", () => {
    expect(ellipseParams(box)).toEqual({ cx: 5, cy: 3, rx: 5, ry: 3 });
  });

  it("gives 2*pi*r and pi*r^2 for a circle", () => {
    const result = ellipseResultsMm(square(5), unitCalibration);
    expect(result.areaMm2).toBeCloseTo(Math.PI * 25, 10);
    expect(result.perimeterMm).toBeCloseTo(2 * Math.PI * 5, 10);
    expect(measurementResultsMm({ type: "ellipse", points: square(5) }, unitCalibration)).toEqual({
      lengthMm: null,
      perimeterMm: result.perimeterMm,
      areaMm2: result.areaMm2,
    });
  });

  it("uses independent X and Y scales", () => {
    const xy = {
      id: "xy",
      name: "XY",
      mode: "xy" as const,
      xReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 20 },
      yReference: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 }, referenceDistanceMm: 10 },
    };
    const result = ellipseResultsMm(square(5), xy);
    // a = 10 mm, b = 5 mm
    expect(result.areaMm2).toBeCloseTo(Math.PI * 50, 10);
    expect(result.perimeterMm).toBeCloseTo(48.4422411, 4);
  });
});

describe("cloud geometry", () => {
  const ccw: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const cw = [...ccw].reverse();

  function isOutward(points: Point[]): boolean {
    const centroid = { x: 50, y: 50 };
    return cloudArcs(points).every((arc) => {
      const mid = { x: (arc.start.x + arc.end.x) / 2, y: (arc.start.y + arc.end.y) / 2 };
      // The arc centre lies inwards of the chord, so it is closer to the centroid than the chord.
      return (
        Math.hypot(arc.center.x - centroid.x, arc.center.y - centroid.y) <
        Math.hypot(mid.x - centroid.x, mid.y - centroid.y) + 1e-9
      );
    });
  }

  it("bulges outwards for clockwise and counter-clockwise rings", () => {
    expect(isOutward(ccw)).toBe(true);
    expect(isOutward(cw)).toBe(true);
    const outline = measurementOutlinePoints("cloud", ccw, 0.1);
    expect(outline.some((point) => point.x > 100 || point.y > 100 || point.x < 0 || point.y < 0)).toBe(
      true,
    );
  });

  it.each([1e12, Number.MAX_VALUE])(
    "uses the control polygon for oversized clouds (%s)",
    (size) => {
      const points = ccw.map((point) => ({ x: (point.x / 100) * size, y: (point.y / 100) * size }));
      expect(cloudArcs(points)).toEqual([]);
      expect(measurementOutlinePoints("cloud", points)).toEqual(points);
      expect(measurementOutlineBounds("cloud", points)).toEqual({
        minX: 0,
        minY: 0,
        maxX: size,
        maxY: size,
      });
      const calls: string[] = [];
      traceMeasurementOutline(
        {
          beginPath: () => calls.push("begin"),
          moveTo: () => calls.push("move"),
          lineTo: () => calls.push("line"),
          arc: () => calls.push("arc"),
          ellipse: () => calls.push("ellipse"),
          closePath: () => calls.push("close"),
        },
        "cloud",
        points,
      );
      expect(calls).toEqual(["begin", "move", "line", "line", "line", "close"]);
    },
  );

  it("keeps scallops at the arc budget and simplifies above it", () => {
    const atLimit = ccw.map((point) => ({ x: point.x * 245.76, y: point.y * 245.76 }));
    const aboveLimit = ccw.map((point) => ({ x: point.x * 245.88, y: point.y * 245.88 }));
    expect(cloudArcs(atLimit)).toHaveLength(4096);
    expect(cloudArcs(aboveLimit)).toEqual([]);
  });

  it("bounds cloud flattening even when tolerance rounds the angular step to zero", () => {
    const outline = measurementOutlinePoints("cloud", ccw, Number.MIN_VALUE);
    expect(outline.length).toBeLessThanOrEqual(cloudArcs(ccw).length * 128);
    expect(outline.length).toBeGreaterThan(0);
    expect(outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
      true,
    );
  });

  it("is deterministic", () => {
    expect(cloudArcs([...ccw])).toEqual(cloudArcs([...ccw]));
    expect(measurementOutlinePoints("cloud", [...ccw])).toEqual(
      measurementOutlinePoints("cloud", [...ccw]),
    );
  });

  it("keeps the outline inside the expanded bounds", () => {
    const bounds = measurementOutlineBounds("cloud", ccw);
    for (const point of measurementOutlinePoints("cloud", ccw, 0.1)) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
      expect(point.x).toBeLessThanOrEqual(bounds.maxX + 1e-6);
      expect(point.y).toBeGreaterThanOrEqual(bounds.minY - 1e-6);
      expect(point.y).toBeLessThanOrEqual(bounds.maxY + 1e-6);
    }
  });
});

describe("outlines", () => {
  it("flattens an ellipse within the 32..2048 segment bounds", () => {
    expect(measurementOutlinePoints("ellipse", box).length).toBeGreaterThanOrEqual(32);
    expect(measurementOutlinePoints("ellipse", box, 1e-12).length).toBe(2048);
  });

  it("returns control points for polygonal types", () => {
    expect(measurementOutlinePoints("rectangle", box)).toBe(box);
  });

  it("traces an ellipse with a single ellipse call and polygons with lines", () => {
    const calls: string[] = [];
    const ctx = {
      beginPath: () => calls.push("begin"),
      moveTo: () => calls.push("move"),
      lineTo: () => calls.push("line"),
      arc: () => calls.push("arc"),
      ellipse: () => calls.push("ellipse"),
      closePath: () => calls.push("close"),
    };
    traceMeasurementOutline(ctx, "ellipse", box);
    expect(calls).toEqual(["begin", "ellipse", "close"]);
    calls.length = 0;
    traceMeasurementOutline(ctx, "rectangle", box);
    expect(calls).toEqual(["begin", "move", "line", "line", "line", "close"]);
  });
});
