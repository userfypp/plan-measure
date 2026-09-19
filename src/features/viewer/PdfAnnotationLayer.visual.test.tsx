// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AreaDisplay,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageState,
  Point,
} from "../../types/domain";
import { isAxisAlignedRectStrictlyInsidePolygon } from "../../utils/geometry";
import { PdfAnnotationLayer, type CalibrationReferenceEditPreview } from "./PdfAnnotationLayer";
import { resolveCanvasVisualRoles } from "./canvasVisualRoles";

type CapturedProps = Record<string, unknown>;

const captured = vi.hoisted(() => ({
  lines: [] as CapturedProps[],
  circles: [] as CapturedProps[],
  labels: [] as CapturedProps[],
  tags: [] as CapturedProps[],
  texts: [] as CapturedProps[],
}));

vi.mock("react-konva", () => ({
  Circle: (props: CapturedProps) => {
    captured.circles.push(props);
    return null;
  },
  Group: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Label: (props: CapturedProps & { children?: React.ReactNode }) => {
    captured.labels.push(props);
    return props.children ?? null;
  },
  Line: (props: CapturedProps) => {
    captured.lines.push(props);
    return null;
  },
  Tag: (props: CapturedProps) => {
    captured.tags.push(props);
    return null;
  },
  Text: (props: CapturedProps) => {
    captured.texts.push(props);
    return null;
  },
}));

vi.mock("konva/lib/shapes/Text", () => ({
  Text: class MockKonvaText {
    readonly props: { text?: string; fontSize?: number; padding?: number };

    constructor(props: { text?: string; fontSize?: number; padding?: number }) {
      this.props = props;
    }

    width() {
      return (this.props.text?.length ?? 0) * (this.props.fontSize ?? 12) * 0.6 +
        (this.props.padding ?? 0) * 2;
    }

    height() {
      return (this.props.fontSize ?? 12) + (this.props.padding ?? 0) * 2;
    }
  },
}));

vi.mock("../../app/sessionState", () => ({
  useSessionState: () => ({ updateMeasurement: vi.fn(() => true) }),
}));

const noop = () => undefined;
const roles = resolveCanvasVisualRoles("light");

function uniformPage(): PageState {
  return {
    pageNumber: 1,
    calibrations: [
      {
        id: "scale-1",
        name: "Ground floor",
        mode: "uniform",
        start: { x: 20, y: 20 },
        end: { x: 220, y: 20 },
        referenceDistanceMm: 10000,
      },
    ],
    activeCalibrationId: "scale-1",
    nextCalibrationNumber: 2,
    measurements: [
      {
        id: "polygon-1",
        name: "Studio floor",
        type: "polygon",
        calibrationId: "scale-1",
        classificationValueIds: [],
        visible: true,
        points: [
          { x: 50, y: 50 },
          { x: 150, y: 50 },
          { x: 150, y: 120 },
          { x: 50, y: 120 },
        ],
      },
    ],
    nextMeasurementNumber: { line: 1, polyline: 1, polygon: 2 },
  };
}

function pageWithMeasurement(type: "line" | "polyline" | "polygon"): PageState {
  const page = uniformPage();
  const points =
    type === "line"
      ? [
          { x: 50, y: 50 },
          { x: 150, y: 50 },
        ]
      : type === "polyline"
        ? [
            { x: 50, y: 50 },
            { x: 150, y: 50 },
            { x: 150, y: 120 },
          ]
        : page.measurements[0]!.points;
  return {
    ...page,
    measurements: [{ ...page.measurements[0]!, type, points }],
  };
}

function xyPage(): PageState {
  return {
    pageNumber: 1,
    calibrations: [
      {
        id: "xy-1",
        name: "Survey correction",
        mode: "xy",
        xReference: {
          start: { x: 20, y: 20 },
          end: { x: 220, y: 20 },
          referenceDistanceMm: 10000,
        },
        yReference: {
          start: { x: 30, y: 30 },
          end: { x: 30, y: 230 },
          referenceDistanceMm: 10000,
        },
      },
    ],
    activeCalibrationId: "xy-1",
    nextCalibrationNumber: 2,
    measurements: [],
    nextMeasurementNumber: { line: 1, polyline: 1, polygon: 1 },
  };
}

