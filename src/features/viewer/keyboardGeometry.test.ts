import { describe, expect, it } from "vitest";
import type { PathMeasurement, LogicalPageBounds, Measurement, Point } from "../../types/domain";
import {
  keyboardEditPreview,
  keyboardHitMeasurement,
  moveKeyboardCursor,
} from "./keyboardGeometry";
import type { SnapTarget } from "./snapping";

const bounds: LogicalPageBounds = { width: 100, height: 80, rotation: 0 };

function measurement(id: string, points: Point[], type: PathMeasurement["type"] = "line"): PathMeasurement {
  return {
    id,
    type,
    points,
    name: id,
    calibrationId: "scale",
    classificationValueIds: [],
    visible: true,
  };
}

function target(measurementId: string, point: Point): SnapTarget {
  return { kind: "vertex", measurementId, point, measurementIndex: 0, primitiveIndex: 0 };
}

function preview(
  measurements: Measurement[],
  overrides: Partial<Parameters<typeof keyboardEditPreview>[0]> = {},
) {
  return keyboardEditPreview({
    measurements,
    vertex: -1,
    origin: { x: 20, y: 20 },
    rawPoint: { x: 25, y: 25 },
    bounds,
    zoom: 1,
    snap: false,
    orthogonal: false,
    targets: [],
    ...overrides,
  });
}

describe("keyboard cursor", () => {
  it.each([0.5, 1, 2, 4])("moves by one or fifty screen pixels at zoom %s", (zoom) => {
    const origin = { x: 200, y: 200 };
    for (const [key, axis, direction] of [
      ["ArrowRight", "x", 1],
      ["ArrowLeft", "x", -1],
      ["ArrowDown", "y", 1],
      ["ArrowUp", "y", -1],
    ] as const) {
      for (const fast of [false, true]) {
        const moved = moveKeyboardCursor(origin, key, zoom, fast, {
          width: 400,
          height: 400,
          rotation: 0,
        });
        expect((moved[axis] - origin[axis]) * zoom).toBe(direction * (fast ? 50 : 1));
        expect(moved[axis === "x" ? "y" : "x"]).toBe(200);
      }
    }
    expect(origin).toEqual({ x: 200, y: 200 });
  });

  it("caps acceleration at sixteen precise or two hundred fast screen pixels", () => {
    const large = { width: 2000, height: 2000, rotation: 0 as const };
    for (const repeats of [15, 1000]) {
      expect(moveKeyboardCursor({ x: 500, y: 500 }, "ArrowRight", 2, false, large, repeats).x).toBe(
        508,
      );
      expect(moveKeyboardCursor({ x: 500, y: 500 }, "ArrowRight", 2, true, large, repeats).x).toBe(
        600,
      );
    }
  });

  it("clamps each page edge including rotation-aware bounds", () => {
    expect(moveKeyboardCursor({ x: 0, y: 0 }, "ArrowLeft", 1, true, bounds)).toEqual({
      x: 0,
      y: 0,
    });
    expect(moveKeyboardCursor({ x: 0, y: 0 }, "ArrowUp", 1, true, bounds)).toEqual({ x: 0, y: 0 });
    expect(moveKeyboardCursor({ x: 99, y: 79 }, "ArrowRight", 1, true, bounds)).toEqual({
      x: 100,
      y: 79,
    });
    expect(moveKeyboardCursor({ x: 99, y: 79 }, "ArrowDown", 1, true, bounds)).toEqual({
      x: 99,
      y: 80,
    });
    expect(
      moveKeyboardCursor({ x: 79, y: 99 }, "ArrowRight", 1, true, {
        width: 80,
        height: 100,
        rotation: 90,
      }),
    ).toEqual({ x: 80, y: 99 });
  });
});

describe("keyboard measurement selection", () => {
  it("uses screen-space tolerance and selects the topmost visible hit", () => {
    const first = measurement("first", [
      { x: 10, y: 20 },
      { x: 90, y: 20 },
    ]);
    const last = { ...first, id: "last" };
    const hidden = { ...first, id: "hidden", visible: false };
    expect(keyboardHitMeasurement([first, last, hidden], { x: 50, y: 24 }, 2)).toBe(last);
    expect(keyboardHitMeasurement([first], { x: 50, y: 24.1 }, 2)).toBeNull();
    expect(keyboardHitMeasurement([hidden], { x: 50, y: 20 }, 1)).toBeNull();
  });

  it("hits polygon interiors and closing edges without closing open polylines", () => {
    const points = [
      { x: 20, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 70 },
    ];
    const polygon = measurement("polygon", points, "polygon");
    const polyline = measurement("polyline", points, "polyline");
    expect(keyboardHitMeasurement([polygon], { x: 60, y: 30 }, 1)).toBe(polygon);
    expect(keyboardHitMeasurement([polygon], { x: 50, y: 45 }, 1)).toBe(polygon);
    expect(keyboardHitMeasurement([polyline], { x: 50, y: 45 }, 1)).toBeNull();
    expect(keyboardHitMeasurement([polyline], { x: 80, y: 45 }, 1)).toBe(polyline);
  });
});

