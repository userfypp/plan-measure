/* @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeasurementGroup } from "./MeasurementGroup";

const measurementGroupCss = readFileSync(
  resolve(import.meta.dirname, "MeasurementGroup.module.css"),
  "utf8",
);

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

function renderGroup(depth?: number) {
  const onToggleCollapsed = vi.fn();
  const onSetMeasurementsVisibility = vi.fn();
  act(() =>
    root!.render(
      <MeasurementGroup
        depth={depth}
        group={{
          key: "dimension:trade:value:electrical",
          dimensionLabel: "Trade",
          label: "Electrical",
          archived: false,
          unassigned: false,
          measurementIds: ["line-1"],
          visibility: "visible",
        }}
        measurements={[]}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        onSelectMeasurement={() => undefined}
        onToggleVisibility={() => undefined}
        onSetMeasurementsVisibility={onSetMeasurementsVisibility}
      />,
    ),
  );
  const header = container!.querySelector("header")!;
  const section = container!.querySelector("section")!;
  return { header, section, onToggleCollapsed, onSetMeasurementsVisibility };
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("MeasurementGroup header", () => {
  it("makes only a root group a block of its own", () => {
    // A root group takes the block class beside the group class; a subgroup stays inside its block.
    expect(renderGroup().section.classList).toHaveLength(2);
    expect(renderGroup(0).section.classList).toHaveLength(2);
    expect(renderGroup(1).section.classList).toHaveLength(1);
  });

  it("raises the block holding the focus above the ones after it", () => {
    // The next block opens with an opaque strip that would cut the focus ring of a collapsed group.
    expect(measurementGroupCss).toMatch(
      /\.rootGroup:focus-within\s*\{[^}]*z-index:\s*var\(--z-raised\);/s,
    );
  });

  it("toggles from its title, count and empty space", () => {
    const { header, onToggleCollapsed } = renderGroup();

    click(header.querySelector("h3 span")!);
    click(header.querySelector('[aria-label="1 measurements"]')!);
    click(header);

    expect(onToggleCollapsed).toHaveBeenCalledTimes(3);
  });

  it("leaves its buttons to their own action", () => {
    const { header, onToggleCollapsed, onSetMeasurementsVisibility } = renderGroup();

    click(header.querySelector('[aria-label="Collapse Trade · Electrical group"] svg')!);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);

    click(header.querySelector("[data-group-visibility]")!);
    expect(onSetMeasurementsVisibility).toHaveBeenCalledWith(["line-1"], false);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("lights the chevron while the pointer is over the rest of the header", () => {
    expect(measurementGroupCss).toMatch(
      /\.header\s*\{[^}]*cursor:\s*pointer;[^}]*user-select:\s*none;/s,
    );
    expect(measurementGroupCss).toMatch(
      /\.toggle:hover,\s*\.header:hover:not\(:has\(\.visibilityControl:hover\)\) \.toggle\s*\{/,
    );
  });
});
