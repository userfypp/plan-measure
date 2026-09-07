import type {
  LogicalPageBounds,
  Measurement,
  Point,
  Tool,
  ViewTransform,
} from "../../types/domain";
import { screenToPage } from "../../utils/coordinates";
import { hasValidMeasurementPoints } from "../../utils/geometry";

export const MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function measurementEditingEnabled(
  activeTool: Tool,
  spacePan: boolean,
  isPanning: boolean,
  calibrationReferenceEditActive: boolean,
  calibrationWorkflowBlocked: boolean,
  activeMeasurementEditId: string | null,
  measurementId: string,
): boolean {
  if (activeMeasurementEditId === measurementId) return true;
  return (
    activeTool === "select" &&
    !spacePan &&
    !isPanning &&
    !calibrationReferenceEditActive &&
    !calibrationWorkflowBlocked
  );
}

export function canDragWholeMeasurement(
  measurement: Measurement,
  selected: boolean,
  editable: boolean,
): boolean {
  return selected && editable && hasValidMeasurementPoints(measurement.type, measurement.points);
}

export function canStartWholeMeasurementDrag(canDragWhole: boolean, button: number): boolean {
  return canDragWhole && button === 0;
}

export function pageDeltaFromScreenDrag(
  start: Point,
  current: Point,
  transform: ViewTransform,
): Point {
  const startPage = screenToPage(start, transform);
  const currentPage = screenToPage(current, transform);
  return {
    x: currentPage.x - startPage.x,
    y: currentPage.y - startPage.y,
  };
}

export function constrainMeasurementTranslation(
  points: readonly Point[],
  proposedDelta: Point,
  bounds: LogicalPageBounds,
): Point {
  if (points.length === 0) return { x: 0, y: 0 };

  let minX = points[0]!.x;
  let maxX = points[0]!.x;
  let minY = points[0]!.y;
  let maxY = points[0]!.y;
  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const minDeltaX = -minX;
  const maxDeltaX = bounds.width - maxX;
  const minDeltaY = -minY;
  const maxDeltaY = bounds.height - maxY;

  if (minDeltaX > maxDeltaX || minDeltaY > maxDeltaY) return { x: 0, y: 0 };
  function correctedAxisDelta(
    minCoordinate: number,
    maxCoordinate: number,
    bound: number,
    proposed: number,
    minDelta: number,
    maxDelta: number,
  ): number {
    let delta = clamp(proposed, minDelta, maxDelta);

    const translatedMax = maxCoordinate + delta;
    if (translatedMax > bound) delta -= translatedMax - bound;

    const translatedMin = minCoordinate + delta;
    if (translatedMin < 0) delta -= translatedMin;

    return delta;
  }

  return {
    x: correctedAxisDelta(minX, maxX, bounds.width, proposedDelta.x, minDeltaX, maxDeltaX),
    y: correctedAxisDelta(minY, maxY, bounds.height, proposedDelta.y, minDeltaY, maxDeltaY),
  };
}

export function viewTransformChanged(left: ViewTransform, right: ViewTransform): boolean {
  return left.zoom !== right.zoom || left.panX !== right.panX || left.panY !== right.panY;
}

export interface WholeMeasurementDragSnapshot {
  transform: ViewTransform;
  bounds: LogicalPageBounds;
}

export function shouldCancelWholeMeasurementDrag(
  snapshot: WholeMeasurementDragSnapshot,
  selected: boolean,
  transform: ViewTransform,
  bounds: LogicalPageBounds,
): boolean {
  return (
    !selected ||
    viewTransformChanged(snapshot.transform, transform) ||
    snapshot.bounds.width !== bounds.width ||
    snapshot.bounds.height !== bounds.height ||
    snapshot.bounds.rotation !== bounds.rotation
  );
}

export interface WholeMeasurementDragResult {
  delta: Point;
  points: Point[];
}

export interface WholeMeasurementDragEffects {
  preview: (points: Point[]) => void;
  commit: (points: Point[]) => boolean;
}

export function previewWholeMeasurementDrag(
  result: WholeMeasurementDragResult | null,
  effects: WholeMeasurementDragEffects,
): boolean {
  if (!result) return false;
  effects.preview(result.points);
  return true;
}

export type WholeMeasurementDragEndResult = "cancelled" | "unchanged" | "accepted" | "rejected";

export function finishWholeMeasurementDrag(
  cancelled: boolean,
  result: WholeMeasurementDragResult | null,
  effects: WholeMeasurementDragEffects,
): WholeMeasurementDragEndResult {
  if (cancelled) return "cancelled";
  if (!result || (result.delta.x === 0 && result.delta.y === 0)) return "unchanged";
  effects.preview(result.points);
  return effects.commit(result.points) ? "accepted" : "rejected";
}

export function createWholeMeasurementDragCancellationRegistry() {
  let active: { measurementId: string; cancel: () => void } | null = null;

  return {
    set(measurementId: string, cancel: (() => void) | null) {
      if (cancel) {
        active = { measurementId, cancel };
        return;
      }
      if (active?.measurementId === measurementId) active = null;
    },
    cancelActive() {
      const current = active;
      if (!current) return;
      current.cancel();
      if (active === current) active = null;
    },
    activeMeasurementId() {
      return active?.measurementId ?? null;
    },
  };
}

interface ListenerTarget {
  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface VisibilityListenerTarget extends ListenerTarget {
  visibilityState: string;
}

export function registerWholeMeasurementDragEnvironmentCancellation({
  windowTarget,
  documentTarget,
  cancel,
}: {
  windowTarget: ListenerTarget;
  documentTarget: VisibilityListenerTarget;
  cancel: () => void;
}): () => void {
  const handleBlur = () => cancel();
  const handleVisibilityChange = () => {
    if (documentTarget.visibilityState === "hidden") cancel();
  };
  const handleTouchCancel = () => cancel();

  windowTarget.addEventListener("blur", handleBlur);
  // Konva fires touchcancel dragend during bubble. Cancel ownership in capture
  // first so that synchronous dragend is stale and cannot commit.
  windowTarget.addEventListener("touchcancel", handleTouchCancel, { capture: true });
  documentTarget.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    windowTarget.removeEventListener("blur", handleBlur);
    windowTarget.removeEventListener("touchcancel", handleTouchCancel, { capture: true });
    documentTarget.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

export function registerWholeMeasurementDragPointerReleaseCleanup({
  windowTarget,
  cancelPreparedDrag,
}: {
  windowTarget: ListenerTarget;
  cancelPreparedDrag: () => void;
}): () => void {
  const handleMouseUp = () => {
    queueMicrotask(cancelPreparedDrag);
  };

  windowTarget.addEventListener("mouseup", handleMouseUp);
  windowTarget.addEventListener("touchend", handleMouseUp);
  windowTarget.addEventListener("touchcancel", handleMouseUp);
  return () => {
    windowTarget.removeEventListener("mouseup", handleMouseUp);
    windowTarget.removeEventListener("touchend", handleMouseUp);
    windowTarget.removeEventListener("touchcancel", handleMouseUp);
  };
}

export function translateMeasurementPoints(points: readonly Point[], delta: Point): Point[] {
  return points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }));
}
