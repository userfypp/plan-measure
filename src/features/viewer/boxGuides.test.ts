import { describe, expect, it } from "vitest";
import type { PageCalibration } from "../../types/domain";
import { boxGuideBounds, boxGuideDimensionTexts } from "./boxGuides";

const calibration: PageCalibration = {
  id: "c",
  name: "Scale",
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  referenceDistanceMm: 5000,
};

describe("boxGuides", () => {
  it("computes the bounds of the draft ring", () => {
    expect(boxGuideBounds([])).toBeNull();
    expect(
      boxGuideBounds([
        { x: 20, y: 30 },
        { x: 120, y: 30 },
        { x: 120, y: 80 },
        { x: 20, y: 80 },
      ]),
    ).toEqual({ minX: 20, minY: 30, maxX: 120, maxY: 80 });
  });

  it("formats calibrated dimensions and falls back to pixels without a scale", () => {
    expect(boxGuideDimensionTexts(100, 50, calibration, "m", 2)).toEqual({
      width: "5.00 m",
      height: "2.50 m",
    });
    expect(boxGuideDimensionTexts(100.4, 49.6, null, "m", 2)).toEqual({
      width: "100 px",
      height: "50 px",
    });
  });

  it.each(["m", "ft-in"] as const)(
    "shows Repair required when a scaled side overflows (%s)",
    (displayUnit) => {
      const extreme: PageCalibration = { ...calibration, referenceDistanceMm: 1e308 };
      expect(boxGuideDimensionTexts(1000, 1000, extreme, displayUnit, 2)).toEqual({
        width: "Repair required",
        height: "Repair required",
      });
    },
  );
});
