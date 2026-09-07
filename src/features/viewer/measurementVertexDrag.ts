import type { LogicalPageBounds, Point, ViewTransform } from "../../types/domain";
import { viewTransformChanged } from "./measurementDrag";

export interface MeasurementVertexDragNode {
  draggable(value: boolean): unknown;
  isDragging(): boolean;
  position(point: Point): unknown;
  stopDrag(): void;
}

export interface MeasurementVertexDragSnapshot {
  owner: object;
  node: MeasurementVertexDragNode;
  vertexIndex: number;
  sourcePoints: Point[];
  transform: ViewTransform;
  bounds: LogicalPageBounds;
}

export type MeasurementVertexDragPreparation = MeasurementVertexDragSnapshot;

export interface MeasurementVertexDragState {
  active: MeasurementVertexDragSnapshot | null;
}

export interface MeasurementVertexDragEffects {
  preview(points: Point[] | null): void;
  setEditing(active: boolean): void;
  commit(points: Point[]): boolean;
}

export type MeasurementVertexDragFinishResult =
  { outcome: "cancelled"; points: null } | { outcome: "accepted" | "rejected"; points: Point[] };

export function createMeasurementVertexDragState(): MeasurementVertexDragState {
  return { active: null };
}

export function createMeasurementVertexDragCancellationRegistry() {
  let active: { measurementId: string; owner: object; cancel: () => void } | null = null;

  return {
    set(measurementId: string, owner: object, cancel: (() => void) | null) {
      if (cancel) {
        active = { measurementId, owner, cancel };
        return;
      }
      if (active?.measurementId === measurementId && active.owner === owner) active = null;
    },
    cancelActive() {
      const current = active;
      if (!current) return;
      active = null;
      current.cancel();
    },
    activeOwner() {
      return active ? { measurementId: active.measurementId, owner: active.owner } : null;
    },
  };
}

export function canStartMeasurementVertexDrag(button: number): boolean {
  return button === 0;
}

export function prepareMeasurementVertexDrag(
  node: MeasurementVertexDragNode,
  vertexIndex: number,
  button: number,
  sourcePoints: readonly Point[],
  transform: ViewTransform,
  bounds: LogicalPageBounds,
): MeasurementVertexDragPreparation | null {
  if (!canStartMeasurementVertexDrag(button)) return null;
  return {
    owner: {},
    node,
    vertexIndex,
    sourcePoints: sourcePoints.map((point) => ({ ...point })),
    transform: { ...transform },
    bounds: { ...bounds },
  };
}

export function matchesPreparedMeasurementVertexDrag(
  preparation: MeasurementVertexDragPreparation | null,
  node: MeasurementVertexDragNode,
  vertexIndex: number,
): preparation is MeasurementVertexDragPreparation {
  return preparation?.node === node && preparation.vertexIndex === vertexIndex;
}

export function cancelPreparedMeasurementVertexDrag(
  preparation: MeasurementVertexDragPreparation,
): void {
  clearReadyMeasurementVertexDrag(preparation.node);
}

export function clearReadyMeasurementVertexDrag(node: MeasurementVertexDragNode): void {
  // Konva only exposes `isDragging()` for the started state. Toggling draggable
  // clears a sub-threshold `ready` drag element without ending unrelated drags.
  node.draggable(false);
  node.draggable(true);
}

export function shouldRenderMeasurementVertexHandles(
  selected: boolean,
  dragActive: boolean,
  editable: boolean,
): boolean {
  return dragActive || (selected && editable);
}

function pointsWithVertex(
  sourcePoints: readonly Point[],
  vertexIndex: number,
  point: Point,
): Point[] {
  return sourcePoints.map((sourcePoint, index) =>
    index === vertexIndex ? point : { ...sourcePoint },
  );
}

export function beginMeasurementVertexDrag(
  state: MeasurementVertexDragState,
  snapshot: MeasurementVertexDragSnapshot,
  startPoint: Point,
  effects: MeasurementVertexDragEffects,
): boolean {
  if (state.active) return false;
  state.active = {
    ...snapshot,
    sourcePoints: snapshot.sourcePoints.map((point) => ({ ...point })),
    transform: { ...snapshot.transform },
    bounds: { ...snapshot.bounds },
  };
  snapshot.node.position(startPoint);
  effects.setEditing(true);
  effects.preview(pointsWithVertex(state.active.sourcePoints, snapshot.vertexIndex, startPoint));
  return true;
}

export function getActiveMeasurementVertexDrag(
  state: MeasurementVertexDragState,
  node: MeasurementVertexDragNode,
  vertexIndex: number,
): MeasurementVertexDragSnapshot | null {
  const drag = state.active;
  return drag && drag.node === node && drag.vertexIndex === vertexIndex ? drag : null;
}

export function updateMeasurementVertexDrag(
  state: MeasurementVertexDragState,
  node: MeasurementVertexDragNode,
  vertexIndex: number,
  point: Point,
  effects: Pick<MeasurementVertexDragEffects, "preview">,
): boolean {
  const drag = getActiveMeasurementVertexDrag(state, node, vertexIndex);
  if (!drag) return false;
  node.position(point);
  effects.preview(pointsWithVertex(drag.sourcePoints, vertexIndex, point));
  return true;
}

export function cancelMeasurementVertexDrag(
  state: MeasurementVertexDragState,
  effects: Pick<MeasurementVertexDragEffects, "preview" | "setEditing">,
): boolean {
  const drag = state.active;
  if (!drag) return false;

  // Invalidate ownership before stopDrag() so any synchronous Konva dragend is stale.
  state.active = null;
  const sourcePoint = drag.sourcePoints[drag.vertexIndex];
  if (sourcePoint) drag.node.position(sourcePoint);
  if (drag.node.isDragging()) drag.node.stopDrag();
  effects.preview(null);
  effects.setEditing(false);
  return true;
}

export function finishMeasurementVertexDrag(
  state: MeasurementVertexDragState,
  node: MeasurementVertexDragNode,
  vertexIndex: number,
  finalPoint: Point,
  effects: MeasurementVertexDragEffects,
): MeasurementVertexDragFinishResult {
  const drag = getActiveMeasurementVertexDrag(state, node, vertexIndex);
  if (!drag) return { outcome: "cancelled", points: null };

  // Consume ownership before commit so a duplicate/stale dragend cannot commit twice.
  state.active = null;
  const points = pointsWithVertex(drag.sourcePoints, vertexIndex, finalPoint);
  node.position(finalPoint);
  effects.preview(points);
  const accepted = effects.commit(points);
  if (!accepted) {
    const sourcePoint = drag.sourcePoints[vertexIndex];
    if (sourcePoint) node.position(sourcePoint);
    effects.preview(null);
  }
  effects.setEditing(false);
  return { outcome: accepted ? "accepted" : "rejected", points };
}

export function shouldCancelMeasurementVertexDrag(
  snapshot: MeasurementVertexDragSnapshot,
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

export function cancelMeasurementVertexDragIfUnsafe(
  state: MeasurementVertexDragState,
  selected: boolean,
  transform: ViewTransform,
  bounds: LogicalPageBounds,
  effects: Pick<MeasurementVertexDragEffects, "preview" | "setEditing">,
): boolean {
  const drag = state.active;
  if (!drag || !shouldCancelMeasurementVertexDrag(drag, selected, transform, bounds)) return false;
  return cancelMeasurementVertexDrag(state, effects);
}
