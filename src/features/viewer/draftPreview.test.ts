import { describe, expect, it } from "vitest";
import type { DrawingDraft } from "../../types/domain";
import { buildDraftPreviewPoints } from "./draftPreview";

const polylineDraft: Extract<DrawingDraft, { type: "path" }> = {
  type: "path",
  measurementType: "polyline",
  points: [
    { x: 10, y: 10 },
    { x: 30, y: 30 },
  ],
};

describe("draft preview points", () => {
  it("returns no points without a draft", () => {
    expect(buildDraftPreviewPoints(null, { x: 40, y: 50 }, false)).toEqual([]);
  });

  it("returns confirmed points without adding a preview when the pointer is null", () => {
    const points = buildDraftPreviewPoints(polylineDraft, null, false);

    expect(points).toBe(polylineDraft.points);
  });

  it("adds the pointer directly when Ortho is disabled", () => {
    expect(buildDraftPreviewPoints(polylineDraft, { x: 44, y: 36 }, false)).toEqual([
      ...polylineDraft.points,
      { x: 44, y: 36 },
    ]);
  });

  it("orthogonalizes only the preview point when Ortho is enabled", () => {
    const pointer = { x: 44, y: 36 };
    const points = buildDraftPreviewPoints(polylineDraft, pointer, true);

    expect(points.slice(0, polylineDraft.points.length)).toEqual(polylineDraft.points);
    expect(points.at(-1)).toEqual({ x: 44, y: 30 });
    expect(points.at(-1)).not.toEqual(pointer);
  });
});
