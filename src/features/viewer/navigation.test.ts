import { describe, expect, it } from "vitest";
import { pageToScreen, screenToPage } from "../../utils/coordinates";
import { beginCalibrationFlow, selectCalibrationReference } from "../../app/calibrationFlow";
import { isPrimaryViewerClick, startsViewerPan } from "./navigation";

describe("viewer navigation gestures", () => {
  it.each(["select", "line", "polyline", "polygon", "calibrate"] as const)(
    "starts a middle-button pan while %s is active",
    (tool) => {
      expect(startsViewerPan(tool, false, 1)).toBe(true);
    },
  );

  it("keeps Hand and Space on the existing primary-button pan path", () => {
    expect(startsViewerPan("hand", false, 0)).toBe(true);
    expect(startsViewerPan("line", true, 0)).toBe(true);
    expect(startsViewerPan("line", false, 0)).toBe(false);
    expect(startsViewerPan("line", false, 2)).toBe(false);
  });

  it("accepts only primary clicks as drawing input", () => {
    expect(isPrimaryViewerClick(0)).toBe(true);
    expect(isPrimaryViewerClick(1)).toBe(false);
    expect(isPrimaryViewerClick(2)).toBe(false);
  });

  it("keeps calibration document points and phase correct after a pan", () => {
    const first = { x: 24, y: 30 };
    const second = { x: 160, y: 210 };
    const transformBeforePan = { zoom: 1.75, panX: 40, panY: -25 };
    const transformAfterPan = { ...transformBeforePan, panX: -120, panY: 95 };

    const secondScreenPoint = pageToScreen(second, transformAfterPan);
    const secondDocumentPoint = screenToPage(secondScreenPoint, transformAfterPan);
    expect(secondDocumentPoint).toEqual(second);

    const uniform = beginCalibrationFlow(1, null, "uniform");
    expect(selectCalibrationReference(uniform, [first, secondDocumentPoint])).toMatchObject({
      phase: "uniform",
      points: [first, second],
    });

    const xy = beginCalibrationFlow(1, null, "xy");
    expect(selectCalibrationReference(xy, [first, secondDocumentPoint])).toMatchObject({
      phase: "x",
      points: [first, second],
    });
  });
});
