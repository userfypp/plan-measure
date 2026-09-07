import { describe, expect, it } from "vitest";
import type { LogicalPageBounds, Measurement, Point, ViewTransform } from "../../types/domain";
import { pageToScreen } from "../../utils/coordinates";
import { constrainOrthogonal } from "../../utils/geometry";
import { buildDraftPreviewPoints } from "./draftPreview";
import {
  POLYGON_CLOSE_TOLERANCE_SCREEN_PX,
  SNAP_TOLERANCE_SCREEN_PX,
  clipSegmentToPage,
  extractSnapTargets,
  isSnapPointPlacementActive,
  nearestPointOnSegment,
  resolveDrawingPoint,
  resolveDrawingPreview,
  resolveSnapCandidate,
  resolveSnapWithOrtho,
  type SnapTarget,
} from "./snapping";

const bounds: LogicalPageBounds = { width: 500, height: 400, rotation: 0 };

function measurement(
  id: string,
  type: Measurement["type"],
  points: Point[],
  visible = true,
): Measurement {
  return {
    id,
    type,
    name: id,
    calibrationId: "scale-1",
    points,
    classificationValueIds: [],
    visible,
  };
}

function transform(zoom = 1, panX = 0, panY = 0): ViewTransform {
  return { zoom, panX, panY };
}

function resolveAtPagePoint(
  rawPoint: Point,
  options: Partial<Parameters<typeof resolveDrawingPoint>[0]> = {},
) {
  const view = options.transform ?? transform();
  return resolveDrawingPoint({
    measurementType: "line",
    confirmedPoints: [],
    rawPointerScreen: pageToScreen(rawPoint, view),
    transform: view,
    bounds,
    snapEnabled: true,
    orthogonal: false,
    targets: [],
    ...options,
  });
}

