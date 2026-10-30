/* @vitest-environment jsdom */
import { chooseSelectOption, selectOptionLabels } from "../../components/ui/selectTestUtils";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KeyboardGeometryHelp } from "./KeyboardGeometryHelp";
import type { Measurement } from "../../types/domain";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  const tokens = readFileSync(resolve(import.meta.dirname, "../../styles/tokens.css"), "utf8");
  // jsdom does not resolve var(), so inline the z-index tokens the stylesheet references.
  stylesheet.textContent = readFileSync(
    resolve(import.meta.dirname, "PdfViewer.module.css"),
    "utf8",
  ).replace(
    /var\((--z-[a-z-]+)\)/g,
    (_match: string, name: string) => new RegExp(`${name}: (\\d+);`).exec(tokens)![1]!,
  );
  document.head.append(stylesheet);
  try {
    const help = document.createElement("div");
    help.className = "keyboardFeedback";
    container.append(help);
    const helpLayer = Number(getComputedStyle(help).zIndex);
    expect(getComputedStyle(help).cursor).toBe("auto");
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
  const select = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  expect(select.getAttribute("aria-label")).toContain("Edit Line 1");
  expect(selectOptionLabels(select)).toEqual([
    "Whole measurement",
    "Vertex 1 of 2",
    "Vertex 2 of 2",
  ]);
  chooseSelectOption(select, "Vertex 1 of 2");
  expect(onTargetChange).toHaveBeenCalledExactlyOnceWith(0);
  expect(onReturnToViewer).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("N: next point");
});
it("explains group movement without exposing an ambiguous vertex selector", () => {
  render(true, null);
  expect(container.querySelector('button[aria-haspopup="menu"]')).toBeNull();
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
  const select = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  expect(selectOptionLabels(select)).toEqual(["Start point", "End point"]);
  chooseSelectOption(select, "End point");
  expect(onTargetChange).toHaveBeenCalledExactlyOnceWith(1);
});

it("offers each corner and each side of a rectangle", () => {
  render(true, {
    ...measurement,
    id: "box",
    name: "Rectangle 1",
    type: "rectangle",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ],
  });
  const select = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  expect(selectOptionLabels(select)).toEqual([
    "Whole measurement",
    "Corner 1 of 4",
    "Corner 2 of 4",
    "Corner 3 of 4",
    "Corner 4 of 4",
    "Top side",
    "Right side",
    "Bottom side",
    "Left side",
  ]);
  chooseSelectOption(select, "Bottom side");
  expect(onTargetChange).toHaveBeenCalledExactlyOnceWith(6);
});
