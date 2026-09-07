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
    expect(buildDraftPreviewPoints(null, { x: 40, y: 50 })).toEqual([]);
  });

  it("returns confirmed points without adding a preview when the pointer is null", () => {
    const points = buildDraftPreviewPoints(polylineDraft, null);

    expect(points).toBe(polylineDraft.points);
  });

  it("appends the already-resolved placement point", () => {
    expect(buildDraftPreviewPoints(polylineDraft, { x: 44, y: 30 })).toEqual([
      ...polylineDraft.points,
      { x: 44, y: 30 },
    ]);
  });

  it("does not independently modify the resolved point", () => {
    const resolvedPoint = { x: 44, y: 30 };
    const points = buildDraftPreviewPoints(polylineDraft, resolvedPoint);

    expect(points.slice(0, polylineDraft.points.length)).toEqual(polylineDraft.points);
    expect(points.at(-1)).toEqual({ x: 44, y: 30 });
    expect(points.at(-1)).toBe(resolvedPoint);
  });
});