describe("snap target extraction", () => {
  it("extracts Line vertices and its finite segment", () => {
    const targets = extractSnapTargets(
      [measurement("line", "line", [{ x: 10, y: 20 }, { x: 30, y: 40 }])],
      true,
    );
    expect(targets.map((target) => [target.kind, target.primitiveIndex])).toEqual([
      ["vertex", 0],
      ["vertex", 1],
      ["segment", 0],
    ]);
  });

  it("extracts Polyline vertices and only consecutive segments", () => {
    const targets = extractSnapTargets(
      [
        measurement("polyline", "polyline", [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ]),
      ],
      true,
    );
    expect(targets.filter((target) => target.kind === "vertex")).toHaveLength(3);
    expect(
      targets
        .filter((target) => target.kind === "segment")
        .map((target) => target.primitiveIndex),
    ).toEqual([0, 1]);
  });

  it("includes the Polygon closing edge as the last segment primitive", () => {
    const targets = extractSnapTargets(
      [
        measurement("polygon", "polygon", [
          { x: 5, y: 5 },
          { x: 25, y: 5 },
          { x: 20, y: 20 },
        ]),
      ],
      true,
    );
    const closing = targets.find(
      (target) => target.kind === "segment" && target.primitiveIndex === 2,
    );
    expect(closing).toMatchObject({
      kind: "segment",
      start: { x: 20, y: 20 },
      end: { x: 5, y: 5 },
    });
  });

  it("does not create a segment target for a zero-length rendered edge", () => {
    const targets = extractSnapTargets(
      [measurement("repair", "polyline", [{ x: 10, y: 10 }, { x: 10, y: 10 }])],
      true,
    );
    expect(targets.filter((target) => target.kind === "segment")).toEqual([]);
    expect(targets.filter((target) => target.kind === "vertex")).toHaveLength(2);
  });

  it("excludes hidden measurements and all measurements when global rendering is off", () => {
    const visible = measurement("visible", "line", [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    const hidden = measurement("hidden", "line", [{ x: 20, y: 0 }, { x: 30, y: 0 }], false);
    expect(extractSnapTargets([visible, hidden], true).every((target) => target.measurementId === "visible"))
      .toBe(true);
    expect(extractSnapTargets([visible, hidden], false)).toEqual([]);
  });

  it("clips partially visible segments to the rendered page rectangle", () => {
    const clipped = clipSegmentToPage(
      { x: -5, y: 0 },
      { x: 5, y: 100 },
      { width: 500, height: 400, rotation: 0 },
    );
    expect(clipped?.start.x).toBeCloseTo(0);
    expect(clipped?.start.y).toBeCloseTo(50);
    expect(clipped?.end).toEqual({ x: 5, y: 100 });

    const targets = extractSnapTargets(
      [measurement("clipped", "line", [{ x: -5, y: 0 }, { x: 5, y: 100 }])],
      true,
      bounds,
    );
    const segment = targets.find((target) => target.kind === "segment");
    expect(segment).toMatchObject({ kind: "segment" });
    expect(resolveSnapCandidate({ x: 0, y: 45 }, 1, segment ? [segment] : [])?.point).toEqual({
      x: 0,
      y: 50,
    });
  });

  it("clips very large finite axis-aligned historical segments without cancellation", () => {
    const edgeBounds: LogicalPageBounds = { width: 500, height: 400, rotation: 0 };
    const horizontal = clipSegmentToPage(
      { x: -1e18, y: 200 },
      { x: 1e18, y: 200 },
      edgeBounds,
    );
    expect(horizontal).toEqual({
      start: { x: 0, y: 200 },
      end: { x: 500, y: 200 },
    });

    const vertical = clipSegmentToPage(
      { x: 250, y: -1e18 },
      { x: 250, y: 1e18 },
      edgeBounds,
    );
    expect(vertical).toEqual({
      start: { x: 250, y: 0 },
      end: { x: 250, y: 400 },
    });

    const targets = extractSnapTargets(
      [measurement("huge", "line", [{ x: -1e18, y: 200 }, { x: 1e18, y: 200 }])],
      true,
      edgeBounds,
    );
    expect(resolveSnapCandidate({ x: 500, y: 200 }, 1, targets, edgeBounds)?.point).toEqual({
      x: 500,
      y: 200,
    });
  });

  it("preserves page-boundary extent for very large finite non-axis-aligned geometry", () => {
    const edgeBounds: LogicalPageBounds = { width: 500, height: 400, rotation: 0 };
    const clipped = clipSegmentToPage(
      { x: -1e18, y: 100 },
      { x: 1e18, y: 300 },
      edgeBounds,
    );
    expect(clipped?.start.x).toBe(0);
    expect(clipped?.end.x).toBe(500);
    expect(clipped?.start.y).toBeCloseTo(200);
    expect(clipped?.end.y).toBeCloseTo(200);

    const targets = extractSnapTargets(
      [measurement("huge-diagonal", "line", [{ x: -1e18, y: 100 }, { x: 1e18, y: 300 }])],
      true,
      edgeBounds,
    );
    expect(resolveSnapCandidate({ x: 500, y: 200 }, 1, targets, edgeBounds)?.point.x).toBe(500);
  });

  it("clips a huge diagonal to the true page edge instead of creating phantom geometry", () => {
    const edgeBounds: LogicalPageBounds = { width: 500, height: 400, rotation: 0 };
    const clipped = clipSegmentToPage(
      { x: -1e18, y: -1e18 },
      { x: 1e18, y: 1e18 },
      edgeBounds,
    );

    expect(clipped).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 400, y: 400 },
    });

    const targets = extractSnapTargets(
      [measurement("huge-corner", "line", [{ x: -1e18, y: -1e18 }, { x: 1e18, y: 1e18 }])],
      true,
      edgeBounds,
    );
    expect(resolveSnapCandidate({ x: 480, y: 369 }, 1, targets, edgeBounds)).toBeNull();
  });

  it("excludes geometry that is fully clipped outside the page", () => {
    const targets = extractSnapTargets(
      [measurement("outside", "line", [{ x: -20, y: 10 }, { x: -10, y: 30 }])],
      true,
      bounds,
    );
    expect(targets).toEqual([]);
  });
});

