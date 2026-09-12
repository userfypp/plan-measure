// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageState } from "../../types/domain";
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
  }: {
    page?: PageState;
    selectedMeasurementId?: string | null;
    calibrationReferenceEdit?: CalibrationReferenceEditPreview | null;
    showCalibration?: boolean;
  } = {}) {
    act(() => {
      root.render(
        <PdfAnnotationLayer
          page={page}
          bounds={{ width: 600, height: 800, rotation: 0 }}
          transform={{ zoom: 2, panX: 0, panY: 0 }}
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
          displayUnit="m"
          showCalibration={showCalibration}
          showMeasurements
          showLabels
          onSelectMeasurement={noop}
          onCalibrationReferencePointsChange={noop}
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
    expect(captured.texts.some((text) => String(text.text).includes(page.calibrations[0]!.name))).toBe(false);
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
});
