import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LABEL_BACKGROUND_OPACITY,
  LABEL_SIZE_SCALE,
  useAppPreferences,
  useNumberFormatKey,
} from "../../utils/appPreferences";
import { Group, Label, Line, Tag, Text } from "react-konva";
import type {
  AreaDisplay,
  CalibrationReferenceKey,
  ClassificationDimension,
  LogicalPageBounds,
  MeasurementDecimalPlaces,
  MeasurementDisplayUnit,
  PageState,
  Point,
  Tool,
  ViewTransform,
} from "../../types/domain";
import { getMeasurementCalibration } from "../../utils/calibration";
import { formatMeasurement } from "../../utils/format";
import { placeLabelWithinBounds } from "../../utils/labelLayout";
import { shouldRenderMeasurement } from "../measurements/measurementViewModels";
import {
  canDragWholeMeasurement,
  measurementEditingEnabled,
  translateMeasurementPoints,
} from "./measurementDrag";
import { composeLabelText } from "./labelContent";
import { CANVAS_VISUAL_METRICS, type CanvasVisualRoles, labelTextPaint } from "./canvasVisualRoles";
import { measurementOutlineBounds } from "../../utils/quickShapesOutline";
import { pointsToFlat } from "./geometry";
import { CalibrationReferenceMarkers } from "./CalibrationReferenceMarkers";
import { MeasurementShape } from "./MeasurementShape";
import {
  averagePoint,
  CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX,
  createForwardingLabelCollisionIndex,
  createMeasurementLabelDataCache,
  LABEL_PADDING_SCREEN_PX,
  measureLabelText,
  planLabelLayout,
} from "./annotationLabelLayout";

export interface CalibrationReferenceEditPreview {
  calibrationId: string;
  reference: CalibrationReferenceKey;
  points: [Point, Point];
  valid: boolean;
}

interface PdfAnnotationLayerProps {
  page: PageState;
  bounds: LogicalPageBounds;
  transform: ViewTransform;
  /** Live view used only to choose mounted measurements; defaults to `transform`. */
  cullTransform?: ViewTransform;
  viewport?: { width: number; height: number };

  activeTool: Tool;
  spacePan: boolean;
  isPanning: boolean;

  selectedMeasurementId: string | null;
  selectedMeasurementIds?: readonly string[];
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
  /** Classification dimension whose value is added to on-screen labels. */
  labelDimension?: ClassificationDimension | null;

