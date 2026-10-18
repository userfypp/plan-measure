// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Measurement, PageCalibration, PageState, Point } from "../../types/domain";
import {
  CALIBRATION_LABEL_MAX_WIDTH_SCREEN_PX,
  createLabelLayoutPlanner,
  measureLabelText,
  planLabelLayout,
  type LabelLayoutInput,
  type LabelLayoutPlan,
  type MeasurementLabelData,
} from "./annotationLabelLayout";

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

describe("measureLabelText", () => {
  it("caps a label at the given screen width, whatever the zoom", () => {
    const longName = "A very long scale name ".repeat(20);
    for (const zoom of [0.5, 1, 4]) {
      const capped = measureLabelText(longName, 11, zoom, CALIBRATION_LABEL_MAX_WIDTH_SCREEN_PX);
      expect(capped.width * zoom).toBeCloseTo(CALIBRATION_LABEL_MAX_WIDTH_SCREEN_PX);
      expect(capped.height).toBe(measureLabelText("Short", 11, zoom).height);
    }
  });

  it("leaves a label narrower than the cap at its natural width", () => {
    expect(measureLabelText("Short", 11, 1, CALIBRATION_LABEL_MAX_WIDTH_SCREEN_PX)).toEqual(
      measureLabelText("Short", 11, 1),
    );
  });
});

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

describe("createLabelLayoutPlanner", () => {
  // Small deterministic generator, so a failing sequence can be replayed.
  function random(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TEXTS = ["12.50 m", "3.2 m", "1,234.56 m²", "Hall · 7.05 m", null];
  const CALIBRATION = {
    id: "ground",
    mode: "uniform",
    name: "Ground floor",
    start: { x: 420, y: 480 },
    end: { x: 580, y: 480 },
  } as unknown as PageCalibration;

  function scenario(seed: number) {
    const next = random(seed);
    const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!;
    const point = () => ({ x: 380 + next() * 240, y: 380 + next() * 240 });
    let serial = 0;
    function measurement(): Measurement {
      const type = pick(["line", "polyline", "polygon"] as const);
      const count = type === "line" ? 2 : 3 + Math.floor(next() * 3);
      return {
        id: `m${serial++}`,
        type,
        points: Array.from({ length: count }, point),
        visible: next() > 0.15,
        classificationValueIds: [],
      } as unknown as Measurement;
    }
    // Mirrors the layer's label data cache: one data object per measurement object.
    const data = new WeakMap<Measurement, MeasurementLabelData>();
    function dataFor(item: Measurement, text = pick(TEXTS)) {
      let entry = data.get(item);
      if (!entry) {
        const xs = item.points.map(({ x }) => x);
        const ys = item.points.map(({ y }) => y);
        entry = {
          anchor: {
            x: xs.reduce((sum, x) => sum + x, 0) / xs.length,
            y: ys.reduce((sum, y) => sum + y, 0) / ys.length,
          },
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
          text,
        };
        data.set(item, entry);
      }
      return entry;
    }

    let measurements = Array.from({ length: 12 }, measurement);
    const options = {
      bounds: BOUNDS as LabelLayoutInput["bounds"],
      zoom: 1,
      labelFontScale: 1,
      showCalibration: false,
      showMeasurementLabels: true,
    };
    const edits: Array<() => void> = [
      () => (measurements = [...measurements, measurement()]),
      () => (measurements = [...measurements, measurement()]),
      () => (measurements = measurements.slice(0, -1)),
      () => {
        const index = Math.floor(next() * measurements.length);
        measurements = measurements.filter((_, other) => other !== index);
      },
      () => {
        const index = Math.floor(next() * measurements.length);
        measurements = measurements.map((item, other) =>
          other === index ? { ...item, points: item.points.map(point) } : item,
        );
      },
      () => {
        // Hidden or shown again with the same label data object.
        const item = pick(measurements);
        if (!item) return;
        const copy = { ...item, visible: !item.visible };
        data.set(copy, dataFor(item));
        measurements = measurements.map((other) => (other === item ? copy : other));
      },
      () => {
        // A new scale or display option: same measurement, new label data.
        const item = pick(measurements);
        if (item) data.set(item, { ...dataFor(item), text: pick(TEXTS) });
      },
      () => (options.zoom = pick([0.5, 1, 1.75])),
      () => (options.labelFontScale = pick([1, 1.25])),
      () =>
        (options.bounds = pick([
          BOUNDS,
          { width: 1000, height: 560, rotation: 0 as const },
          { width: 560, height: 1000, rotation: 0 as const },
        ])),
      () => (options.showCalibration = !options.showCalibration),
      () => (options.showMeasurementLabels = next() > 0.2),
      () => undefined,
    ];

    return {
      edit: () => pick(edits)(),
      input: (): LabelLayoutInput => ({
        ...options,
        calibrationReferenceEdit: null,
        page: { measurements, calibrations: [CALIBRATION] } as unknown as PageState,
        labelData: new Map(measurements.map((item) => [item.id, dataFor(item)])),
      }),
      probe: () => ({ x: 380 + next() * 240, y: 380 + next() * 240, width: 40, height: 14 }),
    };
  }

  function expectSamePlan(
    actual: LabelLayoutPlan,
    expected: LabelLayoutPlan,
    probes: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>,
  ) {
    expect([...actual.placements]).toEqual([...expected.placements]);
    expect([...actual.occupiedRects]).toEqual([...expected.occupiedRects]);
    for (const probe of probes) {
      expect(actual.occupied.hasCollision!(probe, 0)).toBe(
        expected.occupied.hasCollision!(probe, 0),
      );
    }
  }

  it.each([1, 2, 3, 4, 5])("matches a full plan through random page edits (seed %i)", (seed) => {
    const { edit, input, probe } = scenario(seed);
    const planLabels = createLabelLayoutPlanner();
    for (let step = 0; step < 120; step += 1) {
      edit();
      const current = input();
      const probes = Array.from({ length: 4 }, probe);
      expectSamePlan(planLabels(current), planLabelLayout(current), probes);
    }
  });

  it("keeps earlier labels and only places the new one when a measurement is added", () => {
    const planLabels = createLabelLayoutPlanner();
    const measurements = [horizontal, vertical];
    const before = planLabels({
      bounds: BOUNDS,
      calibrationReferenceEdit: null,
      page: { measurements, calibrations: [] } as unknown as PageState,
      labelData: labelDataFor(measurements),
      showCalibration: false,
      showMeasurementLabels: true,
      zoom: 1,
    });
    const labelData = new Map(
      before.reuse!.measurementLabels.map(({ measurement, data }) => [measurement.id, data!]),
    );
    labelData.set(diagonal.id, labelDataFor([diagonal]).get(diagonal.id)!);
    const after = planLabels({
      bounds: BOUNDS,
      calibrationReferenceEdit: null,
      page: { measurements: [...measurements, diagonal], calibrations: [] } as unknown as PageState,
      labelData,
      showCalibration: false,
      showMeasurementLabels: true,
      zoom: 1,
    });

    // Reused, not placed again: dragging a label ignores its own rect by identity.
    expect(after.occupiedRects.get("measurement:horizontal")).toBe(
      before.occupiedRects.get("measurement:horizontal"),
    );
    expect(after.occupiedRects.get("measurement:vertical")).toBe(
      before.occupiedRects.get("measurement:vertical"),
    );
    expect(after.placements.get("measurement:diagonal")).toBeDefined();
  });
});
