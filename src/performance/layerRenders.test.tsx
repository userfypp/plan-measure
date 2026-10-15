// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Measurement, PageState, Tool, ViewTransform } from "../types/domain";
import { PdfAnnotationLayer } from "../features/viewer/PdfAnnotationLayer";
import { resolveCanvasVisualRoles } from "../features/viewer/canvasVisualRoles";

// Presupuesto de renders de MeasurementShape con 1000 medidas en la capa real. Cada interacción
// solo puede renderizar las medidas que cambian para ella: una prop compartida con identidad nueva
// (array, objeto o callback recreado) vuelve a renderizar las 1000 y cuesta frames visibles en un
// plano real. Si falla, busca la prop inestable; no amplíes el presupuesto.

type Props = Record<string, unknown>;

const captured = vi.hoisted(() => ({ shapes: [] as Props[] }));

// Cada render de MeasurementShape pinta exactamente una línea con este nombre.
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

// Las ediciones de la sesión conservan los objetos que no cambian, como las calibraciones.
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

describe("presupuesto de renders de la capa de anotaciones", () => {
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

  /** Aplica el cambio y devuelve, en orden de página, las medidas cuya forma se renderizó. */
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

  it("montar renderiza cada medida una vez y repetir las mismas props no renderiza ninguna", () => {
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

  it("seleccionar renderiza solo las medidas que entran, salen o cambian de grupo", () => {
    mount();
    expect(update({ selected: ids(501) })).toEqual(ids(501));
    expect(update({ selected: ids(502) })).toEqual(ids(501, 502));
    expect(update({ selected: ids(502, 503) })).toEqual(ids(502, 503));
    expect(update({ selected: ids(502, 503, 504) })).toEqual(ids(502, 503, 504));
    expect(update({ selected: ids(503) })).toEqual(ids(502, 503, 504));
    expect(update({ selected: [] })).toEqual(ids(503));
  });

  // Las ediciones elegidas no recolocan etiquetas vecinas; si una lo hace, esas vecinas cambian de
  // posición y también deben renderizarse.
  it("añadir, editar u ocultar una medida renderiza solo esa medida", () => {
    mount();
    expect(update({ page: page([...state.page.measurements, line(COUNT)]) })).toEqual(ids(COUNT));
    expect(update({ page: edit(COUNT, line(COUNT, 2)) })).toEqual(ids(COUNT));
    expect(update({ page: edit(500, line(500, 1)) })).toEqual(ids(500));
    expect(update({ page: edit(300, { ...line(300), visible: false }) })).toEqual([]);
    expect(update({ page: edit(COUNT, null) })).toEqual([]);
    expect(update({ selected: ids(10), page: edit(500, line(500, 2)) })).toEqual(ids(10, 500));
  });

  // El tamaño de trazos, asas y etiquetas depende del zoom: cada medida visible se renderiza una vez.
  it("el zoom renderiza cada medida visible una sola vez", () => {
    mount();
    expect(update({ transform: { zoom: 1.25, panX: 0, panY: 0 } })).toHaveLength(COUNT);
    expect(update({ transform: { zoom: 1.25, panX: 10, panY: 0 } })).toEqual([]);
  });
});