  onSelectMeasurement: (id: string, additive?: boolean) => void;
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

function classificationLabelFor(
  measurement: { classificationValueIds: readonly string[] },
  names: ReadonlyMap<string, string> | null,
): string | undefined {
  if (!names) return undefined;
  for (const id of measurement.classificationValueIds) {
    const name = names.get(id);
    if (name) return name;
  }
  return undefined;
}

export const PdfAnnotationLayer = memo(function PdfAnnotationLayer({
  page,
  bounds,
  transform,
  cullTransform = transform,
  viewport,
  activeTool,
  spacePan,
  isPanning,
  selectedMeasurementId,
  selectedMeasurementIds,
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
  labelDimension = null,
  onSelectMeasurement,
  onCalibrationReferencePointsChange,
  onCalibrationReferenceDragCancellationChange,
  onMeasurementEditActiveChange,
  onWholeMeasurementDragCancellationChange,
  onVertexDragCancellationChange,
}: PdfAnnotationLayerProps) {
  const numberFormatKey = useNumberFormatKey();
  const appPreferences = useAppPreferences();
  const labelContent = appPreferences.labelContent;
  const classificationNames = useMemo(
    () =>
      labelDimension ? new Map(labelDimension.values.map((value) => [value.id, value.name])) : null,
    [labelDimension],
  );
  const labelFontScale = LABEL_SIZE_SCALE[appPreferences.labelSize];
  const labelBackgroundOpacity = LABEL_BACKGROUND_OPACITY[appPreferences.labelBackground];
  const [groupDragPreview, setGroupDragPreview] = useState<{
    ownerId: string;
    delta: Point;
  } | null>(null);
  const previewGroupDrag = useCallback((ownerId: string, delta: Point | null) => {
    setGroupDragPreview((current) =>
      delta ? { ownerId, delta } : current?.ownerId === ownerId ? null : current,
    );
  }, []);
  const selectedPageMeasurements = useMemo(
    () =>
      page.measurements.filter((measurement) => selectedMeasurementIds?.includes(measurement.id)),
    [page.measurements, selectedMeasurementIds],
  );
  const groupMoveAvailable =
    (selectedMeasurementIds?.length ?? 0) > 1 &&
    selectedPageMeasurements.length === selectedMeasurementIds?.length &&
    selectedPageMeasurements.every((measurement) =>
      canDragWholeMeasurement(measurement, true, true),
    );
  const showMeasurementLabels = showMeasurements && showLabels;

  // Geometry and formatted values depend on domain data, not pan or zoom.
  const labelDataCache = useMemo(
    () => createMeasurementLabelDataCache(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new cache whenever label text options change
    [
      displayUnit,
      measurementDecimalPlaces,
      areaDisplay,
      showMeasurementLabels,
      numberFormatKey,
      labelContent,
      classificationNames,
    ],
  );
  const labelData = useMemo(
    () =>
      new Map(
        page.measurements.map((measurement) => {
          const calibration = getMeasurementCalibration(page, measurement);
          const points = measurement.points;
          return [
            measurement.id,
            labelDataCache(measurement, calibration, () => ({
              ...measurementOutlineBounds(measurement.type, points),
              anchor: averagePoint(points),
              text:
                (calibration || measurement.type === "count") &&
                shouldRenderMeasurement(measurement, showMeasurementLabels)
                  ? composeLabelText(
                      formatMeasurement(
                        measurement,
                        calibration,
                        displayUnit,
                        measurementDecimalPlaces,
                        areaDisplay,
                      ),
                      measurement.name,
                      labelContent,
                      classificationLabelFor(measurement, classificationNames),
                    )
                  : null,
            })),
          ];
        }),
      ),
    // The builder only runs on cache misses; the options also key the cache itself.
    [
      page,
      labelDataCache,
      displayUnit,
      measurementDecimalPlaces,
      areaDisplay,
      showMeasurementLabels,
      labelContent,
      classificationNames,
    ],
  );

  // react-konva compares props by identity, and a new array redraws the whole layer.
  const calibrationDash = useMemo(
    () => CANVAS_VISUAL_METRICS.calibrationDashScreenPx.map((value) => value / transform.zoom),
    [transform.zoom],
  );
  const calibrationLinePoints = useMemo(() => {
    const cache = new Map<string, { start: Point; end: Point; points: number[] }>();
    return (key: string, start: Point, end: Point) => {
      const cached = cache.get(key);
      if (cached && cached.start === start && cached.end === end) return cached.points;
      const points = pointsToFlat([start, end]);
      cache.set(key, { start, end, points });
      return points;
    };
  }, []);

  const plannedLabelLayout = useMemo(() => {
    return planLabelLayout({
      bounds,
      calibrationReferenceEdit,
      page,
      labelData,
      showCalibration,
      showMeasurementLabels,
      zoom: transform.zoom,
      labelFontScale,
    });
  }, [
    bounds,
    calibrationReferenceEdit,
    page,
    labelData,
    showCalibration,
    showMeasurementLabels,
    transform.zoom,
    labelFontScale,
  ]);

  const [labelCollisionIndex] = useState(createForwardingLabelCollisionIndex);
  useLayoutEffect(
    () => labelCollisionIndex.forwardTo(plannedLabelLayout.occupied),
    [labelCollisionIndex, plannedLabelLayout],
  );

  // Read at click time, so switching tools does not re-render every shape.
  const selectable =
    activeTool === "select" &&
    !spacePan &&
    !isPanning &&
    !calibrationReferenceEdit &&
    !measurementEditingBlocked;
  const selectableRef = useRef(selectable);
  useLayoutEffect(() => {
    selectableRef.current = selectable;
  }, [selectable]);
  const isSelectable = useCallback(() => selectableRef.current, []);

  const visibleMeasurements = useMemo(() => {
    if (!viewport || isPanning) return page.measurements;
    const padding = Math.max(32, interactionTargetScreenPx) / cullTransform.zoom;
    const left = -cullTransform.panX / cullTransform.zoom - padding;
    const top = -cullTransform.panY / cullTransform.zoom - padding;
    const right = (viewport.width - cullTransform.panX) / cullTransform.zoom + padding;
    const bottom = (viewport.height - cullTransform.panY) / cullTransform.zoom + padding;
    return page.measurements.filter((measurement) => {
      // Keep editing ownership and selected handles mounted across viewport changes.
      if (
        measurement.id === selectedMeasurementId ||
        selectedMeasurementIds?.includes(measurement.id) ||
        measurement.id === activeMeasurementEditId
      )
        return true;
      const data = labelData.get(measurement.id)!;
      if (data.maxX >= left && data.minX <= right && data.maxY >= top && data.minY <= bottom)
        return true;
      const label = showMeasurementLabels
        ? plannedLabelLayout.occupiedRects.get(`measurement:${measurement.id}`)
        : undefined;
      return Boolean(
        label &&
        label.x + label.width >= left &&
        label.x <= right &&
        label.y + label.height >= top &&
        label.y <= bottom,
      );
    });
  }, [
    viewport,
    isPanning,
    page.measurements,
    cullTransform,
    interactionTargetScreenPx,
    selectedMeasurementId,
    selectedMeasurementIds,
    activeMeasurementEditId,
    labelData,
    showMeasurementLabels,
    plannedLabelLayout,
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
                  points={calibrationLinePoints(
                    layoutKey,
                    visibleReference.start,
                    visibleReference.end,
                  )}
                  stroke={stroke}
                  strokeWidth={
                    (referenceIsEditing || active
                      ? CANVAS_VISUAL_METRICS.calibrationEmphasizedStrokeScreenPx
                      : CANVAS_VISUAL_METRICS.calibrationStrokeScreenPx) / transform.zoom
                  }
                  dash={calibrationDash}
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
                    opacity={(referenceIsEditing || active ? 1 : 0.88) * labelBackgroundOpacity}
                    stroke={referenceIsEditing ? visualRoles.measurementSelectedStroke : undefined}
                    strokeWidth={referenceIsEditing ? 1 / transform.zoom : 0}
                    cornerRadius={CANVAS_VISUAL_METRICS.labelCornerRadiusScreenPx / transform.zoom}
                  />
                  <Text
                    text={labelText}
                    {...labelTextPaint(visualRoles, labelBackgroundOpacity, transform.zoom)}
                    fontFamily={CANVAS_VISUAL_METRICS.fontFamily}
                    fontSize={CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX / transform.zoom}
                    padding={LABEL_PADDING_SCREEN_PX / transform.zoom}
                  />
                </Label>
              </Group>
            );
          });
        })}
      {visibleMeasurements
        .filter((measurement) => shouldRenderMeasurement(measurement, showMeasurements))
        .map((measurement) => (
          <MeasurementShape
            key={measurement.id}
            measurement={measurement}
            bounds={bounds}
            zoom={transform.zoom}
            transform={transform}
            selected={
              selectedMeasurementIds
                ? selectedMeasurementIds.includes(measurement.id)
                : selectedMeasurementId === measurement.id
            }
            isSelectable={isSelectable}
            editable={
              (selectedMeasurementIds?.length ?? 0) <= 1 &&
              measurementEditingEnabled(
                activeTool,
                spacePan,
                isPanning,
                Boolean(calibrationReferenceEdit),
                measurementEditingBlocked ||
                  !precisionAuthoringAvailable ||
                  (selectedMeasurementIds?.length ?? 0) > 1,
                activeMeasurementEditId,
                measurement.id,
              )
            }
            wholeDragEditable={measurementEditingEnabled(
              activeTool,
              spacePan,
              isPanning,
              Boolean(calibrationReferenceEdit),
              measurementEditingBlocked ||
                !precisionAuthoringAvailable ||
                ((selectedMeasurementIds?.length ?? 0) > 1 && !groupMoveAvailable),
              activeMeasurementEditId,
              measurement.id,
            )}
            groupMeasurements={groupMoveAvailable ? selectedPageMeasurements : undefined}
            groupPreviewPoints={
              groupDragPreview &&
              groupDragPreview.ownerId !== measurement.id &&
              selectedMeasurementIds?.includes(measurement.id)
                ? translateMeasurementPoints(measurement.points, groupDragPreview.delta)
                : null
            }
            onGroupDragPreview={previewGroupDrag}
            showLabel={showLabels}
            classificationLabel={classificationLabelFor(measurement, classificationNames)}
            calibration={getMeasurementCalibration(page, measurement)}
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
            labelCollisionIndex={labelCollisionIndex.index}
          />
        ))}
    </>
  );
});
