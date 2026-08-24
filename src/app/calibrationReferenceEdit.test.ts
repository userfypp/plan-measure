import { describe, expect, it } from "vitest";
import type { PageCalibration } from "../types/domain";
import {
  beginCalibrationReferenceEdit,
  cancelCalibrationReferenceEdit,
  updateCalibrationReferenceEdit,
} from "./calibrationReferenceEdit";

const uniform: PageCalibration = {
  id: "uniform",
  name: "Uniform scale",
  mode: "uniform",
  start: { x: 10, y: 20 },
  end: { x: 110, y: 20 },
  referenceDistanceMm: 1000,
};

const xy: PageCalibration = {
  id: "xy",
  name: "X/Y scale",
  mode: "xy",
  xReference: { start: { x: 0, y: 0 }, end: { x: 100, y: 10 }, referenceDistanceMm: 1000 },
  yReference: { start: { x: 0, y: 0 }, end: { x: 10, y: 100 }, referenceDistanceMm: 2000 },
};

describe("calibration reference edit draft", () => {
  it("enters with copied uniform points, previews a handle move, and cancels without mutation", () => {
    const edit = beginCalibrationReferenceEdit(2, uniform, "uniform");
    expect(edit).toMatchObject({ pageNumber: 2, calibrationId: "uniform", reference: "uniform" });
    if (!edit) throw new Error("Expected an edit draft.");

    const moved = updateCalibrationReferenceEdit(edit, [
      { x: 20, y: 20 },
      { x: 110, y: 20 },
    ]);
    expect(moved.points).toEqual([{ x: 20, y: 20 }, { x: 110, y: 20 }]);
    expect(moved.originalPoints).toEqual([{ x: 10, y: 20 }, { x: 110, y: 20 }]);
    expect(uniform.start).toEqual({ x: 10, y: 20 });
    expect(cancelCalibrationReferenceEdit()).toBeNull();
  });

  it("edits X or Y independently and rejects an incompatible reference key", () => {
    expect(beginCalibrationReferenceEdit(1, xy, "x")?.points).toEqual([
      xy.xReference.start,
      xy.xReference.end,
    ]);
    expect(beginCalibrationReferenceEdit(1, xy, "y")?.points).toEqual([
      xy.yReference.start,
      xy.yReference.end,
    ]);
    expect(beginCalibrationReferenceEdit(1, xy, "uniform")).toBeNull();
  });
});
