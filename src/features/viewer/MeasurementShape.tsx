import { composeLabelText } from "./labelContent";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FILL_OPACITY_SCALE,
  HANDLE_SIZE_SCALE,
  LABEL_BACKGROUND_OPACITY,
  LABEL_SIZE_SCALE,
  LINE_THICKNESS_SCALE,
  useAppPreferences,
  useNumberFormatKey,
} from "../../utils/appPreferences";
import { Group as KonvaGroup } from "konva/lib/Group";
import { Layer as KonvaLayer } from "konva/lib/Layer";
import type { Node as KonvaNode, NodeConfig as KonvaNodeConfig } from "konva/lib/Node";
import type { Circle as KonvaCircleNode } from "konva/lib/shapes/Circle";
import type { Label as KonvaLabelNode } from "konva/lib/shapes/Label";
import { Text as KonvaTextNode } from "konva/lib/shapes/Text";
import type { Line as KonvaLineNode } from "konva/lib/shapes/Line";
import { Circle, Group, Label, Line, Tag, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useMeasurementCommands } from "../../app/sessionState";
import type {
  AreaDisplay,
  LogicalPageBounds,
  Measurement,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageState,
  Point,
  ViewTransform,
} from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import { measurementPathSpecs } from "../../utils/geometry";
import { applyMeasurementVertexEdit } from "../../utils/quickShapesCore";
import { formatMeasurement } from "../../utils/format";
import { CLOUD_FILL_OPACITY, resolveCloudColor, withHexAlpha } from "../../utils/cloudColors";
import { clampPointToPage, screenToPage } from "../../utils/coordinates";
import {
  LABEL_EDGE_MARGIN_SCREEN_PX,
  placeLabelInsideMeasurementGeometry,
  placeLabelWithinBounds,
  type LabelCollisionIndex,
  type LabelDimensions,
  type LabelPlacement,
  type OccupiedLabelRect,
} from "../../utils/labelLayout";
import {
  canDragWholeMeasurement,
  canStartWholeMeasurementDrag,
  constrainMeasurementTranslation,
  finishWholeMeasurementDrag,
  MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX,
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
  labelTextPaint,
  scaleFillAlpha,
  scaledAlpha,
  scaledHandleRadiusScreenPx,
  type CanvasVisualRoles,
} from "./canvasVisualRoles";
import { pointsToFlat } from "./geometry";
import {
  drawMeasurementHit,
  drawMeasurementOutlineScene,
  withoutKonvaAutoDraw,
} from "./annotationKonva";
import {
  averagePoint,
  LABEL_PADDING_SCREEN_PX,
  MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX,
  measureLabelText,
} from "./annotationLabelLayout";

