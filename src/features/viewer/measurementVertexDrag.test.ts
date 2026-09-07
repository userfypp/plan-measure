import { describe, expect, it, vi } from "vitest";
import type { Measurement, Point } from "../../types/domain";
import { hasValidMeasurementPoints } from "../../utils/geometry";
import {
  canDragWholeMeasurement,
  registerWholeMeasurementDragEnvironmentCancellation,
  registerWholeMeasurementDragPointerReleaseCleanup,
} from "./measurementDrag";
import { startsViewerPan } from "./navigation";
import {
  beginMeasurementVertexDrag,
  canStartMeasurementVertexDrag,
  cancelPreparedMeasurementVertexDrag,
  cancelMeasurementVertexDrag,
  cancelMeasurementVertexDragIfUnsafe,
  createMeasurementVertexDragCancellationRegistry,
  createMeasurementVertexDragState,
  finishMeasurementVertexDrag,
  matchesPreparedMeasurementVertexDrag,
  prepareMeasurementVertexDrag,
  shouldRenderMeasurementVertexHandles,
  shouldCancelMeasurementVertexDrag,
  updateMeasurementVertexDrag,
  type MeasurementVertexDragEffects,
  type MeasurementVertexDragNode,
} from "./measurementVertexDrag";

const transform = { zoom: 1, panX: 0, panY: 0 };
const bounds = { width: 600, height: 800, rotation: 0 as const };

class FakeDragNode implements MeasurementVertexDragNode {
  point: Point = { x: 0, y: 0 };
  dragging = true;
  draggableValue = true;
  draggableCalls: boolean[] = [];
  stopDragCalls = 0;
  onStopDrag: (() => void) | null = null;

  isDragging() {
    return this.dragging;
  }

  draggable(value: boolean) {
    this.draggableValue = value;
    this.draggableCalls.push(value);
  }

  position(point: Point) {
    this.point = { ...point };
  }

  stopDrag() {
    this.stopDragCalls += 1;
    this.dragging = false;
    this.onStopDrag?.();
  }
}

function dragEffects(commit = vi.fn<(points: Point[]) => boolean>(() => true)) {
  const previews: Array<Point[] | null> = [];
  const editing: boolean[] = [];
  const effects: MeasurementVertexDragEffects = {
    preview: (points) => previews.push(points?.map((point) => ({ ...point })) ?? null),
    setEditing: (active) => editing.push(active),
    commit,
  };
  return { commit, previews, editing, effects };
}

function beginLineDrag(
  node: FakeDragNode,
  effects: MeasurementVertexDragEffects,
  sourcePoints: Point[] = [
    { x: 20, y: 30 },
    { x: 80, y: 90 },
  ],
) {
  const state = createMeasurementVertexDragState();
  const owner = {};
  beginMeasurementVertexDrag(
    state,
    {
      owner,
      node,
      vertexIndex: 1,
      sourcePoints,
      transform,
      bounds,
    },
    sourcePoints[1]!,
    effects,
  );
  return { state, owner, sourcePoints };
}

