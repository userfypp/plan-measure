import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Konva } from "konva/lib/Global";
import type { Context as KonvaContext } from "konva/lib/Context";
import { Group as KonvaGroup } from "konva/lib/Group";
import { Layer as KonvaLayer } from "konva/lib/Layer";
import type { Shape as KonvaShape } from "konva/lib/Shape";
import type { Node as KonvaNode, NodeConfig as KonvaNodeConfig } from "konva/lib/Node";
import type { Circle as KonvaCircleNode } from "konva/lib/shapes/Circle";
import type { Label as KonvaLabelNode } from "konva/lib/shapes/Label";
import { Text as KonvaTextNode } from "konva/lib/shapes/Text";
import type { Line as KonvaLineNode } from "konva/lib/shapes/Line";
import { Circle, Group, Label, Line, Tag, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useSessionState } from "../../app/sessionState";
import type {
  AreaDisplay,
  CalibrationReferenceKey,
  LogicalPageBounds,
  Measurement,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageState,
  Point,
  Tool,
  ViewTransform,
} from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import { measurementPathSpecs } from "../../utils/geometry";
import { formatMeasurement } from "../../utils/format";
import { clampPointToPage, screenToPage } from "../../utils/coordinates";
import {
  createLabelCollisionIndex,
  LABEL_EDGE_MARGIN_SCREEN_PX,
  placeLabelInsideMeasurementGeometry,
  placeLabelAvoidingOverlaps,
  placeLabelWithinBounds,
  type LabelCollisionIndex,
  type LabelDimensions,
  type LabelPlacement,
  type OccupiedLabelRect,
} from "../../utils/labelLayout";
import { shouldRenderMeasurement } from "../measurements/measurementViewModels";
import {
  canDragWholeMeasurement,
  canStartWholeMeasurementDrag,
  constrainMeasurementTranslation,
  finishWholeMeasurementDrag,
  MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX,
  measurementEditingEnabled,
  pageDeltaFromScreenDrag,
  shouldCancelWholeMeasurementDrag,
  translateMeasurementPoints,
  type WholeMeasurementDragResult,
} from "./measurementDrag";
import {
  beginMeasurementVertexDrag,
  cancelPreparedMeasurementVertexDrag,
  cancelMeasurementVertexDrag,
  clearReadyMeasurementVertexDrag,
  createMeasurementVertexDragState,
  finishMeasurementVertexDrag,
  getActiveMeasurementVertexDrag,
  matchesPreparedMeasurementVertexDrag,
  prepareMeasurementVertexDrag,
  shouldCancelMeasurementVertexDrag,
  shouldRenderMeasurementVertexHandles,
  type MeasurementVertexDragEffects,
  type MeasurementVertexDragNode,
  type MeasurementVertexDragPreparation,
} from "./measurementVertexDrag";
import {
  CANVAS_VISUAL_METRICS,
  circularHandleHitStrokeWidthScreenPx,
  type CanvasVisualRoles,
} from "./canvasVisualRoles";

const LABEL_PADDING_SCREEN_PX = CANVAS_VISUAL_METRICS.labelPaddingScreenPx;
const MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX =
  CANVAS_VISUAL_METRICS.measurementLabelFontSizeScreenPx;
const CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX =
  CANVAS_VISUAL_METRICS.calibrationLabelFontSizeScreenPx;

export interface CalibrationReferenceEditPreview {
  calibrationId: string;
  reference: CalibrationReferenceKey;
  points: [Point, Point];
  valid: boolean;
}

