import type { LogicalPageBounds, PageState, Point } from "../../types/domain";
import { clampPointToPage } from "../../utils/coordinates";
import {
  constrainOrthogonal,
  distance,
  isPointStrictlyInsidePolygon,
  measurementPathSpecs,
} from "../../utils/geometry";
import { applyMeasurementVertexEdit } from "../../utils/quickShapesCore";
import { measurementOutlinePoints } from "../../utils/quickShapesOutline";
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
    if (measurement.type === "count") {
      if (measurement.points.some((marker) => distance(point, marker) * zoom <= 8)) return measurement;
      continue;
    }
    const closed = measurementPathSpecs[measurement.type].closed;
    // Hit-test the true contour (ellipse arc / cloud scallops), not the control ring.
    const outline = measurementOutlinePoints(measurement.type, measurement.points, 1 / zoom);
    if (closed && isPointStrictlyInsidePolygon(point, outline)) return measurement;
    const edgeCount = outline.length - (closed ? 0 : 1);
    for (let index = 0; index < edgeCount; index++) {
      const start = outline[index]!;
      const end = outline[(index + 1) % outline.length]!;
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
  const isBox = measurementPathSpecs[first.type].authoring === "box";
  const anchor =
    vertex >= 0 ? first.points[(vertex + first.points.length - 1) % first.points.length]! : origin;
  const availableTargets = targets.filter(
    (target) => !measurements.some(({ id }) => id === target.measurementId),
  );
  const match = snap
    ? orthogonal && !isBox
      ? resolveSnapWithOrtho(anchor, rawPoint, zoom, availableTargets, bounds)
      : resolveSnapCandidate(rawPoint, zoom, availableTargets, bounds)
    : null;
  const point = clampPointToPage(
    match?.point ?? (orthogonal && !isBox ? constrainOrthogonal(anchor, rawPoint) : rawPoint),
    bounds,
  );
  if (vertex >= 0) {
    return measurements.map((measurement, index) =>
      index === 0
        ? {
            ...measurement,
            points: applyMeasurementVertexEdit(measurement.type, measurement.points, vertex, point),
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
