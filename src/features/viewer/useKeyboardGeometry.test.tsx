/* @vitest-environment jsdom */
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Measurement, PageState } from "../../types/domain";
import { useKeyboardGeometry } from "./useKeyboardGeometry";

type Options = Parameters<typeof useKeyboardGeometry>[0];
let root: Root;
let container: HTMLDivElement;
let result: ReturnType<typeof useKeyboardGeometry>;
let options: Options;
const line: Measurement = {
  id: "line",
  name: "Line",
  type: "line",
  visible: true,
  classificationValueIds: [],
  calibrationId: "scale",
  points: [
    { x: 20, y: 20 },
    { x: 80, y: 20 },
  ],
};

function Harness() {
  const current = useKeyboardGeometry(options);
  useLayoutEffect(() => {
    result = current;
  });
  return null;
}
function render(update: Partial<Options> = {}) {
  options = { ...options, ...update };
  act(() => root.render(<Harness />));
}
function press(key: string, shiftKey = false, repeat = false) {
  let handled = false;
  act(() => {
    handled = result.handleKeyDown(new KeyboardEvent("keydown", { key, shiftKey, repeat }));
  });
  return handled;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const page: PageState = {
    pageNumber: 1,
    calibrations: [],
    activeCalibrationId: null,
    nextCalibrationNumber: 1,
    nextMeasurementNumber: { line: 2, polygon: 1, polyline: 1 },
    measurements: [line],
  };
  options = {
    document: {},
    page,
    bounds: { width: 100, height: 100, rotation: 0 },
    transform: { zoom: 2, panX: 0, panY: 0 },
    screenCenter: { x: 100, y: 100 },
    tool: "select",
    draft: null,
    selectedIds: ["line"],
    disabled: false,
    editingBlocked: false,
    showMeasurements: true,
    snap: false,
    orthogonal: false,
    targets: [],
    referenceEdit: null,
    onReferenceChange: vi.fn(),
    onReferenceSave: vi.fn(),
    onReferenceCancel: vi.fn(),
    placePoint: vi.fn(),
    previewPoint: vi.fn(),
    select: vi.fn(),
    cancelPointerEdit: vi.fn(),
    commit: vi.fn(() => true),
    reportError: vi.fn(),
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  render();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("keyboard geometry interaction", () => {
  it("accelerates held arrows and resets precision on release, direction and modifier changes", () => {
    render({
      tool: "polygon",
      selectedIds: [],
      bounds: { width: 1000, height: 1000, rotation: 0 },
    });
    press("ArrowRight");
    expect(result.cursor!.x).toBe(50.5);
    press("ArrowRight", false, true);
    expect(result.cursor!.x).toBe(51.5);
    act(() => result.handleKeyUp(new KeyboardEvent("keyup", { key: "ArrowRight" })));
    press("ArrowRight", false, true);
    expect(result.cursor!.x).toBe(52);
    press("ArrowDown", false, true);
    expect(result.cursor!.y).toBe(50.5);
    press("ArrowDown", true, true);
    expect(result.cursor!.y).toBe(75.5);
    press("ArrowDown", true, true);
    expect(result.cursor!.y).toBe(105.5);
  });

  it("chooses a vertex explicitly and cycles with N without losing previous work", () => {
    press("e");
    act(() => result.chooseEditTarget(1));
    press("ArrowDown");
    expect(result.previewPage.measurements[0]!.points).toEqual([
      { x: 20, y: 20 },
      { x: 80, y: 20.5 },
    ]);
    press("n", true);
    expect(result.editTarget).toBe(0);
    press("ArrowRight");
    press("Enter");
    expect(options.commit).toHaveBeenCalledExactlyOnceWith([
      {
        pageNumber: 1,
        id: line.id,
        points: [
          { x: 20.5, y: 20 },
          { x: 80, y: 20.5 },
        ],
      },
    ]);
  });

  it("preserves a keyboard edit through its own cursor reveal pan", () => {
    const panned = { ...options.transform, panX: 50, panY: 40 };
    const revealPoint = vi.fn(() => panned);
    render({ revealPoint });
    press("e");
    expect(revealPoint).toHaveBeenCalledWith(line.points[0]);
    render({ transform: panned });
    expect(result.editing).toBe(true);
    press("ArrowRight", true);
    const preview = result.previewPage.measurements[0]!.points;
    expect(preview).not.toEqual(line.points);
    render({ transform: panned });
    expect(result.editing).toBe(true);
    press("Enter");
    expect(options.commit).toHaveBeenCalledExactlyOnceWith([
      { pageNumber: 1, id: line.id, points: preview },
    ]);
  });

  it("places points from a visible cursor without repeating Space placement", () => {
    render({ tool: "polygon", selectedIds: [] });
    expect(press("ArrowRight")).toBe(true);
    expect(result.cursor).toEqual({ x: 50.5, y: 50 });
    press(" ");
    press(" ", false, true);
    expect(options.placePoint).toHaveBeenCalledExactlyOnceWith({ x: 101, y: 100 });
    expect(options.commit).not.toHaveBeenCalled();
  });

  it("previews all arrow moves and commits once, with no changes on idle Enter", () => {
    press("e");
    press("Enter");
    expect(options.commit).not.toHaveBeenCalled();
    press("e");
    press("ArrowRight", true);
    press("ArrowDown");
    expect(options.commit).not.toHaveBeenCalled();
    expect(result.previewPage.measurements[0]!.points).toEqual([
      { x: 40, y: 20.5 },
      { x: 100, y: 20.5 },
    ]);
    press("Enter");
    expect(options.commit).toHaveBeenCalledExactlyOnceWith([
      {
        pageNumber: 1,
        id: "line",
        points: [
          { x: 40, y: 20.5 },
          { x: 100, y: 20.5 },
        ],
      },
    ]);
    expect(result.editing).toBe(false);
    expect(line.points).toEqual([
      { x: 20, y: 20 },
      { x: 80, y: 20 },
    ]);
  });

  it("keeps vertex changes when switching vertices before a single commit", () => {
    press("e");
    press("]");
    press("ArrowDown", true);
    press("]");
    press("ArrowUp", true);
    expect(result.previewPage.measurements[0]!.points).toEqual([
      { x: 20, y: 45 },
      { x: 80, y: 0 },
    ]);
    press("Enter");
    expect(options.commit).toHaveBeenCalledOnce();
  });

  it("cancels previews without committing and preserves original points", () => {
    press("e");
    press("ArrowLeft");
    press("Escape");
    expect(result.previewPage).toBe(options.page);
    expect(options.commit).not.toHaveBeenCalled();
    expect(result.editing).toBe(false);
  });

  it("rejects invalid geometry and lets the user correct or cancel the preview", () => {
    render({
      page: {
        ...options.page,
        measurements: [
          {
            ...line,
            points: [
              { x: 20, y: 20 },
              { x: 20.5, y: 20 },
            ],
          },
        ],
      },
    });
    press("e");
    press("]");
    press("ArrowRight");
    press("Enter");
    expect(options.reportError).toHaveBeenCalledOnce();
    expect(options.commit).not.toHaveBeenCalled();
    expect(result.editing).toBe(true);
    press("Escape");
    expect(result.editing).toBe(false);
  });

  it("cancels stale previews on zoom, selection, bounds and source geometry changes", () => {
    for (const update of [
      () => ({ transform: { ...options.transform, zoom: options.transform.zoom + 1 } }),
      () => ({ selectedIds: [] }),
      () => ({ bounds: { width: 110, height: 100, rotation: 0 as const } }),
      () => ({ page: { ...options.page, measurements: [...options.page.measurements] } }),
    ]) {
      render({ selectedIds: ["line"] });
      press("e");
      press("ArrowRight");
      expect(result.editing).toBe(true);
      render(update());
      expect(result.editing).toBe(false);
    }
    expect(options.commit).not.toHaveBeenCalled();
  });

  it("previews a rigid group and saves its members in one atomic command", () => {
    render({
      page: {
        ...options.page,
        measurements: [
          line,
          {
            ...line,
            id: "other",
            points: [
              { x: 40, y: 40 },
              { x: 90, y: 40 },
            ],
          },
        ],
      },
      selectedIds: ["line", "other"],
    });
    press("e");
    press("ArrowRight", true);
    press("ArrowRight", true);
    press("ArrowRight", true);
    expect(result.previewPage.measurements.map(({ points }) => points[0]?.x)).toEqual([30, 50]);
    press("Enter");
    expect(options.commit).toHaveBeenCalledOnce();
    expect(vi.mocked(options.commit).mock.calls[0]![0]).toHaveLength(2);
  });

  it("supports additive cursor selection and respects hidden measurements", () => {
    render({ selectedIds: [], screenCenter: { x: 80, y: 40 } });
    press("ArrowRight");
    press(" ", true);
    expect(options.select).toHaveBeenCalledExactlyOnceWith("line", true);
    render({ showMeasurements: false });
    press(" ");
    expect(options.select).toHaveBeenCalledOnce();
  });

  it("uses the existing scale-reference Save and Cancel callbacks", () => {
    render({
      referenceEdit: {
        calibrationId: "scale",
        reference: "uniform",
        points: [
          { x: 20, y: 20 },
          { x: 80, y: 20 },
        ],
        valid: true,
      },
    });
    press("ArrowDown");
    expect(options.onReferenceChange).toHaveBeenCalledWith([
      { x: 20, y: 20.5 },
      { x: 80, y: 20 },
    ]);
    press("]");
    press("ArrowRight");
    expect(options.onReferenceChange).toHaveBeenLastCalledWith([
      { x: 20, y: 20 },
      { x: 80.5, y: 20 },
    ]);
    press("Enter");
    press("Enter", false, true);
    expect(options.onReferenceSave).toHaveBeenCalledOnce();
    press("Escape");
    expect(options.onReferenceCancel).toHaveBeenCalledOnce();
    expect(options.commit).not.toHaveBeenCalled();
  });

  it("does not author points while the viewer lacks usable space", () => {
    render({ disabled: true, tool: "line" });
    expect(press("ArrowRight")).toBe(false);
    expect(press(" ")).toBe(false);
    expect(options.placePoint).not.toHaveBeenCalled();
  });
});
