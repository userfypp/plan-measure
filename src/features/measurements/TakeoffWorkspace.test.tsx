/* @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chooseSelectOption } from "../../components/ui/selectTestUtils";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../../app/sessionState";
import { resetAppPreferences, setAppPreference } from "../../utils/appPreferences";
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
const PROJECT = '[aria-label="Project totals"]';
const DERIVED = '[aria-label="Derived and cost"]';
/** The toggle of a fold (a Disclosure) inside the section the selector names. */
function foldToggle(selector: string) {
  return container.querySelector<HTMLButtonElement>(`${selector} button[aria-expanded]`);
}
/** Opens the fold if it is there and closed; the groups and Derived & cost start closed. */
function openFold(selector: string) {
  const toggle = foldToggle(selector);
  if (toggle?.getAttribute("aria-expanded") === "false") act(() => toggle.click());
}
/** The label and value of each figure in the section the selector names, once its fold is open. */
function rowsOf(selector: string) {
  openFold(selector);
  return Array.from(container.querySelectorAll(`${selector} dl > div`), (row) => [
    row.querySelector("dt")!.textContent,
    row.querySelector("dd")!.textContent,
  ]);
}
const groupSelector = (label: string) => `[aria-label="${label} totals"]`;
function openGroup(label: string) {
  openFold(groupSelector(label));
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
  resetAppPreferences();
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
    openGroup("Page 1");
    act(() => button("Show measurements in Page 1").click());
    expect(container.textContent).toContain("1–50 of 60");
    act(() => button("Next source measurements").click());
    openGroup("Upper floor");
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
    expect(labels(container.querySelector(PROJECT)!)).toEqual([
      "Length",
      "Perimeter",
      "Area",
      "Count",
    ]);
    choose("page");
    openGroup("Page 1");
    expect(labels(container.querySelector('[aria-label="Page 1 totals"]')!)).toEqual([
      "Length",
      "Perimeter",
      "Area",
      "Count",
    ]);
  });
  it("names the scope in the Project totals row and opens the sources from a row under its figures", () => {
    render();
    const totals = container.querySelector(PROJECT)!;
    expect(foldToggle(PROJECT)!.textContent).toBe("Project totalsAll pages · Includes hidden");
    expect(totals.querySelectorAll("p")).toHaveLength(0);
    const sources = button("Show measurements in Project totals");
    expect(sources.textContent).toBe("3 measurements");
    expect(
      totals.querySelector("dl")!.compareDocumentPosition(sources) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const workspace = container.querySelector('[aria-label="Takeoff workspace"]')!;
    expect(workspace.lastElementChild?.textContent).toBe("Choose a breakdown to compare totals.");
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
    openGroup("Old (archived)");
    act(() => button("Show measurements in Old").click());
    expect(container.querySelectorAll('[aria-label="Source measurements"] li')).toHaveLength(2);
    expect(button("Open Missing on page 1")).toBeNull();
    openGroup("Unclassified");
    act(() => button("Show measurements in Unclassified").click());
    expect(container.querySelectorAll('[aria-label="Source measurements"] li')).toHaveLength(1);
    expect(button("Open Missing on page 1")).not.toBeNull();
    choose("page");
    expect(container.querySelector('[aria-label="Source measurements"]')).toBeNull();
    openGroup("Upper floor");
    act(() => button("Show measurements in Upper floor").click());
    expect(container.querySelectorAll('[aria-label="Source measurements"] li')).toHaveLength(1);
    choose("type");
    openGroup("Line");
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
  const groupTotals = (label: string) => rowsOf(groupSelector(label));
  const quantities = rowsOf;

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

    expect(quantities(PROJECT)).toEqual([
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

  it("groups the digits of Count with the app's thousands separator", () => {
    const session = withShapes();
    const plugs = session.pages[1]!.measurements.find((measurement) => measurement.id === "plugs")!;
    plugs.points = Array.from({ length: 1234 }, (_, index) => ({ x: index, y: 0 }));
    render(session);
    expect(quantities(PROJECT)).toContainEqual(["Count", "1234"]);

    act(() => setAppPreference("thousandsSeparator", "comma"));
    expect(quantities(PROJECT)).toContainEqual(["Count", "1,234"]);
    choose("type");
    expect(groupTotals("Count")).toEqual([["Count", "1,234"]]);

    act(() => {
      setAppPreference("thousandsSeparator", "point");
      setAppPreference("decimalSeparator", "comma");
    });
    expect(groupTotals("Count")).toEqual([["Count", "1.234"]]);
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

    expect(quantities(PROJECT)).toEqual([["Length", "1.00 m"]]);
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

    expect(quantities(PROJECT)).toEqual([["Length", "Not calculable"]]);
    expect(container.querySelector<HTMLElement>(`${PROJECT} dd`)!.dataset.unavailable).toBe("true");
    expect(container.textContent).toContain(
      "2 measurements were excluded because they cannot be calculated.",
    );
  });
});

describe("Takeoff derived quantities", () => {
  const derivation = (
    valueId: string,
    source: "length" | "perimeter" | "area",
    factorMm: number,
  ) => ({
    valueId,
    derivation: { source, factorMm },
    price: null,
  });

  // Scale: 10 units = 1000 mm, so 1 unit = 100 mm. Page 1: a 12,500 mm Wall line, a
  // 4,000 x 5,000 mm Slab polygon (20 m²) and a 1,000 mm line with no classification.
  function derivedFixture() {
    const session = fixture();
    session.classificationCatalog.dimensions = [
      {
        id: "element",
        name: "Element",
        archived: false,
        values: [
          { id: "wall", name: "Wall", archived: false },
          { id: "slab", name: "Slab", archived: false },
        ],
      },
      {
        id: "finish",
        name: "Finish",
        archived: false,
        values: [{ id: "paint", name: "Paint", archived: false }],
      },
    ];
    session.pages[1]!.measurements = [
      {
        id: "wall-line",
        name: "Wall line",
        type: "line",
        calibrationId: "scale",
        points: [
          { x: 0, y: 0 },
          { x: 125, y: 0 },
        ],
        visible: true,
        classificationValueIds: ["wall"],
      },
      {
        id: "slab-polygon",
        name: "Slab polygon",
        type: "polygon",
        calibrationId: "scale",
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 50 },
          { x: 0, y: 50 },
        ],
        visible: true,
        classificationValueIds: ["slab"],
      },
    ];
    session.pages[2]!.measurements = [];
    return session;
  }
  function renderDerived(
    session: ReturnType<typeof derivedFixture>,
    rates: ComponentProps<typeof TakeoffWorkspace>["classificationRates"],
    overrides: Partial<ComponentProps<typeof TakeoffWorkspace>> = {},
  ) {
    act(() =>
      root.render(
        <TakeoffWorkspace
          pages={session.pages}
          catalog={session.classificationCatalog}
          classificationRates={rates}
          displayUnit="m"
          decimalPlaces={2}
          areaDisplay="auto"
          pageLabelOverrides={{}}
          sourcePageLabels={null}
          {...overrides}
        />,
      ),
    );
  }
  // The measured figures, then the derived ones and the cost: the second fold starts closed.
  const projectTotals = () => [...rowsOf(PROJECT), ...rowsOf(DERIVED)];
  const derivedRow = (label: string) =>
    Array.from(container.querySelectorAll(`${DERIVED} dl > div`)).find(
      (row) => row.querySelector("dt")!.textContent === label,
    )!;
  const notice =
    "Derived quantities and costs from several classification dimensions are added together.";
  const noticeShown = () => {
    openFold(DERIVED);
    return container.textContent!.includes(notice);
  };

  it("shows the derived area and volume after the measured quantities", () => {
    renderDerived(derivedFixture(), [
      derivation("wall", "length", 2700),
      derivation("slab", "area", 150),
    ]);

    expect(projectTotals()).toEqual([
      ["Length", "12.50 m"],
      ["Perimeter", "18.00 m"],
      ["Area", "20.00 m²"],
      ["Derived area", "33.75 m²"],
      ["Derived volume", "3.00 m³"],
    ]);
  });

  it("shows no derived rows without rates, or while no assigned measurement feeds them", () => {
    const measured = [
      ["Length", "12.50 m"],
      ["Perimeter", "18.00 m"],
      ["Area", "20.00 m²"],
    ];
    renderDerived(derivedFixture(), undefined);
    expect(projectTotals()).toEqual(measured);

    renderDerived(derivedFixture(), []);
    expect(projectTotals()).toEqual(measured);

    // A factor on a value no measurement uses, and a volume factor on a line (no area to derive from).
    renderDerived(derivedFixture(), [
      derivation("paint", "length", 2700),
      derivation("wall", "area", 150),
    ]);
    expect(projectTotals()).toEqual(measured);
  });

  it("shows each group's own derived quantities in a classification breakdown", () => {
    renderDerived(derivedFixture(), [
      derivation("wall", "length", 2700),
      derivation("slab", "area", 150),
    ]);
    choose("classification");

    const group = (label: string) => rowsOf(groupSelector(label));
    expect(group("Wall")).toEqual([
      ["Length", "12.50 m"],
      ["Derived area", "33.75 m²"],
    ]);
    expect(group("Slab")).toEqual([
      ["Perimeter", "18.00 m"],
      ["Area", "20.00 m²"],
      ["Derived volume", "3.00 m³"],
    ]);
  });

  it("formats the derived quantities in the project's unit and area display", () => {
    const rates = [derivation("wall", "length", 2700), derivation("slab", "area", 150)];
    renderDerived(derivedFixture(), rates, { displayUnit: "ft" });
    expect(projectTotals().slice(3)).toEqual([
      ["Derived area", "363.28 ft²"],
      ["Derived volume", "105.94 ft³"],
    ]);

    renderDerived(derivedFixture(), rates, { areaDisplay: "ac", decimalPlaces: 4 });
    expect(projectTotals().slice(3)).toEqual([
      ["Derived area", "0.0083 ac"],
      ["Derived volume", "3.0000 m³"],
    ]);
  });

  it("shows Not calculable when the derived quantity overflows", () => {
    const session = derivedFixture();
    // The wall is 1e306 mm long, which is finite; times 2,700 mm it is not.
    session.pages[1]!.calibrations = [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1e306,
      },
    ];
    renderDerived(session, [derivation("wall", "length", 2700)]);

    projectTotals();
    const derived = derivedRow("Derived area");
    expect(derived.querySelector("dd")!.textContent).toBe("Not calculable");
    expect(derived.querySelector<HTMLElement>("dd")!.dataset.unavailable).toBe("true");
  });

  it("adds derived quantities across dimensions and says so", () => {
    const session = derivedFixture();
    session.pages[1]!.measurements[0]!.classificationValueIds = ["wall", "paint"];
    renderDerived(session, [
      derivation("wall", "length", 2700),
      derivation("paint", "length", 2700),
    ]);

    expect(projectTotals().find(([label]) => label === "Derived area")).toEqual([
      "Derived area",
      "67.50 m²",
    ]);
    expect(noticeShown()).toBe(true);
  });

  it("warns only when factors sit in more than one dimension and measurements exist", () => {
    renderDerived(derivedFixture(), [
      derivation("wall", "length", 2700),
      derivation("slab", "area", 150),
    ]);
    expect(noticeShown()).toBe(false);

    renderDerived(derivedFixture(), [
      derivation("wall", "length", 2700),
      derivation("paint", "length", 2700),
    ]);
    expect(noticeShown()).toBe(true);

    const empty = derivedFixture();
    empty.pages[1]!.measurements = [];
    renderDerived(empty, [derivation("wall", "length", 2700), derivation("paint", "length", 2700)]);
    expect(noticeShown()).toBe(false);
  });

  it("recomputes when the rates change", () => {
    const session = derivedFixture();
    renderDerived(session, [derivation("wall", "length", 2700)]);
    expect(projectTotals().at(-1)).toEqual(["Derived area", "33.75 m²"]);

    renderDerived(session, [derivation("wall", "length", 3000)]);
    expect(projectTotals().at(-1)).toEqual(["Derived area", "37.50 m²"]);
  });

  describe("costs", () => {
    type Rates = NonNullable<
      ComponentProps<typeof TakeoffWorkspace>["classificationRates"]
    >[number];
    const rates = (
      valueId: string,
      derivationOf: Rates["derivation"],
      price: Rates["price"],
    ): Rates => ({ valueId, derivation: derivationOf, price });
    // Wall: 12,500 mm of line x 2,700 mm = 33.75 m² at 25 per m² is 843.75.
    // Slab: 20 m² x 150 mm = 3 m³ at 110 per m³ is 330. Together 1,173.75.
    const wallRates = rates(
      "wall",
      { source: "length", factorMm: 2700 },
      { amount: 25, basis: "derived", unit: "m²" },
    );
    const slabRates = rates(
      "slab",
      { source: "area", factorMm: 150 },
      { amount: 110, basis: "derived", unit: "m³" },
    );
    const priceOnly = (valueId: string) =>
      rates(valueId, null, { amount: 2, basis: "length", unit: "m" });
    const renderCosts = (
      classificationRates: Rates[] | undefined,
      overrides: Partial<ComponentProps<typeof TakeoffWorkspace>> = {},
      session = derivedFixture(),
    ) => renderDerived(session, classificationRates, { currency: "EUR", ...overrides });
    const cost = (rows: (string | null)[][]) => rows.find(([label]) => label === "Cost");

    it("shows the project cost last, with the project's currency", () => {
      renderCosts([wallRates, slabRates]);

      expect(projectTotals().at(-1)).toEqual(["Cost", "1173.75 EUR"]);
    });

    it("shows the cost with the app's separators and follows a change", () => {
      setAppPreference("thousandsSeparator", "comma");
      renderCosts([wallRates, slabRates]);
      expect(projectTotals().at(-1)).toEqual(["Cost", "1,173.75 EUR"]);

      act(() => {
        setAppPreference("thousandsSeparator", "point");
        setAppPreference("decimalSeparator", "comma");
      });
      expect(projectTotals().at(-1)).toEqual(["Cost", "1.173,75 EUR"]);
    });

    it("shows each group's own cost in a classification breakdown", () => {
      renderCosts([wallRates, slabRates]);
      choose("classification");

      expect(cost(rowsOf('[aria-label="Wall totals"]'))).toEqual(["Cost", "843.75 EUR"]);
      expect(cost(rowsOf('[aria-label="Slab totals"]'))).toEqual(["Cost", "330.00 EUR"]);
    });

    it("prices a measured quantity without any derivation", () => {
      renderCosts([priceOnly("wall")]);

      // 12.5 m of wall line at 2 per m.
      expect(projectTotals().at(-1)).toEqual(["Cost", "25.00 EUR"]);
    });

    it("formats the cost with the decimals of the currency and none without one", () => {
      const both = [wallRates, slabRates];
      renderCosts(both, { currency: "JPY" });
      expect(cost(projectTotals())).toEqual(["Cost", "1174 JPY"]);

      renderCosts(both, { currency: "KWD" });
      expect(cost(projectTotals())).toEqual(["Cost", "1173.750 KWD"]);

      renderCosts(both, { currency: null });
      expect(cost(projectTotals())).toEqual(["Cost", "1173.75"]);

      renderCosts(both, { currency: undefined });
      expect(cost(projectTotals())).toEqual(["Cost", "1173.75"]);
    });

    it("hides the cost row without prices, even with a derivation", () => {
      renderCosts(undefined);
      expect(cost(projectTotals())).toBeUndefined();

      renderCosts([]);
      expect(cost(projectTotals())).toBeUndefined();

      renderCosts([rates("wall", { source: "length", factorMm: 2700 }, null)]);
      expect(cost(projectTotals())).toBeUndefined();
      expect(projectTotals().at(-1)).toEqual(["Derived area", "33.75 m²"]);

      // A price on a value no measurement uses.
      renderCosts([priceOnly("paint")]);
      expect(cost(projectTotals())).toBeUndefined();
    });

    it("shows a price of zero as a cost of zero", () => {
      renderCosts([rates("wall", null, { amount: 0, basis: "length", unit: "m" })]);

      expect(cost(projectTotals())).toEqual(["Cost", "0.00 EUR"]);
    });

    it("shows Not calculable when the cost overflows", () => {
      renderCosts([
        rates(
          "wall",
          { source: "length", factorMm: 2700 },
          { amount: 1e308, basis: "derived", unit: "m²" },
        ),
      ]);

      expect(cost(projectTotals())).toEqual(["Cost", "Not calculable"]);
      expect(derivedRow("Cost").querySelector<HTMLElement>("dd")!.dataset.unavailable).toBe("true");
    });

    it("follows the currency and the prices when they change", () => {
      const session = derivedFixture();
      renderCosts([wallRates], {}, session);
      expect(cost(projectTotals())).toEqual(["Cost", "843.75 EUR"]);

      renderCosts([wallRates], { currency: "USD" }, session);
      expect(cost(projectTotals())).toEqual(["Cost", "843.75 USD"]);

      renderCosts(
        [{ ...wallRates, price: { amount: 30, basis: "derived", unit: "m²" } }],
        { currency: "USD" },
        session,
      );
      expect(cost(projectTotals())).toEqual(["Cost", "1012.50 USD"]);
    });

    it("warns when prices sit in more than one dimension and not when they share one", () => {
      renderCosts([priceOnly("wall"), priceOnly("slab")]);
      expect(noticeShown()).toBe(false);

      renderCosts([priceOnly("wall"), priceOnly("paint")]);
      expect(noticeShown()).toBe(true);

      renderCosts([priceOnly("paint")]);
      expect(noticeShown()).toBe(false);
    });

    it("warns when a derivation and a price sit in different dimensions", () => {
      renderCosts([rates("wall", { source: "length", factorMm: 2700 }, null), priceOnly("paint")]);

      expect(noticeShown()).toBe(true);
    });

    it("adds the costs of values from different dimensions on the same measurement", () => {
      const session = derivedFixture();
      session.pages[1]!.measurements[0]!.classificationValueIds = ["wall", "paint"];
      renderCosts(
        [
          wallRates,
          rates(
            "paint",
            { source: "length", factorMm: 2700 },
            { amount: 4, basis: "derived", unit: "m²" },
          ),
        ],
        {},
        session,
      );

      // 33.75 m² x 25 + 33.75 m² x 4
      expect(cost(projectTotals())).toEqual(["Cost", "978.75 EUR"]);
    });
  });
});