describe("snap candidate geometry", () => {
  it("projects to the nearest finite point on a segment, including endpoints", () => {
    expect(nearestPointOnSegment({ x: 5, y: 7 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      x: 5,
      y: 0,
    });
    expect(nearestPointOnSegment({ x: 20, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      x: 10,
      y: 0,
    });
  });

  it("returns exact persisted endpoints instead of reconstructing them one ULP outside", () => {
    const rightEdge = 612.3456789012345;
    const start = { x: 74.38499526912864, y: 100 };
    const end = { x: rightEdge, y: 100 };
    expect(nearestPointOnSegment({ x: rightEdge, y: 101 }, start, end)).toEqual(end);

    const target: SnapTarget = {
      kind: "segment",
      measurementId: "fractional-edge",
      measurementIndex: 0,
      primitiveIndex: 0,
      start,
      end,
    };
    expect(
      resolveSnapCandidate(
        { x: rightEdge, y: 101 },
        1,
        [target],
        { width: rightEdge, height: 400, rotation: 0 },
      )?.point,
    ).toEqual(end);
  });

  it.each([0.1, 1, 8])("uses an inclusive 10 CSS px tolerance at zoom %s", (zoom) => {
    const raw = { x: 200, y: 100 };
    const exact: SnapTarget = {
      kind: "vertex",
      measurementId: "exact",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: raw.x + SNAP_TOLERANCE_SCREEN_PX / zoom, y: raw.y },
    };
    const outside: SnapTarget = {
      ...exact,
      measurementId: "outside",
      point: { x: raw.x + (SNAP_TOLERANCE_SCREEN_PX + 0.001) / zoom, y: raw.y },
    };
    expect(resolveSnapCandidate(raw, zoom, [exact])?.target.measurementId).toBe("exact");
    expect(resolveSnapCandidate(raw, zoom, [outside])).toBeNull();
  });

  it("keeps the mathematically exact 10 px direct resolver boundary inclusive at fractional zoom", () => {
    const zoom = 0.135;
    const raw = { x: 200, y: 100 };
    const exact: SnapTarget = {
      kind: "vertex",
      measurementId: "fractional-exact",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: raw.x + SNAP_TOLERANCE_SCREEN_PX / zoom, y: raw.y },
    };
    expect(resolveSnapCandidate(raw, zoom, [exact])?.target.measurementId).toBe(
      "fractional-exact",
    );
  });

  it("chooses the nearest candidate before applying tie rules", () => {
    const raw = { x: 10, y: 10 };
    const farther: SnapTarget = {
      kind: "vertex",
      measurementId: "farther",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 17, y: 10 },
    };
    const nearer: SnapTarget = {
      kind: "segment",
      measurementId: "nearer",
      measurementIndex: 1,
      primitiveIndex: 0,
      start: { x: 14, y: 0 },
      end: { x: 14, y: 20 },
    };
    expect(resolveSnapCandidate(raw, 1, [farther, nearer])?.target.measurementId).toBe("nearer");
  });

  it("does not turn genuinely different nearby distances into a tie", () => {
    const raw = { x: 10, y: 10 };
    const exactFivePxSegment: SnapTarget = {
      kind: "segment",
      measurementId: "nearer-segment",
      measurementIndex: 1,
      primitiveIndex: 0,
      start: { x: 15, y: 0 },
      end: { x: 15, y: 20 },
    };
    const slightlyFartherVertex: SnapTarget = {
      kind: "vertex",
      measurementId: "farther-vertex",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 15.000000000000014, y: 10 },
    };

    expect(
      resolveSnapCandidate(raw, 1, [slightlyFartherVertex, exactFivePxSegment])?.target
        .measurementId,
    ).toBe("nearer-segment");
  });

  it("breaks equal-distance ties by vertex, measurement order, then primitive index", () => {
    const raw = { x: 10, y: 10 };
    const segment: SnapTarget = {
      kind: "segment",
      measurementId: "segment",
      measurementIndex: 0,
      primitiveIndex: 0,
      start: { x: 5, y: 8 },
      end: { x: 15, y: 8 },
    };
    const vertexLaterMeasurement: SnapTarget = {
      kind: "vertex",
      measurementId: "vertex-later",
      measurementIndex: 2,
      primitiveIndex: 0,
      point: { x: 10, y: 12 },
    };
    expect(resolveSnapCandidate(raw, 1, [segment, vertexLaterMeasurement])?.target.kind).toBe(
      "vertex",
    );

    const measurementOne: SnapTarget = {
      ...vertexLaterMeasurement,
      measurementId: "measurement-one",
      measurementIndex: 1,
      primitiveIndex: 1,
      point: { x: 8, y: 10 },
    };
    const measurementZero: SnapTarget = {
      ...measurementOne,
      measurementId: "measurement-zero",
      measurementIndex: 0,
      primitiveIndex: 5,
      point: { x: 12, y: 10 },
    };
    expect(resolveSnapCandidate(raw, 1, [measurementOne, measurementZero])?.target.measurementId).toBe(
      "measurement-zero",
    );

    const primitiveOne: SnapTarget = {
      ...measurementZero,
      measurementId: "same",
      primitiveIndex: 1,
      point: { x: 8, y: 10 },
    };
    const primitiveZero: SnapTarget = {
      ...primitiveOne,
      primitiveIndex: 0,
      point: { x: 12, y: 10 },
    };
    expect(resolveSnapCandidate(raw, 1, [primitiveOne, primitiveZero])?.target.primitiveIndex).toBe(0);
  });
});

