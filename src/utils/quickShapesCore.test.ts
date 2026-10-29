import { describe, expect, it } from "vitest";
import type { Point } from "../types/domain";
import {
  applyMeasurementVertexEdit,
  BOX_SIDE_TARGET_OFFSET,
  measurementEditTargetCount,
  measurementEditTargetPoint,
  moveBoxSide,
} from "./quickShapesCore";

// boxFromCorners: sides 0 and 2 are horizontal, 1 and 3 vertical.
const BOX: Point[] = [
  { x: 10, y: 20 },
  { x: 50, y: 20 },
  { x: 50, y: 60 },
  { x: 10, y: 60 },
];

describe("box sides", () => {
  it("moves a horizontal side vertically and a vertical side horizontally, ignoring the other axis", () => {
    expect(moveBoxSide(BOX, 0, { x: 999, y: 5 })).toEqual([
      { x: 10, y: 5 },
      { x: 50, y: 5 },
      BOX[2],
      BOX[3],
    ]);
    expect(moveBoxSide(BOX, 1, { x: 80, y: -999 })).toEqual([
      BOX[0],
      { x: 80, y: 20 },
      { x: 80, y: 60 },
      BOX[3],
    ]);
    expect(moveBoxSide(BOX, 3, { x: 0, y: 0 })).toEqual([
      { x: 0, y: 20 },
      BOX[1],
      BOX[2],
      { x: 0, y: 60 },
    ]);
  });

  it("returns a copy and leaves the source ring and unknown sides untouched", () => {
    const before = structuredClone(BOX);
    const moved = moveBoxSide(BOX, 2, { x: 0, y: 90 });
    expect(moved[2]).toEqual({ x: 50, y: 90 });
    expect(BOX).toEqual(before);
    expect(moveBoxSide(BOX, 4, { x: 0, y: 0 })).toEqual(BOX);
    expect(moveBoxSide(BOX, 4, { x: 0, y: 0 })[0]).not.toBe(BOX[0]);
    expect(moveBoxSide(BOX.slice(0, 3), 0, { x: 0, y: 0 })).toEqual(BOX.slice(0, 3));
  });

  it("offers four corners and four sides on boxes only", () => {
    expect(measurementEditTargetCount("rectangle", BOX)).toBe(8);
    expect(measurementEditTargetCount("ellipse", BOX)).toBe(8);
    expect(measurementEditTargetCount("polygon", BOX)).toBe(4);
    expect(measurementEditTargetCount("cloud", BOX)).toBe(4);
    expect(measurementEditTargetCount("line", BOX.slice(0, 2))).toBe(2);
  });

  it("places side targets in the middle of their side and corners on their vertex", () => {
    expect(
      Array.from({ length: 8 }, (_, index) => measurementEditTargetPoint("rectangle", BOX, index)),
    ).toEqual([...BOX, { x: 30, y: 20 }, { x: 50, y: 40 }, { x: 30, y: 60 }, { x: 10, y: 40 }]);
    expect(measurementEditTargetPoint("rectangle", BOX, 8)).toBeUndefined();
    expect(measurementEditTargetPoint("polygon", BOX, BOX_SIDE_TARGET_OFFSET)).toBeUndefined();
  });

  it("edits a side through the side targets and a corner through the corner targets", () => {
    expect(applyMeasurementVertexEdit("ellipse", BOX, 5, { x: 70, y: 0 })).toEqual(
      moveBoxSide(BOX, 1, { x: 70, y: 0 }),
    );
    expect(applyMeasurementVertexEdit("rectangle", BOX, 2, { x: 70, y: 90 })).toEqual([
      BOX[0],
      { x: 70, y: 20 },
      { x: 70, y: 90 },
      { x: 10, y: 90 },
    ]);
    expect(applyMeasurementVertexEdit("polygon", BOX, 2, { x: 70, y: 90 })).toEqual([
      BOX[0],
      BOX[1],
      { x: 70, y: 90 },
      BOX[3],
    ]);
  });
});
