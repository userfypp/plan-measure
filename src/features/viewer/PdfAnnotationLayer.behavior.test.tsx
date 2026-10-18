// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PathMeasurement, PathMeasurementType, PageState, Point, Tool } from "../../types/domain";
import { PdfAnnotationLayer } from "./PdfAnnotationLayer";
import { resolveCanvasVisualRoles } from "./canvasVisualRoles";
import { resetAppPreferences, setAppPreference } from "../../utils/appPreferences";

type Props = Record<string, unknown>;
type Handler = (event: unknown) => void;

const captured = vi.hoisted(() => ({
  isolatedPreview: false,
  previewPoints: [] as number[],
  previewSideHandles: [] as { draggable: ReturnType<typeof vi.fn>; getAttr: (name: string) => unknown; position: ReturnType<typeof vi.fn> }[],
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
  Group: ({ children, ref }: { children?: React.ReactNode; ref?: { current: unknown } }) => {
    if (ref && captured.isolatedPreview) ref.current = {
      getStage: () => ({ add: vi.fn() }),
      visible: vi.fn(),
      clone: () => ({
        find: (selector: string) => selector === ".measurement-preview-side-handle" ? captured.previewSideHandles : [],
        findOne: (selector: string) => selector === ".measurement-preview-line" ? {
          draggable: vi.fn(), fill: vi.fn(),
          points: (points: number[]) => { captured.previewPoints = points; },
        } : undefined,
      }),
    };
    return children ?? null;
  },
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

vi.mock("konva/lib/Layer", () => ({ Layer: class { add() {} destroy() {} draw() {} } }));
vi.mock("konva/lib/Group", () => ({ Group: class { add() {} } }));

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
  transform?: { zoom: number; panX: number; panY: number };
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
    captured.isolatedPreview = false;
    captured.previewPoints = [];
    captured.previewSideHandles = [];
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
    transform = TRANSFORM,
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
          transform={transform}
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
      getAbsolutePosition: () => ({ x: 0, y: 0 }),
      dragBoundFunc: vi.fn(),
      setAttr: vi.fn(),
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

  /** Tiradores de vértice (las esquinas de un rectángulo), sin los de lado. */
  const cornerHandles = () => captured.circles.filter((circle) => circle.name === "measurement-preview-handle");
  const sideHandles = () => captured.circles.filter((circle) => circle.name === "measurement-preview-side-handle");

  /** Arrastra el tirador `handle` desde su posición hasta `to` (coordenadas de pantalla). */
  function dragHandle(handle: Props, to: Point, { button = 0 } = {}) {
    const { node, moveTo } = dragNode();
    const event = mouseEvent(node, button);
    moveTo(toScreen({ x: handle.x as number, y: handle.y as number }));
    fire(handle, "onMouseDown", event);
    fire(handle, "onDragStart", event);
    moveTo(to);
    return { handle, node, event, end: () => fire(handle, "onDragEnd", event) };
  }

  /** Arrastra el vértice `index` desde su posición hasta `to` (coordenadas de pantalla). */
  const dragVertex = (index: number, to: Point, options?: { button?: number }) =>
    dragHandle(cornerHandles()[index]!, to, options);

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

    it("re-renders an unselected measurement on zoom but not on pan", () => {
      const page = pageWith("polygon", SQUARE);
      renderLayer({ page });
      expect(shape()).toBeDefined();
      renderLayer({ page, transform: { ...TRANSFORM, panX: 40, panY: 20 } });
      expect(shape()).toBeUndefined();
      renderLayer({ page, transform: { zoom: 3, panX: 40, panY: 20 } });
      expect(shape()).toBeDefined();
      renderLayer({ page, transform: { zoom: 3, panX: 40, panY: 20 }, selected: ["m-1"] });
      renderLayer({ page, transform: { zoom: 3, panX: 0, panY: 0 }, selected: ["m-1"] });
      expect(shape()).toBeDefined();
    });

    it("drags with the latest pan once a measurement panned while unselected is selected", () => {
      const page = pageWith("polygon", SQUARE);
      const panned = { ...TRANSFORM, panX: 40, panY: 20 };
      renderLayer({ page });
      renderLayer({ page, transform: panned });
      expect(shape()).toBeUndefined();
      renderLayer({ page, transform: panned, selected: ["m-1"] });
      const handle = captured.circles[2]!;
      const { node, moveTo } = dragNode();
      const event = mouseEvent(node);
      moveTo({ x: 150 * 2 + 40, y: 120 * 2 + 20 });
      fire(handle, "onMouseDown", event);
      fire(handle, "onDragStart", event);
      moveTo({ x: 360 + 40, y: 300 + 20 });
      fire(handle, "onDragEnd", event);
      expect(captured.updateMeasurement).toHaveBeenCalledExactlyOnceWith({
        pageNumber: 1,
        id: "m-1",
        points: [SQUARE[0], SQUARE[1], { x: 180, y: 150 }, SQUARE[3]],
      });
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

    it("reformats a label when the number separators change", () => {
      renderLayer({ page: pageWith("line", [{ x: 50, y: 50 }, { x: 250, y: 50 }]) });
      expect(captured.texts.at(-1)?.text).toBe("10.00 m");
      try {
        act(() => setAppPreference("decimalSeparator", "comma"));
        expect(captured.texts.at(-1)?.text).toBe("10,00 m");
      } finally {
        act(() => resetAppPreferences());
      }
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

    it.each(["rectangle", "ellipse"] as const)("offers a handle in the middle of each %s side, beneath the corners", (type) => {
      renderLayer({ page: pageWith(type, SQUARE), selected: ["m-1"] });
      expect(sideHandles().map(({ editTarget, x, y }) => ({ editTarget, x, y }))).toEqual([
        { editTarget: 4, x: 100, y: 50 },
        { editTarget: 5, x: 150, y: 85 },
        { editTarget: 6, x: 100, y: 120 },
        { editTarget: 7, x: 50, y: 85 },
      ]);
      expect(captured.circles.slice(0, 4)).toEqual(sideHandles());
      expect(cornerHandles().map(({ x, y }) => ({ x, y }))).toEqual(SQUARE);
      expect(sideHandles().every((handle) => handle.radius === cornerHandles()[0]!.radius && handle.draggable === true)).toBe(true);
    });

    it("offers side handles only on boxes, while selected and editable", () => {
      renderLayer({ page: pageWith("polygon", SQUARE), selected: ["m-1"] });
      expect(sideHandles()).toHaveLength(0);
      renderLayer({ page: pageWith("rectangle", SQUARE) });
      expect(sideHandles()).toHaveLength(0);
      renderLayer({ page: pageWith("rectangle", SQUARE), selected: ["m-1"], measurementEditingBlocked: true });
      expect(sideHandles()).toHaveLength(0);
    });

    it("hides the handles of sides too short on screen to grab apart from the corners", () => {
      // 100 × 70 de página; el mínimo es el doble del objetivo táctil (2 × 32 px).
      renderLayer({ page: pageWith("rectangle", SQUARE), selected: ["m-1"], transform: { zoom: 0.8, panX: 0, panY: 0 } });
      expect(sideHandles().map((handle) => handle.editTarget)).toEqual([4, 6]);
      renderLayer({ page: pageWith("rectangle", SQUARE), selected: ["m-1"], transform: { zoom: 0.5, panX: 0, panY: 0 } });
      expect(sideHandles()).toHaveLength(0);
      expect(cornerHandles()).toHaveLength(4);
    });

    it("moves only the dragged rectangle side across its length", () => {
      renderLayer({ page: pageWith("rectangle", SQUARE), selected: ["m-1"] });
      const right = sideHandles().find((handle) => handle.editTarget === 5)!;
      const drag = dragHandle(right, { x: 360, y: 300 });
      drag.end();
      expect(captured.updateMeasurement).toHaveBeenCalledExactlyOnceWith({
        pageNumber: 1,
        id: "m-1",
        points: [SQUARE[0], { x: 180, y: 50 }, { x: 180, y: 120 }, SQUARE[3]],
      });
      expect(drag.node.position).toHaveBeenLastCalledWith({ x: 180, y: 85 });
    });

    it("moves only the dragged ellipse side and keeps the opposite one", () => {
      renderLayer({ page: pageWith("ellipse", SQUARE), selected: ["m-1"] });
      const bottom = sideHandles().find((handle) => handle.editTarget === 6)!;
      dragHandle(bottom, { x: 120, y: 400 }).end();
      expect(captured.updateMeasurement).toHaveBeenCalledExactlyOnceWith({
        pageNumber: 1,
        id: "m-1",
        points: [SQUARE[0], SQUARE[1], { x: 150, y: 200 }, { x: 50, y: 200 }],
      });
    });

    it("returns a rejected side drag to the middle of the original side", () => {
      captured.updateMeasurement.mockReturnValueOnce(false);
      renderLayer({ page: pageWith("rectangle", SQUARE), selected: ["m-1"] });
      const top = sideHandles().find((handle) => handle.editTarget === 4)!;
      const drag = dragHandle(top, toScreen({ x: 100, y: 120 }));
      drag.end();
      expect(captured.updateMeasurement).toHaveBeenCalledOnce();
      expect(drag.node.position).toHaveBeenLastCalledWith({ x: 100, y: 50 });
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
    it.each([false, true])("cancels stale gestures after undo, including a prepared gesture (%s)", (prepared) => {
      const page = pageWith("polygon", SQUARE);
      renderLayer({ page, selected: ["m-1"] });
      const handle = captured.circles[2]!;
      const { node, moveTo } = dragNode();
      const event = mouseEvent(node);
      moveTo(toScreen(SQUARE[2]!));
      fire(handle, "onMouseDown", event);
      if (!prepared) fire(handle, "onDragStart", event);
      renderLayer({ page: pageWith("polygon", SQUARE.map((point) => ({ x: point.x - 10, y: point.y - 10 }))), selected: ["m-1"] });
      moveTo({ x: 360, y: 300 });
      fire(handle, "onDragStart", event);
      fire(handle, "onDragMove", event);
      fire(handle, "onDragEnd", event);
      expect(captured.updateMeasurement).not.toHaveBeenCalled();
    });

    it("preserves an active drag when unrelated measurement metadata changes", () => {
      const page = pageWith("polygon", SQUARE);
      renderLayer({ page, selected: ["m-1"] });
      const drag = dragVertex(2, { x: 360, y: 300 });
      renderLayer({ page: { ...page, measurements: [{ ...page.measurements[0]!, note: "Updated" }] }, selected: ["m-1"] });
      drag.end();
      expect(captured.updateMeasurement).toHaveBeenCalledOnce();
    });

    it.each(["rectangle", "ellipse"] as const)("keeps the isolated %s preview aligned at drag start and move", (type) => {
      captured.isolatedPreview = true;
      let frame: FrameRequestCallback | undefined;
      const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 1; });
      try {
        renderLayer({ page: pageWith(type, SQUARE), selected: ["m-1"] });
        const handle = cornerHandles()[2]!;
        const { node, moveTo } = dragNode();
        const event = mouseEvent(node);
        moveTo(toScreen(SQUARE[2]!));
        fire(handle, "onMouseDown", event);
        moveTo({ x: 360, y: 300 });
        fire(handle, "onDragStart", event);
        expect(captured.previewPoints).toEqual([50, 50, 180, 50, 180, 150, 50, 150]);
        moveTo({ x: 400, y: 320 });
        fire(handle, "onDragMove", event);
        act(() => frame!(0));
        expect(captured.previewPoints).toEqual([50, 50, 200, 50, 200, 160, 50, 160]);
        fire(handle, "onDragEnd", event);
        expect(captured.updateMeasurement).toHaveBeenCalledWith(expect.objectContaining({ points: [
          { x: 50, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 160 }, { x: 50, y: 160 },
        ] }));
      } finally { raf.mockRestore(); }
    });

    it("keeps the isolated rectangle preview aligned while a side is dragged", () => {
      captured.isolatedPreview = true;
      let frame: FrameRequestCallback | undefined;
      const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frame = callback; return 1; });
      try {
        captured.previewSideHandles = [4, 5, 6, 7].map((target) => ({
          draggable: vi.fn(),
          getAttr: (name: string) => (name === "editTarget" ? target : undefined),
          position: vi.fn(),
        }));
        renderLayer({ page: pageWith("rectangle", SQUARE), selected: ["m-1"] });
        const handle = sideHandles().find((side) => side.editTarget === 7)!;
        const { node, moveTo } = dragNode();
        const event = mouseEvent(node);
        moveTo(toScreen({ x: 50, y: 85 }));
        fire(handle, "onMouseDown", event);
        moveTo({ x: 60, y: 999 });
        fire(handle, "onDragStart", event);
        expect(captured.previewPoints).toEqual([30, 50, 150, 50, 150, 120, 30, 120]);
        moveTo({ x: 40, y: 0 });
        fire(handle, "onDragMove", event);
        act(() => frame!(0));
        expect(captured.previewPoints).toEqual([20, 50, 150, 50, 150, 120, 20, 120]);
        // Los tiradores de lado de la vista previa siguen a los lados.
        expect(captured.previewSideHandles.map((side) => side.position.mock.lastCall?.[0])).toEqual([
          { x: 85, y: 50 }, { x: 150, y: 85 }, { x: 85, y: 120 }, { x: 20, y: 85 },
        ]);
        expect(captured.previewSideHandles.every((side) => side.draggable.mock.calls[0]?.[0] === false)).toBe(true);
      } finally { raf.mockRestore(); }
    });

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

    function dragWhole(from: Point, to: Point, button = 0, line = shape()) {
      const target = dragNode();
      const event = mouseEvent(target.node, button);
      target.moveTo(from);
      fire(line, "onMouseDown", event);
      fire(line, "onDragStart", event);
      target.moveTo(to);
      return { event, ...target, end: () => fire(line, "onDragEnd", event) };
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

    it("moves the whole selection, including a measurement just added to it, and nothing else", () => {
      const page = pageWith("line", LINE);
      const lineAt = (id: string, y: number) => ({ ...page.measurements[0]!, id, points: [{ x: 50, y }, { x: 150, y }] });
      page.measurements.push(lineAt("m-2", 200), lineAt("m-3", 300), lineAt("m-4", 400));
      renderLayer({ page, selected: ["m-1", "m-2"] });
      renderLayer({ page, selected: ["m-1", "m-2", "m-3"] });
      const added = captured.lines.find((line) => line.name === "measurement-preview-line" && (line.points as number[])[1] === 300)!;
      dragWhole({ x: 200, y: 600 }, { x: 240, y: 620 }, 0, added).end();
      expect(captured.updateMeasurement).not.toHaveBeenCalled();
      expect(captured.updateMeasurements).toHaveBeenCalledExactlyOnceWith([
        { pageNumber: 1, id: "m-1", points: [{ x: 70, y: 60 }, { x: 170, y: 60 }] },
        { pageNumber: 1, id: "m-2", points: [{ x: 70, y: 210 }, { x: 170, y: 210 }] },
        { pageNumber: 1, id: "m-3", points: [{ x: 70, y: 310 }, { x: 170, y: 310 }] },
      ]);
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