interface MeasurementShapeProps {
  measurement: Measurement;
  pageNumber: number;
  page: PageState;
  displayUnit: MeasurementDisplayUnit;
  areaDisplay: AreaDisplay;
  classificationLabel?: string;
  measurementDecimalPlaces: MeasurementDecimalPlaces;
  visualRoles: CanvasVisualRoles;
  interactionTargetScreenPx: number;
  bounds: LogicalPageBounds;
  zoom: number;
  transform: ViewTransform;
  selected: boolean;
  selectable: boolean;
  editable: boolean;
  wholeDragEditable: boolean;
  groupMeasurements?: readonly Measurement[];
  groupPreviewPoints: Point[] | null;
  onGroupDragPreview: (ownerId: string, delta: Point | null) => void;
  showLabel: boolean;
  onSelectMeasurement: (id: string, additive?: boolean) => void;
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

export const MeasurementShape = memo(function MeasurementShape({
  measurement,
  pageNumber,
  page,
  displayUnit,
  areaDisplay,
  classificationLabel,
  measurementDecimalPlaces,
  visualRoles,
  interactionTargetScreenPx,
  bounds,
  zoom,
  transform,
  selected,
  selectable,
  editable,
  wholeDragEditable,
  groupMeasurements,
  groupPreviewPoints,
  onGroupDragPreview,
  showLabel,
  onSelectMeasurement,
  onMeasurementEditActiveChange,
  onWholeMeasurementDragCancellationChange,
  onVertexDragCancellationChange,
  plannedLabelPlacement,
  plannedOccupiedLabelRect,
  labelCollisionIndex,
}: MeasurementShapeProps) {
  useNumberFormatKey(); // re-render when separators change
  const { lineThickness, labelSize, fillOpacity, handleSize, labelBackground, labelContent } =
    useAppPreferences();
  const fillScale = FILL_OPACITY_SCALE[fillOpacity];
  const handleRadiusScreenPx = scaledHandleRadiusScreenPx(HANDLE_SIZE_SCALE[handleSize]);
  const labelBackgroundOpacity = LABEL_BACKGROUND_OPACITY[labelBackground];
  const strokeScale = LINE_THICKNESS_SCALE[lineThickness];
  const labelFontSize = MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX * LABEL_SIZE_SCALE[labelSize];
  const { updateMeasurement: updateSessionMeasurement, updateMeasurements } =
    useMeasurementCommands();
  const measurementGroupRef = useRef<KonvaGroup>(null);
  const wholeDragNodeRef = useRef<KonvaNode>(null);
  const wholeDragNodeOriginRef = useRef<Point>({ x: 0, y: 0 });
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
    sourceMeasurements: readonly Measurement[];
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
  // Revision clouds keep their own (editable) color, also when selected.
  const cloudColor = measurement.type === "cloud" ? resolveCloudColor(measurement.color) : null;
  const stroke = cloudColor
    ? cloudColor
    : selected
      ? visualRoles.measurementSelectedStroke
      : visualRoles.measurementDefaultStroke;
  const visibleMeasurement = useMemo<Measurement>(() => {
    const points = dragPoints ?? groupPreviewPoints;
    if (!points) return measurement;
    return { ...measurement, points };
  }, [dragPoints, groupPreviewPoints, measurement]);
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
      calibration || visibleMeasurement.type === "count"
        ? composeLabelText(
            formatMeasurement(
              visibleMeasurement,
              calibration,
              displayUnit,
              measurementDecimalPlaces,
              areaDisplay,
            ),
            visibleMeasurement.name,
            labelContent,
            classificationLabel,
          )
        : null,
    [
      areaDisplay,
      calibration,
      classificationLabel,
      displayUnit,
      labelContent,
      measurementDecimalPlaces,
      visibleMeasurement,
    ],
  );
  const labelDimensions = useMemo(
    () =>
      !dragPoints && !groupPreviewPoints && plannedLabelPlacement
        ? null
        : labelText
          ? measureLabelText(labelText, labelFontSize, zoom)
          : null,
    [dragPoints, groupPreviewPoints, labelFontSize, labelText, plannedLabelPlacement, zoom],
  );
  const labelPlacement = useMemo(() => {
    if (!dragPoints && !groupPreviewPoints && plannedLabelPlacement) return plannedLabelPlacement;
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
    groupPreviewPoints,
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
    wholeDragEditable,
  );
  const countUsesWholeDrag =
    measurement.type === "count" &&
    (measurement.points.length === 1 || (groupMeasurements?.length ?? 0) > 1);
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
        line.fill(
          cloudColor
            ? withHexAlpha(cloudColor, scaledAlpha(CLOUD_FILL_OPACITY, fillScale))
            : scaleFillAlpha(visualRoles.measurementSelectedSoftFill, fillScale),
        );
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
    if (preview.label && preview.text && (calibration || measurement.type === "count")) {
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
    if (
      wholeDragRef.current?.sourceMeasurements.length &&
      wholeDragRef.current.sourceMeasurements.length > 1
    )
      onGroupDragPreview(measurement.id, result.delta);
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
          applyMeasurementVertexEdit(
            measurement.type,
            drag.sourcePoints,
            pending.index,
            pending.point,
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
    onGroupDragPreview(measurement.id, null);
    setWholeDragPrepared(false);
    rejectedWholeDragRef.current = false;
    cancelledWholeDragRef.current = false;
    finalDragPointsRef.current = null;
    dragPointsRef.current = null;
    const node = wholeDragNodeRef.current;
    if (node) node.position(wholeDragNodeOriginRef.current);
    setDragPoints(null);
    onWholeMeasurementDragCancellationChange(measurement.id, null);
    onMeasurementEditActiveChange(measurement.id, false);
  }, [
    cancelPendingPreview,
    measurement.id,
    onMeasurementEditActiveChange,
    onWholeMeasurementDragCancellationChange,
    onGroupDragPreview,
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
      node.position(wholeDragNodeOriginRef.current);
      node.stopDrag();
    }
    if (cancelledWholeDragRef.current) clearCancelledWholeDrag();
  }, [clearCancelledWholeDrag]);

  useLayoutEffect(() => {
    const drag = wholeDragRef.current;
    if (!drag) return;
    const current = groupMeasurements ?? [measurement];
    if (
      shouldCancelWholeMeasurementDrag(drag, selected, transform, bounds) ||
      !wholeDragEditable ||
      current.length !== drag.sourceMeasurements.length ||
      current.some((item, index) => item !== drag.sourceMeasurements[index])
    ) {
      cancelWholeDrag();
    }
  }, [
    bounds,
    cancelWholeDrag,
    selected,
    transform,
    wholeDragEditable,
    groupMeasurements,
    measurement,
  ]);

  useLayoutEffect(() => {
    const active = vertexDragStateRef.current.active;
    const preparation = vertexDragPreparationRef.current;
    const gesture = active ?? preparation;
    if (!gesture) return;
    if (
      shouldCancelMeasurementVertexDrag(gesture, selected, transform, bounds) ||
      (preparation && !editable) ||
      gesture.measurementType !== measurement.type ||
      gesture.sourcePoints.length !== measurement.points.length ||
      gesture.sourcePoints.some(
        (point, index) =>
          point.x !== measurement.points[index]?.x || point.y !== measurement.points[index]?.y,
      )
    ) {
      cancelVertexGesture(gesture.owner);
    }
  }, [
    bounds,
    cancelVertexGesture,
    editable,
    measurement.points,
    measurement.type,
    selected,
    transform,
  ]);

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
      measurement.type,
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

  function stagePointer<E extends MouseEvent | TouchEvent>(
    event: KonvaEventObject<E>,
  ): Point | null {
    const pointer = event.target.getStage()?.getPointerPosition();
    return pointer ? { x: pointer.x, y: pointer.y } : null;
  }

  function prepareWholeDrag<E extends MouseEvent | TouchEvent>(
    event: KonvaEventObject<E>,
    button: number,
    countIndex = 0,
  ) {
    if (wholeDragRef.current) return;
    wholeDragRef.current = null;
    onWholeMeasurementDragCancellationChange(measurement.id, null);
    if (!canStartWholeMeasurementDrag(wholeMeasurementDraggable, button)) return;
    const pointer = stagePointer(event);
    if (!pointer) return;
    if (measurement.type === "count") {
      wholeDragNodeRef.current = event.target;
      wholeDragNodeOriginRef.current = measurement.points[countIndex]!;
    }
    wholeDragRef.current = {
      startScreen: pointer,
      sourcePoints: measurement.points.map((point) => ({ ...point })),
      sourceMeasurements: groupMeasurements ?? [measurement],
      transform: { ...transform },
      bounds: { ...bounds },
    };
    setWholeDragPrepared(true);
    onWholeMeasurementDragCancellationChange(measurement.id, cancelWholeDrag);
  }

  function prepareWholeMouseDrag(event: KonvaEventObject<MouseEvent>, countIndex = 0) {
    if (event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey) return;
    prepareWholeDrag(event, event.evt.button, countIndex);
  }

  function prepareWholeTouchDrag(event: KonvaEventObject<TouchEvent>, countIndex = 0) {
    prepareWholeDrag(event, 0, countIndex);
  }

  function wholeDragResultFromPointer(pointer: Point): WholeMeasurementDragResult | null {
    const drag = wholeDragRef.current;
    if (!drag) return null;
    const delta = constrainMeasurementTranslation(
      drag.sourceMeasurements.flatMap((item) => item.points),
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
    event.target.position(wholeDragNodeOriginRef.current);
  }

  function handleWholeDragStart(event: KonvaEventObject<MouseEvent>) {
    event.cancelBubble = true;
    if (!wholeDragRef.current || !wholeMeasurementDraggable) {
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
      commit: (points) => {
        const source = wholeDragRef.current?.sourceMeasurements;
        if (!source || source.length === 1 || !result) return updateMeasurementPoints(points);
        return updateMeasurements(
          source.map((item) => ({
            pageNumber,
            id: item.id,
            points: translateMeasurementPoints(item.points, result.delta),
          })),
        );
      },
    });

    if (outcome === "cancelled") {
      clearCancelledWholeDrag();
      return;
    }

    wholeDragRef.current = null;
    onGroupDragPreview(measurement.id, null);
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
    onSelectMeasurement(
      measurement.id,
      event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey,
    );
  }

  return (
    <Group ref={measurementGroupRef}>
      <Line
        name="measurement-preview-line"
        visible={measurement.type !== "count"}
        ref={(node) => {
          if (measurement.type !== "count") wholeDragNodeRef.current = node;
        }}
        points={flatPoints}
        closed={measurementPathSpecs[measurement.type].closed}
        fill={
          cloudColor
            ? withHexAlpha(
                cloudColor,
                scaledAlpha(
                  selected && !manipulating
                    ? CANVAS_VISUAL_METRICS.cloudSelectedFillOpacity
                    : CLOUD_FILL_OPACITY,
                  fillScale,
                ),
              )
            : measurementPathSpecs[measurement.type].closed
              ? selected
                ? manipulating
                  ? scaleFillAlpha(visualRoles.measurementSelectedSoftFill, fillScale)
                  : scaleFillAlpha(visualRoles.measurementSelectedFill, fillScale)
                : scaleFillAlpha(visualRoles.measurementDefaultFill, fillScale)
              : undefined
        }
        stroke={stroke}
        strokeWidth={
          ((cloudColor
            ? selected
              ? CANVAS_VISUAL_METRICS.cloudSelectedStrokeScreenPx
              : CANVAS_VISUAL_METRICS.cloudStrokeScreenPx
            : selected
              ? CANVAS_VISUAL_METRICS.measurementSelectedStrokeScreenPx
              : CANVAS_VISUAL_METRICS.measurementStrokeScreenPx) *
            strokeScale) /
          zoom
        }
        {...(cloudColor && selected
          ? {
              shadowColor: visualRoles.measurementSelectedStroke,
              shadowBlur: CANVAS_VISUAL_METRICS.cloudSelectedHaloBlurScreenPx / zoom,
              shadowOpacity: 0.9,
              shadowForStrokeEnabled: true,
            }
          : {})}
        hitStrokeWidth={CANVAS_VISUAL_METRICS.measurementHitStrokeScreenPx / zoom}
        hitFunc={drawMeasurementHit}
        {...(measurement.type === "ellipse" || measurement.type === "cloud"
          ? { measurementType: measurement.type, sceneFunc: drawMeasurementOutlineScene }
          : {})}
        lineCap="round"
        lineJoin="round"
        draggable={wholeMeasurementDraggable}
        dragDistance={MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX}
        onMouseDown={prepareWholeMouseDrag}
        onTouchStart={prepareWholeTouchDrag}
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
            opacity={(selected ? 1 : 0.88) * labelBackgroundOpacity}
            stroke={selected ? visualRoles.measurementSelectedStroke : (cloudColor ?? undefined)}
            strokeWidth={selected || cloudColor ? 1 / zoom : 0}
            cornerRadius={CANVAS_VISUAL_METRICS.labelCornerRadiusScreenPx / zoom}
          />
          <Text
            text={labelText}
            {...labelTextPaint(visualRoles, labelBackgroundOpacity, zoom)}
            fontFamily={CANVAS_VISUAL_METRICS.fontFamily}
            fontSize={labelFontSize / zoom}
            padding={LABEL_PADDING_SCREEN_PX / zoom}
          />
        </Label>
      )}
      {(measurement.type === "count" ||
        shouldRenderMeasurementVertexHandles(selected, vertexDragOwned, editable)) &&
        visibleMeasurement.points.map((point, index) => (
          <Circle
            key={index}
            name="measurement-preview-handle"
            x={point.x}
            y={point.y}
            radius={
              (measurement.type === "count"
                ? CANVAS_VISUAL_METRICS.countMarkerRadiusScreenPx
                : handleRadiusScreenPx) / zoom
            }
            fill={visualRoles.handleFill}
            stroke={measurement.type === "count" ? stroke : visualRoles.handleStroke}
            strokeWidth={CANVAS_VISUAL_METRICS.handleStrokeScreenPx / zoom}
            hitStrokeWidth={circularHandleHitStrokeWidthScreenPx(interactionTargetScreenPx) / zoom}
            draggable={
              measurement.type === "count"
                ? selected && (countUsesWholeDrag ? wholeMeasurementDraggable : editable)
                : editable
            }
            dragDistance={
              countUsesWholeDrag ? MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX : undefined
            }
            onClick={(event) => {
              if (
                measurement.type === "count" ||
                event.evt.shiftKey ||
                event.evt.ctrlKey ||
                event.evt.metaKey
              )
                select(event);
            }}
            onMouseDown={(event) => {
              if (countUsesWholeDrag) {
                prepareWholeMouseDrag(event, index);
                return;
              }
              if (!editable || (measurement.type === "count" && !selected)) return;
              if (event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey) {
                event.cancelBubble = true;
                return;
              }
              if (prepareVertexGesture(event.target, index, event.evt.button)) {
                event.cancelBubble = true;
              }
            }}
            onTouchStart={(event) => {
              if (countUsesWholeDrag) {
                prepareWholeTouchDrag(event, index);
                return;
              }
              if (!editable || (measurement.type === "count" && !selected)) return;
              // Touch has no mouse button, but Konva treats touchstart as a
              // legitimate draggable start. Preserve the pre-#38 behavior by
              // giving it the same owned preparation as a primary mouse drag.
              if (prepareVertexGesture(event.target, index, 0)) {
                event.cancelBubble = true;
              }
            }}
            onDragStart={(event) => {
              if (countUsesWholeDrag) {
                handleWholeDragStart(event);
                return;
              }
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
                  applyMeasurementVertexEdit(
                    measurement.type,
                    preparation.sourcePoints,
                    index,
                    startPoint,
                  ),
                );
              });
            }}
            onDragMove={(event) => {
              if (countUsesWholeDrag) {
                handleWholeDragMove(event);
                return;
              }
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
              if (countUsesWholeDrag) {
                handleWholeDragEnd(event);
                return;
              }
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
