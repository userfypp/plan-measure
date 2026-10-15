/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeasurementRow } from "./MeasurementRow";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderRow() {
  const onSelectMeasurement = vi.fn();
  const onToggleVisibility = vi.fn();
  act(() =>
    root!.render(
      <MeasurementRow
        viewModel={{
          id: "line-1",
          type: "line",
          name: "Hall length",
          typeLabel: "Line",
          valueLabel: "11.59 m",
          calibrationSummary: "Ground floor · Uniform",
          hasCalibration: true,
          visible: true,
          selected: false,
        }}
        onSelectMeasurement={onSelectMeasurement}
        onToggleVisibility={onToggleVisibility}
      />,
    ),
  );
  const row = container!.querySelector<HTMLElement>('[role="listitem"]')!;
  const control = (name: string) =>
    container!.querySelector<HTMLElement>(`[data-measurement-control="${name}"]`)!;
  return { row, control, onSelectMeasurement, onToggleVisibility };
}

function click(element: Element, init: MouseEventInit = {}) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
  });
}

describe("MeasurementRow", () => {
  it("selects the measurement from the empty space around the eye", () => {
    const { row, control, onSelectMeasurement, onToggleVisibility } = renderRow();
    const actions = control("visibility").parentElement!;

    click(actions);
    click(row, { shiftKey: true });

    expect(onSelectMeasurement.mock.calls).toEqual([
      ["line-1", false],
      ["line-1", true],
    ]);
    expect(onToggleVisibility).not.toHaveBeenCalled();
  });

  it("leaves its buttons to their own action", () => {
    const { control, onSelectMeasurement, onToggleVisibility } = renderRow();

    click(control("visibility").querySelector("svg") ?? control("visibility"));
    expect(onToggleVisibility).toHaveBeenCalledWith("line-1", false);
    expect(onSelectMeasurement).not.toHaveBeenCalled();

    click(control("selection"));
    expect(onSelectMeasurement).toHaveBeenCalledTimes(1);
  });
});
