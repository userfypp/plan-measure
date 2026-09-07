import type { DrawingDraft, Point } from "../../types/domain";

export function buildDraftPreviewPoints(
  draft: DrawingDraft | null,
  pointer: Point | null,
): Point[] {
  if (draft === null) return [];
  if (pointer === null) return draft.points;
  return [...draft.points, pointer];
}
