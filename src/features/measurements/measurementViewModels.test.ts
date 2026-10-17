import { describe, expect, it } from "vitest";
import type { PageState, PathMeasurement } from "../../types/domain";
import {
  createMeasurementViewModel,
  type MeasurementValueLabelCache,
} from "./measurementViewModels";

const page: PageState = {
  pageNumber: 1,
  calibrations: [
    {
      id: "scale",
      name: "Main plan",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
  ],
  activeCalibrationId: "scale",
  nextCalibrationNumber: 2,
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

const points = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
];

function cloud(overrides: Partial<PathMeasurement> = {}): PathMeasurement {
  return {
    id: "cloud-1",
    type: "cloud",
    name: "Cloud 1",
    calibrationId: "scale",
    points,
    classificationValueIds: [],
    visible: true,
    ...overrides,
  };
}

describe("revision clouds in measurement view models", () => {
  it("shows no measures instead of a zero or an unavailable scale when clouds are not measured", () => {
    for (const measurement of [cloud(), cloud({ calibrationId: null })]) {
      const view = createMeasurementViewModel(page, measurement, "m", false, 2, "auto");
      expect(view.valueLabel).toBe("No measures");
      expect(view.calibrationSummary).toBe("No scale required");
      expect(view.hasCalibration).toBe(false);
    }
  });

  it("keeps a cloud without a scale unmeasured even when clouds are measured", () => {
    const view = createMeasurementViewModel(
      page,
      cloud({ calibrationId: null }),
      "m",
      false,
      2,
      "auto",
      undefined,
      true,
    );
    expect(view.valueLabel).toBe("No measures");
    expect(view.hasCalibration).toBe(false);
  });

  it("formats a cloud with a scale like a polygon when clouds are measured", () => {
    const view = createMeasurementViewModel(page, cloud(), "m", false, 2, "auto", undefined, true);
    expect(view.valueLabel).toBe("P 3.41 m · A 0.50 m²");
    expect(view.calibrationSummary).toBe("Main plan · Uniform");
    expect(view.hasCalibration).toBe(true);
  });

  it("does not reuse a cached cloud value when the setting changes", () => {
    const cache: MeasurementValueLabelCache = new WeakMap();
    const measurement = cloud();
    const labels = (measureClouds: boolean) =>
      createMeasurementViewModel(page, measurement, "m", false, 2, "auto", cache, measureClouds)
        .valueLabel;
    expect(labels(false)).toBe("No measures");
    expect(labels(true)).toBe("P 3.41 m · A 0.50 m²");
    expect(labels(false)).toBe("No measures");
  });
});
