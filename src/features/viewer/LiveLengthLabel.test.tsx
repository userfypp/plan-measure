// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { PageState } from "../../types/domain";
import { createLabelCollisionIndex } from "../../utils/labelLayout";
import {
  MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX,
  averagePoint,
  measureLabelText,
  placeMeasurementLabel,
  planLabelLayout,
} from "./annotationLabelLayout";

vi.mock("konva/lib/shapes/Text", () => ({
  Text: class {
    constructor(private config: { text: string; fontSize: number; padding: number }) {}
    width() {
      return this.config.text.length * this.config.fontSize * 0.6 + 2 * this.config.padding;
    }
    height() {
      return this.config.fontSize + 2 * this.config.padding;
    }
  },
}));

describe("live length label placement", () => {
  it("matches the final label placement for the same segment", () => {
    const points = [
      { x: 100, y: 100 },
      { x: 300, y: 160 },
    ];
    const bounds = { width: 1000, height: 800 } as Parameters<typeof planLabelLayout>[0]["bounds"];
    const zoom = 1.5;
    const text = "2.00 m";
    const page = {
      calibrations: [],
      measurements: [{ id: "m", type: "line", points, visible: true }],
    } as unknown as PageState;
    const final = planLabelLayout({
      bounds,
      calibrationReferenceEdit: null,
      page,
      labelData: new Map([
        ["m", { anchor: averagePoint(points), minX: 100, maxX: 300, minY: 100, maxY: 160, text }],
      ]),
      selectedMeasurementId: null,
      showCalibration: false,
      showMeasurementLabels: true,
      zoom,
    }).placements.get("measurement:m");
    const live = placeMeasurementLabel(
      "line",
      points,
      averagePoint(points),
      measureLabelText(text, MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX, zoom),
      bounds,
      zoom,
      createLabelCollisionIndex(),
    );
    expect(final).toBeDefined();
    expect(live).toEqual(final);
  });
});
