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
export const CALIBRATION_LABEL_MAX_WIDTH_SCREEN_PX =
  CANVAS_VISUAL_METRICS.calibrationLabelMaxWidthScreenPx;

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

/** A label wider than `maxWidthScreenPx` is measured at that width; its text is drawn ellipsized. */
export function measureLabelText(
  text: string,
  fontSizeScreenPx: number,
  zoom: number,
  maxWidthScreenPx?: number,
): LabelDimensions {
  const textNode = new KonvaTextNode({
    text,
    fontFamily: CANVAS_VISUAL_METRICS.fontFamily,
    fontSize: fontSizeScreenPx / zoom,
    padding: LABEL_PADDING_SCREEN_PX / zoom,
  });
  const height = textNode.height();
  const width = textNode.width();
  const maxWidth = maxWidthScreenPx === undefined ? width : maxWidthScreenPx / zoom;
  return { width: Math.min(width, maxWidth), height };
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
    placeLabelAvoidingOverlaps(
      anchor,
      dimensions,
      bounds,
      zoom,
      occupied,
      LABEL_EDGE_MARGIN_SCREEN_PX,
    )
  );
}

export interface LabelLayoutInput {
  bounds: LogicalPageBounds;
  calibrationReferenceEdit: CalibrationReferenceEditPreview | null;
  page: PageState;
  labelData: Map<string, MeasurementLabelData>;
  showCalibration: boolean;
  showMeasurementLabels: boolean;
  zoom: number;
  /** Multiplier from the label-size preference; calibration labels are unaffected. */
  labelFontScale?: number;
}

interface PlacedLabel {
  key: string;
  placement: LabelPlacement;
  rect: OccupiedLabelRect;
}

/** What a plan was built from, so the next plan can tell which of its labels still hold. */
interface LabelLayoutReuse {
  width: number;
  height: number;
  rotation: number;
  zoom: number;
  labelFontScale: number;
  calibrationLabels: PlacedLabel[];
  /** One entry per page measurement, in page order; `placed` is null when it has no label. */
  measurementLabels: Array<{
    measurement: Measurement;
    data: MeasurementLabelData | undefined;
    placed: PlacedLabel | null;
  }>;
}

export interface LabelLayoutPlan {
  placements: Map<string, LabelPlacement>;
  occupiedRects: Map<string, OccupiedLabelRect>;
  occupied: LabelCollisionIndex;
  reuse?: LabelLayoutReuse;
}

function sameLabels(left: readonly PlacedLabel[], right: readonly PlacedLabel[]) {
  return (
    left.length === right.length &&
    left.every(({ key, rect }, index) => {
      const other = right[index]!;
      return (
        key === other.key &&
        rect.x === other.rect.x &&
        rect.y === other.rect.y &&
        rect.width === other.rect.width &&
        rect.height === other.rect.height
      );
    })
  );
}

/**
 * Plans labels like planLabelLayout, starting from the previous plan. Labels are placed in page
 * order, so every label before the first measurement whose label inputs changed lands exactly
 * where it did and is reused instead of searched for again: adding, removing or editing the last
 * measurement only places the labels from that point on.
 */
export function createLabelLayoutPlanner() {
  let previous: LabelLayoutPlan | null = null;
  return (input: LabelLayoutInput): LabelLayoutPlan =>
    (previous = planLabelLayout(input, previous));
}

export function planLabelLayout(
  {
    bounds,
    calibrationReferenceEdit,
    page,
    labelData,
    showCalibration,
    showMeasurementLabels,
    zoom,
    labelFontScale = 1,
  }: LabelLayoutInput,
  previous: LabelLayoutPlan | null = null,
): LabelLayoutPlan {
  const placements = new Map<string, LabelPlacement>();
  const occupiedRects = new Map<string, OccupiedLabelRect>();
  const occupied = createLabelCollisionIndex();
  const dimensionsByText = new Map<string, LabelDimensions>();
  function measurementDimensions(text: string) {
    let dimensions = dimensionsByText.get(text);
    if (!dimensions) {
      dimensions = measureLabelText(
        text,
        MEASUREMENT_LABEL_FONT_SIZE_SCREEN_PX * labelFontScale,
        zoom,
      );
      dimensionsByText.set(text, dimensions);
    }
    return dimensions;
  }
  if (!bounds) return { placements, occupiedRects, occupied };
  const reuse: LabelLayoutReuse = {
    width: bounds.width,
    height: bounds.height,
    rotation: bounds.rotation,
    zoom,
    labelFontScale,
    calibrationLabels: [],
    measurementLabels: [],
  };

  function insert(placed: PlacedLabel) {
    placements.set(placed.key, placed.placement);
    occupiedRects.set(placed.key, placed.rect);
    occupied.insert(placed.rect);
    return placed;
  }

  function store(key: string, placement: LabelPlacement, dimensions: LabelDimensions) {
    return insert({ key, placement, rect: { ...placement, ...dimensions } });
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
    reuse.calibrationLabels.push(store(key, placement, dimensions));
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
        const referenceIsEditing = editing && calibrationReferenceEdit?.reference === reference.key;
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
          measureLabelText(
            labelText,
            CALIBRATION_LABEL_FONT_SIZE_SCREEN_PX,
            zoom,
            CALIBRATION_LABEL_MAX_WIDTH_SCREEN_PX,
          ),
        );
      }
    }
  }

  if (showMeasurementLabels) {
    // The previous plan's labels hold while everything placed before them is the same.
    let reusable =
      previous?.reuse &&
      previous.reuse.width === bounds.width &&
      previous.reuse.height === bounds.height &&
      previous.reuse.rotation === bounds.rotation &&
      previous.reuse.zoom === zoom &&
      previous.reuse.labelFontScale === labelFontScale &&
      sameLabels(previous.reuse.calibrationLabels, reuse.calibrationLabels)
        ? previous.reuse.measurementLabels
        : null;
    // Page order, independent of selection: selecting or adding a measurement never moves the
    // labels placed before it.
    page.measurements.forEach((measurement, index) => {
      const data = labelData.get(measurement.id);
      const reused = reusable?.[index];
      if (reused?.measurement === measurement && reused.data === data) {
        reuse.measurementLabels.push({
          measurement,
          data,
          placed: reused.placed && insert(reused.placed),
        });
        return;
      }
      reusable = null;
      reuse.measurementLabels.push({ measurement, data, placed: null });
      if (!shouldRenderMeasurement(measurement, showMeasurementLabels)) return;
      if (data!.text === null) return;
      const key = `measurement:${measurement.id}`;
      const dimensions = measurementDimensions(data!.text);
      const placement = placeMeasurementLabel(
        measurement.type,
        measurement.points,
        data!.anchor,
        dimensions,
        bounds,
        zoom,
        occupied,
      );
      reuse.measurementLabels[index]!.placed = store(key, placement, dimensions);
    });
  }
  return { placements, occupiedRects, occupied, reuse };
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
