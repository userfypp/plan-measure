/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassificationCatalog, Measurement } from "../../types/domain";
import { MeasurementClassificationMenu } from "./MeasurementClassificationMenu";

let root: Root;
let container: HTMLDivElement;
const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [
        { id: "old", name: "Old", archived: true },
        { id: "new", name: "New", archived: false },
      ],
    },
  ],
};
const measurements: Measurement[] = ["one", "two"].map((id, index) => ({
  id,
  name: id,
  type: "line",
  calibrationId: "scale",
  visible: index === 0,
  classificationValueIds: index === 0 ? ["old"] : [],
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
}));

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(selectedCatalog = catalog) {
  const onEdit = vi.fn(() => true);
  act(() =>
    root.render(
      <MeasurementClassificationMenu
        measurements={measurements}
        catalog={selectedCatalog}
        onEdit={onEdit}
      />,
    ),
  );
  act(() => container.querySelector<HTMLButtonElement>("button")!.click());
  return onEdit;
}
function openField(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  act(() => button.click());
  return button;
}
function choose(label: string) {
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find(
    (item) => item.textContent?.trim() === label,
  )!;
  act(() => option.click());
  return option;
}

describe("measurement classification menu", () => {
  it("shows mixed values without changing assignments, applies a common value, and clears the dimension", () => {
    const onEdit = render();
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
      "Apply to 2 selected measurements.",
    );
    openField("Trade: Mixed values");
    expect(onEdit).not.toHaveBeenCalled();
    const archived = Array.from(document.querySelectorAll('[role="menuitemradio"]')).find(
      (item) => item.textContent?.trim() === "Old (archived)",
    )!;
    expect(archived.getAttribute("aria-disabled")).toBe("true");
    choose("New");
    expect(onEdit).toHaveBeenLastCalledWith({
      measurementIds: ["one", "two"],
      operation: { type: "classification", dimensionId: "trade", valueId: "new" },
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    openField("Trade: Mixed values");
    choose("Unclassified");
    expect(onEdit).toHaveBeenLastCalledWith({
      measurementIds: ["one", "two"],
      operation: { type: "classification", dimensionId: "trade", valueId: null },
    });
  });

  it("allows removing archived assignments but prevents assigning archived values", () => {
    const onEdit = render({ dimensions: [{ ...catalog.dimensions[0]!, archived: true }] });
    openField("Trade: Mixed values");
    choose("Old (archived)");
    expect(onEdit).not.toHaveBeenCalled();
    choose("Unclassified");
    expect(onEdit).toHaveBeenCalledWith({
      measurementIds: ["one", "two"],
      operation: { type: "classification", dimensionId: "trade", valueId: null },
    });
  });

  it("closes only the value menu on Escape and restores focus to its field", () => {
    render();
    const trigger = openField("Trade: Mixed values");
    act(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves complete long labels in the accessible triggers and options", () => {
    const dimensionName = "Dimension".repeat(30),
      valueName = "Value".repeat(100);
    render({
      dimensions: [
        {
          ...catalog.dimensions[0]!,
          name: dimensionName,
          values: [{ id: "new", name: valueName, archived: false }],
        },
      ],
    });
    openField(`${dimensionName}: Unclassified`);
    const option = Array.from(document.querySelectorAll('[role="menuitemradio"]')).find(
      (item) => item.textContent === valueName,
    );
    expect(option).toBeTruthy();
  });
});
