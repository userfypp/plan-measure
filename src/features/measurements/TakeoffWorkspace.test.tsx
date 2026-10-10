/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../../app/sessionState";
import type { Measurement } from "../../types/domain";
import { TakeoffWorkspace } from "./TakeoffWorkspace";

let container: HTMLDivElement;
let root: Root;
function fixture() {
  const session = createEmptySession({ name: "Plan.pdf", size: 1, lastModified: 1 }, 2);
  session.classificationCatalog.dimensions = [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [{ id: "old", name: "Old", archived: true }],
    },
  ];
  for (const page of Object.values(session.pages))
    page.calibrations = [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    ];
  const measurement = (id: string, overrides: Partial<Measurement> = {}): Measurement => ({
    id,
    name: id,
    type: "line",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    calibrationId: "scale",
    classificationValueIds: [],
    visible: true,
    ...overrides,
  });
  session.pages[1]!.measurements = [
    measurement("Visible", { classificationValueIds: ["old"] }),
    measurement("Missing", { calibrationId: "gone" }),
  ];
  session.pages[2]!.measurements = [
    measurement("Hidden", { visible: false, classificationValueIds: ["old"] }),
  ];
  return session;
}
function button(label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}
function choose(value: string) {
  act(() => {
    const select = container.querySelector<HTMLSelectElement>("#takeoff-breakdown")!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function render(session = fixture(), blocked = false, onOpen = vi.fn()) {
  act(() =>
    root.render(
      <TakeoffWorkspace
        pages={session.pages}
        catalog={session.classificationCatalog}
        displayUnit="m"
        decimalPlaces={2}
        areaDisplay="auto"
        pageLabelOverrides={{ 2: "Upper floor" }}
        sourcePageLabels={null}
        onOpenMeasurement={onOpen}
        navigationBlocked={blocked}
      />,
    ),
  );
  return onOpen;
}
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
});

describe("Takeoff source measurements", () => {
  it("opens project sources, including hidden and excluded entries, using their page and ID", () => {
    const onOpen = render();
    act(() => button("Show measurements in Project totals").click());
    expect(container.querySelectorAll('[aria-label="Source measurements"] li')).toHaveLength(3);
    expect(container.textContent).toContain("Upper floor · Hidden");
    expect(container.textContent).toContain("Assigned scale is missing.");
    act(() => button("Open Hidden on page 2").click());
    expect(onOpen).toHaveBeenCalledWith(2, "Hidden");
    act(() => button("Hide measurements in Project totals").click());
    expect(container.querySelector('[aria-label="Source measurements"]')).toBeNull();
  });
  it("uses exact page, type, archived and unassigned group membership and resets expansion on breakdown changes", () => {
    render();
    choose("classification");
    act(() => button("Show measurements in Old").click());
    expect(container.querySelectorAll('[aria-label="Source measurements"] li')).toHaveLength(2);
    expect(button("Open Missing on page 1")).toBeNull();
    act(() => button("Show measurements in None assigned").click());
    expect(container.querySelectorAll('[aria-label="Source measurements"] li')).toHaveLength(1);
    expect(button("Open Missing on page 1")).not.toBeNull();
    choose("page");
    expect(container.querySelector('[aria-label="Source measurements"]')).toBeNull();
    act(() => button("Show measurements in Upper floor").click());
    expect(container.querySelectorAll('[aria-label="Source measurements"] li')).toHaveLength(1);
    choose("type");
    act(() => button("Show measurements in Line").click());
    expect(container.querySelectorAll('[aria-label="Source measurements"] li')).toHaveLength(3);
  });
  it("inspects only excluded measurements and removes the notice after repair", () => {
    const session = fixture();
    render(session);
    act(() => button("Inspect excluded measurements").click());
    expect(container.querySelectorAll('[aria-label="Source measurements"] li')).toHaveLength(1);
    expect(container.textContent).toContain("Assigned scale is missing.");
    session.pages[1] = {
      ...session.pages[1]!,
      measurements: session.pages[1]!.measurements.map((m) => ({ ...m, calibrationId: "scale" })),
    };
    render({ ...session, pages: { ...session.pages } });
    expect(button("Inspect excluded measurements")).toBeNull();
    expect(container.querySelector('[aria-label="Source measurements"]')).toBeNull();
  });
  it("keeps source navigation disabled while an edit is pending", () => {
    const onOpen = render(fixture(), true);
    act(() => button("Show measurements in Project totals").click());
    expect(button("Open Hidden on page 2").disabled).toBe(true);
    act(() => button("Open Hidden on page 2").click());
    expect(onOpen).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Finish or cancel the current edit");
  });
});
