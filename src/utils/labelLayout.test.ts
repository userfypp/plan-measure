import { describe, expect, it } from "vitest";
import {
  createLabelCollisionIndex,
  LABEL_EDGE_MARGIN_SCREEN_PX,
  placeLabelAvoidingOverlaps,
  placeLabelWithinBounds,
  type LabelCollisionStats,
  type LabelCollisionIndex,
  type LabelDimensions,
  type LabelPlacement,
  type OccupiedLabelRect,
} from "./labelLayout";

const page = { width: 100, height: 80 };
const label = { width: 20, height: 10 };

function right(placement: { x: number }, width: number): number {
  return placement.x + width;
}

function bottom(placement: { y: number }, height: number): number {
  return placement.y + height;
}

interface PlacementScenarioItem {
  anchor: { x: number; y: number };
  dimensions: LabelDimensions;
}

function runPlacementScenario(
  items: readonly PlacementScenarioItem[],
  scenarioPage: { width: number; height: number },
  zoom = 1,
  indexed = false,
): { placements: LabelPlacement[]; stats: LabelCollisionStats } {
  const occupied: OccupiedLabelRect[] = [];
  const index = indexed ? createLabelCollisionIndex() : null;
  const stats = { broadPhaseCandidates: 0, exactCollisionChecks: 0 };
  const placements: LabelPlacement[] = [];

  for (const item of items) {
    const placement = placeLabelAvoidingOverlaps(
      item.anchor,
      item.dimensions,
      scenarioPage,
      zoom,
      index ?? occupied,
      LABEL_EDGE_MARGIN_SCREEN_PX,
      4,
      stats,
    );
    const rect = { ...placement, ...item.dimensions };
    placements.push(placement);
    occupied.push(rect);
    index?.insert(rect);
  }

  return { placements, stats };
}