describe("measurement vertex drag lifecycle", () => {
  it("commits a normal completed vertex drag exactly once", () => {
    const node = new FakeDragNode();
    const { commit, previews, editing, effects } = dragEffects();
    const { state } = beginLineDrag(node, effects);

    expect(updateMeasurementVertexDrag(state, node, 1, { x: 100, y: 110 }, effects)).toBe(true);
    const result = finishMeasurementVertexDrag(state, node, 1, { x: 120, y: 130 }, effects);

    expect(result).toEqual({
      outcome: "accepted",
      points: [
        { x: 20, y: 30 },
        { x: 120, y: 130 },
      ],
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(editing).toEqual([true, false]);
    expect(previews.at(-1)).toEqual(result.points);

    expect(finishMeasurementVertexDrag(state, node, 1, { x: 140, y: 150 }, effects)).toEqual({
      outcome: "cancelled",
      points: null,
    });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("rolls back the transient handle when the completed edit is rejected", () => {
    const node = new FakeDragNode();
    const commit = vi.fn<(points: Point[]) => boolean>(() => false);
    const { previews, editing, effects } = dragEffects(commit);
    const { state, sourcePoints } = beginLineDrag(node, effects);

    const result = finishMeasurementVertexDrag(state, node, 1, { x: 120, y: 130 }, effects);

    expect(result.outcome).toBe("rejected");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(node.point).toEqual(sourcePoints[1]);
    expect(previews.at(-1)).toBeNull();
    expect(editing).toEqual([true, false]);
  });

  it("cancels on blur with zero update even if stopDrag synchronously emits dragend", () => {
    const node = new FakeDragNode();
    const { commit, previews, editing, effects } = dragEffects();
    const { state, sourcePoints } = beginLineDrag(node, effects);
    const windowTarget = new EventTarget();
    class VisibilityTarget extends EventTarget {
      visibilityState = "visible";
    }
    const documentTarget = new VisibilityTarget();

    node.onStopDrag = () => {
      finishMeasurementVertexDrag(state, node, 1, { x: 500, y: 500 }, effects);
    };
    const unregister = registerWholeMeasurementDragEnvironmentCancellation({
      windowTarget,
      documentTarget,
      cancel: () => cancelMeasurementVertexDrag(state, effects),
    });

    windowTarget.dispatchEvent(new Event("blur"));

    expect(commit).not.toHaveBeenCalled();
    expect(node.stopDragCalls).toBe(1);
    expect(node.point).toEqual(sourcePoints[1]);
    expect(previews.at(-1)).toBeNull();
    expect(editing).toEqual([true, false]);
    expect(finishMeasurementVertexDrag(state, node, 1, { x: 550, y: 550 }, effects)).toEqual({
      outcome: "cancelled",
      points: null,
    });
    expect(commit).not.toHaveBeenCalled();

    unregister();
  });

  it("cancels only when visibility becomes hidden and leaves no stale commit path", () => {
    const node = new FakeDragNode();
    const { commit, effects } = dragEffects();
    const { state } = beginLineDrag(node, effects);
    const windowTarget = new EventTarget();
    class VisibilityTarget extends EventTarget {
      visibilityState = "visible";
    }
    const documentTarget = new VisibilityTarget();
    const unregister = registerWholeMeasurementDragEnvironmentCancellation({
      windowTarget,
      documentTarget,
      cancel: () => cancelMeasurementVertexDrag(state, effects),
    });

    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(state.active).not.toBeNull();
    documentTarget.visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));

    expect(state.active).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    expect(finishMeasurementVertexDrag(state, node, 1, { x: 300, y: 300 }, effects)).toEqual({
      outcome: "cancelled",
      points: null,
    });
    expect(commit).not.toHaveBeenCalled();

    unregister();
  });

  it("cancels an active touch gesture in capture before Konva dragend can commit", () => {
    const node = new FakeDragNode();
    const { commit, effects } = dragEffects();
    const { state } = beginLineDrag(node, effects);
    const windowTarget = new EventTarget();
    class VisibilityTarget extends EventTarget {
      visibilityState = "visible";
    }
    const documentTarget = new VisibilityTarget();

    // Konva's earlier touchcancel capture listener changes dragStatus from
    // dragging to stopped before our cancellation listener runs.
    windowTarget.addEventListener(
      "touchcancel",
      () => {
        node.dragging = false;
      },
      true,
    );
    const unregister = registerWholeMeasurementDragEnvironmentCancellation({
      windowTarget,
      documentTarget,
      cancel: () => cancelMeasurementVertexDrag(state, effects),
    });
    // Model Konva's bubble-phase _endDragAfter -> dragend.
    windowTarget.addEventListener("touchcancel", () => {
      finishMeasurementVertexDrag(state, node, 1, { x: 500, y: 500 }, effects);
    });

    windowTarget.dispatchEvent(new Event("touchcancel"));

    expect(state.active).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    expect(node.stopDragCalls).toBe(0);
    unregister();
  });

  it("cancels a drag when its transform, bounds, or selection no longer match", () => {
    const node = new FakeDragNode();
    const { commit, effects } = dragEffects();
    const { state } = beginLineDrag(node, effects);
    const snapshot = state.active!;

    expect(shouldCancelMeasurementVertexDrag(snapshot, true, transform, bounds)).toBe(false);
    expect(
      shouldCancelMeasurementVertexDrag(snapshot, true, { ...transform, zoom: 1.25 }, bounds),
    ).toBe(true);
    expect(
      shouldCancelMeasurementVertexDrag(snapshot, true, transform, { ...bounds, width: 601 }),
    ).toBe(true);
    expect(shouldCancelMeasurementVertexDrag(snapshot, false, transform, bounds)).toBe(true);

    expect(
      cancelMeasurementVertexDragIfUnsafe(
        state,
        true,
        { ...transform, zoom: 1.25 },
        bounds,
        effects,
      ),
    ).toBe(true);
    expect(finishMeasurementVertexDrag(state, node, 1, { x: 400, y: 400 }, effects)).toEqual({
      outcome: "cancelled",
      points: null,
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("keeps stale cancellation ownership from clearing a newer drag", () => {
    const registry = createMeasurementVertexDragCancellationRegistry();
    const firstOwner = {};
    const secondOwner = {};
    const cancelFirst = vi.fn();
    const cancelSecond = vi.fn();

    registry.set("measurement-1", firstOwner, cancelFirst);
    registry.set("measurement-1", secondOwner, cancelSecond);
    registry.set("measurement-1", firstOwner, null);

    expect(registry.activeOwner()).toEqual({
      measurementId: "measurement-1",
      owner: secondOwner,
    });
    registry.cancelActive();
    expect(cancelFirst).not.toHaveBeenCalled();
    expect(cancelSecond).toHaveBeenCalledTimes(1);
    expect(registry.activeOwner()).toBeNull();
  });

  it("keeps active handles mounted through selection loss until cancellation can stop Konva", () => {
    expect(shouldRenderMeasurementVertexHandles(true, false, true)).toBe(true);
    expect(shouldRenderMeasurementVertexHandles(false, true, true)).toBe(true);
    expect(shouldRenderMeasurementVertexHandles(false, false, true)).toBe(false);
    expect(shouldRenderMeasurementVertexHandles(true, true, false)).toBe(true);
    expect(shouldRenderMeasurementVertexHandles(true, false, false)).toBe(false);
  });

  it("reserves vertex dragging for the primary button while middle button remains pan-owned", () => {
    const node = new FakeDragNode();
    const otherNode = new FakeDragNode();
    expect(canStartMeasurementVertexDrag(0)).toBe(true);
    expect(prepareMeasurementVertexDrag(node, 1, 1, [], transform, bounds)).toBeNull();
    expect(prepareMeasurementVertexDrag(node, 1, 2, [], transform, bounds)).toBeNull();
    const preparation = prepareMeasurementVertexDrag(
      node,
      1,
      0,
      [
        { x: 20, y: 30 },
        { x: 80, y: 90 },
      ],
      transform,
      bounds,
    );
    expect(matchesPreparedMeasurementVertexDrag(preparation, node, 1)).toBe(true);
    expect(matchesPreparedMeasurementVertexDrag(preparation, node, 0)).toBe(false);
    expect(matchesPreparedMeasurementVertexDrag(preparation, otherNode, 1)).toBe(false);
    expect(startsViewerPan("select", false, 1)).toBe(true);
  });

  it("owns and safely clears a sub-threshold prepared drag before dragstart", () => {
    const node = new FakeDragNode();
    node.dragging = false;
    const preparation = prepareMeasurementVertexDrag(
      node,
      1,
      0,
      [
        { x: 20, y: 30 },
        { x: 80, y: 90 },
      ],
      transform,
      bounds,
    );
    if (!preparation) throw new Error("Expected a primary-button preparation.");

    expect(
      shouldCancelMeasurementVertexDrag(preparation, true, { ...transform, zoom: 1.25 }, bounds),
    ).toBe(true);

    const registry = createMeasurementVertexDragCancellationRegistry();
    registry.set("measurement-1", preparation.owner, () => {
      cancelPreparedMeasurementVertexDrag(preparation);
      registry.set("measurement-1", preparation.owner, null);
    });
    registry.cancelActive();

    expect(node.draggableCalls).toEqual([false, true]);
    expect(node.draggableValue).toBe(true);
    expect(node.stopDragCalls).toBe(0);
    expect(registry.activeOwner()).toBeNull();
  });

  it("cancels a prepared drag on blur before dragstart and prevents a later stale start", () => {
    const node = new FakeDragNode();
    node.dragging = false;
    let preparation = prepareMeasurementVertexDrag(
      node,
      1,
      0,
      [
        { x: 20, y: 30 },
        { x: 80, y: 90 },
      ],
      transform,
      bounds,
    );
    if (!preparation) throw new Error("Expected a primary-button preparation.");
    const owner = preparation.owner;
    const registry = createMeasurementVertexDragCancellationRegistry();
    registry.set("measurement-1", owner, () => {
      if (preparation?.owner !== owner) return;
      cancelPreparedMeasurementVertexDrag(preparation);
      preparation = null;
      registry.set("measurement-1", owner, null);
    });
    const windowTarget = new EventTarget();
    class VisibilityTarget extends EventTarget {
      visibilityState = "visible";
    }
    const documentTarget = new VisibilityTarget();
    const unregister = registerWholeMeasurementDragEnvironmentCancellation({
      windowTarget,
      documentTarget,
      cancel: () => registry.cancelActive(),
    });

    windowTarget.dispatchEvent(new Event("blur"));

    expect(preparation).toBeNull();
    expect(node.draggableCalls).toEqual([false, true]);
    expect(node.stopDragCalls).toBe(0);
    expect(matchesPreparedMeasurementVertexDrag(preparation, node, 1)).toBe(false);
    expect(registry.activeOwner()).toBeNull();
    unregister();
  });

  it("cancels a prepared drag only when document visibility becomes hidden", () => {
    const node = new FakeDragNode();
    node.dragging = false;
    let preparation = prepareMeasurementVertexDrag(
      node,
      1,
      0,
      [
        { x: 20, y: 30 },
        { x: 80, y: 90 },
      ],
      transform,
      bounds,
    );
    if (!preparation) throw new Error("Expected a primary-button preparation.");
    const owner = preparation.owner;
    const registry = createMeasurementVertexDragCancellationRegistry();
    registry.set("measurement-1", owner, () => {
      if (preparation?.owner !== owner) return;
      cancelPreparedMeasurementVertexDrag(preparation);
      preparation = null;
      registry.set("measurement-1", owner, null);
    });
    const windowTarget = new EventTarget();
    class VisibilityTarget extends EventTarget {
      visibilityState = "visible";
    }
    const documentTarget = new VisibilityTarget();
    const unregister = registerWholeMeasurementDragEnvironmentCancellation({
      windowTarget,
      documentTarget,
      cancel: () => registry.cancelActive(),
    });

    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(preparation).not.toBeNull();
    expect(node.draggableCalls).toEqual([]);

    documentTarget.visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(preparation).toBeNull();
    expect(node.draggableCalls).toEqual([false, true]);
    expect(node.stopDragCalls).toBe(0);
    unregister();
  });

  it("invalidates a prepared drag before a transform change can upgrade it", () => {
    const node = new FakeDragNode();
    node.dragging = false;
    let preparation = prepareMeasurementVertexDrag(
      node,
      1,
      0,
      [
        { x: 20, y: 30 },
        { x: 80, y: 90 },
      ],
      transform,
      bounds,
    );
    if (!preparation) throw new Error("Expected a primary-button preparation.");
    const owner = preparation.owner;
    const registry = createMeasurementVertexDragCancellationRegistry();
    registry.set("measurement-1", owner, () => {
      if (preparation?.owner !== owner) return;
      cancelPreparedMeasurementVertexDrag(preparation);
      preparation = null;
      registry.set("measurement-1", owner, null);
    });

    expect(
      shouldCancelMeasurementVertexDrag(preparation, true, { ...transform, zoom: 1.25 }, bounds),
    ).toBe(true);
    registry.cancelActive();

    const state = createMeasurementVertexDragState();
    const { effects } = dragEffects();
    expect(matchesPreparedMeasurementVertexDrag(preparation, node, 1)).toBe(false);
    expect(state.active).toBeNull();
    expect(node.stopDragCalls).toBe(0);
    expect(node.draggableCalls).toEqual([false, true]);
    expect(effects.commit).not.toHaveBeenCalled();
  });

  it.each(["page change", "pan takeover"])("cancels prepared ownership before %s", () => {
    const node = new FakeDragNode();
    node.dragging = false;
    let preparation = prepareMeasurementVertexDrag(
      node,
      1,
      0,
      [
        { x: 20, y: 30 },
        { x: 80, y: 90 },
      ],
      transform,
      bounds,
    );
    if (!preparation) throw new Error("Expected a primary-button preparation.");
    const owner = preparation.owner;
    const registry = createMeasurementVertexDragCancellationRegistry();
    registry.set("measurement-1", owner, () => {
      if (preparation?.owner !== owner) return;
      cancelPreparedMeasurementVertexDrag(preparation);
      preparation = null;
      registry.set("measurement-1", owner, null);
    });

    registry.cancelActive();

    expect(preparation).toBeNull();
    expect(node.draggableCalls).toEqual([false, true]);
    expect(node.stopDragCalls).toBe(0);
    expect(registry.activeOwner()).toBeNull();
  });

  it.each(["mouseup", "touchend", "touchcancel"])(
    "clears prepared ownership on global %s before dragstart",
    async (releaseEvent) => {
      const node = new FakeDragNode();
      node.dragging = false;
      let preparation = prepareMeasurementVertexDrag(
        node,
        1,
        0,
        [
          { x: 20, y: 30 },
          { x: 80, y: 90 },
        ],
        transform,
        bounds,
      );
      if (!preparation) throw new Error("Expected a primary-button preparation.");
      const owner = preparation.owner;
      const registry = createMeasurementVertexDragCancellationRegistry();
      registry.set("measurement-1", owner, () => {
        if (preparation?.owner !== owner) return;
        cancelPreparedMeasurementVertexDrag(preparation);
        preparation = null;
        registry.set("measurement-1", owner, null);
      });
      const windowTarget = new EventTarget();
      const unregister = registerWholeMeasurementDragPointerReleaseCleanup({
        windowTarget,
        cancelPreparedDrag: () => registry.cancelActive(),
      });

      windowTarget.dispatchEvent(new Event(releaseEvent));
      expect(preparation).not.toBeNull();
      await Promise.resolve();

      expect(preparation).toBeNull();
      expect(node.draggableCalls).toEqual([false, true]);
      expect(node.stopDragCalls).toBe(0);
      expect(registry.activeOwner()).toBeNull();
      unregister();
    },
  );

  it("cancelling one prepared vertex gesture does not disturb an unrelated active drag", () => {
    const preparedNode = new FakeDragNode();
    preparedNode.dragging = false;
    const unrelatedNode = new FakeDragNode();
    unrelatedNode.dragging = true;
    const preparation = prepareMeasurementVertexDrag(
      preparedNode,
      1,
      0,
      [
        { x: 20, y: 30 },
        { x: 80, y: 90 },
      ],
      transform,
      bounds,
    );
    if (!preparation) throw new Error("Expected a primary-button preparation.");

    cancelPreparedMeasurementVertexDrag(preparation);

    expect(preparedNode.draggableCalls).toEqual([false, true]);
    expect(preparedNode.stopDragCalls).toBe(0);
    expect(unrelatedNode.draggableCalls).toEqual([]);
    expect(unrelatedNode.stopDragCalls).toBe(0);
    expect(unrelatedNode.dragging).toBe(true);
  });

  it("still repairs a historical invalid Polygon by moving one vertex", () => {
    const sourcePoints = [
      { x: 0, y: 0 },
      { x: 6, y: 5 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    ];
    const measurement: Measurement = {
      id: "repair-required",
      type: "polygon",
      name: "Historical polygon",
      calibrationId: "scale-1",
      points: sourcePoints,
      classificationValueIds: [],
      visible: true,
    };
    expect(hasValidMeasurementPoints("polygon", sourcePoints)).toBe(false);
    expect(canDragWholeMeasurement(measurement, true, true)).toBe(false);

    let persistedPoints = sourcePoints.map((point) => ({ ...point }));
    const commit = vi.fn((points: Point[]) => {
      if (!hasValidMeasurementPoints("polygon", points)) return false;
      persistedPoints = points.map((point) => ({ ...point }));
      return true;
    });
    const { effects } = dragEffects(commit);
    const node = new FakeDragNode();
    const state = createMeasurementVertexDragState();
    beginMeasurementVertexDrag(
      state,
      {
        owner: {},
        node,
        vertexIndex: 1,
        sourcePoints,
        transform,
        bounds,
      },
      sourcePoints[1]!,
      effects,
    );
    const result = finishMeasurementVertexDrag(state, node, 1, { x: 2, y: 1 }, effects);

    expect(result.outcome).toBe("accepted");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(hasValidMeasurementPoints("polygon", persistedPoints)).toBe(true);
    expect(persistedPoints).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    ]);
  });

  it("preserves historical repair-required Polygon geometry exactly when the edit is cancelled", () => {
    const sourcePoints = [
      { x: 0, y: 0 },
      { x: 6, y: 5 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    ];
    const node = new FakeDragNode();
    const { commit, effects } = dragEffects();
    const state = createMeasurementVertexDragState();
    beginMeasurementVertexDrag(
      state,
      {
        owner: {},
        node,
        vertexIndex: 1,
        sourcePoints,
        transform,
        bounds,
      },
      sourcePoints[1]!,
      effects,
    );
    updateMeasurementVertexDrag(state, node, 1, { x: 2, y: 1 }, effects);

    cancelMeasurementVertexDrag(state, effects);

    expect(commit).not.toHaveBeenCalled();
    expect(node.point).toEqual(sourcePoints[1]);
    expect(sourcePoints).toEqual([
      { x: 0, y: 0 },
      { x: 6, y: 5 },
      { x: 0, y: 4 },
      { x: 4, y: 0 },
    ]);
  });

  it("starts a clean new vertex drag after cancellation and commits it once", () => {
    const firstNode = new FakeDragNode();
    const { commit, effects } = dragEffects();
    const { state } = beginLineDrag(firstNode, effects);
    cancelMeasurementVertexDrag(state, effects);

    expect(finishMeasurementVertexDrag(state, firstNode, 1, { x: 500, y: 500 }, effects)).toEqual({
      outcome: "cancelled",
      points: null,
    });

    const secondNode = new FakeDragNode();
    beginMeasurementVertexDrag(
      state,
      {
        owner: {},
        node: secondNode,
        vertexIndex: 1,
        sourcePoints: [
          { x: 20, y: 30 },
          { x: 80, y: 90 },
        ],
        transform,
        bounds,
      },
      { x: 80, y: 90 },
      effects,
    );
    expect(
      finishMeasurementVertexDrag(state, secondNode, 1, { x: 105, y: 115 }, effects).outcome,
    ).toBe("accepted");
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
