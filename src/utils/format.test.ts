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

  it("shows additional UI decimals when two decimals would produce zero", () => {
    expect(formatDisplayNumber(0.004)).toBe("0.004");
    expect(formatDisplayNumber(0.000004)).toBe("0.000004");
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
});
