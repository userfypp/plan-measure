// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Measurement, PageState, Point } from "../../types/domain";
import { planLabelLayout, type MeasurementLabelData } from "./annotationLabelLayout";

// jsdom has no 2D context: measure each glyph as 0.6 em of the context font size.
beforeAll(() => {
  const context = {
    font: "10px sans-serif",
    fillStyle: "",
    save() {},
    restore() {},
    clearRect() {},
    fillRect() {},
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4).map((_, index) =>
        index % 4 === 3 ? 255 : 40,
      ),
    }),
    measureText(text: string) {
      const fontSize = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
      return { width: text.length * fontSize * 0.6 };
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
});

const BOUNDS = { width: 1000, height: 1000, rotation: 0 as const };

function line(id: string, start: Point, end: Point): Measurement {
  return {
    id,
    type: "line",
    points: [start, end],
    visible: true,
    classificationValueIds: [],
  } as unknown as Measurement;
}

function labelDataFor(measurements: Measurement[]) {
  return new Map<string, MeasurementLabelData>(
    measurements.map((measurement) => {
      const [start, end] = measurement.points as [Point, Point];
      return [
        measurement.id,
        {
          anchor: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
          minX: Math.min(start.x, end.x),
          maxX: Math.max(start.x, end.x),
          minY: Math.min(start.y, end.y),
          maxY: Math.max(start.y, end.y),
          text: "12.50 m",
        },
      ];
    }),
  );
}

function plan(measurements: Measurement[]) {
  return planLabelLayout({
    bounds: BOUNDS,
    calibrationReferenceEdit: null,
    page: { measurements, calibrations: [] } as unknown as PageState,
    labelData: labelDataFor(measurements),
    showCalibration: false,
    showMeasurementLabels: true,
    zoom: 1,
  }).placements;
}

// Two lines crossing at the same midpoint, so their labels compete for the same spot.
const horizontal = line("horizontal", { x: 100, y: 500 }, { x: 900, y: 500 });
const vertical = line("vertical", { x: 500, y: 100 }, { x: 500, y: 900 });
const diagonal = line("diagonal", { x: 200, y: 200 }, { x: 800, y: 800 });

describe("planLabelLayout", () => {
  it("places labels in page order, so earlier labels keep their spot", () => {
    const alone = plan([horizontal]).get("measurement:horizontal");
    const both = plan([horizontal, vertical]);

    expect(both.get("measurement:horizontal")).toEqual(alone);
    // The later label is the one that moves out of the way.
    expect(both.get("measurement:vertical")).not.toEqual(
      plan([vertical]).get("measurement:vertical"),
    );
  });

  it("keeps existing labels in place when a measurement is added", () => {
    const before = plan([horizontal, vertical]);
    const after = plan([horizontal, vertical, diagonal]);

    expect(after.get("measurement:horizontal")).toEqual(before.get("measurement:horizontal"));
    expect(after.get("measurement:vertical")).toEqual(before.get("measurement:vertical"));
  });
});
