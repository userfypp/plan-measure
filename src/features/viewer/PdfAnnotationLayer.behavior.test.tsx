// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PathMeasurement, PathMeasurementType, PageState, Point, Tool } from "../../types/domain";
import { PdfAnnotationLayer } from "./PdfAnnotationLayer";
import { resolveCanvasVisualRoles } from "./canvasVisualRoles";

type Props = Record<string, unknown>;
type Handler = (event: unknown) => void;

const captured = vi.hoisted(() => ({
  lines: [] as Props[],
  circles: [] as Props[],
  texts: [] as Props[],
  updateMeasurement: vi.fn(() => true),
  updateMeasurements: vi.fn(() => true),
}));

vi.mock("react-konva", () => ({
  Circle: (props: Props) => {
    captured.circles.push(props);
    return null;
  },
  Group: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Label: (props: Props & { children?: React.ReactNode }) => props.children ?? null,
  Line: (props: Props) => {
    captured.lines.push(props);
    return null;
  },
  Tag: () => null,
  Text: (props: Props) => {
    captured.texts.push(props);
    return null;
  },
}));

vi.mock("konva/lib/shapes/Text", () => ({
  Text: class MockKonvaText {
    constructor(readonly props: { text?: string; fontSize?: number; padding?: number }) {}
    width() {
      return (this.props.text?.length ?? 0) * (this.props.fontSize ?? 12) * 0.6 + (this.props.padding ?? 0) * 2;
    }
    height() {
      return (this.props.fontSize ?? 12) + (this.props.padding ?? 0) * 2;
    }
  },
}));

vi.mock("../../app/sessionState", () => ({
  useMeasurementCommands: () => ({
    updateMeasurement: captured.updateMeasurement,
    updateMeasurements: captured.updateMeasurements,
  }),
}));

const noop = () => undefined;
const roles = resolveCanvasVisualRoles("light");
const BOUNDS = { width: 600, height: 800, rotation: 0 as const };
// Zoom 2 sin desplazamiento: pantalla = 2 * página.
const TRANSFORM = { zoom: 2, panX: 0, panY: 0 };
const toScreen = (point: Point): Point => ({ x: point.x * 2, y: point.y * 2 });

const SQUARE: Point[] = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 120 }, { x: 50, y: 120 }];

/** Página con una escala uniforme de 50 mm por unidad de página y una medición. */
function pageWith(type: PathMeasurementType, points: Point[], visible = true): PageState {
  return {
    pageNumber: 1,
    calibrations: [
      { id: "scale-1", name: "Scale", mode: "uniform", start: { x: 20, y: 20 }, end: { x: 220, y: 20 }, referenceDistanceMm: 10000 },
    ],
    activeCalibrationId: "scale-1",
    nextCalibrationNumber: 2,
    measurements: [
      { id: "m-1", name: "Item", type, calibrationId: "scale-1", classificationValueIds: [], visible, points },
    ],
    nextMeasurementNumber: { line: 1, polyline: 1, polygon: 1, rectangle: 1, ellipse: 1, cloud: 1, count: 1 },
  };
}

interface LayerOptions {
  page?: PageState;
  activeTool?: Tool;
  selected?: string[];
  measurementEditingBlocked?: boolean;
  showMeasurements?: boolean;
  onSelectMeasurement?: (id: string, additive?: boolean) => void;
  onVertexDragCancellationChange?: (id: string, owner: object, cancel: (() => void) | null) => void;
  onWholeMeasurementDragCancellationChange?: (id: string, cancel: (() => void) | null) => void;
  onMeasurementEditActiveChange?: (id: string, active: boolean) => void;
}

