import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Text as KonvaTextNode } from "konva/lib/shapes/Text";
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

const LABEL_PADDING_SCREEN_PX = 4;
const MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX = 12;
const CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX = 11;

export interface CalibrationReferenceEditPreview {
  calibrationId: string;
  reference: CalibrationReferenceKey;
  points: [Point, Point];
  valid: boolean;
}

function pointsToFlat(points: Point[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
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

  calibrationReferenceEdit: CalibrationReferenceEditPreview | null;

  displayUnit: LinearUnit;
  showCalibration: boolean;
  showMeasurements: boolean;
  showLabels: boolean;

  onSelectMeasurement: (id: string) => void;
  onCalibrationReferencePointsChange: (points: [Point, Point]) => void;
}

export function PdfAnnotationLayer({
  page,
  bounds,
  transform,
  activeTool,
  spacePan,
  isPanning,
  selectedMeasurementId,
  calibrationReferenceEdit,
  displayUnit,
  showCalibration,
  showMeasurements,
  showLabels,
  onSelectMeasurement,
  onCalibrationReferencePointsChange,
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
                { key: "x", label: `${calibration.name} · X`, ...calibration.xReference },
                { key: "y", label: `${calibration.name} · Y`, ...calibration.yReference },
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
          const stroke = editing ? "#7c3aed" : active ? "#d97706" : "#52606d";
          const references =
            calibration.mode === "uniform"
              ? [{ key: "uniform", label: calibration.name, ...calibration }]
              : [
                  {
                    key: "x",
                    label: `${calibration.name} · X`,
                    ...calibration.xReference,
                  },
                  {
                    key: "y",
                    label: `${calibration.name} · Y`,
                    ...calibration.yReference,
                  },
                ];
          return references.map((reference) => {
            const referenceIsEditing =
              editing && calibrationReferenceEdit?.reference === reference.key;
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
                  strokeWidth={(referenceIsEditing || active ? 3 : 2) / transform.zoom}
                  dash={[8 / transform.zoom, 5 / transform.zoom]}
                />
                <CalibrationReferenceMarkers
                  calibrationId={calibration.id}
                  points={[visibleReference.start, visibleReference.end]}
                  editable={referenceIsEditing}
                  stroke={stroke}
                  zoom={transform.zoom}
                  transform={transform}
                  bounds={bounds}
                  emphasized={referenceIsEditing || active}
                  onPointsChange={onCalibrationReferencePointsChange}
                />
                <Label x={labelPlacement.x} y={labelPlacement.y}>
                  <Tag fill="rgba(15,23,42,0.88)" cornerRadius={3 / transform.zoom} />
                  <Text
                    text={labelText}
                    fill="#fff"
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
            editable={
              activeTool === "select" &&
              !spacePan &&
              !isPanning &&
              !calibrationReferenceEdit
            }
            showLabel={showLabels}
            page={page}
            displayUnit={displayUnit}
            pageNumber={page.pageNumber}
            onSelectMeasurement={onSelectMeasurement}
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
  stroke: string;
  zoom: number;
  transform: ViewTransform;
  bounds: LogicalPageBounds;
  emphasized: boolean;
  onPointsChange: (points: [Point, Point]) => void;
}

function CalibrationReferenceMarkers({
  calibrationId,
  points,
  editable,
  stroke,
  zoom,
  transform,
  bounds,
  emphasized,
  onPointsChange,
}: CalibrationReferenceMarkersProps) {
  const frameRef = useRef<number | null>(null);
  const pendingPointsRef = useRef<[Point, Point] | null>(null);
  const dragPointsRef = useRef<[Point, Point]>(points);

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
  }

  return points.map((point, index) => (
    <Circle
      key={`${calibrationId}-${index}`}
      x={point.x}
      y={point.y}
      radius={4 / zoom}
      fill="#fff"
      stroke={stroke}
      strokeWidth={(emphasized ? 2 : 1.5) / zoom}
      draggable={editable}
      hitStrokeWidth={editable ? 12 / zoom : 0}
      onDragStart={editable ? (event) => (event.cancelBubble = true) : undefined}
      onDragMove={editable ? (event) => handleDragMove(index, event) : undefined}
      onDragEnd={editable ? (event) => handleDragEnd(index, event) : undefined}
    />
  ));
}

interface MeasurementShapeProps {
  measurement: Measurement;
  pageNumber: number;
  page: PageState;
  displayUnit: LinearUnit;
  bounds: LogicalPageBounds;
  zoom: number;
  transform: ViewTransform;
  selected: boolean;
  editable: boolean;
  showLabel: boolean;
  onSelectMeasurement: (id: string) => void;
  plannedLabelPlacement: LabelPlacement | null;
}

const MeasurementShape = memo(function MeasurementShape({
  measurement,
  pageNumber,
  page,
  displayUnit,
  bounds,
  zoom,
  transform,
  selected,
  editable,
  showLabel,
  onSelectMeasurement,
  plannedLabelPlacement,
}: MeasurementShapeProps) {
  const { updateMeasurement: updateSessionMeasurement } = useSessionState();
  const dragPointsRef = useRef<Point[] | null>(null);
  const finalDragPointsRef = useRef<Point[] | null>(null);
  const [dragPoints, setDragPoints] = useState<Point[] | null>(null);
  const stroke = selected ? "#c2410c" : "#2563eb";
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

  function pointsWithVertex(index: number, point: Point): Point[] {
    const sourcePoints = dragPointsRef.current ?? measurement.points;
    return sourcePoints.map((existing, pointIndex) => (pointIndex === index ? point : existing));
  }

  function updateDragPoints(points: Point[]) {
    dragPointsRef.current = points;
    setDragPoints(points);
  }

  function pointFromDragEvent(event: KonvaEventObject<MouseEvent>): Point {
    const pointer = event.target.getStage()?.getPointerPosition();
    const rawPoint = pointer
      ? screenToPage({ x: pointer.x, y: pointer.y }, transform)
      : { x: event.target.x(), y: event.target.y() };
    return clampPointToPage(rawPoint, bounds);
  }

  function updateMeasurementPoints(points: Point[]): boolean {
    return updateSessionMeasurement({
      pageNumber,
      id: measurement.id,
      points,
    });
  }

  function select(event: KonvaEventObject<MouseEvent>) {
    if (!editable) return;
    event.cancelBubble = true;
    onSelectMeasurement(measurement.id);
  }

  return (
    <Group>
      <Line
        points={flatPoints}
        closed={measurementPathSpecs[measurement.type].closed}
        fill={
          measurementPathSpecs[measurement.type].closed
            ? selected
              ? "rgba(194,65,12,0.13)"
              : "rgba(37,99,235,0.10)"
            : undefined
        }
        stroke={stroke}
        strokeWidth={(selected ? 3 : 2) / zoom}
        hitStrokeWidth={12 / zoom}
        lineJoin="round"
        onClick={select}
      />
      {showLabel && labelText && labelPlacement && (
        <Label x={labelPlacement.x} y={labelPlacement.y} listening={false}>
          <Tag fill="rgba(15,23,42,0.88)" cornerRadius={3 / zoom} />
          <Text
            text={labelText}
            fill="#fff"
            fontSize={MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX / zoom}
            padding={LABEL_PADDING_SCREEN_PX / zoom}
          />
        </Label>
      )}
      {selected &&
        editable &&
        visibleMeasurement.points.map((point, index) => (
          <Circle
            key={index}
            x={point.x}
            y={point.y}
            radius={6 / zoom}
            fill="#fff"
            stroke="#c2410c"
            strokeWidth={2 / zoom}
            hitStrokeWidth={10 / zoom}
            draggable
            onDragStart={(event) => {
              finalDragPointsRef.current = null;
              dragPointsRef.current = null;
              const startPoint = pointFromDragEvent(event);
              event.target.position(startPoint);
              updateDragPoints(pointsWithVertex(index, startPoint));
            }}
            onDragMove={(event) => {
              const nextPoint = pointFromDragEvent(event);
              event.target.position(nextPoint);
              const nextPoints = pointsWithVertex(index, nextPoint);
              updateDragPoints(nextPoints);
            }}
            onDragEnd={(event) => {
              const finalPoint = pointFromDragEvent(event);
              event.target.position(finalPoint);
              const finalPoints = pointsWithVertex(index, finalPoint);
              finalDragPointsRef.current = finalPoints;
              updateDragPoints(finalPoints);
              const accepted = updateMeasurementPoints(finalPoints);
              if (!accepted) {
                finalDragPointsRef.current = null;
                dragPointsRef.current = null;
                setDragPoints(null);
              }
            }}
          />
        ))}
    </Group>
  );
});