function potentialCollisions(
  index: LabelCollisionIndex,
  candidate: OccupiedLabelRect,
  gap: number,
): OccupiedLabelRect[] {
  const result: OccupiedLabelRect[] = [];
  index.somePotentialCollision(candidate, gap, (rect) => {
    result.push(rect);
    return false;
  });
  return result;
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

describe("label collision avoidance", () => {
  it("keeps the centered position when it is unoccupied", () => {
    expect(placeLabelAvoidingOverlaps({ x: 50, y: 40 }, label, page, 1, [])).toEqual({
      x: 40,
      y: 35,
    });
  });

  it("moves a second label to a deterministic non-overlapping position", () => {
    const first = placeLabelAvoidingOverlaps({ x: 50, y: 40 }, label, page, 1, []);
    const second = placeLabelAvoidingOverlaps(
      { x: 51, y: 40 },
      label,
      page,
      1,
      [{ ...first, ...label }],
    );

    expect(second).not.toEqual(first);
    expect(second.y + label.height + 4 <= first.y || first.y + label.height + 4 <= second.y).toBe(true);
  });

  it("keeps displaced labels within page bounds", () => {
    const occupied = [
      { x: 76, y: 64, width: 20, height: 10 },
      { x: 76, y: 50, width: 20, height: 10 },
    ];
    const placement = placeLabelAvoidingOverlaps({ x: 99, y: 79 }, label, page, 1, occupied);

    expect(placement.x).toBeGreaterThanOrEqual(4);
    expect(placement.y).toBeGreaterThanOrEqual(4);
    expect(right(placement, label.width)).toBeLessThanOrEqual(96);
    expect(bottom(placement, label.height)).toBeLessThanOrEqual(76);
  });

  it("preserves the exact touching-boundary gap semantics with the spatial index", () => {
    const occupied = { x: 6, y: 35, width: 10, height: 10 };
    const index = createLabelCollisionIndex();
    index.insert(occupied);

    const baseline = placeLabelAvoidingOverlaps(
      { x: 30, y: 40 },
      label,
      page,
      1,
      [occupied],
    );
    const indexed = placeLabelAvoidingOverlaps({ x: 30, y: 40 }, label, page, 1, index);

    expect(baseline).toEqual({ x: 20, y: 35 });
    expect(indexed).toEqual(baseline);
  });

  it("matches the legacy all-occupied scan for ordinary mixed placements", () => {
    const items: PlacementScenarioItem[] = [
      { anchor: { x: 50, y: 40 }, dimensions: label },
      { anchor: { x: 51, y: 40 }, dimensions: label },
      { anchor: { x: 99, y: 79 }, dimensions: { width: 28, height: 12 } },
      { anchor: { x: 4, y: 4 }, dimensions: { width: 12, height: 9 } },
      { anchor: { x: 75, y: 20 }, dimensions: { width: 36, height: 11 } },
    ];

    expect(runPlacementScenario(items, page, 2, true).placements).toEqual(
      runPlacementScenario(items, page, 2, false).placements,
    );
  });

  it("deduplicates broad-phase hits for long labels spanning multiple cells", () => {
    const index = createLabelCollisionIndex();
    const longOccupied = { x: 100, y: 100, width: 240, height: 20 };
    index.insert(longOccupied);
    const stats = { broadPhaseCandidates: 0, exactCollisionChecks: 0 };

    const placement = placeLabelAvoidingOverlaps(
      { x: 250, y: 110 },
      { width: 240, height: 20 },
      { width: 800, height: 600 },
      1,
      index,
      LABEL_EDGE_MARGIN_SCREEN_PX,
      4,
      stats,
    );
    const baseline = placeLabelAvoidingOverlaps(
      { x: 250, y: 110 },
      { width: 240, height: 20 },
      { width: 800, height: 600 },
      1,
      [longOccupied],
    );

    expect(placement).toEqual(baseline);
    expect(stats.exactCollisionChecks).toBeLessThanOrEqual(stats.broadPhaseCandidates);
    expect(stats.broadPhaseCandidates).toBeLessThanOrEqual(11);
  });

  it("indexes large and negative finite coordinates without missing nearby rectangles", () => {
    const index = createLabelCollisionIndex();
    const negative = { x: -1_000_000_000, y: -1_000_000_000, width: 20, height: 10 };
    const positive = { x: 1_000_000_000, y: 1_000_000_000, width: 20, height: 10 };
    index.insert(negative);
    index.insert(positive);

    expect(
      potentialCollisions(
        index,
        { x: negative.x + 5, y: negative.y + 2, width: 20, height: 10 },
        4,
      ),
    ).toContain(negative);
    expect(
      potentialCollisions(
        index,
        { x: positive.x + 5, y: positive.y + 2, width: 20, height: 10 },
        4,
      ),
    ).toContain(positive);
  });

  it("falls back safely for pathological rectangles spanning many grid cells", () => {
    const index = createLabelCollisionIndex();
    const huge = { x: 0, y: 0, width: 1_000_000, height: 10 };
    index.insert(huge);

    expect(
      potentialCollisions(index, { x: 900_000, y: 0, width: 20, height: 10 }, 4),
    ).toContain(huge);
  });

  it("keeps degenerate early entries queryable before a usable grid size exists", () => {
    const index = createLabelCollisionIndex();
    const flat = { x: 10, y: 10, width: 20, height: 0 };
    index.insert(flat);

    expect(potentialCollisions(index, { x: 15, y: 8, width: 10, height: 4 }, 4)).toContain(flat);
  });
});

describe("label collision broad phase performance", () => {
  it("keeps hundreds of distributed placements identical to the legacy scan", () => {
    const items = Array.from({ length: 500 }, (_, index) => ({
      anchor: { x: 50 + index * 80, y: 40 },
      dimensions: label,
    }));
    const largePage = { width: 40_100, height: 80 };
    const baseline = runPlacementScenario(items, largePage, 1, false);
    const indexed = runPlacementScenario(items, largePage, 1, true);

    expect(indexed.placements).toEqual(baseline.placements);
    expect(indexed.stats.exactCollisionChecks).toBeLessThan(
      baseline.stats.exactCollisionChecks / 20,
    );
  });

  it("avoids the all-pairs scan for thousands of widely distributed labels", () => {
    const count = 2_000;
    const items = Array.from({ length: count }, (_, index) => ({
      anchor: { x: 50 + index * 100, y: 40 },
      dimensions: label,
    }));
    const largePage = { width: count * 100 + 100, height: 80 };
    const baseline = runPlacementScenario(items, largePage, 1, false);
    const indexed = runPlacementScenario(items, largePage, 1, true);

    expect(indexed.placements).toEqual(baseline.placements);
    expect(baseline.stats.exactCollisionChecks).toBe((count * (count - 1)) / 2);
    expect(indexed.stats.exactCollisionChecks).toBeLessThan(count);
    expect(indexed.stats.broadPhaseCandidates).toBeLessThan(count * 2);
  });

  it("remains deterministic and behavior-identical for a dense adversarial cluster", () => {
    const items = Array.from({ length: 300 }, () => ({
      anchor: { x: 100, y: 100 },
      dimensions: label,
    }));
    const clusteredPage = { width: 200, height: 200 };
    const baseline = runPlacementScenario(items, clusteredPage, 1, false);
    const firstIndexed = runPlacementScenario(items, clusteredPage, 1, true);
    const secondIndexed = runPlacementScenario(items, clusteredPage, 1, true);

    expect(firstIndexed.placements).toEqual(baseline.placements);
    expect(secondIndexed.placements).toEqual(firstIndexed.placements);
    expect(firstIndexed.stats.exactCollisionChecks).toBeGreaterThan(0);
    expect(firstIndexed.stats.exactCollisionChecks).toBeLessThanOrEqual(
      baseline.stats.exactCollisionChecks,
    );
  });
});
