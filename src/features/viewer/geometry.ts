import type { Point } from "../../types/domain";

export function pointsToFlat(points: Point[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}
