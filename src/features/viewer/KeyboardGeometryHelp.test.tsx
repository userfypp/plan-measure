/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KeyboardGeometryHelp } from "./KeyboardGeometryHelp";
import type { Measurement } from "../../types/domain";
// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";

let root: Root;
let container: HTMLDivElement;
const measurement: Measurement = {
  id: "line",
  name: "Line 1",
  type: "line",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  visible: true,
  classificationValueIds: [],
  calibrationId: "scale",
};
const onTargetChange = vi.fn();
const onReturnToViewer = vi.fn();
function render(editing = false, selected: Measurement | null = measurement) {
  act(() =>
    root.render(
      <KeyboardGeometryHelp
        editing={editing}
        measurement={selected}
        target={-1}
        onTargetChange={onTargetChange}
        onReturnToViewer={onReturnToViewer}
        helpRef={null}
      />,
    ),
  );
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});
it("keeps help visible past notification timeout and dismisses only on explicit action", () => {
  vi.useFakeTimers();
  render();
  act(() => vi.advanceTimersByTime(60000));
  expect(container.textContent).toContain("To edit: select a measurement");
  act(() => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(container.textContent).toBe("");
  expect(onReturnToViewer).toHaveBeenCalledOnce();
  render(true);
  expect(container.textContent).toBe("");
});
it("paints both viewer cursors above the help without intercepting its controls", () => {
  const stylesheet = document.createElement("style");
  stylesheet.textContent = readFileSync("src/features/viewer/PdfViewer.module.css", "utf8");
  document.head.append(stylesheet);
  try {
    const help = document.createElement("div");
    help.className = "keyboardFeedback";
    container.append(help);
    const helpLayer = Number(getComputedStyle(help).zIndex);
    expect(getComputedStyle(help).cursor).toBe("auto");
    const button = document.createElement("button");
    help.append(button);
    expect(getComputedStyle(button).cursor).toBe("pointer");
    for (const className of ["keyboardCursor", "softwareCursor"]) {
      const cursor = document.createElement("div");
      cursor.className = className;
      container.append(cursor);
      const style = getComputedStyle(cursor);
      expect(Number(style.zIndex)).toBeGreaterThan(helpLayer);
      expect(style.pointerEvents).toBe("none");
    }
  } finally {
    stylesheet.remove();
  }
});
it("exposes whole-measurement and vertex editing as accessible explicit choices", () => {
  render(true);
  const select = container.querySelector("select")!;
  expect(select.labels![0]!.textContent).toContain("Edit Line 1");
  expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
    "Whole measurement",
    "Vertex 1 of 2",
    "Vertex 2 of 2",
  ]);
  act(() => {
    select.value = "1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onTargetChange).toHaveBeenCalledExactlyOnceWith(1);
  expect(onReturnToViewer).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("N: next point");
});
it("explains group movement without exposing an ambiguous vertex selector", () => {
  render(true, null);
  expect(container.querySelector("select")).toBeNull();
  expect(container.textContent).toContain("Moving all selected measurements together");
});

it("provides explicit reference endpoints without offering whole-measurement movement", () => {
  act(() =>
    root.render(
      <KeyboardGeometryHelp
        editing={false}
        referenceEditing
        measurement={null}
        target={0}
        onTargetChange={onTargetChange}
        onReturnToViewer={onReturnToViewer}
        helpRef={null}
      />,
    ),
  );
  const select = container.querySelector("select")!;
  expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
    "Start point",
    "End point",
  ]);
  act(() => {
    select.value = "1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onTargetChange).toHaveBeenCalledExactlyOnceWith(1);
});
