import { describe, expect, it } from "vitest";
import { LABEL_EDGE_MARGIN_SCREEN_PX, placeLabelWithinBounds } from "./labelLayout";

const page = { width: 100, height: 80 };
const label = { width: 20, height: 10 };

function right(placement: { x: number }, width: number): number {
  return placement.x + width;
}

function bottom(placement: { y: number }, height: number): number {
  return placement.y + height;
}

describe("label placement within page bounds", () => {
  it("keeps a comfortably centered label centered", () => {
    const placement = placeLabelWithinBounds({ x: 50, y: 40 }, label, page, 1);

    expect(placement).toEqual({ x: 40, y: 35 });
  });

  it("clamps a label at the right edge without changing its measured width", () => {
    const placement = placeLabelWithinBounds({ x: 98, y: 40 }, label, page, 1);

    expect(right(placement, label.width)).toBe(page.width - LABEL_EDGE_MARGIN_SCREEN_PX);
    expect(placement.x).toBeGreaterThanOrEqual(LABEL_EDGE_MARGIN_SCREEN_PX);
  });

  it("clamps a label at the left edge", () => {
    const placement = placeLabelWithinBounds({ x: 2, y: 40 }, label, page, 1);

    expect(placement.x).toBe(LABEL_EDGE_MARGIN_SCREEN_PX);
    expect(right(placement, label.width)).toBeLessThanOrEqual(page.width - 4);
  });

  it("clamps a label at the top edge", () => {
    const placement = placeLabelWithinBounds({ x: 50, y: 1 }, label, page, 1);

    expect(placement.y).toBe(LABEL_EDGE_MARGIN_SCREEN_PX);
    expect(bottom(placement, label.height)).toBeLessThanOrEqual(page.height - 4);
  });

  it("clamps a label at the bottom edge", () => {
    const placement = placeLabelWithinBounds({ x: 50, y: 79 }, label, page, 1);

    expect(bottom(placement, label.height)).toBe(page.height - LABEL_EDGE_MARGIN_SCREEN_PX);
    expect(placement.y).toBeGreaterThanOrEqual(LABEL_EDGE_MARGIN_SCREEN_PX);
  });

  it("clamps both axes at a corner", () => {
    const placement = placeLabelWithinBounds({ x: 1, y: 1 }, label, page, 1);

    expect(placement).toEqual({
      x: LABEL_EDGE_MARGIN_SCREEN_PX,
      y: LABEL_EDGE_MARGIN_SCREEN_PX,
    });
  });

  it.each([1, 2, 4])("converts the visual margin consistently at %sx zoom", (zoom) => {
    const pageSize = { width: 200, height: 120 };
    const dimensions = { width: 40 / zoom, height: 20 / zoom };
    const placement = placeLabelWithinBounds(
      { x: pageSize.width, y: pageSize.height },
      dimensions,
      pageSize,
      zoom,
    );

    expect((pageSize.width - right(placement, dimensions.width)) * zoom).toBeCloseTo(
      LABEL_EDGE_MARGIN_SCREEN_PX,
    );
    expect((pageSize.height - bottom(placement, dimensions.height)) * zoom).toBeCloseTo(
      LABEL_EDGE_MARGIN_SCREEN_PX,
    );
  });

  it("returns finite safe coordinates when a label is larger than the page", () => {
    const placement = placeLabelWithinBounds(
      { x: 50, y: 40 },
      { width: 1_000, height: 1_000 },
      page,
      2,
    );

    expect(Number.isFinite(placement.x)).toBe(true);
    expect(Number.isFinite(placement.y)).toBe(true);
    expect(placement.x).toBeGreaterThanOrEqual(0);
    expect(placement.y).toBeGreaterThanOrEqual(0);
  });
});
