/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeasurementViewModel } from "./measurementViewModels";
import { MeasurementCollection } from "./MeasurementCollection";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const measurements: Array<MeasurementViewModel & { selected: boolean }> = [
  {
    id: "line-1",
    type: "line",
    name: "Line 1",
    typeLabel: "Line",
    valueLabel: "1.00 m",
    calibrationSummary: "Scale 1 · Uniform",
    hasCalibration: true,
    visible: true,
    selected: true,
  },
  {
    id: "line-2",
    type: "line",
    name: "Line 2",
    typeLabel: "Line",
    valueLabel: "2.00 m",
    calibrationSummary: "Scale 1 · Uniform",
    hasCalibration: true,
    visible: true,
    selected: false,
  },
  {
    id: "polygon-1",
    type: "polygon",
    name: "Polygon 1",
    typeLabel: "Polygon",
    valueLabel: "P 4.00 m · A 1.00 m²",
    calibrationSummary: "Scale 1 · Uniform",
    hasCalibration: true,
    visible: true,
    selected: false,
  },
];

function renderCollection(
  list = measurements,
  onSelectMeasurement = vi.fn(),
  onToggleVisibility = vi.fn(),
) {
  act(() =>
    root!.render(
      <MeasurementCollection
        measurements={list}
        emptyMessage="Empty"
        onSelectMeasurement={onSelectMeasurement}
        onToggleVisibility={onToggleVisibility}
      />,
    ),
  );
  return { onSelectMeasurement, onToggleVisibility };
}

function renderGroupedCollection() {
  act(() =>
    root!.render(
      <MeasurementCollection
        measurements={measurements}
        emptyMessage="Empty"
        onSelectMeasurement={vi.fn()}
        onToggleVisibility={vi.fn()}
        groupByDimensionId="trade"
        groups={[
          {
            key: "dimension:trade:value:first",
            label: "First",
            archived: false,
            measurementIds: ["line-1"],
            visibility: "visible",
          },
          {
            key: "dimension:trade:value:second",
            label: "Second",
            archived: false,
            measurementIds: ["line-2", "polygon-1"],
            visibility: "visible",
          },
        ]}
        onSetMeasurementsVisibility={vi.fn()}
      />,
    ),
  );
}

function control(measurementId: string, kind: "selection" | "visibility"): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(
    `[data-measurement-id="${measurementId}"][data-measurement-control="${kind}"]`,
  );
  if (!button) throw new Error(`Missing ${kind} control for ${measurementId}`);
  return button;
}

function press(key: string) {
  act(() =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    ),
  );
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll('[role="tooltip"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("MeasurementCollection keyboard model", () => {
  it("exposes one Tab stop for the measurement list rather than one stop per row action", () => {
    renderCollection();
    const rowControls = Array.from(
      container!.querySelectorAll<HTMLButtonElement>("[data-measurement-control]"),
    );
    expect(rowControls.filter((button) => button.tabIndex === 0)).toEqual([
      control("line-1", "selection"),
    ]);
    expect(rowControls.every((button) => button.tabIndex <= 0)).toBe(true);
  });

  it("uses vertical arrows for rows and horizontal arrows for the row action", () => {
    renderCollection();
    act(() => control("line-1", "selection").focus());

    press("ArrowDown");
    expect(document.activeElement).toBe(control("line-2", "selection"));
    press("ArrowRight");
    expect(document.activeElement).toBe(control("line-2", "visibility"));
    press("ArrowDown");
    expect(document.activeElement).toBe(control("polygon-1", "visibility"));
    press("ArrowLeft");
    expect(document.activeElement).toBe(control("polygon-1", "selection"));
    press("Home");
    expect(document.activeElement).toBe(control("line-1", "selection"));
    press("End");
    expect(document.activeElement).toBe(control("polygon-1", "selection"));

    const rowControls = Array.from(
      container!.querySelectorAll<HTMLButtonElement>("[data-measurement-control]"),
    );
    expect(rowControls.filter((button) => button.tabIndex === 0)).toEqual([
      control("polygon-1", "selection"),
    ]);
  });

  it("keeps Enter/Space native activation semantics for selection and visibility", () => {
    const callbacks = renderCollection();
    act(() => control("line-2", "selection").click());
    act(() => control("line-2", "visibility").click());
    expect(callbacks.onSelectMeasurement).toHaveBeenCalledWith("line-2");
    expect(callbacks.onToggleVisibility).toHaveBeenCalledWith("line-2", false);
  });

  it("repairs the single Tab stop when the remembered row disappears", () => {
    renderCollection();
    act(() => control("line-2", "selection").focus());
    renderCollection(measurements.filter((measurement) => measurement.id !== "line-2"));

    const rowControls = Array.from(
      container!.querySelectorAll<HTMLButtonElement>("[data-measurement-control]"),
    );
    expect(rowControls.filter((button) => button.tabIndex === 0)).toEqual([
      control("line-1", "selection"),
    ]);
  });

  it("moves the single row Tab stop to a visible group when its remembered group collapses", () => {
    renderGroupedCollection();
    const collapseFirst = Array.from(container!.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.getAttribute("aria-label") === "Collapse First group",
    );
    if (!collapseFirst) throw new Error("First group toggle was not rendered.");

    act(() => collapseFirst.click());

    expect(control("line-1", "selection").closest("[hidden]")).not.toBeNull();
    const visibleRowControls = Array.from(
      container!.querySelectorAll<HTMLButtonElement>("[data-measurement-control]"),
    ).filter((button) => !button.closest("[hidden]"));
    expect(visibleRowControls.filter((button) => button.tabIndex === 0)).toEqual([
      control("line-2", "selection"),
    ]);
  });
});
