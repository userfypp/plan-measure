import { Text as KonvaTextNode } from "konva/lib/shapes/Text";
import type {
  LogicalPageBounds,
  Measurement,
  MeasurementType,
  PageCalibration,
  PageState,
  Point,
} from "../../types/domain";
import {
  createLabelCollisionIndex,
  LABEL_EDGE_MARGIN_SCREEN_PX,
  placeLabelInsideMeasurementGeometry,
  placeLabelAvoidingOverlaps,
  type LabelCollisionIndex,
  type LabelDimensions,
  type LabelPlacement,
  type OccupiedLabelRect,
} from "../../utils/labelLayout";
import { shouldRenderMeasurement } from "../measurements/measurementViewModels";
import { CANVAS_VISUAL_METRICS } from "./canvasVisualRoles";
import type { CalibrationReferenceEditPreview } from "./PdfAnnotationLayer";

export const LABEL_PADDING_SCREEN_PX = CANVAS_VISUAL_METRICS.labelPaddingScreenPx;
export const MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX =
  CANVAS_VISUAL_METRICS.measurementLabelFontSizeScreenPx;
export const CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX =
  CANVAS_VISUAL_METRICS.calibrationLabelFontSizeScreenPx;

export interface MeasurementLabelData {
  anchor: Point;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  text: string | null;
}

/**
 * Reuses each measurement's label data while the measurement and its scale are unchanged, so an
 * edit only formats the measurements it touched. Create a new cache when display options change.
 */
export function createMeasurementLabelDataCache() {
  const entries = new WeakMap<
    Measurement,
    { calibration: PageCalibration | null; data: MeasurementLabelData }
  >();
  return (
    measurement: Measurement,
    calibration: PageCalibration | null,
    build: () => MeasurementLabelData,
  ): MeasurementLabelData => {
    const cached = entries.get(measurement);
    if (cached && cached.calibration === calibration) return cached.data;
    const data = build();
    entries.set(measurement, { calibration, data });
    return data;
  };
}

export function averagePoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export function measureLabelText(text: string, fontSizeScreenPx: number, zoom: number): LabelDimensions {
  const textNode = new KonvaTextNode({
    text,
    fontFamily: CANVAS_VISUAL_METRICS.fontFamily,
    fontSize: fontSizeScreenPx / zoom,
    padding: LABEL_PADDING_SCREEN_PX / zoom,
  });
  return { width: textNode.width(), height: textNode.height() };
}

/** Shared by final and live labels: inside-geometry placement, else overlap-avoiding at the anchor. */
export function placeMeasurementLabel(
  type: MeasurementType,
  points: readonly Point[],
  anchor: Point,
  dimensions: LabelDimensions,
  bounds: Pick<LogicalPageBounds, "width" | "height">,
  zoom: number,
  occupied: LabelCollisionIndex,
): LabelPlacement {
  return (
    placeLabelInsideMeasurementGeometry(
      type,
      points,
      dimensions,
      bounds,
      zoom,
      occupied,
      LABEL_EDGE_MARGIN_SCREEN_PX,
    ) ??
    placeLabelAvoidingOverlaps(anchor, dimensions, bounds, zoom, occupied, LABEL_EDGE_MARGIN_SCREEN_PX)
  );
}

export function planLabelLayout({
  bounds,
  calibrationReferenceEdit,
  page,
  labelData,
  showCalibration,
  showMeasurementLabels,
  zoom,
  labelFontScale = 1,
}: {
  bounds: LogicalPageBounds;
  calibrationReferenceEdit: CalibrationReferenceEditPreview | null;
  page: PageState;
  labelData: Map<string, MeasurementLabelData>;
  showCalibration: boolean;
  showMeasurementLabels: boolean;
  zoom: number;
  /** Multiplier from the label-size preference; calibration labels are unaffected. */
  labelFontScale?: number;
}) {
  const placements = new Map<string, LabelPlacement>();
  const occupiedRects = new Map<string, OccupiedLabelRect>();
  const occupied = createLabelCollisionIndex();
  const dimensionsByText = new Map<string, LabelDimensions>();
  function measurementDimensions(text: string) {
    let dimensions = dimensionsByText.get(text);
    if (!dimensions) {
      dimensions = measureLabelText(text, MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX * labelFontScale, zoom);
      dimensionsByText.set(text, dimensions);
    }
    return dimensions;
  }
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
      bounds,
      zoom,
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
          measureLabelText(labelText, CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX, zoom),
        );
      }
    }
  }

  if (showMeasurementLabels) {
    // Page order, independent of selection: selecting or adding a measurement never moves the
    // labels placed before it.
    for (const measurement of page.measurements) {
      if (!shouldRenderMeasurement(measurement, showMeasurementLabels)) continue;
      const data = labelData.get(measurement.id)!;
      if (data.text === null) continue;
      const key = `measurement:${measurement.id}`;
      const dimensions = measurementDimensions(data.text);
      const placement = placeMeasurementLabel(
        measurement.type,
        measurement.points,
        data.anchor,
        dimensions,
        bounds,
        zoom,
        occupied,
      );
      store(key, placement, dimensions);
    }
  }
  return { placements, occupiedRects, occupied };
}

/**
 * A stable collision index that forwards to the latest label plan. The plan is rebuilt on every
 * page edit, and shapes only consult it while dragging, so they need not re-render for it.
 */
export function createForwardingLabelCollisionIndex() {
  // Empty until the first plan commits; shapes cannot drag before that.
  let target: LabelCollisionIndex = {
    insert() {},
    hasCollision: () => false,
    somePotentialCollision: () => false,
  };
  // Plans always build their index with createLabelCollisionIndex, which has hasCollision.
  const index: Required<LabelCollisionIndex> = {
    insert: (rect) => target.insert(rect),
    hasCollision: (candidate, gap, ignore) => target.hasCollision!(candidate, gap, ignore),
    somePotentialCollision: (candidate, gap, visit) =>
      target.somePotentialCollision(candidate, gap, visit),
  };
  return {
    index,
    forwardTo(next: LabelCollisionIndex) {
      target = next;
    },
  };
}