describe("Takeoff sections", () => {
  type Rates = NonNullable<ComponentProps<typeof TakeoffWorkspace>["classificationRates"]>;
  const rated: Rates = [
    {
      valueId: "old",
      derivation: { source: "length", factorMm: 2700 },
      price: { amount: 25, basis: "derived", unit: "m²" },
    },
  ];
  function renderRated(session = fixture(), rates: Rates | null = rated) {
    act(() =>
      root.render(
        <TakeoffWorkspace
          pages={session.pages}
          catalog={session.classificationCatalog}
          classificationRates={rates ?? undefined}
          currency="EUR"
          displayUnit="m"
          decimalPlaces={2}
          areaDisplay="auto"
          pageLabelOverrides={{ 2: "Upper floor" }}
          sourcePageLabels={null}
        />,
      ),
    );
  }
  const expanded = (selector: string) => foldToggle(selector)!.getAttribute("aria-expanded");

  it("opens Project totals and keeps Derived & cost closed, with the cost on its row", () => {
    renderRated();
    expect(expanded(PROJECT)).toBe("true");
    expect(expanded(DERIVED)).toBe("false");
    // Title, what is inside, and the figure that speaks for it while the fold is closed.
    expect(foldToggle(DERIVED)!.textContent).toBe("Derived & costDerived area · Cost135.00 EUR");
    expect(container.querySelector(`${DERIVED} dl`)).toBeNull();

    openFold(DERIVED);
    expect(expanded(DERIVED)).toBe("true");
    expect(foldToggle(DERIVED)!.textContent).toBe("Derived & costDerived area · Cost");
    expect(rowsOf(DERIVED)).toEqual([
      ["Derived area", "5.40 m²"],
      ["Cost", "135.00 EUR"],
    ]);
  });

  it("speaks for Derived & cost with the derived area when nothing is priced", () => {
    renderRated(fixture(), [{ ...rated[0]!, price: null }]);
    expect(foldToggle(DERIVED)!.textContent).toBe("Derived & costDerived area5.40 m²");
  });

  it("shows Derived & cost only when something is derived or priced", () => {
    render();
    expect(container.querySelector(DERIVED)).toBeNull();
    renderRated(fixture(), null);
    expect(container.querySelector(DERIVED)).toBeNull();
    renderRated();
    expect(container.querySelector(DERIVED)).not.toBeNull();
  });

  it("keeps the excluded notice on screen when Project totals is folded", () => {
    render();
    act(() => foldToggle(PROJECT)!.click());
    expect(expanded(PROJECT)).toBe("false");
    expect(container.querySelector(`${PROJECT} dl`)).toBeNull();
    expect(button("Show measurements in Project totals")).toBeNull();
    expect(container.querySelector('[aria-label="Excluded measurements"]')!.textContent).toContain(
      "1 measurement was excluded",
    );
    act(() => button("Inspect excluded measurements").click());
    expect(sourceRows()).toHaveLength(1);
  });

  it("starts every group closed with its headline figure on the row", () => {
    const session = fixture();
    session.pages[1]!.measurements.push({
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
    });
    render(session);
    choose("type");
    for (const label of ["Line", "Polygon"]) {
      expect(expanded(groupSelector(label)), label).toBe("false");
      expect(container.querySelector(`${groupSelector(label)} dl`), label).toBeNull();
    }
    // The title and the figure share the row: a line leads with its length, a polygon with its
    // area (the perimeter never speaks for a group).
    expect(foldToggle(groupSelector("Line"))!.textContent).toBe("Line2.00 m");
    expect(foldToggle(groupSelector("Polygon"))!.textContent).toBe("Polygon1.00 m²");

    openGroup("Polygon");
    expect(foldToggle(groupSelector("Polygon"))!.textContent).toBe("Polygon");
    expect(expanded(groupSelector("Line"))).toBe("false");
  });

  it("says a group is archived on its row and folds the groups again on a new breakdown", () => {
    render();
    choose("classification");
    expect(foldToggle(groupSelector("Old (archived)"))!.textContent).toBe("OldArchived2.00 m");

    openGroup("Old (archived)");
    openGroup("Unclassified");
    choose("page");
    choose("classification");
    expect(expanded(groupSelector("Old (archived)"))).toBe("false");
    expect(expanded(groupSelector("Unclassified"))).toBe("false");
  });

  it("states that nothing is calculable under the figures that are missing", () => {
    const session = fixture();
    session.pages[1]!.measurements = session.pages[1]!.measurements.filter(
      (measurement) => measurement.id === "Missing",
    );
    session.pages[2]!.measurements = [];
    render(session);
    expect(container.querySelector(`${PROJECT} dl`)).toBeNull();
    expect(container.querySelector(PROJECT)!.textContent).toContain("No calculable quantities.");
    expect(button("Show measurements in Project totals")!.textContent).toBe("1 measurement");

    choose("page");
    openGroup("Page 1");
    expect(container.querySelector(groupSelector("Page 1"))!.textContent).toContain(
      "No calculable quantities.",
    );
  });

  it("shows only the empty state, without a scope, sources or Derived & cost, in an empty project", () => {
    const session = createEmptySession({ name: "Plan.pdf", size: 1, lastModified: 1 }, 1);
    render(session);
    expect(foldToggle(PROJECT)!.textContent).toBe("Project totals");
    expect(container.querySelector(PROJECT)!.textContent).toContain(
      "No measurements in this project.",
    );
    expect(container.querySelector('button[aria-label^="Show measurements"]')).toBeNull();
    expect(container.querySelector(DERIVED)).toBeNull();
    expect(container.textContent).not.toContain("Choose a breakdown");
  });

  it("puts the blocked-navigation note right under the open source list", () => {
    render(fixture(), true);
    act(() => button("Show measurements in Project totals").click());
    const list = container.querySelector('[aria-label="Source measurements"]')!;
    const note = Array.from(container.querySelectorAll(`${PROJECT} p`)).find((paragraph) =>
      paragraph.textContent?.includes("Finish or cancel the current edit"),
    )!;
    expect(note).toBeDefined();
    expect(list.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.previousElementSibling).toBe(list);
  });
});