describe("drawing point resolution", () => {
  it("leaves free drawing unchanged when Snap is off", () => {
    const raw = { x: 42, y: 73 };
    expect(resolveAtPagePoint(raw, { snapEnabled: false })?.point).toEqual(raw);
  });

  it("preserves Ortho-only behavior exactly when Snap is off", () => {
    const anchor = { x: 10, y: 10 };
    const raw = { x: 35, y: 16 };
    expect(
      resolveAtPagePoint(raw, {
        confirmedPoints: [anchor],
        snapEnabled: false,
        orthogonal: true,
      })?.point,
    ).toEqual(constrainOrthogonal(anchor, raw));
  });

  it("snaps the first point and returns feedback before a draft exists", () => {
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "existing",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 25, y: 25 },
    };
    const resolution = resolveAtPagePoint({ x: 29, y: 25 }, { targets: [target] });
    expect(resolution?.point).toEqual(target.point);
    expect(resolution?.snapMatch?.point).toEqual(target.point);
  });

  it("respects nonzero pan while keeping CSS-space tolerance constant", () => {
    const view = transform(2, 137, -41);
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "panned",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 105, y: 100 },
    };
    const resolution = resolveAtPagePoint(
      { x: 100, y: 100 },
      { transform: view, targets: [target] },
    );
    expect(resolution?.snapMatch?.target.measurementId).toBe("panned");
    expect(resolution?.snapMatch?.distanceScreenPx).toBeCloseTo(10, 12);
  });

  it("uses the original screen pointer for the exact 10 px production boundary", () => {
    const view = transform(0.1, 973.722312071624, 0);
    const rawPage = { x: 380.65569593270095, y: 100 };
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "exact-screen-distance",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 480.65569593270095, y: 100 },
    };
    const resolution = resolveAtPagePoint(rawPage, {
      transform: view,
      bounds: { width: 1000, height: 1000, rotation: 0 },
      targets: [target],
    });
    expect(resolution?.snapMatch?.target.measurementId).toBe("exact-screen-distance");
    expect(resolution?.snapMatch?.distanceScreenPx).toBeCloseTo(10, 12);
  });

  it("keeps a persisted screen-derived target at an exact intended 10 px inclusive", () => {
    const view = transform(0.135, 0, 0);
    const rawPointerScreen = { x: 30, y: 20 };
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "persisted-exact",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 40 / view.zoom, y: 20 / view.zoom },
    };
    const resolution = resolveDrawingPoint({
      measurementType: "line",
      confirmedPoints: [],
      rawPointerScreen,
      transform: view,
      bounds: { width: 1000, height: 1000, rotation: 0 },
      snapEnabled: true,
      orthogonal: false,
      targets: [target],
    });
    expect(resolution?.snapMatch?.target.measurementId).toBe("persisted-exact");
  });

  it("keeps an exact 10 px production boundary inclusive under a cancellation-prone pan", () => {
    const view = transform(5.052086315814703, -1476.9260697145432, 0);
    const rawPointerScreen = { x: 185.28909544579975, y: 100 };
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "exact-cancellation-prone",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: {
        x: (rawPointerScreen.x + SNAP_TOLERANCE_SCREEN_PX - view.panX) / view.zoom,
        y: (rawPointerScreen.y - view.panY) / view.zoom,
      },
    };
    const resolution = resolveDrawingPoint({
      measurementType: "line",
      confirmedPoints: [],
      rawPointerScreen,
      transform: view,
      bounds: { width: 1000, height: 1000, rotation: 0 },
      snapEnabled: true,
      orthogonal: false,
      targets: [target],
    });

    expect(resolution?.snapMatch?.target.measurementId).toBe("exact-cancellation-prone");
    expect(resolution?.snapMatch?.distanceScreenPx).toBeCloseTo(10, 12);
  });

  it("rejects a genuinely farther candidate instead of treating it as the 10 px boundary", () => {
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "strictly-outside",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 110.00000000000006, y: 100 },
    };
    const resolution = resolveDrawingPoint({
      measurementType: "line",
      confirmedPoints: [],
      rawPointerScreen: { x: 100, y: 100 },
      transform: transform(),
      bounds,
      snapEnabled: true,
      orthogonal: false,
      targets: [target],
    });

    expect(resolution?.snapMatch).toBeNull();
    expect(resolution?.point).toEqual({ x: 100, y: 100 });
  });

  it("applies deterministic tie-breaking when rendered round-trip distances are numerically equal", () => {
    const view = transform(0.1, 973.722312071624, 0);
    const rawPage = { x: 380.65569593270095, y: 100 };
    const earlier: SnapTarget = {
      kind: "vertex",
      measurementId: "earlier",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: rawPage.x + 20, y: rawPage.y },
    };
    const later: SnapTarget = {
      ...earlier,
      measurementId: "later",
      measurementIndex: 1,
      point: { x: rawPage.x - 20, y: rawPage.y },
    };
    expect(
      resolveAtPagePoint(rawPage, {
        transform: view,
        bounds: { width: 1000, height: 1000, rotation: 0 },
        targets: [earlier, later],
      })?.snapMatch?.target.measurementId,
    ).toBe("earlier");
  });

  it("does not apply measurement-order tie-breaking to merely close screen distances", () => {
    const view = transform(0.135, 0, 0);
    const rawPointerScreen = { x: 40, y: 20 };
    const earlier: SnapTarget = {
      kind: "vertex",
      measurementId: "earlier-persisted",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 47 / view.zoom, y: 20 / view.zoom },
    };
    const later: SnapTarget = {
      ...earlier,
      measurementId: "later-persisted",
      measurementIndex: 1,
      point: { x: 33 / view.zoom, y: 20 / view.zoom },
    };
    const resolution = resolveDrawingPoint({
      measurementType: "line",
      confirmedPoints: [],
      rawPointerScreen,
      transform: view,
      bounds: { width: 1000, height: 1000, rotation: 0 },
      snapEnabled: true,
      orthogonal: false,
      targets: [earlier, later],
    });
    expect(resolution?.snapMatch?.target.measurementId).toBe("later-persisted");
  });

  it("accepts an exact rendered page boundary without pulling an outside pointer inward", () => {
    const edgeBounds: LogicalPageBounds = {
      width: 612.3456789012345,
      height: 400,
      rotation: 0,
    };
    const view = transform(0.1, 953.3097783010155, 0);
    const rightEdgeScreen = pageToScreen({ x: edgeBounds.width, y: 200 }, view);
    const exactEdge = resolveDrawingPoint({
      measurementType: "line",
      confirmedPoints: [],
      rawPointerScreen: rightEdgeScreen,
      transform: view,
      bounds: edgeBounds,
      snapEnabled: false,
      orthogonal: false,
      targets: [],
    });
    expect(exactEdge?.point.x).toBe(edgeBounds.width);
    expect(
      resolveDrawingPoint({
        measurementType: "line",
        confirmedPoints: [],
        rawPointerScreen: { ...rightEdgeScreen, x: rightEdgeScreen.x + Number.EPSILON * 1024 },
        transform: view,
        bounds: edgeBounds,
        snapEnabled: false,
        orthogonal: false,
        targets: [],
      }),
    ).toBeNull();
  });

  it("does not pull an outside-page pointer back to a boundary target", () => {
    const edge: SnapTarget = {
      kind: "vertex",
      measurementId: "edge",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 0, y: 100 },
    };
    expect(resolveAtPagePoint({ x: -0.1, y: 100 }, { targets: [edge] })).toBeNull();
    expect(resolveAtPagePoint({ x: 0, y: 100 }, { targets: [edge] })?.point).toEqual(edge.point);
  });

  it("does not resolve an out-of-page candidate that is not visibly placeable", () => {
    const outsideTarget: SnapTarget = {
      kind: "vertex",
      measurementId: "outside",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: -1, y: 100 },
    };
    const resolution = resolveAtPagePoint({ x: 0, y: 100 }, { targets: [outsideTarget] });
    expect(resolution?.snapMatch).toBeNull();
    expect(resolution?.point).toEqual({ x: 0, y: 100 });
  });

  it("gives Polygon close precedence over a nearer generic Snap target", () => {
    const polygonPoints = [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 60 },
    ];
    const otherTarget: SnapTarget = {
      kind: "vertex",
      measurementId: "other",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 12, y: 10 },
    };
    const resolution = resolveAtPagePoint(
      { x: 11, y: 10 },
      {
        measurementType: "polygon",
        confirmedPoints: polygonPoints,
        targets: [otherTarget],
      },
    );
    expect(resolution?.closesPolygon).toBe(true);
    expect(resolution?.snapMatch).toBeNull();
  });

  it("keeps an exact 10 px Polygon-close gesture inclusive in screen space", () => {
    const view = transform(3.109945925352178, -1075.6588359675798, 0);
    const firstPointScreen = { x: 427.31804099756454, y: 200 };
    const firstPoint = {
      x: (firstPointScreen.x - view.panX) / view.zoom,
      y: (firstPointScreen.y - view.panY) / view.zoom,
    };
    const resolution = resolveDrawingPoint({
      measurementType: "polygon",
      confirmedPoints: [firstPoint, { x: 600, y: 200 }, { x: 600, y: 300 }],
      rawPointerScreen: { x: firstPointScreen.x + POLYGON_CLOSE_TOLERANCE_SCREEN_PX, y: 200 },
      transform: view,
      bounds: { width: 1000, height: 1000, rotation: 0 },
      snapEnabled: true,
      orthogonal: false,
      targets: [],
    });

    expect(resolution?.closesPolygon).toBe(true);
    expect(resolution?.snapMatch).toBeNull();
  });

  it("uses the same resolved point for preview geometry and click placement", () => {
    const draft = {
      type: "path" as const,
      measurementType: "polyline" as const,
      points: [{ x: 10, y: 10 }],
    };
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "existing",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 30, y: 10 },
    };
    const args = {
      measurementType: "polyline" as const,
      confirmedPoints: draft.points,
      rawPointerScreen: { x: 33, y: 13 },
      transform: transform(),
      bounds,
      snapEnabled: true,
      orthogonal: true,
      targets: [target],
    };
    const hoverResolution = resolveDrawingPoint(args)!;
    const clickResolution = resolveDrawingPoint(args)!;
    expect(clickResolution).toEqual(hoverResolution);
    expect(buildDraftPreviewPoints(draft, hoverResolution.point).at(-1)).toEqual(
      clickResolution.point,
    );
  });

  it("does not advertise snapping back to the current confirmed anchor", () => {
    const anchor = { x: 10, y: 10 };
    const anchorTarget: SnapTarget = {
      kind: "vertex",
      measurementId: "anchor",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: anchor,
    };
    const nextTarget: SnapTarget = {
      kind: "vertex",
      measurementId: "next",
      measurementIndex: 1,
      primitiveIndex: 0,
      point: { x: 17, y: 10 },
    };
    const withAlternative = resolveAtPagePoint(
      { x: 12, y: 10 },
      { confirmedPoints: [anchor], targets: [anchorTarget, nextTarget] },
    );
    expect(withAlternative?.snapMatch?.target.measurementId).toBe("next");
    expect(withAlternative?.point).toEqual(nextTarget.point);

    const onlyAnchor = resolveAtPagePoint(
      { x: 12, y: 10 },
      { confirmedPoints: [anchor], targets: [anchorTarget] },
    );
    expect(onlyAnchor?.snapMatch).toBeNull();
    expect(onlyAnchor?.point).toEqual({ x: 12, y: 10 });
  });
});

