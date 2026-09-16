import { describe, expect, it } from "vitest";
import {
  createLabelCollisionIndex,
  LABEL_EDGE_MARGIN_SCREEN_PX,
  placeLabelInsideMeasurementGeometry,
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

describe("inside measurement label placement", () => {
  const insidePage = { width: 140, height: 120 };

  function inside(
    type: "line" | "polyline" | "polygon",
    points: Array<{ x: number; y: number }>,
    dimensions: LabelDimensions = label,
    zoom = 1,
    occupied: OccupiedLabelRect[] | LabelCollisionIndex = [],
    stats?: LabelCollisionStats,
  ) {
    return placeLabelInsideMeasurementGeometry(
      type,
      points,
      dimensions,
      insidePage,
      zoom,
      occupied,
      LABEL_EDGE_MARGIN_SCREEN_PX,
      4,
      stats,
    );
  }

  describe("Line", () => {
    it.each([
      [
        "horizontal",
        [
          { x: 20, y: 40 },
          { x: 100, y: 40 },
        ],
        { x: 50, y: 35 },
      ],
      [
        "vertical",
        [
          { x: 60, y: 15 },
          { x: 60, y: 105 },
        ],
        { x: 50, y: 55 },
      ],
      [
        "diagonal",
        [
          { x: 10, y: 10 },
          { x: 110, y: 90 },
        ],
        { x: 50, y: 45 },
      ],
    ] as const)(
      "centers an unrotated label inside a long %s segment",
      (_name, points, expected) => {
        expect(
          inside(
            "line",
            points.map((point) => ({ ...point })),
          ),
        ).toEqual(expected);
        expect(
          inside(
            "line",
            [...points].reverse().map((point) => ({ ...point })),
          ),
        ).toEqual(expected);
      },
    );

    it("requires projected label footprint plus endpoint clearance", () => {
      const short = [
        { x: 40, y: 40 },
        { x: 65, y: 40 },
      ];

      expect(inside("line", short, { width: 20, height: 10 }, 1)).toBeNull();
      expect(inside("line", short, { width: 10, height: 5 }, 2)).toEqual({
        x: 47.5,
        y: 37.5,
      });
    });

    it("rejects an otherwise fitting inside center when page bounds would clamp it", () => {
      expect(
        inside("line", [
          { x: 0, y: 15 },
          { x: 0, y: 105 },
        ]),
      ).toBeNull();
    });
  });

  describe("Polyline", () => {
    it("uses the longest eligible segment instead of the whole-path center", () => {
      expect(
        inside("polyline", [
          { x: 10, y: 20 },
          { x: 100, y: 20 },
          { x: 100, y: 70 },
        ]),
      ).toEqual({ x: 45, y: 15 });
    });

    it("selects equal-length eligible segments deterministically under reversal", () => {
      const points = [
        { x: 10, y: 10 },
        { x: 50, y: 10 },
        { x: 50, y: 50 },
      ];

      expect(inside("polyline", points)).toEqual({ x: 20, y: 5 });
      expect(inside("polyline", [...points].reverse())).toEqual({ x: 20, y: 5 });
    });

    it("supports a diagonal dominant segment and rejects a path with no eligible segment", () => {
      expect(
        inside("polyline", [
          { x: 10, y: 10 },
          { x: 110, y: 90 },
          { x: 115, y: 95 },
        ]),
      ).toEqual({ x: 50, y: 45 });
      expect(
        inside("polyline", [
          { x: 40, y: 40 },
          { x: 55, y: 40 },
          { x: 55, y: 50 },
        ]),
      ).toBeNull();
    });

    it("tries the next eligible segment when the longest segment would clip the page", () => {
      expect(
        inside("polyline", [
          { x: 0, y: 10 },
          { x: 0, y: 110 },
          { x: 80, y: 110 },
        ]),
      ).toEqual({ x: 30, y: 105 });
    });
  });

  describe("Polygon", () => {
    it("centers the label inside a large convex polygon with stroke clearance", () => {
      expect(
        inside("polygon", [
          { x: 10, y: 10 },
          { x: 120, y: 10 },
          { x: 120, y: 100 },
          { x: 10, y: 100 },
        ]),
      ).toEqual({ x: 55, y: 50 });
    });

    it("finds bounded-grid interior space when centroid, bounds center, and vertex average are invalid", () => {
      const cShape = [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 30 },
        { x: 40, y: 30 },
        { x: 40, y: 90 },
        { x: 120, y: 90 },
        { x: 120, y: 120 },
        { x: 0, y: 120 },
      ];

      const placement = inside("polygon", cShape);
      expect(placement).not.toBeNull();
      expect(placement!.x + label.width).toBeLessThan(40);
      expect(inside("polygon", [...cShape].reverse())).toEqual(placement);
    });

    it("uses a long polygon edge to find a roomy concave arm missed by central anchors", () => {
      const cShape = [
        { x: 20, y: 20 },
        { x: 255, y: 20 },
        { x: 255, y: 60 },
        { x: 95, y: 60 },
        { x: 95, y: 120 },
        { x: 255, y: 120 },
        { x: 255, y: 160 },
        { x: 20, y: 160 },
      ];
      const dimensions = { width: 140, height: 20 };
      const scenarioPage = { width: 300, height: 200 };

      const placement = placeLabelInsideMeasurementGeometry(
        "polygon",
        cShape,
        dimensions,
        scenarioPage,
        1,
        [],
      );

      expect(placement).toEqual({ x: 67.5, y: 24.5 });
      expect(
        placeLabelInsideMeasurementGeometry(
          "polygon",
          [...cShape].reverse(),
          dimensions,
          scenarioPage,
          1,
          [],
        ),
      ).toEqual(placement);
    });

    it("falls back safely for narrow and tiny polygons", () => {
      expect(
        inside("polygon", [
          { x: 10, y: 10 },
          { x: 35, y: 10 },
          { x: 35, y: 100 },
          { x: 10, y: 100 },
        ]),
      ).toBeNull();
      expect(
        inside("polygon", [
          { x: 10, y: 10 },
          { x: 25, y: 10 },
          { x: 25, y: 20 },
          { x: 10, y: 20 },
        ]),
      ).toBeNull();
    });

    it("rejects a polygon candidate whose label rectangle cannot stay within the page margin", () => {
      expect(
        inside("polygon", [
          { x: 0, y: 10 },
          { x: 24, y: 10 },
          { x: 24, y: 110 },
          { x: 0, y: 110 },
        ]),
      ).toBeNull();
    });
  });

  it("rejects an occupied inside candidate so the existing fallback sequence can take over", () => {
    const points = [
      { x: 20, y: 40 },
      { x: 100, y: 40 },
    ];
    const occupied = { x: 50, y: 35, width: 20, height: 10 };
    const index = createLabelCollisionIndex();
    index.insert(occupied);
    const fallbackAnchor = { x: 60, y: 40 };

    expect(inside("line", points, label, 1, index)).toBeNull();
    expect(placeLabelAvoidingOverlaps(fallbackAnchor, label, insidePage, 1, index)).toEqual({
      x: 50,
      y: 21,
    });
  });

  it("preserves exact legacy fallback placements when inside geometry does not fit", () => {
    const cases = [
      {
        type: "line" as const,
        points: [
          { x: 50, y: 50 },
          { x: 70, y: 50 },
        ],
        expected: { x: 35, y: 45 },
      },
      {
        type: "polyline" as const,
        points: [
          { x: 50, y: 50 },
          { x: 70, y: 50 },
          { x: 70, y: 60 },
        ],
        expected: { x: 38.333333333333336, y: 48.333333333333336 },
      },
      {
        type: "polygon" as const,
        points: [
          { x: 50, y: 50 },
          { x: 80, y: 50 },
          { x: 80, y: 65 },
          { x: 50, y: 65 },
        ],
        expected: { x: 40, y: 52.5 },
      },
      {
        type: "polygon" as const,
        points: [
          { x: 50, y: 50 },
          { x: 120, y: 50 },
          { x: 120, y: 60 },
          { x: 60, y: 60 },
          { x: 60, y: 120 },
          { x: 50, y: 120 },
        ],
        expected: null,
      },
      {
        type: "line" as const,
        points: [
          { x: 0, y: 20 },
          { x: 0, y: 80 },
        ],
        expected: { x: 2, y: 45 },
      },
    ];
    const dimensions = { width: 50, height: 10 };
    const scenarioPage = { width: 600, height: 800 };

    for (const scenario of cases) {
      const anchor = {
        x: scenario.points.reduce((sum, point) => sum + point.x, 0) / scenario.points.length,
        y: scenario.points.reduce((sum, point) => sum + point.y, 0) / scenario.points.length,
      };
      const baseline = placeLabelAvoidingOverlaps(anchor, dimensions, scenarioPage, 2, []);
      const insidePlacement = placeLabelInsideMeasurementGeometry(
        scenario.type,
        scenario.points,
        dimensions,
        scenarioPage,
        2,
        [],
      );
      const withInsideFallback = insidePlacement ?? baseline;

      expect(insidePlacement).toBeNull();
      expect(withInsideFallback).toEqual(baseline);
      if (scenario.expected) expect(withInsideFallback).toEqual(scenario.expected);
    }
  });

  it("keeps the #58 spatial index authoritative for thousands of distributed inside labels", () => {
    const count = 2_000;
    const index = createLabelCollisionIndex();
    const stats = { broadPhaseCandidates: 0, exactCollisionChecks: 0 };

    for (let item = 0; item < count; item += 1) {
      const centerX = 50 + item * 100;
      const placement = placeLabelInsideMeasurementGeometry(
        "line",
        [
          { x: centerX - 30, y: 40 },
          { x: centerX + 30, y: 40 },
        ],
        label,
        { width: count * 100 + 100, height: 80 },
        1,
        index,
        LABEL_EDGE_MARGIN_SCREEN_PX,
        4,
        stats,
      );
      expect(placement).not.toBeNull();
      index.insert({ ...placement!, ...label });
    }

    expect(stats.exactCollisionChecks).toBeLessThan(count);
    expect(stats.broadPhaseCandidates).toBeLessThan(count * 2);
  });
});
