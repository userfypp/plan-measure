/* @vitest-environment jsdom */
import { chooseSelectOption } from "../../components/ui/selectTestUtils";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../../app/sessionState";
import type { PageCalibration, PathMeasurement } from "../../types/domain";
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
  const measurement = (id: string, overrides: Partial<PathMeasurement> = {}): PathMeasurement => ({
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
function largeFixture(count: number) {
  const session = fixture();
  const source = session.pages[1]!.measurements[0]! as PathMeasurement;
  const split = Math.ceil(count / 2);
  for (const pageNumber of [1, 2]) {
    const start = pageNumber === 1 ? 0 : split;
    const end = pageNumber === 1 ? split : count;
    session.pages[pageNumber]!.measurements = Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset;
      return {
        ...source,
        id: `source-${index}`,
        name: `Source ${index}`,
        visible: pageNumber === 1,
        calibrationId: index === count - 1 ? "gone" : "scale",
      };
    });
  }
  return session;
}
function sourceRows() {
  return container.querySelectorAll('[aria-label="Source measurements"] li');
}
function button(label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}
const BREAKDOWN_LABELS: Record<string, string> = {
  none: "None",
  page: "Page",
  type: "Type",
  classification: "Classification",
};
function choose(value: string) {
  chooseSelectOption(
    container.querySelector<HTMLButtonElement>("#takeoff-breakdown")!,
    BREAKDOWN_LABELS[value]!,
  );
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
  it("bounds 5,000 source rows and reaches the last hidden, excluded measurement", () => {
    const onOpen = render(largeFixture(5000));
    act(() => button("Show measurements in Project totals").click());
    expect(sourceRows()).toHaveLength(50);
    expect(button("Previous source measurements").disabled).toBe(true);
    expect(
      container.querySelector('[aria-label="Source measurement pages"]')!.textContent,
    ).toContain("1–50 of 5000");
    for (let page = 1; page < 100; page++) {
      act(() => button("Next source measurements").click());
      expect(sourceRows()).toHaveLength(50);
    }
    expect(button("Next source measurements").disabled).toBe(true);
    expect(container.textContent).toContain("4951–5000 of 5000");
    expect(container.textContent).toContain("Upper floor · Hidden");
    expect(container.textContent).toContain("Assigned scale is missing.");
    act(() => button("Open Source 4999 on page 2").click());
    expect(onOpen).toHaveBeenCalledWith(2, "source-4999");
    act(() => button("Previous source measurements").click());
    expect(container.textContent).toContain("4901–4950 of 5000");
  });
  it("preserves the source page across unrelated renders, clamps shrinking lists and resets scope", () => {
    const session = largeFixture(120);
    const onOpen = render(session);
    act(() => button("Show measurements in Project totals").click());
    act(() => button("Next source measurements").click());
    act(() => button("Next source measurements").click());
    expect(sourceRows()).toHaveLength(20);
    render(session, true, onOpen);
    expect(container.textContent).toContain("101–120 of 120");
    expect(button("Open Source 100 on page 2").disabled).toBe(true);
    act(() => button("Open Source 100 on page 2").click());
    expect(onOpen).not.toHaveBeenCalled();
    const smaller = {
      ...session,
      pages: {
        ...session.pages,
        2: { ...session.pages[2]!, measurements: session.pages[2]!.measurements.slice(0, 10) },
      },
    };
    render(smaller);
    expect(container.textContent).toContain("51–70 of 70");
    expect(sourceRows()).toHaveLength(20);
    render(session);
    expect(container.textContent).toContain("51–100 of 120");
    choose("page");
    act(() => button("Show measurements in Page 1").click());
    expect(container.textContent).toContain("1–50 of 60");
    act(() => button("Next source measurements").click());
    act(() => button("Show measurements in Upper floor").click());
    expect(container.textContent).toContain("1–50 of 60");
    expect(button("Open Source 60 on page 2")).not.toBeNull();
    act(() => button("Inspect excluded measurements").click());
    expect(sourceRows()).toHaveLength(1);
    expect(button("Open Source 119 on page 2")).not.toBeNull();
    expect(container.querySelector('[aria-label="Source measurement pages"]')).toBeNull();
  });
  it("places Count after physical quantities in project totals and page breakdowns", () => {
    const session = fixture();
    session.pages[1]!.measurements.push(
      {
        id: "polygon",
        name: "Room",
        type: "polygon",
        calibrationId: "scale",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        visible: true,
        classificationValueIds: [],
      },
      {
        id: "count",
        name: "Plugs",
        type: "count",
        calibrationId: null,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        visible: true,
        classificationValueIds: [],
      },
    );
    render(session);
    const labels = (section: Element) =>
      Array.from(section.querySelectorAll("dt"), (dt) => dt.textContent);
    expect(labels(container.querySelector('[aria-labelledby="project-totals-heading"]')!)).toEqual([
      "Length",
      "Perimeter",
      "Area",
      "Count",
    ]);
    choose("page");
    expect(labels(container.querySelector('[aria-label="Page 1 totals"]')!)).toEqual([
      "Length",
      "Perimeter",
      "Area",
      "Count",
    ]);
  });
  it("keeps scope information at the foot of the workspace and source access beside the heading", () => {
    render();
    const workspace = container.querySelector('[aria-label="Takeoff workspace"]')!;
    expect(workspace.lastElementChild?.textContent).toBe("All pages · Includes hidden");
    expect(button("Show measurements in Project totals").parentElement).toBe(
      container.querySelector("h2")!.parentElement,
    );
    expect(
      container.querySelector('[aria-labelledby="project-totals-heading"]')!.textContent,
    ).not.toContain("Includes hidden");
  });
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
    act(() => button("Show measurements in Unclassified").click());
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
      measurements: session.pages[1]!.measurements.map((m) => ({
        ...m,
        type: "line" as const,
        calibrationId: "scale",
      })),
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

describe("Takeoff totals", () => {
  function quantities(selector: string) {
    const section = container.querySelector(selector);
    if (!section) throw new Error(`Missing ${selector}`);
    return Array.from(section.querySelectorAll("dl > div"), (row) => [
      row.querySelector("dt")!.textContent,
      row.querySelector("dd")!.textContent,
    ]);
  }
  const groupTotals = (label: string) => quantities(`[aria-label="${label} totals"]`);

  // Page 1 (100 mm per unit): a 1 m line in "Old", a 1 m × 1 m square, two Count items and a line
  // whose scale is gone. Page 2: a hidden 1 m line in "Old".
  function withShapes() {
    const session = fixture();
    session.pages[1]!.measurements.push(
      {
        id: "square",
        name: "Room",
        type: "polygon",
        calibrationId: "scale",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        visible: true,
        classificationValueIds: [],
      },
      {
        id: "plugs",
        name: "Plugs",
        type: "count",
        calibrationId: null,
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
        visible: true,
        classificationValueIds: [],
      },
    );
    return session;
  }

  it("shows each quantity for the project and for page, type and classification groups", () => {
    render(withShapes());

    expect(quantities('[aria-labelledby="project-totals-heading"]')).toEqual([
      ["Length", "2.00 m"],
      ["Perimeter", "4.00 m"],
      ["Area", "1.00 m²"],
      ["Count", "2"],
    ]);

    choose("page");
    expect(groupTotals("Page 1")).toEqual([
      ["Length", "1.00 m"],
      ["Perimeter", "4.00 m"],
      ["Area", "1.00 m²"],
      ["Count", "2"],
    ]);
    expect(groupTotals("Upper floor")).toEqual([["Length", "1.00 m"]]);

    choose("type");
    expect(groupTotals("Line")).toEqual([["Length", "2.00 m"]]);
    expect(groupTotals("Polygon")).toEqual([
      ["Perimeter", "4.00 m"],
      ["Area", "1.00 m²"],
    ]);
    expect(groupTotals("Count")).toEqual([["Count", "2"]]);

    choose("classification");
    expect(groupTotals("Old (archived)")).toEqual([["Length", "2.00 m"]]);
    expect(groupTotals("Unclassified")).toEqual([
      ["Perimeter", "4.00 m"],
      ["Area", "1.00 m²"],
      ["Count", "2"],
    ]);
  });

  it("rounds the sum, not each group, so three thirds of a metre total 1.00 m", () => {
    const session = createEmptySession({ name: "Plan.pdf", size: 1, lastModified: 1 }, 3);
    for (const page of Object.values(session.pages)) {
      page.calibrations = fixture().pages[1]!.calibrations;
      page.measurements = [
        {
          id: `third-${page.pageNumber}`,
          name: "Third",
          type: "line",
          calibrationId: "scale",
          points: [
            { x: 0, y: 0 },
            { x: 10 / 3, y: 0 },
          ],
          visible: true,
          classificationValueIds: [],
        },
      ];
    }
    render(session);

    expect(quantities('[aria-labelledby="project-totals-heading"]')).toEqual([
      ["Length", "1.00 m"],
    ]);
    choose("page");
    expect(groupTotals("Page 1")).toEqual([["Length", "0.33 m"]]);
  });

  it("shows Not calculable when a total overflows and words the exclusion notice by number", () => {
    render();
    expect(container.textContent).toContain(
      "1 measurement was excluded because it cannot be calculated.",
    );

    const session = fixture();
    // Each 1 m line is about 9e307 mm at this scale, so two of them overflow.
    const huge: PageCalibration = {
      id: "huge",
      name: "Huge",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 9e307,
    };
    for (const page of Object.values(session.pages)) page.calibrations = [huge];
    // The fixture holds only lines.
    const lines = (pageNumber: number) =>
      session.pages[pageNumber]!.measurements as PathMeasurement[];
    session.pages[1]!.measurements = lines(1).map((measurement) => ({
      ...measurement,
      calibrationId: measurement.id === "Missing" ? "gone" : "huge",
    }));
    session.pages[2]!.measurements = [
      ...lines(2).map((measurement) => ({ ...measurement, calibrationId: "huge" })),
      {
        id: "Invalid",
        name: "Invalid",
        type: "line",
        calibrationId: "huge",
        points: [{ x: 0, y: 0 }],
        visible: true,
        classificationValueIds: [],
      },
    ];
    render(session);

    expect(quantities('[aria-labelledby="project-totals-heading"]')).toEqual([
      ["Length", "Not calculable"],
    ]);
    expect(
      container.querySelector<HTMLElement>('[aria-labelledby="project-totals-heading"] dd')!.dataset
        .unavailable,
    ).toBe("true");
    expect(container.textContent).toContain(
      "2 measurements were excluded because they cannot be calculated.",
    );
  });
});
