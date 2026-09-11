import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Context as KonvaContext } from "konva/lib/Context";
import type { Shape as KonvaShape } from "konva/lib/Shape";
import { Text as KonvaTextNode } from "konva/lib/shapes/Text";
import type { Line as KonvaLineNode } from "konva/lib/shapes/Line";
import { Circle, Group, Label, Line, Tag, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useSessionState } from "../../app/sessionState";
import type {
  CalibrationReferenceKey,
  LinearUnit,
  LogicalPageBounds,
  Measurement,
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
  LABEL_EDGE_MARGIN_SCREEN_PX,
  placeLabelAvoidingOverlaps,
  placeLabelWithinBounds,
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
  previewWholeMeasurementDrag,
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
  updateMeasurementVertexDrag,
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

  displayUnit: LinearUnit;
  showCalibration: boolean;
  showMeasurements: boolean;
  showLabels: boolean;

  onSelectMeasurement: (id: string) => void;
  onCalibrationReferencePointsChange: (points: [Point, Point]) => void;
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

export function PdfAnnotationLayer({
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
  showCalibration,
  showMeasurements,
  showLabels,
  onSelectMeasurement,
  onCalibrationReferencePointsChange,
  onMeasurementEditActiveChange,
  onWholeMeasurementDragCancellationChange,
  onVertexDragCancellationChange,
}: PdfAnnotationLayerProps) {
  const showMeasurementLabels = showMeasurements && showLabels;
  const plannedLabelPlacements = useMemo(() => {
    const placements = new Map<string, LabelPlacement>();
    const occupied: OccupiedLabelRect[] = [];
    if (!bounds) return placements;

    function reserve(key: string, anchor: Point, dimensions: LabelDimensions) {
      const placement = placeLabelAvoidingOverlaps(
        anchor,
        dimensions,
        bounds!,
        transform.zoom,
        occupied,
        LABEL_EDGE_MARGIN_SCREEN_PX,
      );
      placements.set(key, placement);
      occupied.push({ ...placement, ...dimensions });
    }

    if (showCalibration) {
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
        const labelText = formatMeasurement(measurement, calibration, displayUnit);
        reserve(
          `measurement:${measurement.id}`,
          averagePoint(measurement.points),
          measureLabelText(labelText, MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX, transform.zoom),
        );
      }
    }
    return placements;
  }, [
    bounds,
    calibrationReferenceEdit,
    page,
    selectedMeasurementId,
    displayUnit,
    showCalibration,
    showMeasurementLabels,
    transform.zoom,
  ]);

  return (
    <>
      {showCalibration &&
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
            const labelPlacement =
              plannedLabelPlacements.get(`calibration:${calibration.id}:${reference.key}`) ??
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
            visualRoles={visualRoles}
            interactionTargetScreenPx={interactionTargetScreenPx}
            pageNumber={page.pageNumber}
            onSelectMeasurement={onSelectMeasurement}
            onMeasurementEditActiveChange={onMeasurementEditActiveChange}
            onWholeMeasurementDragCancellationChange={onWholeMeasurementDragCancellationChange}
            onVertexDragCancellationChange={onVertexDragCancellationChange}
            plannedLabelPlacement={
              plannedLabelPlacements.get(`measurement:${measurement.id}`) ?? null
            }
          />
        ))}
    </>
  );
}

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
}: CalibrationReferenceMarkersProps) {
  const frameRef = useRef<number | null>(null);
  const pendingPointsRef = useRef<[Point, Point] | null>(null);
  const dragPointsRef = useRef<[Point, Point]>(points);
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);

  useEffect(() => {
    dragPointsRef.current = points;
  }, [points]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      pendingPointsRef.current = null;
    },
    [],
  );

  function pointFromDragEvent(event: KonvaEventObject<MouseEvent>): Point {
    const pointer = event.target.getStage()?.getPointerPosition();
    const rawPoint = pointer
      ? screenToPage({ x: pointer.x, y: pointer.y }, transform)
      : { x: event.target.x(), y: event.target.y() };
    return clampPointToPage(rawPoint, bounds);
  }

  function queuePoints(nextPoints: [Point, Point]) {
    dragPointsRef.current = nextPoints;
    pendingPointsRef.current = nextPoints;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingPointsRef.current;
      pendingPointsRef.current = null;
      if (pending) onPointsChange(pending);
    });
  }

  function pointsWithHandle(index: number, point: Point): [Point, Point] {
    const current = dragPointsRef.current;
    return index === 0 ? [point, current[1]] : [current[0], point];
  }

  function handleDragMove(index: number, event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    const point = pointFromDragEvent(event);
    event.target.position(point);
    queuePoints(pointsWithHandle(index, point));
  }

  function handleDragEnd(index: number, event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    const point = pointFromDragEvent(event);
    event.target.position(point);
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointsRef.current = null;
    const nextPoints = pointsWithHandle(index, point);
    dragPointsRef.current = nextPoints;
    onPointsChange(nextPoints);
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
                setActiveDragIndex(index);
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
  displayUnit: LinearUnit;
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
}