describe("PdfAnnotationLayer V2 visual semantics", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    captured.lines.length = 0;
    captured.circles.length = 0;
    captured.labels.length = 0;
    captured.tags.length = 0;
    captured.texts.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderLayer({
    page = uniformPage(),
    selectedMeasurementId = null,
    calibrationReferenceEdit = null,
    showCalibration = false,
    showMeasurements = true,
    showLabels = true,
    displayUnit = "m",
    areaDisplay = "auto",
    measurementDecimalPlaces = 2,
    bounds = { width: 600, height: 800, rotation: 0 },
    transform = { zoom: 2, panX: 0, panY: 0 },
    onCalibrationReferencePointsChange = noop,
    onCalibrationReferenceDragCancellationChange = noop,
  }: {
    page?: PageState;
    selectedMeasurementId?: string | null;
    calibrationReferenceEdit?: CalibrationReferenceEditPreview | null;
    showCalibration?: boolean;
    showMeasurements?: boolean;
    showLabels?: boolean;
    displayUnit?: MeasurementDisplayUnit;
    areaDisplay?: AreaDisplay;
    measurementDecimalPlaces?: MeasurementDecimalPlaces;
    bounds?: { width: number; height: number; rotation: 0 | 90 | 180 | 270 };
    transform?: { zoom: number; panX: number; panY: number };
    onCalibrationReferencePointsChange?: (points: [Point, Point]) => void;
    onCalibrationReferenceDragCancellationChange?: (
      owner: object,
      cancel: (() => void) | null,
    ) => void;
  } = {}) {
    act(() => {
      root.render(
        <PdfAnnotationLayer
          page={page}
          bounds={bounds}
          transform={transform}
          activeTool="select"
          spacePan={false}
          isPanning={false}
          selectedMeasurementId={selectedMeasurementId}
          activeMeasurementEditId={null}
          calibrationReferenceEdit={calibrationReferenceEdit}
          measurementEditingBlocked={false}
          precisionAuthoringAvailable
          visualRoles={roles}
          interactionTargetScreenPx={32}
          displayUnit={displayUnit}
          areaDisplay={areaDisplay}
          measurementDecimalPlaces={measurementDecimalPlaces}
          showCalibration={showCalibration}
          showMeasurements={showMeasurements}
          showLabels={showLabels}
          onSelectMeasurement={noop}
          onCalibrationReferencePointsChange={onCalibrationReferencePointsChange}
          onCalibrationReferenceDragCancellationChange={
            onCalibrationReferenceDragCancellationChange
          }
          onMeasurementEditActiveChange={noop}
          onWholeMeasurementDragCancellationChange={noop}
          onVertexDragCancellationChange={noop}
        />,
      );
    });
  }

  it("uses one teal semantic style for unselected measurements without inventing type taxonomy", () => {
    renderLayer();

    expect(captured.lines).toHaveLength(1);
    expect(captured.lines[0]).toMatchObject({
      closed: true,
      stroke: roles.measurementDefaultStroke,
      fill: roles.measurementDefaultFill,
      strokeWidth: 0.75,
      hitStrokeWidth: 6,
      lineCap: "round",
      lineJoin: "round",
    });
    expect(captured.circles).toHaveLength(0);
    expect(captured.labels[0]?.listening).toBe(false);
    expect(captured.tags[0]).toMatchObject({ fill: roles.labelBackground, opacity: 0.88 });
    expect(captured.texts[0]).toMatchObject({
      fill: roles.labelText,
      fontFamily: 'Arial, "Helvetica Neue", sans-serif',
      fontSize: 6,
      padding: 2,
    });
  });

  it("updates existing measurement labels when display precision changes", () => {
    renderLayer({ measurementDecimalPlaces: 2 });
    expect(captured.texts[0]?.text).toContain("17.50 m²");

    captured.texts.length = 0;
    renderLayer({ measurementDecimalPlaces: 6 });
    expect(captured.texts[0]?.text).toContain("17.500000 m²");
  });

  it("measures and places long architectural labels through the existing inside/fallback pipeline", () => {
    const page = uniformPage();
    const calibration = page.calibrations[0]!;
    if (calibration.mode !== "uniform") throw new Error("Expected uniform calibration.");
    page.calibrations[0] = {
      ...calibration,
      referenceDistanceMm: 1524 / 5,
    };

    renderLayer({ page, displayUnit: "ft-in", areaDisplay: "ac" });

    const text = String(captured.texts[0]?.text);
    expect(text).toContain("P ");
    expect(text).toContain("'");
    expect(text).toContain(" · A ");
    expect(text).toContain(" ac");
    expect(captured.labels).toHaveLength(1);
    expect(Number.isFinite(Number(captured.labels[0]?.x))).toBe(true);
    expect(Number.isFinite(Number(captured.labels[0]?.y))).toBe(true);
  });

  it("keeps selected-first collision planning deterministic and excludes hidden measurements", () => {
    const page = uniformPage();
    const first = page.measurements[0]!;
    page.measurements = [
      first,
      { ...first, id: "polygon-2", name: "Second" },
      { ...first, id: "polygon-hidden", name: "Hidden", visible: false },
    ];

    renderLayer({ page, selectedMeasurementId: "polygon-2" });
    const firstPass = captured.labels.map((label) => ({ x: label.x, y: label.y }));

    expect(firstPass).toHaveLength(2);
    expect(firstPass[0]?.y).toBe(68);
    expect(firstPass[1]?.y).toBe(80);

    captured.lines.length = 0;
    captured.circles.length = 0;
    captured.labels.length = 0;
    captured.tags.length = 0;
    captured.texts.length = 0;
    renderLayer({ page, selectedMeasurementId: "polygon-2" });

    expect(captured.labels.map((label) => ({ x: label.x, y: label.y }))).toEqual(firstPass);
  });

  it("anchors a Polyline label to its longest fitting segment rather than the whole-path average", () => {
    renderLayer({ page: pageWithMeasurement("polyline") });

    expect(captured.labels).toHaveLength(1);
    expect(captured.labels[0]).toMatchObject({ x: 87.2, y: 45 });
  });

  it("places a concave Polygon label in contained interior space instead of an invalid naive center", () => {
    const page = uniformPage();
    page.measurements[0] = {
      ...page.measurements[0]!,
      points: [
        { x: 20, y: 20 },
        { x: 260, y: 20 },
        { x: 260, y: 80 },
        { x: 100, y: 80 },
        { x: 100, y: 200 },
        { x: 260, y: 200 },
        { x: 260, y: 260 },
        { x: 20, y: 260 },
      ],
    };

    renderLayer({ page });

    expect(captured.labels).toHaveLength(1);
    const label = captured.labels[0]!;
    const text = captured.texts[0]!;
    const labelWidth = String(text.text).length * 6 * 0.6 + 4;
    const labelHeight = 10;
    const clearance = 2;
    expect(
      isAxisAlignedRectStrictlyInsidePolygon(
        {
          x: Number(label.x) - clearance,
          y: Number(label.y) - clearance,
          width: labelWidth + clearance * 2,
          height: labelHeight + clearance * 2,
        },
        page.measurements[0]!.points,
      ),
    ).toBe(true);
  });

  it("keeps measurement label visibility controls unchanged", () => {
    renderLayer({ showLabels: false });
    expect(captured.lines).toHaveLength(1);
    expect(captured.labels).toHaveLength(0);
    expect(captured.texts).toHaveLength(0);

    captured.lines.length = 0;
    captured.labels.length = 0;
    captured.texts.length = 0;
    renderLayer({ showMeasurements: false });
    expect(captured.lines).toHaveLength(0);
    expect(captured.labels).toHaveLength(0);
    expect(captured.texts).toHaveLength(0);
  });

  it("makes selection structurally stronger with blue fill and 6 px optical / 32 px hit handles", () => {
    renderLayer({ selectedMeasurementId: "polygon-1" });

    expect(captured.lines[0]).toMatchObject({
      stroke: roles.measurementSelectedStroke,
      fill: roles.measurementSelectedFill,
      strokeWidth: 1,
      hitStrokeWidth: 6,
    });
    expect(captured.circles).toHaveLength(4);
    for (const handle of captured.circles) {
      expect(handle).toMatchObject({
        radius: 1.5,
        fill: roles.handleFill,
        stroke: roles.handleStroke,
        strokeWidth: 1,
        hitStrokeWidth: 13,
        draggable: true,
      });
    }
    expect(captured.tags[0]).toMatchObject({
      fill: roles.labelBackground,
      opacity: 1,
      stroke: roles.measurementSelectedStroke,
      strokeWidth: 0.5,
    });
  });

  it("keeps V2 round scene caps but historical butt-cap hit geometry with one interactive owner", () => {
    for (const type of ["line", "polyline", "polygon"] as const) {
      captured.lines.length = 0;
      captured.circles.length = 0;
      captured.labels.length = 0;
      captured.tags.length = 0;
      captured.texts.length = 0;
      const page = pageWithMeasurement(type);
      renderLayer({ page, selectedMeasurementId: "polygon-1" });

      const interactiveLines = captured.lines.filter(
        (line) => typeof line.onMouseDown === "function" || typeof line.onClick === "function",
      );
      expect(interactiveLines).toHaveLength(1);
      const line = interactiveLines[0]!;
      expect(line).toMatchObject({
        lineCap: "round",
        hitStrokeWidth: 6,
      });
      expect(typeof line.hitFunc).toBe("function");

      const calls: Array<[string, ...unknown[]]> = [];
      const context = {
        beginPath: () => calls.push(["beginPath"]),
        moveTo: (x: number, y: number) => calls.push(["moveTo", x, y]),
        lineTo: (x: number, y: number) => calls.push(["lineTo", x, y]),
        closePath: () => calls.push(["closePath"]),
        fillShape: () => calls.push(["fillShape"]),
        save: () => calls.push(["save"]),
        setAttr: (name: string, value: unknown) => calls.push(["setAttr", name, value]),
        stroke: () => calls.push(["stroke"]),
        restore: () => calls.push(["restore"]),
      };
      const shape = {
        points: () => page.measurements[0]!.points.flatMap((point) => [point.x, point.y]),
        closed: () => type === "polygon",
        hasHitStroke: () => true,
        hitStrokeWidth: () => 6,
        strokeWidth: () => 1,
        colorKey: "#abcdef",
      };

      (line.hitFunc as (context: unknown, shape: unknown) => void)(context, shape);

      expect(calls[0]).toEqual(["beginPath"]);
      expect(calls[1]).toEqual(["moveTo", 50, 50]);
      expect(calls).toContainEqual(["setAttr", "lineCap", "butt"]);
      expect(calls).toContainEqual(["setAttr", "lineWidth", 6]);
      expect(calls).toContainEqual(["setAttr", "strokeStyle", "#abcdef"]);
      expect(calls.filter(([name]) => name === "stroke")).toHaveLength(1);
      if (type === "polygon") {
        expect(calls).toContainEqual(["closePath"]);
        expect(calls).toContainEqual(["fillShape"]);
      } else {
        expect(calls.some(([name]) => name === "closePath")).toBe(false);
        expect(calls.some(([name]) => name === "fillShape")).toBe(false);
      }
    }
  });

  it("differentiates existing X/Y reference semantics without adding domain state", () => {
    renderLayer({ page: xyPage(), showCalibration: true });

    expect(captured.lines).toHaveLength(2);
    expect(captured.lines[0]).toMatchObject({
      stroke: roles.calibrationStroke,
      strokeWidth: 1,
      dash: [3, 2],
    });
    expect(captured.lines[1]).toMatchObject({
      stroke: roles.referenceStroke,
      strokeWidth: 1,
      dash: [3, 2],
    });
  });

  it("labels X/Y references by axis only, independent of the stored scale name", () => {
    const page = xyPage();
    page.calibrations[0]!.name = "Nombre extremadamente e innecesariamente largo de prueba";

    renderLayer({ page, showCalibration: true });

    expect(captured.texts.map((text) => text.text)).toEqual(["X", "Y"]);
    expect(
      captured.texts.some((text) => String(text.text).includes(page.calibrations[0]!.name)),
    ).toBe(false);
  });

  it("keeps the Uniform calibration canvas label unchanged", () => {
    renderLayer({ page: uniformPage(), showCalibration: true });

    expect(captured.texts[0]?.text).toBe("Ground floor");
  });

  it("uses selection semantics for active reference editing while preserving reference endpoints", () => {
    const page = xyPage();
    const edit: CalibrationReferenceEditPreview = {
      calibrationId: "xy-1",
      reference: "x",
      points: [
        { x: 40, y: 40 },
        { x: 240, y: 40 },
      ],
      valid: true,
    };
    renderLayer({ page, showCalibration: true, calibrationReferenceEdit: edit });

    expect(captured.lines[0]).toMatchObject({
      points: [40, 40, 240, 40],
      stroke: roles.measurementSelectedStroke,
    });
    const editedHandles = captured.circles.slice(0, 2);
    for (const handle of editedHandles) {
      expect(handle).toMatchObject({
        radius: 1.5,
        fill: roles.handleFill,
        stroke: roles.measurementSelectedStroke,
        hitStrokeWidth: 13,
        draggable: true,
      });
    }
    expect(captured.lines[1]?.stroke).toBe(roles.referenceStroke);
    expect(captured.circles.slice(2).every((handle) => handle.hitStrokeWidth === 0)).toBe(true);
  });

  it("keeps only the active reference and handles visible while calibration visibility is off", () => {
    const page = xyPage();
    const edit: CalibrationReferenceEditPreview = {
      calibrationId: "xy-1",
      reference: "x",
      points: [
        { x: 40, y: 40 },
        { x: 240, y: 40 },
      ],
      valid: true,
    };
    renderLayer({ page, showCalibration: true, calibrationReferenceEdit: edit });

    captured.lines.length = 0;
    captured.circles.length = 0;
    captured.labels.length = 0;
    captured.tags.length = 0;
    captured.texts.length = 0;
    renderLayer({ page, showCalibration: false, calibrationReferenceEdit: edit });

    expect(captured.lines).toHaveLength(1);
    expect(captured.lines[0]).toMatchObject({
      points: [40, 40, 240, 40],
      stroke: roles.measurementSelectedStroke,
    });
    expect(captured.circles).toHaveLength(2);
    expect(captured.circles.every((handle) => handle.draggable === true)).toBe(true);
    expect(captured.texts.map((text) => text.text)).toEqual(["X · editing"]);

    captured.lines.length = 0;
    captured.circles.length = 0;
    captured.labels.length = 0;
    captured.tags.length = 0;
    captured.texts.length = 0;
    renderLayer({ page, showCalibration: false, calibrationReferenceEdit: null });

    expect(captured.lines).toHaveLength(0);
    expect(captured.circles).toHaveLength(0);
    expect(captured.texts).toHaveLength(0);
  });

  it("cancels a reference drag on zoom, restores its source preview, and ignores stale dragend", () => {
    const source: [Point, Point] = [
      { x: 20, y: 20 },
      { x: 220, y: 20 },
    ];
    const onPointsChange = vi.fn<(points: [Point, Point]) => void>();
    const edit: CalibrationReferenceEditPreview = {
      calibrationId: "scale-1",
      reference: "uniform",
      points: source,
      valid: true,
    };
    const node = {
      x: () => 20,
      y: () => 20,
      getStage: () => ({ getPointerPosition: () => ({ x: 100, y: 100 }) }),
      position: vi.fn(),
      isDragging: () => true,
      stopDrag: vi.fn(),
    };

    renderLayer({
      calibrationReferenceEdit: edit,
      onCalibrationReferencePointsChange: onPointsChange,
    });
    const handle = captured.circles[0]!;
    const start = handle.onDragStart as (event: {
      cancelBubble: boolean;
      target: typeof node;
    }) => void;
    const move = handle.onDragMove as (event: {
      cancelBubble: boolean;
      target: typeof node;
    }) => void;
    const end = handle.onDragEnd as (event: { cancelBubble: boolean; target: typeof node }) => void;
    act(() => {
      start({ cancelBubble: false, target: node });
      move({ cancelBubble: false, target: node });
    });

    renderLayer({
      calibrationReferenceEdit: edit,
      transform: { zoom: 3, panX: 0, panY: 0 },
      onCalibrationReferencePointsChange: onPointsChange,
    });
    act(() => end({ cancelBubble: false, target: node }));

    expect(onPointsChange).toHaveBeenCalledTimes(1);
    expect(onPointsChange).toHaveBeenLastCalledWith(source);
    expect(node.position).toHaveBeenCalledWith(source[0]);
    expect(node.stopDrag).toHaveBeenCalledTimes(1);
  });

  it("commits a stable reference drag with the drag-start transform", () => {
    const onPointsChange = vi.fn<(points: [Point, Point]) => void>();
    const edit: CalibrationReferenceEditPreview = {
      calibrationId: "scale-1",
      reference: "uniform",
      points: [
        { x: 20, y: 20 },
        { x: 220, y: 20 },
      ],
      valid: true,
    };
    const node = {
      x: () => 20,
      y: () => 20,
      getStage: () => ({ getPointerPosition: () => ({ x: 100, y: 100 }) }),
      position: vi.fn(),
      isDragging: () => true,
      stopDrag: vi.fn(),
    };

    renderLayer({
      calibrationReferenceEdit: edit,
      onCalibrationReferencePointsChange: onPointsChange,
    });
    const handle = captured.circles[0]!;
    const start = handle.onDragStart as (event: {
      cancelBubble: boolean;
      target: typeof node;
    }) => void;
    const end = handle.onDragEnd as (event: { cancelBubble: boolean; target: typeof node }) => void;
    act(() => {
      start({ cancelBubble: false, target: node });
      end({ cancelBubble: false, target: node });
    });

    expect(onPointsChange).toHaveBeenCalledWith([
      { x: 50, y: 50 },
      { x: 220, y: 20 },
    ]);
    expect(node.stopDrag).not.toHaveBeenCalled();
  });
});
