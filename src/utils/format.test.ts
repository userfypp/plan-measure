import { describe, expect, it } from "vitest";
import type { LineMeasurement, PolygonMeasurement, UniformPageCalibration } from "../types/domain";
import { formatCsvNumber, formatDisplayNumber, formatMeasurement, formatNumber } from "./format";

const calibration: UniformPageCalibration = {
  id: "scale-1",
  name: "Scale 1",
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
  referenceDistanceMm: 1,
};

const line: LineMeasurement = {
  id: "line-1",
  type: "line",
  name: "Small line",
  calibrationId: calibration.id,
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ],
};

const polygon: PolygonMeasurement = {
  id: "polygon-1",
  type: "polygon",
  name: "Small polygon",
  calibrationId: calibration.id,
  points: [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: 0, y: 2 },
  ],
};

describe("measurement formatting", () => {
  it("keeps the normal two-decimal UI rule for ordinary values", () => {
    expect(formatDisplayNumber(12.345)).toBe("12.35");
    expect(formatNumber(12.345)).toBe("12.35");
  });

  it.each([
    [0, "12"],
    [2, "12.35"],
    [3, "12.346"],
    [6, "12.345670"],
  ] as const)("formats ordinary UI values with %d decimal places", (decimalPlaces, expected) => {
    expect(formatDisplayNumber(12.34567, decimalPlaces)).toBe(expected);
  });

  it("shows additional UI decimals when two decimals would produce zero", () => {
    expect(formatDisplayNumber(0.004)).toBe("0.004");
    expect(formatDisplayNumber(0.000004)).toBe("0.000004");
  });

  it("preserves a finite non-zero value when the selected precision would display zero", () => {
    expect(formatDisplayNumber(0.4, 0)).toBe("0.4");
    expect(formatDisplayNumber(0.004, 2)).toBe("0.004");
    expect(formatDisplayNumber(0.0000004, 6)).toBe("0.0000004");
  });

  it("preserves CSV precision while keeping two decimals for ordinary values", () => {
    expect(formatCsvNumber(12.5)).toBe("12.50");
    expect(formatCsvNumber(12.345)).toBe("12.345");
    expect(formatCsvNumber(0.004)).toBe("0.004");
  });

  it.each([
    ["mm", "4.00 mm"],
    ["cm", "0.40 cm"],
    ["m", "0.004 m"],
  ] as const)("formats small lengths in %s", (unit, expected) => {
    expect(formatMeasurement(line, calibration, unit)).toBe(expected);
  });

  it.each([
    ["mm", "P 8.00 mm · A 4.00 mm²"],
    ["cm", "P 0.80 cm · A 0.04 cm²"],
    ["m", "P 0.01 m · A 0.000004 m²"],
  ] as const)("formats small perimeters and areas in %s", (unit, expected) => {
    expect(formatMeasurement(polygon, calibration, unit)).toBe(expected);
  });

  it("applies the selected precision to metre lengths, perimeter, and area", () => {
    expect(formatMeasurement(line, calibration, "m", 6)).toBe("0.004000 m");
    expect(formatMeasurement(polygon, calibration, "m", 3)).toBe(
      "P 0.008 m · A 0.000004 m²",
    );
    expect(formatMeasurement(polygon, calibration, "mm", 0)).toBe("P 8 mm · A 4 mm²");
  });

  it("does not format a self-intersecting Polygon as a valid area", () => {
    expect(
      formatMeasurement(
        {
          type: "polygon",
          points: [
            { x: 0, y: 0 },
            { x: 6, y: 5 },
            { x: 0, y: 4 },
            { x: 4, y: 0 },
          ],
        },
        calibration,
        "mm",
      ),
    ).toBe("Repair required");
  });

  it("shows repair required instead of an infinite measurement result", () => {
    expect(
      formatMeasurement(
        {
          type: "line",
          points: [
            { x: 0, y: 0 },
            { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
          ],
        },
        calibration,
        "mm",
      ),
    ).toBe("Repair required");
  });
});
