import { describe, expect, it, vi } from "vitest";
import type { Measurement, MeasurementType, PageCalibration, Point } from "../../types/domain";
import { fitToScreen, isPointInPage, pageToScreen, rotatedPageBounds } from "../../utils/coordinates";
import { measurementResultsMm } from "../../utils/geometry";
import {
  canDragWholeMeasurement,
  canStartWholeMeasurementDrag,
  constrainMeasurementTranslation,
  createWholeMeasurementDragCancellationRegistry,
  finishWholeMeasurementDrag,
  MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX,
  measurementEditingEnabled,
  pageDeltaFromScreenDrag,
  previewWholeMeasurementDrag,
  registerWholeMeasurementDragEnvironmentCancellation,
  registerWholeMeasurementDragPointerReleaseCleanup,
  shouldCancelWholeMeasurementDrag,
  translateMeasurementPoints,
  viewTransformChanged,
} from "./measurementDrag";

const calibration: PageCalibration = {
  id: "scale-1",
  name: "Scale 1",
  mode: "xy",
  xReference: {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 1 },
    referenceDistanceMm: 5000,
  },
  yReference: {
    start: { x: 0, y: 0 },
    end: { x: 1, y: 10 },
    referenceDistanceMm: 8000,
  },
};

function measurement(type: MeasurementType, points: Point[]): Measurement {
  return {
    id: `${type}-1`,
    type,
    name: "Keep me",
    calibrationId: "scale-1",
    points,
    classificationValueIds: ["trade-electrical"],
    visible: false,
  };
}

