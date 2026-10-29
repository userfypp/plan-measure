// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Measurement, PageState, Tool, ViewTransform } from "../types/domain";
import { PdfAnnotationLayer } from "../features/viewer/PdfAnnotationLayer";
import { resolveCanvasVisualRoles } from "../features/viewer/canvasVisualRoles";

// MeasurementShape render budget with 1000 measurements in the real layer. Each interaction may
// render only the measurements it changes: a shared prop with a new identity (a recreated array,
// object or callback) re-renders all 1000 and costs visible frames on a real plan. If this fails,
// find the unstable prop; don't raise the budget.

type Props = Record<string, unknown>;

const captured = vi.hoisted(() => ({ shapes: [] as Props[] }));

// Each MeasurementShape render draws exactly one line with this name.
vi.mock("react-konva", () => ({
  Circle: () => null,
  Group: ({ children }: { children?: ReactNode }) => children ?? null,
  Label: ({ children }: { children?: ReactNode }) => children ?? null,
  Line: (props: Props) => {
    if (props.name === "measurement-preview-line") captured.shapes.push(props);
    return null;
  },
  Tag: () => null,
  Text: () => null,
}));
vi.mock("konva/lib/Layer", () => ({
  Layer: class {
    add() {}
    destroy() {}
    draw() {}
  },
}));
vi.mock("konva/lib/Group", () => ({
  Group: class {
    add() {}
  },
}));
vi.mock("konva/lib/shapes/Text", () => ({
  Text: class {
    constructor(readonly props: { text?: string; fontSize?: number; padding?: number }) {}
    width() {
      const { text = "", fontSize = 12, padding = 0 } = this.props;
      return text.length * fontSize * 0.6 + padding * 2;
    }
    height() {
      return (this.props.fontSize ?? 12) + (this.props.padding ?? 0) * 2;
    }
  },
}));
vi.mock("../app/sessionState", () => ({
  useMeasurementCommands: () => ({ updateMeasurement: () => true, updateMeasurements: () => true }),
}));

const noop = () => undefined;
const roles = resolveCanvasVisualRoles("light");
const BOUNDS = { width: 600, height: 800, rotation: 0 as const };
const VIEWPORT = { width: 1000, height: 1000 };
const TRANSFORM: ViewTransform = { zoom: 1, panX: 0, panY: 0 };
const COUNT = 1000;

function line(i: number, dx = 0): Measurement {
  const x = 10 + (i % 40) * 14 + dx;
  const y = 10 + Math.floor(i / 40) * 30;
  return {
    id: `m-${i}`,
    name: `Medición ${i}`,
    type: "line",
    points: [
      { x, y },
      { x: x + 8, y: y + 20 },
    ],
    calibrationId: "scale-1",
    classificationValueIds: [],
    visible: true,
  };
}

// Session edits keep the objects that don't change, such as calibrations.
const CALIBRATIONS: PageState["calibrations"] = [
  {
    id: "scale-1",
    name: "Scale",
    mode: "uniform",
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    referenceDistanceMm: 1000,
  },
];
const NEXT_NUMBERS: PageState["nextMeasurementNumber"] = {
  line: COUNT + 1,
  polyline: 1,
  polygon: 1,
  rectangle: 1,
  ellipse: 1,
  cloud: 1,
  count: 1,
};

function page(measurements: Measurement[]): PageState {
  return {
    pageNumber: 1,
    calibrations: CALIBRATIONS,
    activeCalibrationId: "scale-1",
    nextCalibrationNumber: 2,
    measurements,
    nextMeasurementNumber: NEXT_NUMBERS,
  };
}

interface LayerState {
  page: PageState;
  transform: ViewTransform;
  activeTool: Tool;
  selected: string[];
  isPanning: boolean;
}

const BASE: LayerState = {
  page: page(Array.from({ length: COUNT }, (_, i) => line(i))),
  transform: TRANSFORM,
  activeTool: "select",
  selected: [],
  isPanning: false,
};
const ids = (...indexes: number[]) => indexes.map((i) => `m-${i}`);

