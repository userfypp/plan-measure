import type { LogicalPageBounds, PageState, Point } from "../../types/domain";
import { clampPointToPage } from "../../utils/coordinates";
import { constrainOrthogonal, distance, isPointStrictlyInsidePolygon } from "../../utils/geometry";
import { constrainMeasurementTranslation, translateMeasurementPoints } from "./measurementDrag";
import {
  nearestPointOnSegment,
  resolveSnapCandidate,
  resolveSnapWithOrtho,
  type SnapTarget,
} from "./snapping";

export type KeyboardMeasurement = PageState["measurements"][number];

export function moveKeyboardCursor(
  point: Point,
  key: string,
  zoom: number,
  fast: boolean,
  bounds: LogicalPageBounds,
  repeats = 0,
): Point {
  const acceleration = fast ? 1 + Math.min(repeats, 15) / 5 : 1 + Math.min(repeats, 15);
  const step = ((fast ? 50 : 1) * acceleration) / zoom;
  return clampPointToPage(
    {
      x: point.x + (key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0),
      y: point.y + (key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0),
    },
    bounds,
  );
}

export function keyboardHitMeasurement(
  measurements: readonly KeyboardMeasurement[],
  point: Point,
  zoom: number,
): KeyboardMeasurement | null {
  for (const measurement of [...measurements].reverse()) {
    if (!measurement.visible) continue;
    if (measurement.type === "polygon" && isPointStrictlyInsidePolygon(point, measurement.points))
      return measurement;
    const edgeCount = measurement.points.length - (measurement.type === "polygon" ? 0 : 1);
    for (let index = 0; index < edgeCount; index++) {
      const start = measurement.points[index]!;
      const end = measurement.points[(index + 1) % measurement.points.length]!;
      if (distance(point, nearestPointOnSegment(point, start, end)) * zoom <= 8) return measurement;
    }
  }
  return null;
}

export function keyboardEditPreview({
  measurements,
  vertex,
  origin,
  rawPoint,
  bounds,
  zoom,
  snap,
  orthogonal,
  targets,
}: {
  measurements: readonly KeyboardMeasurement[];
  vertex: number;
  origin: Point;
  rawPoint: Point;
  bounds: LogicalPageBounds;
  zoom: number;
  snap: boolean;
  orthogonal: boolean;
  targets: readonly SnapTarget[];
}): KeyboardMeasurement[] {
  const first = measurements[0];
  if (!first) return [];
  if (rawPoint.x === origin.x && rawPoint.y === origin.y) return [...measurements];
  const anchor =
    vertex >= 0 ? first.points[(vertex + first.points.length - 1) % first.points.length]! : origin;
  const availableTargets = targets.filter(
    (target) => !measurements.some(({ id }) => id === target.measurementId),
  );
  const match = snap
    ? orthogonal
      ? resolveSnapWithOrtho(anchor, rawPoint, zoom, availableTargets, bounds)
      : resolveSnapCandidate(rawPoint, zoom, availableTargets, bounds)
    : null;
  const point = clampPointToPage(
    match?.point ?? (orthogonal ? constrainOrthogonal(anchor, rawPoint) : rawPoint),
    bounds,
  );
  if (vertex >= 0) {
    return measurements.map((measurement, index) =>
      index === 0
        ? {
            ...measurement,
            points: measurement.points.map((original, i) => (i === vertex ? point : original)),
          }
        : measurement,
    );
  }
  const delta = constrainMeasurementTranslation(
    measurements.flatMap(({ points }) => points),
    {
      x: point.x - origin.x,
      y: point.y - origin.y,
    },
    bounds,
  );
  return measurements.map((measurement) => ({
    ...measurement,
    points: translateMeasurementPoints(measurement.points, delta),
  }));
}