describe("Snap + Ortho", () => {
  const anchor = { x: 10, y: 10 };

  it("snaps to an exactly axis-compatible vertex", () => {
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "vertex",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 30, y: 10 },
    };
    expect(resolveSnapWithOrtho(anchor, { x: 32, y: 13 }, 1, [target])?.point).toEqual({
      x: 30,
      y: 10,
    });
  });

  it("snaps to the exact crossing of a segment and the selected axis", () => {
    const segment: SnapTarget = {
      kind: "segment",
      measurementId: "crossing",
      measurementIndex: 0,
      primitiveIndex: 0,
      start: { x: 28, y: 0 },
      end: { x: 28, y: 20 },
    };
    expect(resolveSnapWithOrtho(anchor, { x: 30, y: 13 }, 1, [segment])?.point).toEqual({
      x: 28,
      y: 10,
    });
  });

  it("uses the nearest valid point on a collinear segment", () => {
    const segment: SnapTarget = {
      kind: "segment",
      measurementId: "collinear",
      measurementIndex: 0,
      primitiveIndex: 0,
      start: { x: 20, y: 10 },
      end: { x: 40, y: 10 },
    };
    expect(resolveSnapWithOrtho(anchor, { x: 31, y: 13 }, 1, [segment])?.point).toEqual({
      x: 31,
      y: 10,
    });
  });

  it("keeps exact page-edge endpoints for Ortho collinear and crossing segments", () => {
    const rightEdge = 612.3456789012345;
    const edgeBounds: LogicalPageBounds = { width: rightEdge, height: 400, rotation: 0 };
    const edgeAnchor = { x: 500, y: 100 };
    const raw = { x: rightEdge, y: 101 };
    const collinear: SnapTarget = {
      kind: "segment",
      measurementId: "collinear-edge",
      measurementIndex: 0,
      primitiveIndex: 0,
      start: { x: 550, y: 100 },
      end: { x: rightEdge, y: 100 },
    };
    expect(resolveSnapWithOrtho(edgeAnchor, raw, 1, [collinear], edgeBounds)?.point).toEqual({
      x: rightEdge,
      y: 100,
    });

    const crossing: SnapTarget = {
      kind: "segment",
      measurementId: "crossing-edge",
      measurementIndex: 0,
      primitiveIndex: 1,
      start: { x: rightEdge - 20, y: 80 },
      end: { x: rightEdge, y: 100 },
    };
    expect(resolveSnapWithOrtho(edgeAnchor, raw, 1, [crossing], edgeBounds)?.point).toEqual({
      x: rightEdge,
      y: 100,
    });
  });

  it("ignores a nearer incompatible target and falls back to normal Ortho", () => {
    const incompatible: SnapTarget = {
      kind: "vertex",
      measurementId: "incompatible",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 30, y: 12 },
    };
    const raw = { x: 30, y: 13 };
    const resolution = resolveAtPagePoint(raw, {
      confirmedPoints: [anchor],
      orthogonal: true,
      targets: [incompatible],
    });
    expect(resolution?.snapMatch).toBeNull();
    expect(resolution?.point).toEqual({ x: 30, y: 10 });
  });

  it("ranks compatible candidates by distance from the raw pointer", () => {
    const raw = { x: 30, y: 18 };
    const fartherIntersection: SnapTarget = {
      kind: "segment",
      measurementId: "far-from-raw",
      measurementIndex: 0,
      primitiveIndex: 0,
      start: { x: 25, y: 0 },
      end: { x: 25, y: 20 },
    };
    const rawNearVertex: SnapTarget = {
      kind: "vertex",
      measurementId: "raw-near",
      measurementIndex: 1,
      primitiveIndex: 0,
      point: { x: 29, y: 10 },
    };
    expect(
      resolveSnapWithOrtho(anchor, raw, 1, [fartherIntersection, rawNearVertex])?.target
        .measurementId,
    ).toBe("raw-near");
  });

  it("rejects a candidate outside the raw-pointer tolerance even when near the Ortho point", () => {
    const raw = { x: 30, y: 21 };
    const segment: SnapTarget = {
      kind: "segment",
      measurementId: "axis-near-only",
      measurementIndex: 0,
      primitiveIndex: 0,
      start: { x: 30, y: 0 },
      end: { x: 30, y: 20 },
    };
    expect(resolveSnapWithOrtho(anchor, raw, 1, [segment])).toBeNull();
  });
});

