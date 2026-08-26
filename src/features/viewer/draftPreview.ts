import type { DrawingDraft, Point } from "../../types/domain";
import { constrainOrthogonal } from "../../utils/geometry";

export function buildDraftPreviewPoints(
  draft: DrawingDraft | null,
  pointer: Point | null,
  orthogonal: boolean,
): Point[] {
  if (draft === null) return [];
  if (pointer === null) return draft.points;

  const last = draft.points.at(-1);
  const previewPoint =
    draft.type === "path" && orthogonal && last
      ? constrainOrthogonal(last, pointer)
      : pointer;
  return [...draft.points, previewPoint];
}