describe("keyboard edit preview", () => {
  it("preserves geometry without raw movement despite nearby Snap targets or diagonal Ortho vertices", () => {
    const source = [
      measurement("a", [
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ]),
    ];
    const before = structuredClone(source);
    expect(
      preview(source, {
        origin: { x: 20, y: 20 },
        rawPoint: { x: 20, y: 20 },
        snap: true,
        targets: [target("outside", { x: 22, y: 20 })],
      }),
    ).toEqual(before);
    expect(
      preview(source, {
        vertex: 1,
        origin: { x: 30, y: 30 },
        rawPoint: { x: 30, y: 30 },
        orthogonal: true,
      }),
    ).toEqual(before);
    expect(source).toEqual(before);
  });

  it("translates an entire group rigidly with a shared boundary constraint and preserves source data", () => {
    const group = [
      measurement("a", [
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ]),
      measurement("b", [
        { x: 60, y: 50 },
        { x: 90, y: 70 },
      ]),
    ];
    const before = structuredClone(group);
    const result = preview(group, { rawPoint: { x: 90, y: 70 } });
    expect(result.map(({ points }) => points)).toEqual([
      [
        { x: 20, y: 20 },
        { x: 40, y: 40 },
      ],
      [
        { x: 70, y: 60 },
        { x: 100, y: 80 },
      ],
    ]);
    expect(group).toEqual(before);
    expect(result[0]?.calibrationId).toBe("scale");
  });

  it("edits only the chosen vertex of the first measurement and clamps it to the page", () => {
    const group = [
      measurement("a", [
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ]),
      measurement("b", [
        { x: 60, y: 50 },
        { x: 90, y: 70 },
      ]),
    ];
    const before = structuredClone(group);
    const result = preview(group, { vertex: 1, rawPoint: { x: 110, y: -5 } });
    expect(result[0]?.points).toEqual([
      { x: 10, y: 10 },
      { x: 100, y: 0 },
    ]);
    expect(result[1]).toEqual(group[1]);
    expect(group).toEqual(before);
  });

  it("excludes all edited measurements from snapping and can escape a nearby target with raw movement", () => {
    const group = [
      measurement("a", [
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ]),
      measurement("b", [
        { x: 50, y: 50 },
        { x: 60, y: 60 },
      ]),
    ];
    const ownTargets = [target("a", { x: 26, y: 25 }), target("b", { x: 25, y: 26 })];
    expect(preview(group, { snap: true, targets: ownTargets })[0]?.points[0]).toEqual({
      x: 15,
      y: 15,
    });
    const external = target("outside", { x: 30, y: 20 });
    expect(
      preview(group, { snap: true, rawPoint: { x: 29, y: 20 }, targets: [external] })[0]?.points[0],
    ).toEqual({ x: 20, y: 10 });
    expect(
      preview(group, { snap: true, rawPoint: { x: 41, y: 20 }, targets: [external] })[0]?.points[0],
    ).toEqual({ x: 31, y: 10 });
  });

  it("anchors orthogonal whole edits at the cursor origin and vertex edits at the preceding vertex", () => {
    const source = [
      measurement("a", [
        { x: 10, y: 10 },
        { x: 30, y: 30 },
      ]),
    ];
    expect(preview(source, { orthogonal: true, rawPoint: { x: 35, y: 24 } })[0]?.points).toEqual([
      { x: 25, y: 10 },
      { x: 45, y: 30 },
    ]);
    expect(
      preview(source, { vertex: 1, orthogonal: true, rawPoint: { x: 15, y: 40 } })[0]?.points,
    ).toEqual([
      { x: 10, y: 10 },
      { x: 10, y: 40 },
    ]);
    expect(
      preview(source, {
        vertex: 1,
        orthogonal: true,
        snap: true,
        rawPoint: { x: 39, y: 12 },
        targets: [target("other", { x: 40, y: 10 })],
      })[0]?.points[1],
    ).toEqual({ x: 40, y: 10 });
  });
});