describe("whole-measurement drag", () => {
  it("is available only for valid selected measurements in the normal Select edit workflow", () => {
    const valid = measurement("polygon", [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 25 },
      { x: 10, y: 25 },
    ]);
    const crossing = measurement("polygon", [
      { x: 10, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 30 },
      { x: 30, y: 10 },
    ]);

    expect(measurementEditingEnabled("select", false, false, false, false, null, valid.id)).toBe(
      true,
    );
    expect(canDragWholeMeasurement(valid, true, true)).toBe(true);
    expect(canDragWholeMeasurement(valid, false, true)).toBe(false);
    expect(canDragWholeMeasurement(crossing, true, true)).toBe(false);

    for (const tool of ["hand", "line", "polyline", "polygon", "calibrate"] as const) {
      expect(measurementEditingEnabled(tool, false, false, false, false, null, valid.id)).toBe(
        false,
      );
    }
    expect(measurementEditingEnabled("select", true, false, false, false, null, valid.id)).toBe(
      false,
    );
    expect(measurementEditingEnabled("select", false, true, false, false, null, valid.id)).toBe(
      false,
    );
    expect(measurementEditingEnabled("select", false, false, true, false, null, valid.id)).toBe(
      false,
    );
    expect(measurementEditingEnabled("select", false, false, false, true, null, valid.id)).toBe(
      false,
    );
  });

  it("keeps only the owning measurement editable until its edit ends", () => {
    const activeId = "measurement-a";
    expect(
      measurementEditingEnabled("select", true, false, false, false, activeId, activeId),
    ).toBe(true);
    expect(measurementEditingEnabled("hand", false, false, false, false, activeId, activeId)).toBe(
      true,
    );
    expect(measurementEditingEnabled("line", false, false, false, false, activeId, activeId)).toBe(
      true,
    );
    expect(measurementEditingEnabled("select", false, false, true, true, activeId, activeId)).toBe(
      true,
    );
    expect(
      measurementEditingEnabled("hand", false, false, false, false, activeId, "measurement-b"),
    ).toBe(false);
  });

  it("keeps primary whole-drag separate from middle-button pan and preserves click threshold", () => {
    expect(canStartWholeMeasurementDrag(true, 0)).toBe(true);
    expect(canStartWholeMeasurementDrag(true, 1)).toBe(false);
    expect(canStartWholeMeasurementDrag(true, 2)).toBe(false);
    expect(canStartWholeMeasurementDrag(false, 0)).toBe(false);
    expect(MEASUREMENT_WHOLE_DRAG_DISTANCE_SCREEN_PX).toBe(3);
  });

  it("keeps cancellation ownership measurement-ID-aware and allows a clean subsequent drag", () => {
    const registry = createWholeMeasurementDragCancellationRegistry();
    const cancelA = vi.fn();
    const cancelB = vi.fn();
    const cancelAAgain = vi.fn();

    registry.set("measurement-a", cancelA);
    registry.set("measurement-b", cancelB);
    registry.set("measurement-a", null);
    expect(registry.activeMeasurementId()).toBe("measurement-b");

    registry.cancelActive();
    expect(cancelA).not.toHaveBeenCalled();
    expect(cancelB).toHaveBeenCalledTimes(1);
    expect(registry.activeMeasurementId()).toBeNull();

    registry.set("measurement-a", cancelAAgain);
    registry.cancelActive();
    expect(cancelAAgain).toHaveBeenCalledTimes(1);
    expect(registry.activeMeasurementId()).toBeNull();
  });

  it("never commits cancelled or unchanged drag ends and commits a successful drag exactly once", () => {
    const points = [
      { x: 20, y: 25 },
      { x: 50, y: 55 },
    ];
    const movedPoints = translateMeasurementPoints(points, { x: 10, y: -4 });
    const preview = vi.fn();
    const commit = vi.fn(() => true);
    const effects = { preview, commit };

    expect(
      previewWholeMeasurementDrag({ delta: { x: 10, y: -4 }, points: movedPoints }, effects),
    ).toBe(true);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    preview.mockClear();

    expect(
      finishWholeMeasurementDrag(
        true,
        { delta: { x: 10, y: -4 }, points: movedPoints },
        effects,
      ),
    ).toBe("cancelled");
    expect(finishWholeMeasurementDrag(false, null, effects)).toBe("unchanged");
    expect(
      finishWholeMeasurementDrag(false, { delta: { x: 0, y: 0 }, points }, effects),
    ).toBe("unchanged");
    expect(preview).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();

    expect(
      finishWholeMeasurementDrag(
        false,
        { delta: { x: 10, y: -4 }, points: movedPoints },
        effects,
      ),
    ).toBe("accepted");
    expect(preview).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(movedPoints);
  });

  it("cancels an active drag when selection, transform, or logical page bounds change", () => {
    const snapshot = {
      transform: { zoom: 2, panX: -30, panY: 45 },
      bounds: { width: 600, height: 800, rotation: 0 as const },
    };

    expect(
      shouldCancelWholeMeasurementDrag(snapshot, true, { ...snapshot.transform }, {
        ...snapshot.bounds,
      }),
    ).toBe(false);
    expect(
      shouldCancelWholeMeasurementDrag(snapshot, false, snapshot.transform, snapshot.bounds),
    ).toBe(true);
    expect(
      shouldCancelWholeMeasurementDrag(
        snapshot,
        true,
        { ...snapshot.transform, zoom: 2.5 },
        snapshot.bounds,
      ),
    ).toBe(true);
    expect(
      shouldCancelWholeMeasurementDrag(
        snapshot,
        true,
        snapshot.transform,
        { ...snapshot.bounds, width: 800, height: 600, rotation: 90 },
      ),
    ).toBe(true);
  });

  it("cancels on window blur and only on hidden document visibility, then unregisters cleanly", () => {
    class VisibilityTarget extends EventTarget {
      visibilityState = "visible";
    }

    const windowTarget = new EventTarget();
    const documentTarget = new VisibilityTarget();
    const cancel = vi.fn();
    const unregister = registerWholeMeasurementDragEnvironmentCancellation({
      windowTarget,
      documentTarget,
      cancel,
    });

    windowTarget.dispatchEvent(new Event("blur"));
    expect(cancel).toHaveBeenCalledTimes(1);

    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(cancel).toHaveBeenCalledTimes(1);
    documentTarget.visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(cancel).toHaveBeenCalledTimes(2);

    unregister();
    windowTarget.dispatchEvent(new Event("blur"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it("clears a sub-threshold prepared gesture after mouseup without racing a synchronous drag end", async () => {
    const windowTarget = new EventTarget();
    const registry = createWholeMeasurementDragCancellationRegistry();
    const cancelReady = vi.fn();
    const cancelCompleted = vi.fn();
    const unregister = registerWholeMeasurementDragPointerReleaseCleanup({
      windowTarget,
      cancelPreparedDrag: () => registry.cancelActive(),
    });

    registry.set("ready", cancelReady);
    windowTarget.dispatchEvent(new Event("mouseup"));
    expect(cancelReady).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(cancelReady).toHaveBeenCalledTimes(1);
    expect(registry.activeMeasurementId()).toBeNull();

    registry.set("completed", cancelCompleted);
    windowTarget.dispatchEvent(new Event("mouseup"));
    registry.set("completed", null);
    await Promise.resolve();
    expect(cancelCompleted).not.toHaveBeenCalled();
    expect(registry.activeMeasurementId()).toBeNull();

    unregister();
  });

  it("starts cleanly after sub-threshold cleanup and still commits the next completed drag once", async () => {
    const windowTarget = new EventTarget();
    const registry = createWholeMeasurementDragCancellationRegistry();
    const preview = vi.fn();
    const commit = vi.fn(() => true);
    const effects = { preview, commit };
    const movedPoints = [
      { x: 25, y: 30 },
      { x: 55, y: 60 },
    ];
    const unregister = registerWholeMeasurementDragPointerReleaseCleanup({
      windowTarget,
      cancelPreparedDrag: () => registry.cancelActive(),
    });

    registry.set("first", () => {
      expect(
        finishWholeMeasurementDrag(
          true,
          { delta: { x: 5, y: 5 }, points: movedPoints },
          effects,
        ),
      ).toBe("cancelled");
      registry.set("first", null);
    });
    windowTarget.dispatchEvent(new Event("mouseup"));
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
    expect(registry.activeMeasurementId()).toBeNull();

    registry.set("second", () => undefined);
    expect(
      finishWholeMeasurementDrag(
        false,
        { delta: { x: 5, y: 5 }, points: movedPoints },
        effects,
      ),
    ).toBe("accepted");
    registry.set("second", null);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(registry.activeMeasurementId()).toBeNull();

    unregister();
  });

  it.each([
    [
      "line",
      [
        { x: 12, y: 14 },
        { x: 44, y: 29 },
      ],
    ],
    [
      "polyline",
      [
        { x: 12, y: 14 },
        { x: 44, y: 29 },
        { x: 51, y: 58 },
      ],
    ],
    [
      "polygon",
      [
        { x: 12, y: 14 },
        { x: 44, y: 18 },
        { x: 51, y: 58 },
        { x: 18, y: 49 },
      ],
    ],
  ] as const)("applies one identical delta to every %s vertex and preserves measured values", (type, points) => {
    const source = measurement(type, points.map((point) => ({ ...point })));
    const sourceBefore = structuredClone(source);
    const delta = { x: 17.25, y: -6.5 };
    const movedPoints = translateMeasurementPoints(source.points, delta);

    movedPoints.forEach((point, index) => {
      expect(point.x - source.points[index]!.x).toBe(delta.x);
      expect(point.y - source.points[index]!.y).toBe(delta.y);
    });
    for (let index = 1; index < movedPoints.length; index += 1) {
      expect({
        x: movedPoints[index]!.x - movedPoints[index - 1]!.x,
        y: movedPoints[index]!.y - movedPoints[index - 1]!.y,
      }).toEqual({
        x: source.points[index]!.x - source.points[index - 1]!.x,
        y: source.points[index]!.y - source.points[index - 1]!.y,
      });
    }

    const beforeResults = measurementResultsMm(source, calibration);
    const afterResults = measurementResultsMm({ ...source, points: movedPoints }, calibration);
    if (type === "polygon") {
      expect(afterResults.lengthMm).toBeNull();
      expect(afterResults.perimeterMm).toBeCloseTo(beforeResults.perimeterMm!, 10);
      expect(afterResults.areaMm2).toBeCloseTo(beforeResults.areaMm2!, 8);
    } else {
      expect(afterResults.lengthMm).toBeCloseTo(beforeResults.lengthMm!, 10);
      expect(afterResults.perimeterMm).toBeNull();
      expect(afterResults.areaMm2).toBeNull();
    }
    expect(source).toEqual(sourceBefore);
  });

  it("constrains one shared translation delta at every page edge without deforming the shape", () => {
    const bounds = { width: 100, height: 80, rotation: 0 as const };
    const points = [
      { x: 10, y: 20 },
      { x: 90, y: 20 },
      { x: 90, y: 70 },
      { x: 10, y: 70 },
    ];
    const cases = [
      [{ x: -100, y: 0 }, { x: -10, y: 0 }],
      [{ x: 100, y: 0 }, { x: 10, y: 0 }],
      [{ x: 0, y: -100 }, { x: 0, y: -20 }],
      [{ x: 0, y: 100 }, { x: 0, y: 10 }],
      [{ x: -100, y: -100 }, { x: -10, y: -20 }],
      [{ x: 100, y: -100 }, { x: 10, y: -20 }],
      [{ x: -100, y: 100 }, { x: -10, y: 10 }],
      [{ x: 100, y: 100 }, { x: 10, y: 10 }],
    ] as const;

    for (const [proposed, expected] of cases) {
      const delta = constrainMeasurementTranslation(points, proposed, bounds);
      expect(delta).toEqual(expected);
      const moved = translateMeasurementPoints(points, delta);
      expect(moved.every((point) => isPointInPage(point, bounds))).toBe(true);
      moved.forEach((point, index) => {
        expect(point.x - points[index]!.x).toBe(delta.x);
        expect(point.y - points[index]!.y).toBe(delta.y);
      });
    }
  });

  it("corrects the observed floating-point edge residual with one shared delta", () => {
    const bounds = { width: 620.18, height: 400, rotation: 0 as const };
    const points = [
      { x: 20.18, y: 35.25 },
      { x: 100.18, y: 90.75 },
    ];
    const naiveMaxDelta = bounds.width - points[1]!.x;
    expect(points[1]!.x + naiveMaxDelta).toBeGreaterThan(bounds.width);

    const delta = constrainMeasurementTranslation(points, { x: 10_000, y: 0 }, bounds);
    const moved = translateMeasurementPoints(points, delta);

    expect(delta.x).toBeLessThan(naiveMaxDelta);
    expect(Math.max(...moved.map((point) => point.x))).toBeLessThanOrEqual(bounds.width);
    expect(moved.every((point) => isPointInPage(point, bounds))).toBe(true);
    moved.forEach((point, index) => {
      expect(point).toEqual({
        x: points[index]!.x + delta.x,
        y: points[index]!.y + delta.y,
      });
    });
  });

  it("detects only numeric page-to-screen transform changes", () => {
    const base = { zoom: 2, panX: -30, panY: 45 };
    expect(viewTransformChanged(base, { ...base })).toBe(false);
    expect(viewTransformChanged(base, { ...base, zoom: 2.5 })).toBe(true);
    expect(viewTransformChanged(base, { ...base, panX: -29 })).toBe(true);
    expect(viewTransformChanged(base, { ...base, panY: 46 })).toBe(true);
  });

  it.each([0, 90, 180, 270] as const)(
    "uses the rotation-aware logical page bounds at %s degrees",
    (rotation) => {
      const bounds = rotatedPageBounds(600, 800, rotation);
      const points = [
        { x: 40, y: 50 },
        { x: Math.min(220, bounds.width - 40), y: 50 },
        { x: Math.min(220, bounds.width - 40), y: Math.min(260, bounds.height - 40) },
      ];
      const delta = constrainMeasurementTranslation(points, { x: 10_000, y: 10_000 }, bounds);
      const moved = translateMeasurementPoints(points, delta);

      expect(bounds.rotation).toBe(rotation);
      expect(moved.every((point) => isPointInPage(point, bounds))).toBe(true);
      expect(Math.max(...moved.map((point) => point.x))).toBe(bounds.width);
      expect(Math.max(...moved.map((point) => point.y))).toBe(bounds.height);
    },
  );

  it.each([0.5, 1, 2, 4])(
    "converts a screen drag through the existing view transform at zoom %s",
    (zoom) => {
      const transform = { zoom, panX: -137.5, panY: 82.25 };
      const startPage = { x: 73.25, y: 41.5 };
      const expectedDelta = { x: 19.75, y: -8.125 };
      const startScreen = pageToScreen(startPage, transform);
      const currentScreen = pageToScreen(
        { x: startPage.x + expectedDelta.x, y: startPage.y + expectedDelta.y },
        transform,
      );

      const delta = pageDeltaFromScreenDrag(startScreen, currentScreen, transform);
      expect(delta.x).toBeCloseTo(expectedDelta.x, 12);
      expect(delta.y).toBeCloseTo(expectedDelta.y, 12);
    },
  );

  it.each([
    { width: 640, height: 480 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1200 },
  ])("remains page-space correct for a fitted $width×$height viewport", (viewer) => {
    const bounds = rotatedPageBounds(600, 800, 90);
    const transform = fitToScreen(bounds, viewer);
    const start = { x: 100, y: 80 };
    const end = { x: 145, y: 112 };
    const delta = pageDeltaFromScreenDrag(
      pageToScreen(start, transform),
      pageToScreen(end, transform),
      transform,
    );

    expect(delta.x).toBeCloseTo(45, 12);
    expect(delta.y).toBeCloseTo(32, 12);
  });
});