function pointsToFlat(points: Point[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

/**
 * Preserve the historical Konva hit geometry while allowing the scene stroke
 * to use the V2 round cap. Konva otherwise applies the scene lineCap to its hit
 * stroke too, which would extend open Line/Polyline hit regions past endpoints.
 */
function drawMeasurementHit(context: KonvaContext, shape: KonvaShape): void {
  const line = shape as KonvaLineNode;
  const points = line.points();
  if (points.length < 2) return;

  context.beginPath();
  context.moveTo(points[0]!, points[1]!);
  for (let index = 2; index < points.length; index += 2) {
    context.lineTo(points[index]!, points[index + 1]!);
  }

  if (line.closed()) {
    context.closePath();
    context.fillShape(line);
  }

  if (!line.hasHitStroke()) return;
  const hitStrokeWidth = line.hitStrokeWidth();
  const strokeWidth = hitStrokeWidth === "auto" ? line.strokeWidth() : hitStrokeWidth;
  context.save();
  context.setAttr("lineCap", "butt");
  context.setAttr("lineWidth", strokeWidth);
  context.setAttr("strokeStyle", line.colorKey);
  context.stroke();
  context.restore();
}

function averagePoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function measureLabelText(text: string, fontSizeScreenPx: number, zoom: number): LabelDimensions {
  const textNode = new KonvaTextNode({
    text,
    fontFamily: CANVAS_VISUAL_METRICS.fontFamily,
    fontSize: fontSizeScreenPx / zoom,
    padding: LABEL_PADDING_SCREEN_PX / zoom,
  });
  return { width: textNode.width(), height: textNode.height() };
}

function withoutKonvaAutoDraw<T>(action: () => T): T {
  const previousAutoDraw = Konva.autoDrawEnabled;
  Konva.autoDrawEnabled = false;
  try {
    return action();
  } finally {
    Konva.autoDrawEnabled = previousAutoDraw;
  }
}

interface PdfAnnotationLayerProps {
  page: PageState;
  bounds: LogicalPageBounds;
  transform: ViewTransform;

  activeTool: Tool;
  spacePan: boolean;
  isPanning: boolean;

  selectedMeasurementId: string | null;
  activeMeasurementEditId: string | null;

  calibrationReferenceEdit: CalibrationReferenceEditPreview | null;
  measurementEditingBlocked: boolean;
  precisionAuthoringAvailable: boolean;
  visualRoles: CanvasVisualRoles;
  interactionTargetScreenPx: number;

  displayUnit: MeasurementDisplayUnit;
  areaDisplay: AreaDisplay;
  measurementDecimalPlaces: MeasurementDecimalPlaces;
  showCalibration: boolean;
  showMeasurements: boolean;
  showLabels: boolean;

  onSelectMeasurement: (id: string) => void;
  onCalibrationReferencePointsChange: (points: [Point, Point]) => void;
  onCalibrationReferenceDragCancellationChange: (
    owner: object,
    cancel: (() => void) | null,
  ) => void;
  onMeasurementEditActiveChange: (measurementId: string, active: boolean) => void;
  onWholeMeasurementDragCancellationChange: (
    measurementId: string,
    cancel: (() => void) | null,
  ) => void;
  onVertexDragCancellationChange: (
    measurementId: string,
    owner: object,
    cancel: (() => void) | null,
  ) => void;
}

export const PdfAnnotationLayer = memo(function PdfAnnotationLayer({
  page,
  bounds,
  transform,
  activeTool,
  spacePan,
  isPanning,
  selectedMeasurementId,
  activeMeasurementEditId,
  calibrationReferenceEdit,
  measurementEditingBlocked,
  precisionAuthoringAvailable,
  visualRoles,
  interactionTargetScreenPx,
  displayUnit,
  areaDisplay,
  measurementDecimalPlaces,
  showCalibration,
  showMeasurements,
  showLabels,
  onSelectMeasurement,
  onCalibrationReferencePointsChange,
  onCalibrationReferenceDragCancellationChange,
  onMeasurementEditActiveChange,
  onWholeMeasurementDragCancellationChange,
  onVertexDragCancellationChange,
}: PdfAnnotationLayerProps) {
  const showMeasurementLabels = showMeasurements && showLabels;

  const plannedLabelLayout = useMemo(() => {
    const placements = new Map<string, LabelPlacement>();
    const occupiedRects = new Map<string, OccupiedLabelRect>();
    const occupied = createLabelCollisionIndex();
    if (!bounds) return { placements, occupiedRects, occupied };

    function store(key: string, placement: LabelPlacement, dimensions: LabelDimensions) {
      const rect = { ...placement, ...dimensions };
      placements.set(key, placement);
      occupiedRects.set(key, rect);
      occupied.insert(rect);
    }

    function reserve(key: string, anchor: Point, dimensions: LabelDimensions) {
      const placement = placeLabelAvoidingOverlaps(
        anchor,
        dimensions,
        bounds!,
        transform.zoom,
        occupied,
        LABEL_EDGE_MARGIN_SCREEN_PX,
      );
      store(key, placement, dimensions);
    }

    if (showCalibration || calibrationReferenceEdit) {
      for (const calibration of page.calibrations) {
        const editing = calibrationReferenceEdit?.calibrationId === calibration.id;
        const references =
          calibration.mode === "uniform"
            ? [
                {
                  key: "uniform",
                  label: calibration.name,
                  start: calibration.start,
                  end: calibration.end,
                },
              ]
            : [
                { key: "x", label: "X", ...calibration.xReference },
                { key: "y", label: "Y", ...calibration.yReference },
              ];
        for (const reference of references) {
          const referenceIsEditing =
            editing && calibrationReferenceEdit?.reference === reference.key;
          if (!showCalibration && !referenceIsEditing) continue;
          const start =
            referenceIsEditing && calibrationReferenceEdit
              ? calibrationReferenceEdit.points[0]
              : reference.start;
          const end =
            referenceIsEditing && calibrationReferenceEdit
              ? calibrationReferenceEdit.points[1]
              : reference.end;
          const labelText = `${reference.label}${referenceIsEditing ? " · editing" : ""}`;
          reserve(
            `calibration:${calibration.id}:${reference.key}`,
            { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
            measureLabelText(labelText, CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX, transform.zoom),
          );
        }
      }
    }

    if (showMeasurementLabels) {
      const orderedMeasurements = [...page.measurements].sort((left, right) =>
        left.id === selectedMeasurementId ? -1 : right.id === selectedMeasurementId ? 1 : 0,
      );
      for (const measurement of orderedMeasurements) {
        if (!shouldRenderMeasurement(measurement, showMeasurementLabels)) continue;
        const calibration = getMeasurementCalibration(page, measurement);
        if (!calibration) continue;
        const labelText = formatMeasurement(
          measurement,
          calibration,
          displayUnit,
          measurementDecimalPlaces,
          areaDisplay,
        );
        const key = `measurement:${measurement.id}`;
        const dimensions = measureLabelText(
          labelText,
          MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX,
          transform.zoom,
        );
        const fallbackAnchor = averagePoint(measurement.points);
        const placement =
          placeLabelInsideMeasurementGeometry(
            measurement.type,
            measurement.points,
            dimensions,
            bounds,
            transform.zoom,
            occupied,
            LABEL_EDGE_MARGIN_SCREEN_PX,
          ) ??
          placeLabelAvoidingOverlaps(
            fallbackAnchor,
            dimensions,
            bounds,
            transform.zoom,
            occupied,
            LABEL_EDGE_MARGIN_SCREEN_PX,
          );
        store(key, placement, dimensions);
      }
    }
    return { placements, occupiedRects, occupied };
  }, [
    bounds,
    calibrationReferenceEdit,
    page,
    selectedMeasurementId,
    displayUnit,
    areaDisplay,
    measurementDecimalPlaces,
    showCalibration,
    showMeasurementLabels,
    transform.zoom,
  ]);

  return (
    <>
      {(showCalibration || calibrationReferenceEdit) &&
        page.calibrations.flatMap((calibration) => {
          const active = calibration.id === page.activeCalibrationId;
          const editing = calibrationReferenceEdit?.calibrationId === calibration.id;
          const references =
            calibration.mode === "uniform"
              ? [{ key: "uniform", label: calibration.name, ...calibration }]
              : [
                  {
                    key: "x",
                    label: "X",
                    ...calibration.xReference,
                  },
                  {
                    key: "y",
                    label: "Y",
                    ...calibration.yReference,
                  },
                ];
          return references.map((reference) => {
            const referenceIsEditing =
              editing && calibrationReferenceEdit?.reference === reference.key;
            if (!showCalibration && !referenceIsEditing) return null;
            const baseStroke =
              reference.key === "y" ? visualRoles.referenceStroke : visualRoles.calibrationStroke;
            const stroke = referenceIsEditing ? visualRoles.measurementSelectedStroke : baseStroke;
            const visibleReference = referenceIsEditing
              ? {
                  ...reference,
                  start: calibrationReferenceEdit.points[0],
                  end: calibrationReferenceEdit.points[1],
                }
              : reference;
            const labelPoint = {
              x: (visibleReference.start.x + visibleReference.end.x) / 2,
              y: (visibleReference.start.y + visibleReference.end.y) / 2,
            };
            const labelText = `${reference.label}${referenceIsEditing ? " · editing" : ""}`;
            const labelDimensions = measureLabelText(
              labelText,
              CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX,
              transform.zoom,
            );
            const layoutKey = `calibration:${calibration.id}:${reference.key}`;
            const plannedPlacement = plannedLabelLayout.placements.get(layoutKey);
            const labelPlacement =
              plannedPlacement ??
              placeLabelWithinBounds(labelPoint, labelDimensions, bounds, transform.zoom);
            return (
              <Group
                key={`${calibration.id}-${reference.key}`}
                listening={referenceIsEditing}
                opacity={active ? 1 : 0.72}
              >
                <Line
                  points={pointsToFlat([visibleReference.start, visibleReference.end])}
                  stroke={stroke}
                  strokeWidth={
                    (referenceIsEditing || active
                      ? CANVAS_VISUAL_METRICS.calibrationEmphasizedStrokeScreenPx
                      : CANVAS_VISUAL_METRICS.calibrationStrokeScreenPx) / transform.zoom
                  }
                  dash={CANVAS_VISUAL_METRICS.calibrationDashScreenPx.map(
                    (value) => value / transform.zoom,
                  )}
                  lineCap="round"
                  lineJoin="round"
                />
                <CalibrationReferenceMarkers
                  calibrationId={calibration.id}
                  points={[visibleReference.start, visibleReference.end]}
                  editable={referenceIsEditing}
                  precisionAuthoringAvailable={precisionAuthoringAvailable}
                  stroke={stroke}
                  handleFill={visualRoles.handleFill}
                  interactionTargetScreenPx={interactionTargetScreenPx}
                  zoom={transform.zoom}
                  transform={transform}
                  bounds={bounds}
                  onPointsChange={onCalibrationReferencePointsChange}
                  onDragCancellationChange={onCalibrationReferenceDragCancellationChange}
                />
                <Label x={labelPlacement.x} y={labelPlacement.y}>
                  <Tag
                    fill={visualRoles.labelBackground}
                    opacity={referenceIsEditing || active ? 1 : 0.88}
                    stroke={referenceIsEditing ? visualRoles.measurementSelectedStroke : undefined}
                    strokeWidth={referenceIsEditing ? 1 / transform.zoom : 0}
                    cornerRadius={CANVAS_VISUAL_METRICS.labelCornerRadiusScreenPx / transform.zoom}
                  />
                  <Text
                    text={labelText}
                    fill={visualRoles.labelText}
                    fontFamily={CANVAS_VISUAL_METRICS.fontFamily}
                    fontSize={CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX / transform.zoom}
                    padding={LABEL_PADDING_SCREEN_PX / transform.zoom}
                  />
                </Label>
              </Group>
            );
          });
        })}
      {page.measurements
        .filter((measurement) => shouldRenderMeasurement(measurement, showMeasurements))
        .map((measurement) => (
          <MeasurementShape
            key={measurement.id}
            measurement={measurement}
            bounds={bounds}
            zoom={transform.zoom}
            transform={transform}
            selected={selectedMeasurementId === measurement.id}
            selectable={
              activeTool === "select" &&
              !spacePan &&
              !isPanning &&
              !calibrationReferenceEdit &&
              !measurementEditingBlocked
            }
            editable={measurementEditingEnabled(
              activeTool,
              spacePan,
              isPanning,
              Boolean(calibrationReferenceEdit),
              measurementEditingBlocked || !precisionAuthoringAvailable,
              activeMeasurementEditId,
              measurement.id,
            )}
            showLabel={showLabels}
            page={page}
            displayUnit={displayUnit}
            areaDisplay={areaDisplay}
            measurementDecimalPlaces={measurementDecimalPlaces}
            visualRoles={visualRoles}
            interactionTargetScreenPx={interactionTargetScreenPx}
            pageNumber={page.pageNumber}
            onSelectMeasurement={onSelectMeasurement}
            onMeasurementEditActiveChange={onMeasurementEditActiveChange}
            onWholeMeasurementDragCancellationChange={onWholeMeasurementDragCancellationChange}
            onVertexDragCancellationChange={onVertexDragCancellationChange}
            plannedLabelPlacement={
              plannedLabelLayout.placements.get(`measurement:${measurement.id}`) ?? null
            }
            plannedOccupiedLabelRect={
              plannedLabelLayout.occupiedRects.get(`measurement:${measurement.id}`) ?? null
            }
            labelCollisionIndex={plannedLabelLayout.occupied}
          />
        ))}
    </>
  );
});

interface CalibrationReferenceMarkersProps {
  calibrationId: string;
  points: [Point, Point];
  editable: boolean;
  precisionAuthoringAvailable: boolean;
  stroke: string;
  handleFill: string;
  interactionTargetScreenPx: number;
  zoom: number;
  transform: ViewTransform;
  bounds: LogicalPageBounds;
  onPointsChange: (points: [Point, Point]) => void;
  onDragCancellationChange: (owner: object, cancel: (() => void) | null) => void;
}

interface CalibrationReferenceDragSnapshot {
  owner: object;
  node: {
    position(point: Point): unknown;
    isDragging(): boolean;
    stopDrag(): void;
  };
  index: number;
  sourcePoints: [Point, Point];
  transform: ViewTransform;
  bounds: LogicalPageBounds;
}

function CalibrationReferenceMarkers({
  calibrationId,
  points,
  editable,
  precisionAuthoringAvailable,
  stroke,
  handleFill,
  interactionTargetScreenPx,
  zoom,
  transform,
  bounds,
  onPointsChange,
  onDragCancellationChange,
}: CalibrationReferenceMarkersProps) {
  const frameRef = useRef<number | null>(null);
  const pendingPointsRef = useRef<[Point, Point] | null>(null);
  const dragPointsRef = useRef<[Point, Point]>(points);
  const activeDragRef = useRef<CalibrationReferenceDragSnapshot | null>(null);
  const onPointsChangeRef = useRef(onPointsChange);
  const onDragCancellationChangeRef = useRef(onDragCancellationChange);
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);

  useLayoutEffect(() => {
    onPointsChangeRef.current = onPointsChange;
    onDragCancellationChangeRef.current = onDragCancellationChange;
  }, [onDragCancellationChange, onPointsChange]);

  useEffect(() => {
    dragPointsRef.current = points;
  }, [points]);

  const cancelActiveDrag = useCallback(() => {
    const drag = activeDragRef.current;
    if (!drag) return;

    // Invalidate ownership before stopDrag() so a synchronous Konva dragend is stale.
    activeDragRef.current = null;
    onDragCancellationChangeRef.current(drag.owner, null);
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointsRef.current = null;
    dragPointsRef.current = drag.sourcePoints.map((point) => ({ ...point })) as [Point, Point];
    drag.node.position(drag.sourcePoints[drag.index]!);
    if (drag.node.isDragging()) drag.node.stopDrag();
    onPointsChangeRef.current(dragPointsRef.current);
    setActiveDragIndex(null);
  }, []);

  useLayoutEffect(() => {
    const drag = activeDragRef.current;
    if (!drag) return;
    if (
      shouldCancelWholeMeasurementDrag(drag, true, transform, bounds) ||
      !editable ||
      !precisionAuthoringAvailable
    ) {
      cancelActiveDrag();
    }
  }, [bounds, cancelActiveDrag, editable, precisionAuthoringAvailable, transform]);

  useEffect(() => () => cancelActiveDrag(), [cancelActiveDrag]);

  function pointFromDragEvent(
    event: KonvaEventObject<MouseEvent>,
    drag: Pick<CalibrationReferenceDragSnapshot, "transform" | "bounds">,
  ): Point {
    const pointer = event.target.getStage()?.getPointerPosition();
    const rawPoint = pointer
      ? screenToPage({ x: pointer.x, y: pointer.y }, drag.transform)
      : { x: event.target.x(), y: event.target.y() };
    return clampPointToPage(rawPoint, drag.bounds);
  }

  function queuePoints(owner: object, nextPoints: [Point, Point]) {
    dragPointsRef.current = nextPoints;
    pendingPointsRef.current = nextPoints;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingPointsRef.current;
      pendingPointsRef.current = null;
      if (pending && activeDragRef.current?.owner === owner) onPointsChangeRef.current(pending);
    });
  }

  function pointsWithHandle(
    sourcePoints: [Point, Point],
    index: number,
    point: Point,
  ): [Point, Point] {
    const current = sourcePoints;
    return index === 0 ? [point, current[1]] : [current[0], point];
  }

  function handleDragMove(index: number, event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    const drag = activeDragRef.current;
    if (!drag || drag.node !== event.target || drag.index !== index) return;
    const point = pointFromDragEvent(event, drag);
    event.target.position(point);
    queuePoints(drag.owner, pointsWithHandle(drag.sourcePoints, index, point));
  }

  function handleDragEnd(index: number, event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    const drag = activeDragRef.current;
    if (!drag || drag.node !== event.target || drag.index !== index) return;
    activeDragRef.current = null;
    onDragCancellationChangeRef.current(drag.owner, null);
    const point = pointFromDragEvent(event, drag);
    event.target.position(point);
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointsRef.current = null;
    const nextPoints = pointsWithHandle(drag.sourcePoints, index, point);
    dragPointsRef.current = nextPoints;
    onPointsChangeRef.current(nextPoints);
    setActiveDragIndex(null);
  }

  return points.map((point, index) => {
    const spatialEditable =
      editable && (precisionAuthoringAvailable || activeDragIndex === index);
    return (
      <Circle
        key={`${calibrationId}-${index}`}
        x={point.x}
        y={point.y}
        radius={CANVAS_VISUAL_METRICS.handleRadiusScreenPx / zoom}
        fill={handleFill}
        stroke={stroke}
        strokeWidth={CANVAS_VISUAL_METRICS.handleStrokeScreenPx / zoom}
        draggable={spatialEditable}
        hitStrokeWidth={
          spatialEditable
            ? circularHandleHitStrokeWidthScreenPx(interactionTargetScreenPx) / zoom
            : 0
        }
        onDragStart={
          spatialEditable
            ? (event) => {
                event.cancelBubble = true;
                const sourcePoints = points.map((point) => ({ ...point })) as [Point, Point];
                const snapshot: CalibrationReferenceDragSnapshot = {
                  owner: {},
                  node: event.target,
                  index,
                  sourcePoints,
                  transform: { ...transform },
                  bounds: { ...bounds },
                };
                activeDragRef.current = snapshot;
                dragPointsRef.current = sourcePoints;
                setActiveDragIndex(index);
                onDragCancellationChangeRef.current(snapshot.owner, cancelActiveDrag);
              }
            : undefined
        }
        onDragMove={spatialEditable ? (event) => handleDragMove(index, event) : undefined}
        onDragEnd={spatialEditable ? (event) => handleDragEnd(index, event) : undefined}
      />
    );
  });
}