describe("Snap interaction scope", () => {
  it("is active only for new measurement point placement", () => {
    expect(isSnapPointPlacementActive("line", false, false, false, false)).toBe(true);
    expect(isSnapPointPlacementActive("polyline", false, false, false, false)).toBe(true);
    expect(isSnapPointPlacementActive("polygon", false, false, false, false)).toBe(true);
    expect(isSnapPointPlacementActive("calibrate", false, false, false, false)).toBe(false);
    expect(isSnapPointPlacementActive("select", false, false, false, false)).toBe(false);
    expect(isSnapPointPlacementActive("hand", false, false, false, false)).toBe(false);
    expect(isSnapPointPlacementActive("line", true, false, false, false)).toBe(false);
    expect(isSnapPointPlacementActive("line", false, true, false, false)).toBe(false);
    expect(isSnapPointPlacementActive("line", false, false, true, false)).toBe(false);
    expect(isSnapPointPlacementActive("line", false, false, false, true)).toBe(false);
  });

  it("keeps Select-only vertex editing, whole dragging, and duplicate placement outside Snap", () => {
    expect(isSnapPointPlacementActive("select", false, false, false, false)).toBe(false);
  });

  it("drives first-point preview feedback from the production preview policy", () => {
    const view = transform();
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "existing",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 25, y: 25 },
    };
    const preview = resolveDrawingPreview({
      tool: "line",
      draft: null,
      rawPointerScreen: pageToScreen({ x: 29, y: 25 }, view),
      transform: view,
      bounds,
      snapEnabled: true,
      orthogonal: false,
      targets: [target],
      spacePan: false,
      isPanning: false,
      calibrationReferenceEditActive: false,
      measurementEditActive: false,
    });
    expect(preview?.snapMatch?.point).toEqual(target.point);
    expect(preview?.point).toEqual(target.point);
  });

  it("re-resolves a stationary raw pointer when Snap or Ortho changes", () => {
    const view = transform();
    const rawPage = { x: 33, y: 13 };
    const rawPointerScreen = pageToScreen(rawPage, view);
    const draft = {
      type: "path" as const,
      measurementType: "polyline" as const,
      points: [{ x: 10, y: 10 }],
    };
    const target: SnapTarget = {
      kind: "vertex",
      measurementId: "existing",
      measurementIndex: 0,
      primitiveIndex: 0,
      point: { x: 30, y: 10 },
    };
    const base = {
      tool: "polyline" as const,
      draft,
      rawPointerScreen,
      transform: view,
      bounds,
      targets: [target],
      spacePan: false,
      isPanning: false,
      calibrationReferenceEditActive: false,
      measurementEditActive: false,
    };

    expect(resolveDrawingPreview({ ...base, snapEnabled: false, orthogonal: false })?.point).toEqual(
      rawPage,
    );
    expect(resolveDrawingPreview({ ...base, snapEnabled: true, orthogonal: false })?.point).toEqual(
      target.point,
    );
    expect(resolveDrawingPreview({ ...base, snapEnabled: false, orthogonal: true })?.point).toEqual({
      x: 33,
      y: 10,
    });
    expect(resolveDrawingPreview({ ...base, snapEnabled: true, orthogonal: true })?.point).toEqual(
      target.point,
    );
  });

  it("suppresses production preview while placement is inactive", () => {
    const base = {
      tool: "line" as const,
      draft: null,
      rawPointerScreen: { x: 20, y: 20 },
      transform: transform(),
      bounds,
      snapEnabled: true,
      orthogonal: false,
      targets: [] as SnapTarget[],
      spacePan: false,
      isPanning: false,
      calibrationReferenceEditActive: false,
      measurementEditActive: false,
    };
    expect(resolveDrawingPreview({ ...base, spacePan: true })).toBeNull();
    expect(resolveDrawingPreview({ ...base, isPanning: true })).toBeNull();
    expect(resolveDrawingPreview({ ...base, calibrationReferenceEditActive: true })).toBeNull();
    expect(resolveDrawingPreview({ ...base, measurementEditActive: true })).toBeNull();
    expect(resolveDrawingPreview({ ...base, tool: "calibrate" })).toBeNull();
    expect(resolveDrawingPreview({ ...base, tool: "select" })).toBeNull();
  });
});
