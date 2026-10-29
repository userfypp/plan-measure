import { describe, expect, it } from "vitest";
import type { LineMeasurement, PathMeasurement, UniformPageCalibration } from "../../types/domain";
import { formatMeasurement } from "../../utils/format";
import { composeLabelText, measurementLabelText } from "./labelContent";

describe("composeLabelText", () => {
  it("keeps the value alone by default and prefixes the name on request", () => {
    expect(composeLabelText("12.50 m", "Wall A", "value")).toBe("12.50 m");
    expect(composeLabelText("12.50 m", "Wall A", "name-value")).toBe("Wall A · 12.50 m");
  });

  it("ignores empty names", () => {
    expect(composeLabelText("3 items", "  ", "name-value")).toBe("3 items");
    expect(composeLabelText("3 items", undefined, "name-value")).toBe("3 items");
  });

  it("is identical without a classification", () => {
    expect(composeLabelText("12.50 m", "Wall A", "name-value", undefined)).toBe("Wall A · 12.50 m");
    expect(composeLabelText("12.50 m", "Wall A", "name-value", "")).toBe("Wall A · 12.50 m");
  });

  it("orders name, classification and value", () => {
    expect(composeLabelText("12.50 m", "Wall A", "name-value", "Electrical")).toBe(
      "Wall A · Electrical · 12.50 m",
    );
    expect(composeLabelText("12.50 m", "Wall A", "value", "Electrical")).toBe(
      "Electrical · 12.50 m",
    );
  });

  it("uses the name as the label when there is no value, whatever the preference", () => {
    expect(composeLabelText("", "Cloud 1", "value")).toBe("Cloud 1");
    expect(composeLabelText("", "Cloud 1", "name-value")).toBe("Cloud 1");
    expect(composeLabelText("", "Cloud 1", "value", "Electrical")).toBe("Cloud 1 · Electrical");
  });
});

describe("measurementLabelText", () => {
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
  const cloud: PathMeasurement = {
    id: "cloud-1",
    type: "cloud",
    name: "Revision A",
    calibrationId: calibration.id,
    points: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ],
    classificationValueIds: [],
    visible: true,
  };

  it("labels an unmeasured cloud with its name whatever the label content", () => {
    expect(measurementLabelText(cloud, null, "m", 2, "auto", "value")).toBe("Revision A");
    expect(measurementLabelText(cloud, null, "m", 2, "auto", "name-value")).toBe("Revision A");
    expect(measurementLabelText(cloud, null, "m", 2, "auto", "value", "Electrical")).toBe(
      "Revision A · Electrical",
    );
  });

  it("labels a measured cloud and the other types as before", () => {
    expect(measurementLabelText(cloud, calibration, "m", 2, "auto", "value")).toBe(
      formatMeasurement(cloud, calibration, "m", 2),
    );
    expect(measurementLabelText(line, calibration, "m", 2, "auto", "name-value")).toBe(
      "Small line · 0.004 m",
    );
  });

  it("has no label for a scaled type without a scale, and a count keeps its label", () => {
    expect(measurementLabelText(line, null, "m", 2, "auto", "value")).toBeNull();
    const count = {
      id: "count-1",
      type: "count" as const,
      name: "Sockets",
      calibrationId: null,
      points: [{ x: 1, y: 1 }],
    };
    expect(measurementLabelText(count, null, "m", 2, "auto", "value")).toBe("1 item");
  });
});