const MeasurementShape = memo(function MeasurementShape({
  measurement,
  pageNumber,
  page,
  displayUnit,
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
}: MeasurementShapeProps) {
  const { updateMeasurement: updateSessionMeasurement } = useSessionState();
  const wholeDragNodeRef = useRef<KonvaLineNode>(null);
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
    () => (calibration ? formatMeasurement(visibleMeasurement, calibration, displayUnit) : null),
    [calibration, displayUnit, visibleMeasurement],
  );
  const labelDimensions = useMemo(
    () =>
      labelText ? measureLabelText(labelText, MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX, zoom) : null,
    [labelText, zoom],
  );
  const labelPlacement = useMemo(
    () =>
      !dragPoints && plannedLabelPlacement
        ? plannedLabelPlacement
        : labelDimensions
          ? placeLabelWithinBounds(
              labelPoint,
              labelDimensions,
              bounds,
              zoom,
              LABEL_EDGE_MARGIN_SCREEN_PX,
            )
          : null,
    [bounds, dragPoints, labelDimensions, labelPoint, plannedLabelPlacement, zoom],
  );
  const wholeMeasurementDraggable = canDragWholeMeasurement(
    measurement,
    selected || wholeDragPrepared,
    editable,
  );
  const manipulating = dragPoints !== null || vertexDragOwned;

  const cancelVertexGesture = useCallback(
    (owner?: object) => {
      const active = vertexDragStateRef.current.active;
      const preparation = vertexDragPreparationRef.current;
      const currentOwner = active?.owner ?? preparation?.owner ?? null;
      if (!currentOwner || (owner && currentOwner !== owner)) return false;

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
    [measurement.id, onMeasurementEditActiveChange, onVertexDragCancellationChange],
  );

  const clearCancelledWholeDrag = useCallback(() => {
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
  }, [measurement.id, onMeasurementEditActiveChange, onWholeMeasurementDragCancellationChange]);

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
      cancelWholeDrag();
      cancelVertexGesture();
    },
    [cancelVertexGesture, cancelWholeDrag],
  );

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

  function wholeDragResult(event: KonvaEventObject<MouseEvent>): WholeMeasurementDragResult | null {
    const drag = wholeDragRef.current;
    const pointer = stagePointer(event);
    if (!drag || !pointer) return null;
    const delta = constrainMeasurementTranslation(
      drag.sourcePoints,
      pageDeltaFromScreenDrag(drag.startScreen, pointer, drag.transform),
      bounds,
    );
    return { delta, points: translateMeasurementPoints(drag.sourcePoints, delta) };
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
    onMeasurementEditActiveChange(measurement.id, true);
    finalDragPointsRef.current = null;
    dragPointsRef.current = null;
    resetWholeDragTarget(event);
    const result = wholeDragResult(event);
    previewWholeMeasurementDrag(result, {
      preview: updateDragPoints,
      commit: updateMeasurementPoints,
    });
  }

  function handleWholeDragMove(event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    if (rejectedWholeDragRef.current) return;
    resetWholeDragTarget(event);
    const result = wholeDragResult(event);
    previewWholeMeasurementDrag(result, {
      preview: updateDragPoints,
      commit: updateMeasurementPoints,
    });
  }

  function handleWholeDragEnd(event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
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
    <Group>
      <Line
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
        <Label x={labelPlacement.x} y={labelPlacement.y} listening={false}>
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
              updateMeasurementVertexDrag(
                vertexDragStateRef.current,
                event.target,
                index,
                nextPoint,
                vertexDragEffects(),
              );
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