interface MeasurementShapeProps {
  measurement: Measurement;
  pageNumber: number;
  page: PageState;
  displayUnit: MeasurementDisplayUnit;
  areaDisplay: AreaDisplay;
  measurementDecimalPlaces: MeasurementDecimalPlaces;
  visualRoles: CanvasVisualRoles;
  interactionTargetScreenPx: number;
  bounds: LogicalPageBounds;
  zoom: number;
  transform: ViewTransform;
  selected: boolean;
  selectable: boolean;
  editable: boolean;
  showLabel: boolean;
  onSelectMeasurement: (id: string) => void;
  onMeasurementEditActiveChange: (measurementId: string, active: boolean) => void;
  onWholeMeasurementDragCancellationChange: (
    measurementId: string,
    cancel: (() => void) | null,
  ) => void;
  onVertexDragCancellationChange: (
    measurementId: string,
    owner: object,
    cancel: (() => void) | null,
  ) => void;
  plannedLabelPlacement: LabelPlacement | null;
  plannedOccupiedLabelRect: OccupiedLabelRect | null;
  labelCollisionIndex: LabelCollisionIndex;
}

const MeasurementShape = memo(function MeasurementShape({
  measurement,
  pageNumber,
  page,
  displayUnit,
  areaDisplay,
  measurementDecimalPlaces,
  visualRoles,
  interactionTargetScreenPx,
  bounds,
  zoom,
  transform,
  selected,
  selectable,
  editable,
  showLabel,
  onSelectMeasurement,
  onMeasurementEditActiveChange,
  onWholeMeasurementDragCancellationChange,
  onVertexDragCancellationChange,
  plannedLabelPlacement,
  plannedOccupiedLabelRect,
  labelCollisionIndex,
}: MeasurementShapeProps) {
  const { updateMeasurement: updateSessionMeasurement } = useSessionState();
  const measurementGroupRef = useRef<KonvaGroup>(null);
  const wholeDragNodeRef = useRef<KonvaLineNode>(null);
  const dragPreviewRef = useRef<{
    layer: KonvaLayer;
    source: KonvaGroup;
    group: KonvaGroup;
    line: KonvaLineNode;
    label: KonvaLabelNode | undefined;
    text: KonvaTextNode | undefined;
    labelDimensions: LabelDimensions | null;
    handles: KonvaCircleNode[];
  } | null>(null);
  const pinnedDragNodeRef = useRef<{
    node: KonvaNode;
    bound: KonvaNodeConfig["dragBoundFunc"];
  } | null>(null);
  const vertexDragStateRef = useRef(createMeasurementVertexDragState());
  const vertexDragPreparationRef = useRef<MeasurementVertexDragPreparation | null>(null);
  const dragPointsRef = useRef<Point[] | null>(null);
  const finalDragPointsRef = useRef<Point[] | null>(null);
  const wholeDragRef = useRef<{
    startScreen: Point;
    sourcePoints: Point[];
    transform: ViewTransform;
    bounds: LogicalPageBounds;
  } | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<
    | {
        kind: "vertex";
        owner: object;
        node: MeasurementVertexDragNode;
        index: number;
        point: Point;
      }
    | {
        kind: "whole";
        drag: NonNullable<typeof wholeDragRef.current>;
        pointer: Point;
      }
    | null
  >(null);
  const rejectedWholeDragRef = useRef(false);
  const cancelledWholeDragRef = useRef(false);
  const [wholeDragPrepared, setWholeDragPrepared] = useState(false);
  const [vertexDragOwned, setVertexDragOwned] = useState(false);
  const [dragPoints, setDragPoints] = useState<Point[] | null>(null);
  const stroke = selected
    ? visualRoles.measurementSelectedStroke
    : visualRoles.measurementDefaultStroke;
  const visibleMeasurement = useMemo<Measurement>(() => {
    if (!dragPoints) return measurement;
    return { ...measurement, points: dragPoints };
  }, [dragPoints, measurement]);
  const calibration = getMeasurementCalibration(page, visibleMeasurement);
  const flatPoints = useMemo(
    () => pointsToFlat(visibleMeasurement.points),
    [visibleMeasurement.points],
  );
  const labelPoint = useMemo(
    () => averagePoint(visibleMeasurement.points),
    [visibleMeasurement.points],
  );
  const labelText = useMemo(
    () =>
      calibration
        ? formatMeasurement(
            visibleMeasurement,
            calibration,
            displayUnit,
            measurementDecimalPlaces,
            areaDisplay,
          )
        : null,
    [areaDisplay, calibration, displayUnit, measurementDecimalPlaces, visibleMeasurement],
  );
  const labelDimensions = useMemo(
    () =>
      !dragPoints && plannedLabelPlacement
        ? null
        : labelText
          ? measureLabelText(labelText, MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX, zoom)
          : null,
    [dragPoints, labelText, plannedLabelPlacement, zoom],
  );
  const labelPlacement = useMemo(() => {
    if (!dragPoints && plannedLabelPlacement) return plannedLabelPlacement;
    if (!labelDimensions) return null;
    const insidePlacement = placeLabelInsideMeasurementGeometry(
      visibleMeasurement.type,
      visibleMeasurement.points,
      labelDimensions,
      bounds,
      zoom,
      labelCollisionIndex,
      LABEL_EDGE_MARGIN_SCREEN_PX,
      4,
      plannedOccupiedLabelRect,
    );
    return (
      insidePlacement ??
      placeLabelWithinBounds(labelPoint, labelDimensions, bounds, zoom, LABEL_EDGE_MARGIN_SCREEN_PX)
    );
  }, [
    bounds,
    dragPoints,
    labelCollisionIndex,
    labelDimensions,
    labelPoint,
    plannedLabelPlacement,
    plannedOccupiedLabelRect,
    visibleMeasurement,
    zoom,
  ]);
  const wholeMeasurementDraggable = canDragWholeMeasurement(
    measurement,
    selected || wholeDragPrepared,
    editable,
  );
  const manipulating = dragPoints !== null || vertexDragOwned;

  function startDragPreview(node: KonvaNode, renderInitial: () => void): boolean {
    const source = measurementGroupRef.current;
    const stage = source?.getStage();
    if (!source || !stage || dragPreviewRef.current) return false;

    const clone = source.clone({ listening: false });
    const layer = new KonvaLayer({ listening: false });
    const pageGroup = new KonvaGroup({
      x: transform.panX,
      y: transform.panY,
      scaleX: zoom,
      scaleY: zoom,
      clipX: 0,
      clipY: 0,
      clipWidth: bounds.width,
      clipHeight: bounds.height,
      listening: false,
    });
    const started = withoutKonvaAutoDraw(() => {
      layer.add(pageGroup);
      pageGroup.add(clone);
      const line = clone.findOne<KonvaLineNode>(".measurement-preview-line");
      if (!line) {
        layer.destroy();
        return false;
      }
      const label = clone.findOne<KonvaLabelNode>(".measurement-preview-label");
      const handles = clone.find<KonvaCircleNode>(".measurement-preview-handle");
      line.draggable(false);
      handles.forEach((handle) => handle.draggable(false));
      if (measurementPathSpecs[measurement.type].closed && selected) {
        line.fill(visualRoles.measurementSelectedSoftFill);
      }
      dragPreviewRef.current = {
        layer,
        source,
        group: clone,
        line,
        label,
        text: label?.findOne<KonvaTextNode>("Text"),
        labelDimensions: null,
        handles,
      };
      try {
        renderInitial();
        stage.add(layer);
      } catch (error) {
        dragPreviewRef.current = null;
        layer.destroy();
        throw error;
      }
      return true;
    });
    if (!started) return false;
    source.visible(false);

    const position = node.getAbsolutePosition();
    pinnedDragNodeRef.current = { node, bound: node.dragBoundFunc() };
    node.dragBoundFunc(() => position);
    return true;
  }

  const releaseDragPreview = useCallback(() => {
    const pinned = pinnedDragNodeRef.current;
    pinnedDragNodeRef.current = null;
    if (pinned) pinned.node.setAttr("dragBoundFunc", pinned.bound);
    const preview = dragPreviewRef.current;
    dragPreviewRef.current = null;
    if (!preview) return;
    preview.source.visible(true);
    preview.layer.destroy();
  }, []);

  function renderDragPreview(points: Point[]) {
    const preview = dragPreviewRef.current;
    if (!preview) {
      updateDragPoints(points);
      return;
    }
    preview.line.points(pointsToFlat(points));
    points.forEach((point, index) => preview.handles[index]?.position(point));
    if (preview.label && preview.text && calibration) {
      const currentMeasurement = { ...measurement, points };
      const text = formatMeasurement(
        currentMeasurement,
        calibration,
        displayUnit,
        measurementDecimalPlaces,
        areaDisplay,
      );
      preview.text.text(text);
      const dimensions = { width: preview.text.width(), height: preview.text.height() };
      const placement =
        placeLabelInsideMeasurementGeometry(
          measurement.type,
          points,
          dimensions,
          bounds,
          zoom,
          labelCollisionIndex,
          LABEL_EDGE_MARGIN_SCREEN_PX,
          4,
          plannedOccupiedLabelRect,
        ) ??
        placeLabelWithinBounds(
          averagePoint(points),
          dimensions,
          bounds,
          zoom,
          LABEL_EDGE_MARGIN_SCREEN_PX,
        );
      preview.label.position(placement);
    }
  }

  function renderWholeDragPreview(result: WholeMeasurementDragResult) {
    const preview = dragPreviewRef.current;
    if (!preview) {
      updateDragPoints(result.points);
      return;
    }
    preview.group.position(result.delta);
    if (preview.label && preview.text) {
      const dimensions =
        preview.labelDimensions ??
        (preview.labelDimensions = {
          width: preview.text.width(),
          height: preview.text.height(),
        });
      const placement =
        placeLabelInsideMeasurementGeometry(
          measurement.type,
          result.points,
          dimensions,
          bounds,
          zoom,
          labelCollisionIndex,
          LABEL_EDGE_MARGIN_SCREEN_PX,
          4,
          plannedOccupiedLabelRect,
        ) ??
        placeLabelWithinBounds(
          averagePoint(result.points),
          dimensions,
          bounds,
          zoom,
          LABEL_EDGE_MARGIN_SCREEN_PX,
        );
      preview.label.position({
        x: placement.x - result.delta.x,
        y: placement.y - result.delta.y,
      });
    }
  }

  const cancelPendingPreview = useCallback(() => {
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    pendingPreviewRef.current = null;
  }, []);

  function applyPreview(pending: NonNullable<typeof pendingPreviewRef.current>) {
    if (pending.kind === "vertex") {
      if (vertexDragStateRef.current.active?.owner !== pending.owner) return false;
      const drag = getActiveMeasurementVertexDrag(
        vertexDragStateRef.current,
        pending.node,
        pending.index,
      );
      if (drag) {
        renderDragPreview(
          drag.sourcePoints.map((point, index) =>
            index === pending.index ? pending.point : point,
          ),
        );
        return true;
      }
    } else if (wholeDragRef.current === pending.drag) {
      const result = wholeDragResultFromPointer(pending.pointer);
      if (result) {
        renderWholeDragPreview(result);
        return true;
      }
    }
    return false;
  }

  function drawIsolatedPreview(update: () => boolean) {
    const preview = dragPreviewRef.current;
    if (!preview) {
      update();
      return;
    }
    withoutKonvaAutoDraw(() => {
      if (update()) preview.layer.draw();
    });
  }

  function queuePreview(preview: NonNullable<typeof pendingPreviewRef.current>) {
    pendingPreviewRef.current = preview;
    if (previewFrameRef.current !== null) return;
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const pending = pendingPreviewRef.current;
      pendingPreviewRef.current = null;
      if (pending) drawIsolatedPreview(() => applyPreview(pending));
    });
  }

  const cancelVertexGesture = useCallback(
    (owner?: object) => {
      const active = vertexDragStateRef.current.active;
      const preparation = vertexDragPreparationRef.current;
      const currentOwner = active?.owner ?? preparation?.owner ?? null;
      if (!currentOwner || (owner && currentOwner !== owner)) return false;

      cancelPendingPreview();
      finalDragPointsRef.current = null;
      let cancelled = false;
      if (active) {
        cancelled = cancelMeasurementVertexDrag(vertexDragStateRef.current, {
          preview: (points) => {
            dragPointsRef.current = points;
            setDragPoints(points);
          },
          setEditing: (active) => onMeasurementEditActiveChange(measurement.id, active),
        });
      } else if (preparation) {
        vertexDragPreparationRef.current = null;
        cancelPreparedMeasurementVertexDrag(preparation);
        dragPointsRef.current = null;
        setDragPoints(null);
        cancelled = true;
      }

      if (!cancelled) return false;
      vertexDragPreparationRef.current = null;
      setVertexDragOwned(false);
      onVertexDragCancellationChange(measurement.id, currentOwner, null);
      return cancelled;
    },
    [
      cancelPendingPreview,
      measurement.id,
      onMeasurementEditActiveChange,
      onVertexDragCancellationChange,
    ],
  );

  const clearCancelledWholeDrag = useCallback(() => {
    cancelPendingPreview();
    wholeDragRef.current = null;
    setWholeDragPrepared(false);
    rejectedWholeDragRef.current = false;
    cancelledWholeDragRef.current = false;
    finalDragPointsRef.current = null;
    dragPointsRef.current = null;
    const node = wholeDragNodeRef.current;
    if (node) node.position({ x: 0, y: 0 });
    setDragPoints(null);
    onWholeMeasurementDragCancellationChange(measurement.id, null);
    onMeasurementEditActiveChange(measurement.id, false);
  }, [
    cancelPendingPreview,
    measurement.id,
    onMeasurementEditActiveChange,
    onWholeMeasurementDragCancellationChange,
  ]);

  const cancelWholeDrag = useCallback(() => {
    const node = wholeDragNodeRef.current;
    if (!wholeDragRef.current && !node?.isDragging()) return;

    cancelledWholeDragRef.current = true;
    wholeDragRef.current = null;
    setWholeDragPrepared(false);
    finalDragPointsRef.current = null;
    dragPointsRef.current = null;
    if (node) {
      node.position({ x: 0, y: 0 });
      node.stopDrag();
    }
    if (cancelledWholeDragRef.current) clearCancelledWholeDrag();
  }, [clearCancelledWholeDrag]);

  useLayoutEffect(() => {
    const drag = wholeDragRef.current;
    if (!drag) return;
    if (shouldCancelWholeMeasurementDrag(drag, selected, transform, bounds)) {
      cancelWholeDrag();
    }
  }, [bounds, cancelWholeDrag, selected, transform]);

  useLayoutEffect(() => {
    const active = vertexDragStateRef.current.active;
    const preparation = vertexDragPreparationRef.current;
    const gesture = active ?? preparation;
    if (!gesture) return;
    if (
      shouldCancelMeasurementVertexDrag(gesture, selected, transform, bounds) ||
      (preparation && !editable)
    ) {
      cancelVertexGesture(gesture.owner);
    }
  }, [bounds, cancelVertexGesture, editable, selected, transform]);

  useLayoutEffect(
    () => () => {
      cancelPendingPreview();
      cancelWholeDrag();
      cancelVertexGesture();
      releaseDragPreview();
    },
    [cancelPendingPreview, cancelVertexGesture, cancelWholeDrag, releaseDragPreview],
  );

  useLayoutEffect(() => {
    if (
      dragPreviewRef.current &&
      !wholeDragRef.current &&
      !vertexDragStateRef.current.active &&
      !vertexDragPreparationRef.current
    ) {
      releaseDragPreview();
    }
  });

  useEffect(() => {
    const finalPoints = finalDragPointsRef.current;
    if (!finalPoints || measurement.points.length !== finalPoints.length) return;
    if (
      measurement.points.some(
        (point, index) => point.x !== finalPoints[index]?.x || point.y !== finalPoints[index]?.y,
      )
    ) {
      return;
    }
    finalDragPointsRef.current = null;
    dragPointsRef.current = null;
    // Keep the final local frame until the reducer has published those exact points.
    setDragPoints(null);
  }, [measurement.points]);

  function updateDragPoints(points: Point[]) {
    dragPointsRef.current = points;
    setDragPoints(points);
  }

  function pointFromVertexDragEvent(
    event: KonvaEventObject<MouseEvent>,
    dragTransform: ViewTransform,
    dragBounds: LogicalPageBounds,
  ): Point {
    const pointer = event.target.getStage()?.getPointerPosition();
    const rawPoint = pointer
      ? screenToPage({ x: pointer.x, y: pointer.y }, dragTransform)
      : { x: event.target.x(), y: event.target.y() };
    return clampPointToPage(rawPoint, dragBounds);
  }

  function vertexDragEffects(): MeasurementVertexDragEffects {
    return {
      preview: (points) => {
        dragPointsRef.current = points;
        setDragPoints(points);
      },
      setEditing: (active) => onMeasurementEditActiveChange(measurement.id, active),
      commit: updateMeasurementPoints,
    };
  }

  function resetStaleVertexTarget(index: number, event: KonvaEventObject<MouseEvent>) {
    const persistedPoint = measurement.points[index];
    if (persistedPoint) event.target.position(persistedPoint);
    if (event.target.isDragging()) event.target.stopDrag();
  }

  function prepareVertexGesture(
    node: MeasurementVertexDragNode,
    index: number,
    button: number,
  ): boolean {
    const clearReadyAfterStartEvent = () => {
      // Konva's draggable listener may run before or after the React listener
      // after `draggable` has been toggled. Defer ready-state cleanup until all
      // listeners for this mouse/touch start event have completed.
      queueMicrotask(() => {
        if (!node.isDragging()) clearReadyMeasurementVertexDrag(node);
      });
    };
    const currentOwner =
      vertexDragStateRef.current.active?.owner ?? vertexDragPreparationRef.current?.owner;
    if (currentOwner) {
      cancelVertexGesture(currentOwner);
      clearReadyAfterStartEvent();
      return false;
    }

    const preparation = prepareMeasurementVertexDrag(
      node,
      index,
      button,
      measurement.points,
      transform,
      bounds,
    );
    vertexDragPreparationRef.current = preparation;
    if (!preparation) {
      clearReadyAfterStartEvent();
      return false;
    }
    setVertexDragOwned(true);
    onVertexDragCancellationChange(measurement.id, preparation.owner, () =>
      cancelVertexGesture(preparation.owner),
    );
    return true;
  }

  function updateMeasurementPoints(points: Point[]): boolean {
    return updateSessionMeasurement({
      pageNumber,
      id: measurement.id,
      points,
    });
  }

  function stagePointer(event: KonvaEventObject<MouseEvent>): Point | null {
    const pointer = event.target.getStage()?.getPointerPosition();
    return pointer ? { x: pointer.x, y: pointer.y } : null;
  }

  function prepareWholeDrag(event: KonvaEventObject<MouseEvent>) {
    if (wholeDragRef.current) return;
    wholeDragRef.current = null;
    onWholeMeasurementDragCancellationChange(measurement.id, null);
    if (!canStartWholeMeasurementDrag(wholeMeasurementDraggable, event.evt.button)) return;
    const pointer = stagePointer(event);
    if (!pointer) return;
    wholeDragRef.current = {
      startScreen: pointer,
      sourcePoints: measurement.points.map((point) => ({ ...point })),
      transform: { ...transform },
      bounds: { ...bounds },
    };
    setWholeDragPrepared(true);
    onWholeMeasurementDragCancellationChange(measurement.id, cancelWholeDrag);
  }

  function wholeDragResultFromPointer(pointer: Point): WholeMeasurementDragResult | null {
    const drag = wholeDragRef.current;
    if (!drag) return null;
    const delta = constrainMeasurementTranslation(
      drag.sourcePoints,
      pageDeltaFromScreenDrag(drag.startScreen, pointer, drag.transform),
      drag.bounds,
    );
    return { delta, points: translateMeasurementPoints(drag.sourcePoints, delta) };
  }

  function wholeDragResult(event: KonvaEventObject<MouseEvent>): WholeMeasurementDragResult | null {
    const pointer = stagePointer(event);
    return pointer ? wholeDragResultFromPointer(pointer) : null;
  }

  function resetWholeDragTarget(event: KonvaEventObject<MouseEvent>) {
    event.target.position({ x: 0, y: 0 });
  }

  function handleWholeDragStart(event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    if (
      !wholeDragRef.current ||
      !canStartWholeMeasurementDrag(wholeMeasurementDraggable, event.evt.button)
    ) {
      rejectedWholeDragRef.current = true;
      event.target.stopDrag();
      return;
    }
    cancelPendingPreview();
    onMeasurementEditActiveChange(measurement.id, true);
    finalDragPointsRef.current = null;
    dragPointsRef.current = null;
    resetWholeDragTarget(event);
    const result = wholeDragResult(event);
    const started = startDragPreview(event.target, () => {
      if (result) renderWholeDragPreview(result);
    });
    if (!started && result) renderWholeDragPreview(result);
  }

  function handleWholeDragMove(event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    if (rejectedWholeDragRef.current) return;
    if (!dragPreviewRef.current) resetWholeDragTarget(event);
    const drag = wholeDragRef.current;
    const pointer = stagePointer(event);
    if (drag && pointer) queuePreview({ kind: "whole", drag, pointer });
  }

  function handleWholeDragEnd(event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    if (wholeDragRef.current || cancelledWholeDragRef.current || rejectedWholeDragRef.current) {
      cancelPendingPreview();
    }
    resetWholeDragTarget(event);
    const cancelled = cancelledWholeDragRef.current || rejectedWholeDragRef.current;
    const result = cancelled ? null : wholeDragResult(event);
    const outcome = finishWholeMeasurementDrag(cancelled, result, {
      preview: (points) => {
        finalDragPointsRef.current = points;
        updateDragPoints(points);
      },
      commit: updateMeasurementPoints,
    });

    if (outcome === "cancelled") {
      clearCancelledWholeDrag();
      return;
    }

    wholeDragRef.current = null;
    setWholeDragPrepared(false);
    if (outcome === "unchanged") {
      dragPointsRef.current = null;
      finalDragPointsRef.current = null;
      setDragPoints(null);
      onWholeMeasurementDragCancellationChange(measurement.id, null);
      onMeasurementEditActiveChange(measurement.id, false);
      return;
    }

    if (outcome === "rejected") {
      finalDragPointsRef.current = null;
      dragPointsRef.current = null;
      setDragPoints(null);
    }
    onWholeMeasurementDragCancellationChange(measurement.id, null);
    onMeasurementEditActiveChange(measurement.id, false);
  }

  function select(event: KonvaEventObject<MouseEvent>) {
    if (!selectable) return;
    event.cancelBubble = true;
    onSelectMeasurement(measurement.id);
  }

  return (
    <Group ref={measurementGroupRef}>
      <Line
        name="measurement-preview-line"
        ref={wholeDragNodeRef}
        points={flatPoints}
        closed={measurementPathSpecs[measurement.type].closed}
        fill={
          measurementPathSpecs[measurement.type].closed
            ? selected
              ? manipulating
                ? visualRoles.measurementSelectedSoftFill
                : visualRoles.measurementSelectedFill
              : visualRoles.measurementDefaultFill
            : undefined
        }
        stroke={stroke}
        strokeWidth={
          (selected
            ? CANVAS_VISUAL_METRICS.measurementSelectedStrokeScreenPx
            : CANVAS_VISUAL_METRICS.measurementStrokeScreenPx) / zoom
        }
        hitStrokeWidth={CANVAS_VISUAL_METRICS.measurementHitStrokeScreenPx / zoom}
        hitFunc={drawMeasurementHit}
        lineCap="round"
        lineJoin="round"
        draggable={wholeMeasurementDraggable}
        dragDistance={MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX}
        onMouseDown={prepareWholeDrag}
        onDragStart={wholeMeasurementDraggable ? handleWholeDragStart : undefined}
        onDragMove={wholeMeasurementDraggable ? handleWholeDragMove : undefined}
        onDragEnd={wholeMeasurementDraggable ? handleWholeDragEnd : undefined}
        onClick={select}
      />
      {showLabel && labelText && labelPlacement && (
        <Label
          name="measurement-preview-label"
          x={labelPlacement.x}
          y={labelPlacement.y}
          listening={false}
        >
          <Tag
            fill={visualRoles.labelBackground}
            opacity={selected ? 1 : 0.88}
            stroke={selected ? visualRoles.measurementSelectedStroke : undefined}
            strokeWidth={selected ? 1 / zoom : 0}
            cornerRadius={CANVAS_VISUAL_METRICS.labelCornerRadiusScreenPx / zoom}
          />
          <Text
            text={labelText}
            fill={visualRoles.labelText}
            fontFamily={CANVAS_VISUAL_METRICS.fontFamily}
            fontSize={MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX / zoom}
            padding={LABEL_PADDING_SCREEN_PX / zoom}
          />
        </Label>
      )}
      {shouldRenderMeasurementVertexHandles(selected, vertexDragOwned, editable) &&
        visibleMeasurement.points.map((point, index) => (
          <Circle
            key={index}
            name="measurement-preview-handle"
            x={point.x}
            y={point.y}
            radius={CANVAS_VISUAL_METRICS.handleRadiusScreenPx / zoom}
            fill={visualRoles.handleFill}
            stroke={visualRoles.handleStroke}
            strokeWidth={CANVAS_VISUAL_METRICS.handleStrokeScreenPx / zoom}
            hitStrokeWidth={
              circularHandleHitStrokeWidthScreenPx(interactionTargetScreenPx) / zoom
            }
            draggable
            onMouseDown={(event) => {
              if (prepareVertexGesture(event.target, index, event.evt.button)) {
                event.cancelBubble = true;
              }
            }}
            onTouchStart={(event) => {
              // Touch has no mouse button, but Konva treats touchstart as a
              // legitimate draggable start. Preserve the pre-#38 behavior by
              // giving it the same owned preparation as a primary mouse drag.
              if (prepareVertexGesture(event.target, index, 0)) {
                event.cancelBubble = true;
              }
            }}
            onDragStart={(event) => {
              event.cancelBubble = true;
              const preparation = vertexDragPreparationRef.current;
              vertexDragPreparationRef.current = null;
              if (!matchesPreparedMeasurementVertexDrag(preparation, event.target, index)) {
                event.target.stopDrag();
                return;
              }
              cancelPendingPreview();
              finalDragPointsRef.current = null;
              dragPointsRef.current = null;
              const startPoint = pointFromVertexDragEvent(
                event,
                preparation.transform,
                preparation.bounds,
              );
              const started = beginMeasurementVertexDrag(
                vertexDragStateRef.current,
                preparation,
                startPoint,
                vertexDragEffects(),
              );
              if (!started) {
                onVertexDragCancellationChange(measurement.id, preparation.owner, null);
                setVertexDragOwned(false);
                resetStaleVertexTarget(index, event);
                return;
              }
              startDragPreview(event.target, () => {
                renderDragPreview(
                  preparation.sourcePoints.map((point, pointIndex) =>
                    pointIndex === index ? startPoint : point,
                  ),
                );
              });
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;
              const drag = getActiveMeasurementVertexDrag(
                vertexDragStateRef.current,
                event.target,
                index,
              );
              if (!drag) {
                resetStaleVertexTarget(index, event);
                return;
              }
              const nextPoint = pointFromVertexDragEvent(event, drag.transform, drag.bounds);
              queuePreview({
                kind: "vertex",
                owner: drag.owner,
                node: event.target,
                index,
                point: nextPoint,
              });
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              const drag = getActiveMeasurementVertexDrag(
                vertexDragStateRef.current,
                event.target,
                index,
              );
              if (!drag) {
                resetStaleVertexTarget(index, event);
                return;
              }
              cancelPendingPreview();
              const finalPoint = pointFromVertexDragEvent(event, drag.transform, drag.bounds);
              const result = finishMeasurementVertexDrag(
                vertexDragStateRef.current,
                event.target,
                index,
                finalPoint,
                vertexDragEffects(),
              );
              onVertexDragCancellationChange(measurement.id, drag.owner, null);
              setVertexDragOwned(false);
              finalDragPointsRef.current = result.outcome === "accepted" ? result.points : null;
            }}
          />
        ))}
    </Group>
  );
});
