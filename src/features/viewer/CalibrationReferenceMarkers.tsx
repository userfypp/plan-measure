import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Circle } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { LogicalPageBounds, Point, ViewTransform } from "../../types/domain";
import { HANDLE_SIZE_SCALE, useAppPreferences } from "../../utils/appPreferences";
import { clampPointToPage, screenToPage } from "../../utils/coordinates";
import { shouldCancelWholeMeasurementDrag } from "./measurementDrag";
import {
  CANVAS_VISUAL_METRICS,
  circularHandleHitStrokeWidthScreenPx,
  scaledHandleRadiusScreenPx,
} from "./canvasVisualRoles";

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

export function CalibrationReferenceMarkers({
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
  const { handleSize } = useAppPreferences();
  const handleRadiusScreenPx = scaledHandleRadiusScreenPx(HANDLE_SIZE_SCALE[handleSize]);
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
    const spatialEditable = editable && (precisionAuthoringAvailable || activeDragIndex === index);
    return (
      <Circle
        key={`${calibrationId}-${index}`}
        x={point.x}
        y={point.y}
        radius={handleRadiusScreenPx / zoom}
        fill={handleFill}
        stroke={stroke}
        strokeWidth={CANVAS_VISUAL_METRICS.handleStrokeScreenPx / zoom}
        draggable={spatialEditable}
        hitStrokeWidth={
          spatialEditable
            ? circularHandleHitStrokeWidthScreenPx(
                interactionTargetScreenPx,
                handleRadiusScreenPx,
              ) / zoom
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
