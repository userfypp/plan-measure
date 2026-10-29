import { describe, expect, it } from "vitest";
import type { PageState } from "../types/domain";
import {
  getActiveCalibration,
  getMeasurementCalibration,
  getMeasuringCalibration,
  isCloudMeasured,
} from "./calibration";

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
  nextMeasurementNumber: {
    line: 1,
    polyline: 1,
    polygon: 1,
    rectangle: 1,
    ellipse: 1,
    cloud: 1,
    count: 1,
  },
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

describe("revision cloud measuring scale", () => {
  const cloudPoints = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];
  const scaledCloud = {
    id: "cloud-1",
    type: "cloud" as const,
    name: "Cloud 1",
    calibrationId: "scale-2",
    points: cloudPoints,
  };
  const freeCloud = { ...scaledCloud, id: "cloud-2", calibrationId: null };
  const polygon = { ...scaledCloud, id: "polygon-1", type: "polygon" as const };
  const scale = page.calibrations[1]!;

  it("measures a cloud only when the project measures clouds and the cloud has a scale", () => {
    expect(isCloudMeasured(scaledCloud, scale, true)).toBe(true);
    expect(isCloudMeasured(scaledCloud, scale, false)).toBe(false);
    expect(isCloudMeasured(freeCloud, null, true)).toBe(false);
    expect(isCloudMeasured(freeCloud, null, false)).toBe(false);
  });

  it("never treats other types as measured clouds", () => {
    expect(isCloudMeasured(polygon, scale, true)).toBe(false);
  });

  it("gives clouds their measuring scale only when they are measured", () => {
    expect(getMeasuringCalibration(page, scaledCloud, true)?.id).toBe("scale-2");
    expect(getMeasuringCalibration(page, scaledCloud, false)).toBeNull();
    expect(getMeasuringCalibration(page, freeCloud, true)).toBeNull();
  });

  it("leaves the scale of every other type to the stored calibration", () => {
    expect(getMeasuringCalibration(page, polygon, false)?.id).toBe("scale-2");
    expect(getMeasuringCalibration(page, polygon, true)?.id).toBe("scale-2");
  });
});
