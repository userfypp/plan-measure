import { describe, expect, it } from "vitest";
import type { PageState } from "../types/domain";
import { getActiveCalibration, getMeasurementCalibration } from "./calibration";

const page: PageState = {
  pageNumber: 1,
  calibrations: [
    {
      id: "scale-1",
      name: "Main plan",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
    {
      id: "scale-2",
      name: "Detail A",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 5000,
    },
  ],
  activeCalibrationId: "scale-1",
  nextCalibrationNumber: 3,
  measurements: [],
  nextLineNumber: 1,
  nextPolygonNumber: 1,
};

describe("page calibration resolution", () => {
  it("resolves a measurement by its stored calibration ID instead of the active scale", () => {
    const measurement = {
      id: "line-1",
      type: "line" as const,
      name: "Detail measurement",
      calibrationId: "scale-2",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ] as [{ x: number; y: number }, { x: number; y: number }],
    };

    expect(getActiveCalibration(page)?.id).toBe("scale-1");
    expect(getMeasurementCalibration(page, measurement)?.id).toBe("scale-2");
  });
});