describe("annotation layer render budget", () => {
  let container: HTMLDivElement;
  let root: Root;
  let state: LayerState;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    state = BASE;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /** Applies the change and returns, in page order, the measurements whose shape rendered. */
  function update(next: Partial<LayerState> = {}) {
    state = { ...state, ...next };
    const byStart = new Map(
      state.page.measurements.map((measurement) => {
        const [start] = measurement.points;
        return [`${start!.x},${start!.y}`, measurement.id];
      }),
    );
    captured.shapes.length = 0;
    act(() =>
      root.render(
        <PdfAnnotationLayer
          page={state.page}
          bounds={BOUNDS}
          transform={state.transform}
          viewport={VIEWPORT}
          activeTool={state.activeTool}
          spacePan={false}
          isPanning={state.isPanning}
          selectedMeasurementId={state.selected.length === 1 ? state.selected[0]! : null}
          selectedMeasurementIds={state.selected}
          activeMeasurementEditId={null}
          calibrationReferenceEdit={null}
          measurementEditingBlocked={false}
          precisionAuthoringAvailable
          visualRoles={roles}
          interactionTargetScreenPx={32}
          displayUnit="m"
          areaDisplay="auto"
          measurementDecimalPlaces={2}
          showCalibration={false}
          showMeasurements
          showLabels
          onSelectMeasurement={noop}
          onCalibrationReferencePointsChange={noop}
          onCalibrationReferenceDragCancellationChange={noop}
          onMeasurementEditActiveChange={noop}
          onWholeMeasurementDragCancellationChange={noop}
          onVertexDragCancellationChange={noop}
        />,
      ),
    );
    return captured.shapes.map((shape) => {
      const [x, y] = shape.points as number[];
      return byStart.get(`${x},${y}`) ?? "?";
    });
  }

  function mount() {
    expect(update()).toHaveLength(COUNT);
  }

  const edit = (index: number, replacement: Measurement | null) =>
    page(
      state.page.measurements.flatMap((measurement, i) =>
        i !== index ? [measurement] : replacement ? [replacement] : [],
      ),
    );

  it("mounting renders each measurement once and repeating the same props renders none", () => {
    mount();
    expect(update()).toEqual([]);
    expect(update({ page: page(state.page.measurements) })).toEqual([]);
  });

  it("desplazar y cambiar de herramienta no renderiza ninguna medida", () => {
    mount();
    expect(update({ isPanning: true })).toEqual([]);
    expect(update({ transform: { zoom: 1, panX: 20, panY: 15 } })).toEqual([]);
    expect(update({ isPanning: false })).toEqual([]);
    expect(update({ activeTool: "line" })).toEqual([]);
    expect(update({ activeTool: "select" })).toEqual([]);
  });

  it("selecting renders only the measurements that join, leave or change group", () => {
    mount();
    expect(update({ selected: ids(501) })).toEqual(ids(501));
    expect(update({ selected: ids(502) })).toEqual(ids(501, 502));
    expect(update({ selected: ids(502, 503) })).toEqual(ids(502, 503));
    expect(update({ selected: ids(502, 503, 504) })).toEqual(ids(502, 503, 504));
    expect(update({ selected: ids(503) })).toEqual(ids(502, 503, 504));
    expect(update({ selected: [] })).toEqual(ids(503));
  });

  // These edits don't move neighbouring labels; if one did, those neighbours would move and would
  // have to render too.
  it("adding, editing or hiding a measurement renders only that measurement", () => {
    mount();
    expect(update({ page: page([...state.page.measurements, line(COUNT)]) })).toEqual(ids(COUNT));
    expect(update({ page: edit(COUNT, line(COUNT, 2)) })).toEqual(ids(COUNT));
    expect(update({ page: edit(500, line(500, 1)) })).toEqual(ids(500));
    expect(update({ page: edit(300, { ...line(300), visible: false }) })).toEqual([]);
    expect(update({ page: edit(COUNT, null) })).toEqual([]);
    expect(update({ selected: ids(10), page: edit(500, line(500, 2)) })).toEqual(ids(10, 500));
  });

  // Stroke, handle and label sizes depend on zoom: each visible measurement renders once.
  it("zooming renders each visible measurement exactly once", () => {
    mount();
    expect(update({ transform: { zoom: 1.25, panX: 0, panY: 0 } })).toHaveLength(COUNT);
    expect(update({ transform: { zoom: 1.25, panX: 10, panY: 0 } })).toEqual([]);
  });
});