describe("PdfAnnotationLayer behavior", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    captured.lines.length = 0;
    captured.circles.length = 0;
    captured.texts.length = 0;
    captured.updateMeasurement.mockClear();
    captured.updateMeasurements.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderLayer({
    page = pageWith("polygon", SQUARE),
    activeTool = "select",
    selected = [],
    measurementEditingBlocked = false,
    showMeasurements = true,
    onSelectMeasurement = noop,
    onVertexDragCancellationChange = noop,
    onWholeMeasurementDragCancellationChange = noop,
    onMeasurementEditActiveChange = noop,
  }: LayerOptions = {}) {
    captured.lines.length = 0;
    captured.circles.length = 0;
    captured.texts.length = 0;
    act(() => {
      root.render(
        <PdfAnnotationLayer
          page={page}
          bounds={BOUNDS}
          transform={TRANSFORM}
          activeTool={activeTool}
          spacePan={false}
          isPanning={false}
          selectedMeasurementId={selected.length === 1 ? selected[0]! : null}
          selectedMeasurementIds={selected}
          activeMeasurementEditId={null}
          calibrationReferenceEdit={null}
          measurementEditingBlocked={measurementEditingBlocked}
          precisionAuthoringAvailable
          visualRoles={roles}
          interactionTargetScreenPx={32}
          displayUnit="m"
          areaDisplay="auto"
          measurementDecimalPlaces={2}
          showCalibration={false}
          showMeasurements={showMeasurements}
          showLabels
          onSelectMeasurement={onSelectMeasurement}
          onCalibrationReferencePointsChange={noop}
          onCalibrationReferenceDragCancellationChange={noop}
          onMeasurementEditActiveChange={onMeasurementEditActiveChange}
          onWholeMeasurementDragCancellationChange={onWholeMeasurementDragCancellationChange}
          onVertexDragCancellationChange={onVertexDragCancellationChange}
        />,
      );
    });
  }

  /** Línea de la medición (excluye la línea de calibración, que no se pinta con showCalibration=false). */
  const shape = () => captured.lines.find((line) => line.name === "measurement-preview-line")!;

  /** Nodo Konva simulado cuyo puntero se controla desde el test. */
  function dragNode() {
    const pointer = { x: 0, y: 0 };
    const node = {
      getStage: () => ({ getPointerPosition: () => ({ ...pointer }) }),
      draggable: vi.fn(),
      isDragging: vi.fn(() => false),
      position: vi.fn(),
      stopDrag: vi.fn(),
      x: () => pointer.x,
      y: () => pointer.y,
    };
    return { node, moveTo: (screen: Point) => Object.assign(pointer, screen) };
  }

  const fire = (props: Props, name: string, event: unknown) => act(() => (props[name] as Handler)(event));
  const mouseEvent = (target: unknown, button = 0, modifiers: Record<string, boolean> = {}) => ({
    target,
    evt: { button, ...modifiers },
    cancelBubble: false,
  });

  /** Arrastra el vértice `index` desde su posición hasta `to` (coordenadas de pantalla). */
  function dragVertex(index: number, to: Point, { button = 0 } = {}) {
    const handle = captured.circles[index]!;
    const { node, moveTo } = dragNode();
    const event = mouseEvent(node, button);
    moveTo(toScreen({ x: handle.x as number, y: handle.y as number }));
    fire(handle, "onMouseDown", event);
    fire(handle, "onDragStart", event);
    moveTo(to);
    return { handle, node, event, end: () => fire(handle, "onDragEnd", event) };
  }

  describe("selection", () => {
    it("selects on click when the select tool is active and reports additive modifiers", () => {
      const onSelectMeasurement = vi.fn();
      renderLayer({ onSelectMeasurement });
      fire(shape(), "onClick", mouseEvent({}));
      fire(shape(), "onClick", mouseEvent({}, 0, { shiftKey: true }));
      fire(shape(), "onClick", mouseEvent({}, 0, { ctrlKey: true }));
      expect(onSelectMeasurement.mock.calls).toEqual([["m-1", undefined], ["m-1", true], ["m-1", true]]);
    });

    it.each<Tool>(["line", "polygon", "count", "hand", "calibrate"])("does not select while the %s tool is active", (activeTool) => {
      const onSelectMeasurement = vi.fn();
      renderLayer({ activeTool, onSelectMeasurement });
      fire(shape(), "onClick", mouseEvent({}));
      expect(onSelectMeasurement).not.toHaveBeenCalled();
    });

    it("does not select, edit or drag while measurement editing is blocked", () => {
      const onSelectMeasurement = vi.fn();
      renderLayer({ selected: ["m-1"], measurementEditingBlocked: true, onSelectMeasurement });
      fire(shape(), "onClick", mouseEvent({}));
      expect(onSelectMeasurement).not.toHaveBeenCalled();
      expect(shape().draggable).toBe(false);
      expect(captured.circles).toHaveLength(0);
    });

    it("shows vertex handles only for the selected measurement and highlights it", () => {
      renderLayer();
      expect(captured.circles).toHaveLength(0);
      expect(shape().stroke).toBe(roles.measurementDefaultStroke);
      renderLayer({ selected: ["m-1"] });
      expect(captured.circles.map(({ x, y }) => ({ x, y }))).toEqual(SQUARE);
      expect(shape().stroke).toBe(roles.measurementSelectedStroke);
    });

    it("removes handles when the selection is cleared", () => {
      renderLayer({ selected: ["m-1"] });
      expect(captured.circles).toHaveLength(4);
      renderLayer({ selected: [] });
      expect(captured.circles).toHaveLength(0);
    });
  });

  describe("visibility and labels", () => {
    it("does not draw hidden measurements nor any measurement when measurements are hidden", () => {
      renderLayer({ page: pageWith("polygon", SQUARE, false) });
      expect(captured.lines.find((line) => line.visible !== false && line.name === "measurement-preview-line")).toBeUndefined();
      expect(captured.texts).toHaveLength(0);
      renderLayer({ showMeasurements: false });
      expect(captured.lines).toHaveLength(0);
      expect(captured.texts).toHaveLength(0);
    });

    it("labels each type with its scaled result and refreshes it when the points change", () => {
      // 50 mm por unidad de página.
      renderLayer({ page: pageWith("line", [{ x: 50, y: 50 }, { x: 250, y: 50 }]) });
      expect(captured.texts.map((text) => text.text)).toEqual(["10.00 m"]);
      renderLayer({ page: pageWith("line", [{ x: 50, y: 50 }, { x: 450, y: 50 }]) });
      expect(captured.texts.map((text) => text.text)).toEqual(["20.00 m"]);
      renderLayer({ page: pageWith("polygon", [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }]) });
      expect(captured.texts.map((text) => text.text)).toEqual(["P 40.00 m · A 100.00 m²"]);
    });
  });

  describe("quick shapes", () => {
    it("moves the adjacent corners together when a rectangle vertex is dragged", () => {
      renderLayer({ page: pageWith("rectangle", SQUARE), selected: ["m-1"] });
      dragVertex(2, { x: 360, y: 300 }).end();
      expect(captured.updateMeasurement).toHaveBeenCalledExactlyOnceWith({
        pageNumber: 1,
        id: "m-1",
        points: [
          SQUARE[0],
          { x: 180, y: 50 },
          { x: 180, y: 150 },
          { x: 50, y: 150 },
        ],
      });
    });

    it("hit-tests an ellipse on its contour and traces it with a true ellipse", () => {
      renderLayer({ page: pageWith("ellipse", SQUARE) });
      const line = shape();
      expect(line.measurementType).toBe("ellipse");
      expect(typeof line.sceneFunc).toBe("function");
      const ellipse = vi.fn();
      const context = {
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        ellipse,
        closePath: vi.fn(),
        fillShape: vi.fn(),
        save: vi.fn(),
        setAttr: vi.fn(),
        stroke: vi.fn(),
        restore: vi.fn(),
      };
      const konvaShape = {
        points: () => SQUARE.flatMap((point) => [point.x, point.y]),
        getAttr: (name: string) => (name === "measurementType" ? "ellipse" : undefined),
        closed: () => true,
        hasHitStroke: () => true,
        hitStrokeWidth: () => 6,
        strokeWidth: () => 1,
        colorKey: "#abcdef",
      };
      (line.hitFunc as (context: unknown, shape: unknown) => void)(context, konvaShape);
      expect(ellipse).toHaveBeenCalledWith(100, 85, 50, 35, 0, 0, 2 * Math.PI);
      expect(context.lineTo).not.toHaveBeenCalled();
      expect(context.fillShape).toHaveBeenCalledTimes(1);
    });

    describe("revision cloud style", () => {
      const TRIANGLE: Point[] = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 100, y: 130 }];
      function cloudPage(color?: string): PageState {
        const page = pageWith("cloud", TRIANGLE);
        if (color) (page.measurements[0] as PathMeasurement).color = color;
        return page;
      }

      it("draws an uncolored cloud in review red with a thick stroke and a faint fill", () => {
        renderLayer({ page: cloudPage() });
        expect(shape()).toMatchObject({ stroke: "#d92d20", fill: "#d92d2014" });
        expect(shape().strokeWidth as number).toBeCloseTo(2.75 / TRANSFORM.zoom, 10);
        expect(shape().shadowColor).toBeUndefined();
      });

      it("uses the chosen palette color and keeps it, with a halo and handles, when selected", () => {
        renderLayer({ page: cloudPage("#2e9e4f") });
        expect(shape()).toMatchObject({ stroke: "#2e9e4f", fill: "#2e9e4f14" });

        renderLayer({ page: cloudPage("#2e9e4f"), selected: ["m-1"] });
        expect(shape()).toMatchObject({
          stroke: "#2e9e4f",
          fill: "#2e9e4f24",
          shadowColor: roles.measurementSelectedStroke,
        });
        expect(shape().strokeWidth as number).toBeCloseTo(3.25 / TRANSFORM.zoom, 10);
        expect(shape().shadowBlur as number).toBeGreaterThan(0);
        expect(captured.circles).toHaveLength(3);
      });

      it("leaves the look of polygons and ellipses unchanged", () => {
        for (const type of ["polygon", "ellipse"] as const) {
          renderLayer({ page: pageWith(type, SQUARE) });
          expect(shape()).toMatchObject({
            stroke: roles.measurementDefaultStroke,
            fill: roles.measurementDefaultFill,
          });
          expect(shape().shadowColor).toBeUndefined();
        }
        renderLayer({ page: pageWith("polygon", SQUARE), selected: ["m-1"] });
        expect(shape()).toMatchObject({
          stroke: roles.measurementSelectedStroke,
          fill: roles.measurementSelectedFill,
        });
      });
    });

    it("keeps line, polyline and polygon free of custom scene geometry", () => {
      renderLayer({ page: pageWith("polygon", SQUARE) });
      expect(shape().sceneFunc).toBeUndefined();
      expect(shape().measurementType).toBeUndefined();
    });
  });

  describe("vertex drag", () => {
    it("commits only the dragged vertex, converted from screen to page coordinates", () => {
      renderLayer({ selected: ["m-1"] });
      const drag = dragVertex(2, { x: 360, y: 300 });
      drag.end();
      expect(captured.updateMeasurement).toHaveBeenCalledExactlyOnceWith({
        pageNumber: 1,
        id: "m-1",
        points: [SQUARE[0], SQUARE[1], { x: 180, y: 150 }, SQUARE[3]],
      });
    });

    it("clamps a vertex dropped outside the page to the page bounds", () => {
      renderLayer({ selected: ["m-1"] });
      dragVertex(0, { x: -400, y: 5000 }).end();
      expect(captured.updateMeasurement).toHaveBeenCalledExactlyOnceWith({
        pageNumber: 1,
        id: "m-1",
        points: [{ x: 0, y: 800 }, SQUARE[1], SQUARE[2], SQUARE[3]],
      });
    });

    it("reports editing activity and a cancel handle for the duration of the drag", () => {
      const onMeasurementEditActiveChange = vi.fn();
      const onVertexDragCancellationChange = vi.fn();
      renderLayer({ selected: ["m-1"], onMeasurementEditActiveChange, onVertexDragCancellationChange });
      const drag = dragVertex(1, { x: 400, y: 200 });
      expect(onMeasurementEditActiveChange).toHaveBeenCalledWith("m-1", true);
      expect(onVertexDragCancellationChange.mock.calls.at(-1)).toEqual(["m-1", expect.any(Object), expect.any(Function)]);
      drag.end();
      expect(onMeasurementEditActiveChange).toHaveBeenLastCalledWith("m-1", false);
      expect(onVertexDragCancellationChange.mock.calls.at(-1)![2]).toBeNull();
    });

    it("commits nothing when the drag is cancelled, as Escape does through the registered handle", () => {
      const onVertexDragCancellationChange = vi.fn();
      renderLayer({ selected: ["m-1"], onVertexDragCancellationChange });
      const drag = dragVertex(2, { x: 360, y: 300 });
      const cancel = onVertexDragCancellationChange.mock.calls.filter(([, , fn]) => typeof fn === "function").at(-1)![2] as () => void;
      act(cancel);
      drag.end();
      expect(captured.updateMeasurement).not.toHaveBeenCalled();
      expect(captured.updateMeasurements).not.toHaveBeenCalled();
    });

    it("ignores a secondary-button press on a handle", () => {
      renderLayer({ selected: ["m-1"] });
      const { handle, node, event } = dragVertex(0, { x: 200, y: 200 }, { button: 2 });
      fire(handle, "onDragEnd", event);
      expect(node.stopDrag).toHaveBeenCalled();
      expect(captured.updateMeasurement).not.toHaveBeenCalled();
    });

    it("does not make handles draggable for a multi-selection", () => {
      const page = pageWith("polygon", SQUARE);
      page.measurements.push({ ...page.measurements[0]!, id: "m-2" });
      renderLayer({ page, selected: ["m-1", "m-2"] });
      expect(captured.circles).toHaveLength(0);
    });
  });

  describe("whole measurement drag", () => {
    const LINE: Point[] = [{ x: 50, y: 50 }, { x: 150, y: 50 }];

    function dragWhole(from: Point, to: Point, button = 0) {
      const target = dragNode();
      const event = mouseEvent(target.node, button);
      target.moveTo(from);
      fire(shape(), "onMouseDown", event);
      fire(shape(), "onDragStart", event);
      target.moveTo(to);
      return { event, ...target, end: () => fire(shape(), "onDragEnd", event) };
    }

    it("is draggable only when selected with the select tool", () => {
      renderLayer({ page: pageWith("line", LINE) });
      expect(shape().draggable).toBe(false);
      renderLayer({ page: pageWith("line", LINE), selected: ["m-1"] });
      expect(shape().draggable).toBe(true);
      renderLayer({ page: pageWith("line", LINE), selected: ["m-1"], activeTool: "line" });
      expect(shape().draggable).toBe(false);
    });

    it("translates every point by the page-space drag delta", () => {
      renderLayer({ page: pageWith("line", LINE), selected: ["m-1"] });
      dragWhole({ x: 200, y: 100 }, { x: 240, y: 120 }).end();
      expect(captured.updateMeasurement).toHaveBeenCalledExactlyOnceWith({
        pageNumber: 1,
        id: "m-1",
        points: [{ x: 70, y: 60 }, { x: 170, y: 60 }],
      });
    });

    it("keeps the whole measurement inside the page while dragging past an edge", () => {
      renderLayer({ page: pageWith("line", LINE), selected: ["m-1"] });
      dragWhole({ x: 200, y: 100 }, { x: 5000, y: 100 }).end();
      expect(captured.updateMeasurement).toHaveBeenCalledExactlyOnceWith({
        pageNumber: 1,
        id: "m-1",
        points: [{ x: 500, y: 50 }, { x: 600, y: 50 }],
      });
    });

    it("commits nothing when the drag is cancelled or the pointer returns to the start", () => {
      const onWholeMeasurementDragCancellationChange = vi.fn();
      renderLayer({ page: pageWith("line", LINE), selected: ["m-1"], onWholeMeasurementDragCancellationChange });
      const drag = dragWhole({ x: 200, y: 100 }, { x: 260, y: 140 });
      const cancel = onWholeMeasurementDragCancellationChange.mock.calls.filter(([, fn]) => typeof fn === "function").at(-1)![1] as () => void;
      act(cancel);
      drag.end();
      expect(captured.updateMeasurement).not.toHaveBeenCalled();
      dragWhole({ x: 200, y: 100 }, { x: 200, y: 100 }).end();
      expect(captured.updateMeasurement).not.toHaveBeenCalled();
    });

    it("does not start from a secondary button", () => {
      renderLayer({ page: pageWith("line", LINE), selected: ["m-1"] });
      const drag = dragWhole({ x: 200, y: 100 }, { x: 260, y: 140 }, 2);
      drag.end();
      expect(drag.node.stopDrag).toHaveBeenCalled();
      expect(captured.updateMeasurement).not.toHaveBeenCalled();
    });
  });
});