describe("Takeoff workspace surface", () => {
  const takeoffCss = readFileSync(
    resolve(import.meta.dirname, "TakeoffWorkspace.module.css"),
    "utf8",
  );

  it("sits on the viewer tone with the panel's surface as blocks set apart by 8px", () => {
    expect(takeoffCss).toMatch(
      /\.workspace\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*var\(--space-8\);[^}]*padding-block:\s*var\(--space-8\);[^}]*background:\s*var\(--color-surface-viewer\);/s,
    );
    expect(takeoffCss).toMatch(
      /\.block,\s*\.breakdownControls\s*\{[^}]*border-block:\s*var\(--border-width\) solid var\(--color-divider\);[^}]*background:\s*var\(--color-surface-panel\);/s,
    );
    // Blocks run edge to edge: no frames, radii or dashed borders of the previous layout.
    expect(takeoffCss).not.toMatch(/\.emptyState\s*\{[^}]*(border-radius|border:)/s);
    expect(takeoffCss).not.toMatch(/\.sourceList\s*\{[^}]*(border-radius|background)/s);
    expect(takeoffCss).not.toContain("dashed");
    expect(takeoffCss).not.toContain(".group");
  });

  it("puts text on the 12px edge and controls on the 8px edge", () => {
    expect(takeoffCss).toMatch(
      /\.workspace\s*\{[^}]*--text-edge:\s*calc\(var\(--geometry-panel-gutter\) \+ var\(--space-4\)\);/s,
    );
    expect(takeoffCss).toMatch(
      /\.sourceToggle\s*\{[^}]*padding:\s*0 var\(--geometry-panel-gutter\) 0 var\(--text-edge\);/s,
    );
    expect(takeoffCss).toMatch(
      /\.quantities\s*\{[^}]*padding:\s*var\(--space-8\) var\(--text-edge\);[^}]*border-top:\s*var\(--border-width\) solid var\(--color-divider\);/s,
    );
    expect(takeoffCss).toMatch(
      /\.summaryQuantities \.quantity\s*\{[^}]*padding:\s*var\(--space-8\) var\(--text-edge\);[^}]*border-top:\s*var\(--border-width\) solid var\(--color-divider\);/s,
    );
    expect(takeoffCss).toMatch(
      /\.breakdownControls\s*\{[^}]*padding:\s*var\(--space-8\) var\(--geometry-panel-gutter\);/s,
    );
    // No footnotes: the scope is the Project totals subtitle and the note lives in Derived & cost.
    expect(takeoffCss).not.toContain(".scope");
    expect(takeoffCss).not.toContain(".sectionHeading");
  });
});
