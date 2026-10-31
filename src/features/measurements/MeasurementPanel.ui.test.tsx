/* @vitest-environment jsdom */

import { chooseSelectOption, selectOptionLabels } from "../../components/ui/selectTestUtils";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PathMeasurement, CurrentSession, Measurement, PageState } from "../../types/domain";
import { resetAppPreferences, setAppPreference } from "../../utils/appPreferences";
import { NO_DEFAULT_MEASUREMENT_FILTERS } from "./measurementFilters";

const state = vi.hoisted(() => ({
  session: null as CurrentSession | null,
  selectedMeasurementId: null as string | null,
}));

vi.mock("../../app/sessionState", () => ({ useSessionState: () => ({ session: state.session }) }));
vi.mock("../../app/workspaceState", () => ({
  useWorkspaceState: () => ({ selectedMeasurementId: state.selectedMeasurementId }),
}));

import { MeasurementPanel, preloadMeasurementFilters } from "./MeasurementPanel";
import { TakeoffWorkspace } from "./TakeoffWorkspace";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function measurement(overrides: Partial<PathMeasurement> = {}): PathMeasurement {
  return {
    id: "line-1",
    type: "line",
    name: "Hallway",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    calibrationId: "scale",
    classificationValueIds: [],
    visible: true,
    ...overrides,
  };
}

function page(measurements: Measurement[]): PageState {
  return {
    pageNumber: 1,
    calibrations: [
      {
        id: "scale",
        name: "Scale",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        referenceDistanceMm: 1000,
      },
    ],
    activeCalibrationId: "scale",
    nextCalibrationNumber: 2,
    measurements,
    nextMeasurementNumber: {
      line: 2,
      polyline: 1,
      polygon: 1,
      rectangle: 1,
      ellipse: 1,
      cloud: 1,
      count: 1,
    },
  };
}

function session(pages: Record<number, PageState>, withCatalog = true): CurrentSession {
  return {
    schemaVersion: 16,
    pageCount: Object.keys(pages).length,
    currentPage: 1,
    pages,
    pageLabelOverrides: {},
    settings: {
      displayUnit: "m",
      areaDisplay: "auto",
      measurementDecimalPlaces: 2,
      showLabels: true,
      showMeasurements: true,
      showCalibration: true,
      labelClassificationDimensionId: null,
      measureClouds: false,
      defaultMeasurementFilters: null,
      csvExport: { columnOverrides: {} },
    },
    classificationCatalog: withCatalog
      ? {
          dimensions: [
            {
              id: "trade",
              name: "Trade",
              archived: false,
              values: [{ id: "electrical", name: "Electrical", archived: false }],
            },
          ],
        }
      : { dimensions: [] },
  } as CurrentSession;
}

function renderPanel(
  currentSession: CurrentSession,
  activePage: PageState,
  onSelectMeasurement = () => undefined,
  onSetMeasurementsVisibility: (measurementIds: string[], visible: boolean) => void = () =>
    undefined,
) {
  state.session = currentSession;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MeasurementPanel
        page={activePage}
        pages={currentSession.pages}
        pageLabelOverrides={currentSession.pageLabelOverrides}
        sourcePageLabels={null}
        selectedMeasurementId={state.selectedMeasurementId}
        onSelectMeasurement={onSelectMeasurement}
        onSetMeasurementVisibility={() => undefined}
        onSetMeasurementsVisibility={onSetMeasurementsVisibility}
      />,
    );
  });
}

beforeAll(async () => {
  await preloadMeasurementFilters();
});

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  state.session = null;
  state.selectedMeasurementId = null;
  resetAppPreferences();
});

describe("MeasurementPanel and TakeoffWorkspace", () => {
  it("filters Count markers independently of paths", () => {
    const activePage = page([
      measurement(),
      {
        id: "count-1",
        type: "count",
        name: "Socket",
        points: [{ x: 1, y: 2 }],
        calibrationId: null,
        classificationValueIds: [],
        visible: true,
      },
    ]);
    renderPanel(session({ 1: activePage }), activePage);
    act(() => container!.querySelector<HTMLButtonElement>('[aria-label="Filters"]')!.click());
    chooseSelectOption(
      document.querySelector<HTMLButtonElement>('button[aria-label="Type"]')!,
      "Count (1)",
    );
    expect(
      container!.querySelector(
        '[data-measurement-id="count-1"][data-measurement-control="selection"]',
      ),
    ).not.toBeNull();
    expect(
      container!.querySelector(
        '[data-measurement-id="line-1"][data-measurement-control="selection"]',
      ),
    ).toBeNull();
  });

  it("ignores deleted filters and grouping dimensions, and restores them after undo", () => {
    const activePage = page([measurement({ classificationValueIds: ["electrical"] })]);
    const currentSession = session({ 1: activePage });
    renderPanel(currentSession, activePage);
    act(() =>
      container!.querySelector<HTMLButtonElement>('[aria-label="Group measurements"]')!.click(),
    );
    chooseSelectOption(
      document.querySelector<HTMLButtonElement>(
        '[aria-label="Measurement grouping"] button[aria-label="Group by"]',
      )!,
      "Trade",
    );
    act(() =>
      container!.querySelector<HTMLButtonElement>('[aria-label="Group by Trade"]')!.click(),
    );
    act(() => container!.querySelector<HTMLButtonElement>('[aria-label="Filters"]')!.click());
    chooseSelectOption(
      document.querySelector<HTMLButtonElement>(
        '[aria-label="Measurement filters"] button[aria-label="Classification"]',
      )!,
      "Trade: Electrical (1)",
    );
    const rerender = (next: CurrentSession) => {
      state.session = next;
      act(() =>
        root!.render(
          <MeasurementPanel
            page={next.pages[1]!}
            pages={next.pages}
            pageLabelOverrides={next.pageLabelOverrides}
            sourcePageLabels={null}
            selectedMeasurementId={null}
            onSelectMeasurement={() => undefined}
            onSetMeasurementVisibility={() => undefined}
            onSetMeasurementsVisibility={() => undefined}
          />,
        ),
      );
    };
    const deleted = {
      ...currentSession,
      classificationCatalog: { dimensions: [] },
      pages: {
        1: page([measurement()]),
      },
    };
    rerender(deleted);
    expect(container!.querySelector('[aria-label="Filters"]')).not.toBeNull();
    expect(container!.textContent).not.toContain("Unknown classification");
    expect(
      container!.querySelector(
        '[data-measurement-id="line-1"][data-measurement-control="selection"]',
      ),
    ).not.toBeNull();
    rerender(currentSession);
    expect(container!.querySelector('[aria-label="Filters, 1 active"]')).not.toBeNull();
    expect(container!.querySelector('[aria-label="Group by Trade"]')).not.toBeNull();
  });

  it("uses an available Takeoff dimension after the selected dimension is deleted", () => {
    const currentSession = session({ 1: page([measurement()]) });
    currentSession.classificationCatalog.dimensions.push({
      id: "status",
      name: "Status",
      archived: false,
      values: [],
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const render = () =>
      act(() =>
        root!.render(
          <TakeoffWorkspace
            pages={currentSession.pages}
            catalog={currentSession.classificationCatalog}
            displayUnit="m"
            decimalPlaces={2}
            areaDisplay="auto"
            pageLabelOverrides={{}}
            sourcePageLabels={null}
          />,
        ),
      );
    render();
    chooseSelectOption(
      container.querySelector<HTMLButtonElement>("#takeoff-breakdown")!,
      "Classification",
    );
    chooseSelectOption(
      container.querySelector<HTMLButtonElement>('[aria-label="Dimension"]')!,
      "Status",
    );
    currentSession.classificationCatalog = {
      dimensions: currentSession.classificationCatalog.dimensions.filter(
        (item) => item.id !== "status",
      ),
    };
    render();
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Dimension"]')!.textContent,
    ).toBe("Trade");
    currentSession.classificationCatalog = { dimensions: [] };
    render();
    expect(container.textContent).toContain("No classification dimensions.");
  });

  it("sets the visibility of a group spanning several pages in a single call", () => {
    const firstPage = page([measurement({ classificationValueIds: ["electrical"] })]);
    const secondPage = {
      ...page([
        measurement({ id: "line-2", name: "Second", classificationValueIds: ["electrical"] }),
      ]),
      pageNumber: 2,
    };
    const onSetMeasurementsVisibility = vi.fn();
    renderPanel(
      session({ 1: firstPage, 2: secondPage }),
      firstPage,
      undefined,
      onSetMeasurementsVisibility,
    );

    act(() =>
      container!.querySelector<HTMLButtonElement>('[aria-label="Group measurements"]')!.click(),
    );
    chooseSelectOption(
      document.querySelector<HTMLButtonElement>(
        '[role="dialog"][aria-label="Measurement grouping"] button[aria-haspopup="menu"]',
      )!,
      "Trade",
    );
    act(() =>
      container!
        .querySelector<HTMLButtonElement>(
          'button[aria-label^="Hide all measurements in Trade · Electrical"]',
        )!
        .click(),
    );

    expect(onSetMeasurementsVisibility.mock.calls).toEqual([[["line-1", "line-2"], false]]);
  });

  it("lets users choose and reorder classification dimensions for nested measurement groups", () => {
    const activePage = page([
      measurement({ classificationValueIds: ["electrical", "approved"] }),
      measurement({ id: "line-2", name: "Second", classificationValueIds: ["electrical"] }),
    ]);
    const currentSession = session({ 1: activePage });
    currentSession.classificationCatalog.dimensions.push({
      id: "status",
      name: "Status",
      archived: false,
      values: [{ id: "approved", name: "Approved", archived: false }],
    });
    renderPanel(currentSession, activePage);

    act(() =>
      container!.querySelector<HTMLButtonElement>('[aria-label="Group measurements"]')!.click(),
    );

    const GROUPING_TRIGGERS =
      '[role="dialog"][aria-label="Measurement grouping"] button[aria-haspopup="menu"]';
    const OPTION_LABELS: Record<string, string> = { trade: "Trade", status: "Status", "": "None" };
    function choose(index: number, value: string) {
      const select = document.querySelectorAll<HTMLButtonElement>(GROUPING_TRIGGERS)[index]!;
      chooseSelectOption(select, OPTION_LABELS[value]!);
    }
    function groupingValues() {
      return Array.from(
        document.querySelectorAll<HTMLButtonElement>(GROUPING_TRIGGERS),
        (select) => select.textContent,
      );
    }

    choose(0, "trade");
    choose(1, "status");
    expect(groupingValues()).toEqual(["Trade", "Status"]);
    const groupingButton = container!.querySelector<HTMLButtonElement>(
      '[aria-label="Group by Trade, then Status"]',
    );
    expect(groupingButton).not.toBeNull();
    // Icon-only trigger: the levels live in its accessible name (and tooltip), not in its text.
    expect(groupingButton!.textContent).toBe("");
    expect(groupingButton!.hasAttribute("title")).toBe(false);
    const electrical = container!.querySelector(
      '[aria-label="Trade · Electrical measurement group"]',
    );
    expect(
      electrical?.querySelector('[aria-label="Status · Approved measurement group"]'),
    ).not.toBeNull();
    expect(
      container!.querySelectorAll(
        '[data-measurement-id="line-1"][data-measurement-control="selection"]',
      ),
    ).toHaveLength(1);

    choose(0, "status");
    expect(groupingValues()).toEqual(["Status", "Trade"]);
    const approved = container!.querySelector('[aria-label="Status · Approved measurement group"]');
    expect(
      approved?.querySelector('[aria-label="Trade · Electrical measurement group"]'),
    ).not.toBeNull();

    choose(1, "");
    expect(groupingValues()).toEqual(["Status", "None"]);

    act(() =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Clear grouping")!
        .click(),
    );
    expect(groupingValues()).toEqual(["None"]);
    expect(
      container!.querySelector('[aria-label="Measurements grouped by classification"]'),
    ).toBeNull();
    expect(container!.querySelector('[aria-label="Select measurement Hallway"]')).not.toBeNull();
  });

  it("keeps Measurements dedicated to its list", () => {
    const activePage = page([measurement()]);
    renderPanel(session({ 1: activePage }), activePage);

    expect(container?.querySelector('aside[aria-label="Measurements workspace"]')).not.toBeNull();
    expect(container?.querySelector('input[type="search"]')).not.toBeNull();
    expect(container?.querySelector('[aria-label="Filters"]')).not.toBeNull();
    expect(container?.querySelector('[aria-label="Group measurements"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"][aria-label="Measurement filters"]')).toBeNull();
    expect(document.querySelector('[role="dialog"][aria-label="Measurement grouping"]')).toBeNull();
    expect(container?.textContent).not.toContain("Summary");
    expect(container?.textContent).not.toContain("List");
  });

  it("keeps filter values when popovers close and opens only one control popover at a time", () => {
    const firstPage = page([measurement()]);
    const secondPage = { ...page([measurement({ id: "line-2", name: "Kitchen" })]), pageNumber: 2 };
    renderPanel(session({ 1: firstPage, 2: secondPage }), firstPage);

    const filtersButton = container!.querySelector<HTMLButtonElement>('[aria-label="Filters"]')!;
    const groupButton = container!.querySelector<HTMLButtonElement>(
      '[aria-label="Group measurements"]',
    )!;
    act(() => filtersButton.click());
    expect(
      document.querySelector('[role="dialog"][aria-label="Measurement filters"]'),
    ).not.toBeNull();

    chooseSelectOption(
      document.querySelector<HTMLButtonElement>(
        '[role="dialog"][aria-label="Measurement filters"] button[aria-label="Page"]',
      )!,
      "Page 2 (1)",
    );

    act(() => {
      groupButton.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      groupButton.click();
    });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    const groupingDialog = document.querySelector(
      '[role="dialog"][aria-label="Measurement grouping"]',
    );
    expect(groupingDialog).not.toBeNull();
    expect(groupingDialog?.querySelector("[data-viewer-shortcuts]")).toBeNull();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(document.querySelector('[role="dialog"][aria-label="Measurement grouping"]')).toBeNull();
    expect(document.activeElement).toBe(groupButton);

    act(() => filtersButton.click());
    expect(
      document.querySelector<HTMLButtonElement>(
        '[role="dialog"][aria-label="Measurement filters"] button[aria-label="Page"]',
      )?.textContent,
    ).toBe("Page 2 (1)");

    act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(document.querySelector('[role="dialog"][aria-label="Measurement filters"]')).toBeNull();
  });

  it("closes filter and grouping popovers when keyboard focus leaves their content", () => {
    const activePage = page([measurement()]);
    renderPanel(session({ 1: activePage }), activePage);

    const filtersButton = container!.querySelector<HTMLButtonElement>('[aria-label="Filters"]')!;
    const groupingButton = container!.querySelector<HTMLButtonElement>(
      '[aria-label="Group measurements"]',
    )!;
    act(() => filtersButton.click());
    const filterDialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Measurement filters"]',
    )!;
    const lastFilterControl = Array.from(
      filterDialog.querySelectorAll<HTMLElement>("input, button"),
    ).at(-1)!;
    act(() => lastFilterControl.focus());
    act(() => groupingButton.focus());
    expect(document.querySelector('[role="dialog"][aria-label="Measurement filters"]')).toBeNull();

    act(() => groupingButton.click());
    const groupingDialog = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Measurement grouping"]',
    )!;
    const lastGroupingControl = groupingDialog.querySelector<HTMLButtonElement>(
      'button[aria-label="Group by"]',
    )!;
    const measurementButton = container!.querySelector<HTMLButtonElement>(
      '[aria-label="Select measurement Hallway"]',
    )!;
    act(() => lastGroupingControl.focus());
    act(() => measurementButton.focus());
    expect(document.querySelector('[role="dialog"][aria-label="Measurement grouping"]')).toBeNull();
  });

  it("filters measurements across pages and selects the result on its source page", () => {
    const firstPage = page([measurement({ name: "Hallway" })]);
    const secondPage = {
      ...page([
        measurement({
          id: "line-2",
          name: "Kitchen",
          visible: false,
          classificationValueIds: ["electrical"],
        }),
      ]),
      pageNumber: 2,
    };
    const currentSession = session({ 1: firstPage, 2: secondPage });
    const onSelectMeasurement = vi.fn();
    renderPanel(currentSession, firstPage, onSelectMeasurement);

    const search = container!.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        search,
        "kitchen",
      );
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container!.querySelector('[aria-label="Select measurement Kitchen"]')).not.toBeNull();
    expect(container!.querySelector('[aria-label="Select measurement Hallway"]')).toBeNull();
    act(() => container!.querySelector<HTMLButtonElement>('[aria-label="Filters"]')!.click());

    function chooseFilter(labelText: string, optionLabel: string) {
      const filterDialog = document.querySelector(
        '[role="dialog"][aria-label="Measurement filters"]',
      );
      const select = filterDialog?.querySelector<HTMLButtonElement>(
        `button[aria-label="${labelText}"]`,
      );
      if (!select) throw new Error(`${labelText} filter was not rendered.`);
      chooseSelectOption(select, optionLabel);
    }

    chooseFilter("Page", "Page 1 (1)");
    expect(container!.querySelector('[aria-label="Select measurement Kitchen"]')).toBeNull();
    chooseFilter("Page", "This page (1)");
    expect(container!.querySelector('[aria-label="Select measurement Kitchen"]')).toBeNull();
    chooseFilter("Page", "All pages");
    chooseFilter("Type", "Line (2)");
    chooseFilter("Visibility", "Visible (1)");
    expect(container!.querySelector('[aria-label="Select measurement Kitchen"]')).toBeNull();
    chooseFilter("Visibility", "Hidden (1)");
    chooseFilter("Classification", "Trade: Electrical (1)");
    expect(container!.querySelector('[aria-label="Select measurement Kitchen"]')).not.toBeNull();
    expect(
      container!
        .querySelector<HTMLButtonElement>('[aria-label^="Filters,"]')
        ?.getAttribute("aria-label"),
    ).toBe("Filters, 3 active");
    expect(container!.querySelector('[aria-label^="Filters,"]')?.textContent).toContain("3");

    const clearFiltersButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === "Clear filters");
    if (!clearFiltersButton) throw new Error("Clear filters button was not rendered.");
    act(() => clearFiltersButton.click());
    expect(container!.querySelector('[aria-label="Select measurement Kitchen"]')).not.toBeNull();
    expect(
      Array.from(container!.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.getAttribute("aria-label")?.startsWith("Filters"))
        ?.getAttribute("aria-label"),
    ).toBe("Filters");
    expect(search.value).toBe("kitchen");

    act(() =>
      container!
        .querySelector<HTMLButtonElement>('[aria-label="Select measurement Kitchen"]')!
        .click(),
    );
    expect(onSelectMeasurement).toHaveBeenCalledWith(2, "line-2", false);
  });

  it("offers only present filter values with counts and filters by scale, classification and selection", () => {
    const activePage = {
      ...page([
        measurement({ name: "Hallway", classificationValueIds: ["electrical"] }),
        measurement({ id: "line-2", name: "Kitchen", calibrationId: "old-scale" }),
        {
          id: "count-1",
          type: "count" as const,
          name: "Socket",
          points: [{ x: 1, y: 2 }],
          calibrationId: null,
          classificationValueIds: [],
          visible: true,
        },
      ]),
    };
    state.selectedMeasurementId = "line-2";
    // Page 2 reuses the scale id, but only page 1 is on screen.
    const otherPage = { ...page([measurement({ id: "line-3", name: "Garage" })]), pageNumber: 2 };
    renderPanel(session({ 1: activePage, 2: otherPage }), activePage);
    act(() => container!.querySelector<HTMLButtonElement>('[aria-label="Filters"]')!.click());
    const filterSelect = (labelText: string) =>
      document.querySelector<HTMLButtonElement>(
        `[role="dialog"][aria-label="Measurement filters"] button[aria-label="${labelText}"]`,
      )!;
    const listed = () =>
      Array.from(container!.querySelectorAll('[data-measurement-control="selection"]'), (control) =>
        control.getAttribute("data-measurement-id"),
      );

    expect(selectOptionLabels(filterSelect("Type"))).toEqual([
      "All types",
      "Line (3)",
      "Count (1)",
    ]);
    chooseSelectOption(filterSelect("Scale"), "Active: Scale (1)");
    expect(listed()).toEqual(["line-1"]);
    chooseSelectOption(filterSelect("Scale"), "Other scales (2)");
    expect(listed().sort()).toEqual(["line-2", "line-3"]);
    chooseSelectOption(filterSelect("Scale"), "All scales");
    chooseSelectOption(filterSelect("Classification"), "Unclassified (3)");
    expect(listed().sort()).toEqual(["count-1", "line-2", "line-3"]);
    chooseSelectOption(filterSelect("Selection"), "Selected (1)");
    expect(listed()).toEqual(["line-2"]);
    expect(container!.querySelector('[aria-label="Filters, 2 active"]')).not.toBeNull();
  });

  it("shows project totals with accessible, compact breakdown controls", () => {
    const activePage = page([
      measurement(),
      measurement({
        id: "polygon-1",
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        classificationValueIds: ["electrical"],
      }),
    ]);
    const currentSession = session({ 1: activePage });
    state.session = currentSession;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <TakeoffWorkspace
          pages={currentSession.pages}
          catalog={currentSession.classificationCatalog}
          displayUnit="m"
          decimalPlaces={2}
          areaDisplay="auto"
          pageLabelOverrides={{}}
          sourcePageLabels={null}
        />,
      );
    });
    expect(container?.querySelector('[aria-label="Takeoff workspace"]')).not.toBeNull();
    expect(container?.textContent).toContain("Project totals");
    const breakdown = container?.querySelector("#takeoff-breakdown") as HTMLButtonElement;
    expect(breakdown.getAttribute("aria-label")).toBe("Breakdown");
    expect(breakdown.textContent).toBe("None");
    expect(breakdown.dataset.viewerShortcuts).toBe("enabled");
    expect(container?.querySelector('[aria-label^="Breakdown by"]')).toBeNull();
    expect(selectOptionLabels(breakdown)).toEqual(["None", "Page", "Type", "Classification"]);
    chooseSelectOption(breakdown, "Page");
    expect(container?.textContent).toContain("Project totals");
    expect(container?.querySelector('[aria-label="Breakdown by page"]')).not.toBeNull();
    chooseSelectOption(breakdown, "Type");
    const typeBreakdown = container?.querySelector('[aria-label="Breakdown by type"]');
    expect(typeBreakdown).not.toBeNull();
    const lineGroup = typeBreakdown?.querySelector('[aria-label="Line totals"]');
    expect(lineGroup?.textContent).toContain("Length");
    expect(lineGroup?.textContent).not.toContain("Perimeter");
    expect(lineGroup?.textContent).not.toContain("Area");
    chooseSelectOption(breakdown, "Classification");
    const dimension = container?.querySelector<HTMLButtonElement>('button[aria-label="Dimension"]');
    expect(dimension).not.toBeNull();
    expect(dimension?.dataset.viewerShortcuts).toBe("enabled");
    chooseSelectOption(breakdown, "None");
    expect(container?.querySelector('button[aria-label="Dimension"]')).toBeNull();
  });

  it("reformats project totals when unit, precision, and area preferences change", () => {
    const activePage = page([
      measurement(),
      measurement({
        id: "polygon-1",
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 660, y: 0 },
          { x: 660, y: 660 },
          { x: 0, y: 660 },
        ],
      }),
    ]);
    const currentSession = session({ 1: activePage });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const renderTakeoff = (
      displayUnit: "m" | "ft-in",
      decimalPlaces: 2 | 3,
      areaDisplay: "auto" | "ac",
    ) => {
      act(() => {
        root!.render(
          <TakeoffWorkspace
            pages={currentSession.pages}
            catalog={currentSession.classificationCatalog}
            displayUnit={displayUnit}
            decimalPlaces={decimalPlaces}
            areaDisplay={areaDisplay}
            pageLabelOverrides={{}}
            sourcePageLabels={null}
          />,
        );
      });
    };

    renderTakeoff("m", 2, "auto");
    expect(container.textContent).toContain("1.00 m");
    renderTakeoff("m", 3, "auto");
    expect(container.textContent).toContain("1.000 m");
    renderTakeoff("ft-in", 2, "ac");
    expect(container.textContent).toContain("3' 3 3/8\"");
    expect(container.textContent).toContain("ac");
  });

  it("shows clear empty and excluded-measurement Takeoff states", () => {
    const empty = page([]);
    const emptySession = session({ 1: empty });
    state.session = emptySession;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <TakeoffWorkspace
          pages={emptySession.pages}
          catalog={emptySession.classificationCatalog}
          displayUnit="m"
          decimalPlaces={2}
          areaDisplay="auto"
          pageLabelOverrides={{}}
          sourcePageLabels={null}
        />,
      ),
    );
    expect(container?.textContent).toContain("Project totals");
    expect(container?.textContent).toContain("No measurements in this project.");
    act(() => root?.unmount());
    container?.remove();

    const invalidPage = page([measurement({ calibrationId: "missing" })]);
    const invalidSession = session({ 1: invalidPage });
    state.session = invalidSession;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <TakeoffWorkspace
          pages={invalidSession.pages}
          catalog={invalidSession.classificationCatalog}
          displayUnit="m"
          decimalPlaces={2}
          areaDisplay="auto"
          pageLabelOverrides={{}}
          sourcePageLabels={null}
        />,
      ),
    );
    expect(container?.textContent).toContain(
      "1 measurement was excluded because it cannot be calculated.",
    );
    expect(container?.textContent).toContain("No calculable quantities.");
  });
});

describe("MeasurementPanel default filters", () => {
  const hallway = '[aria-label="Select measurement Hallway"]';
  const kitchen = '[aria-label="Select measurement Kitchen"]';

  function twoPages() {
    const firstPage = page([measurement({ name: "Hallway" })]);
    const secondPage = {
      ...page([
        measurement({
          id: "line-2",
          name: "Kitchen",
          visible: false,
          classificationValueIds: ["electrical"],
        }),
      ]),
      pageNumber: 2,
    };
    return { firstPage, currentSession: session({ 1: firstPage, 2: secondPage }) };
  }

  it("starts with the app defaults and clears them with Clear filters", () => {
    setAppPreference("defaultMeasurementFilters", {
      ...NO_DEFAULT_MEASUREMENT_FILTERS,
      visibility: "false",
    });
    const { firstPage, currentSession } = twoPages();
    renderPanel(currentSession, firstPage);

    expect(container!.querySelector(hallway)).toBeNull();
    expect(container!.querySelector(kitchen)).not.toBeNull();
    expect(container!.querySelector('[aria-label="Filters, 1 active"]')).not.toBeNull();

    act(() => container!.querySelector<HTMLButtonElement>('[aria-label^="Filters,"]')!.click());
    const clear = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Clear filters",
    );
    act(() => clear!.click());

    expect(container!.querySelector(hallway)).not.toBeNull();
    expect(container!.querySelector(kitchen)).not.toBeNull();
    expect(container!.querySelector('[aria-label="Filters"]')).not.toBeNull();
  });

  it("follows the page on screen with the This page default", () => {
    setAppPreference("defaultMeasurementFilters", {
      ...NO_DEFAULT_MEASUREMENT_FILTERS,
      page: "current",
    });
    const { firstPage, currentSession } = twoPages();
    renderPanel(currentSession, firstPage);

    expect(container!.querySelector(hallway)).not.toBeNull();
    expect(container!.querySelector(kitchen)).toBeNull();
  });

  it("uses the project's own filters instead of the app defaults", () => {
    setAppPreference("defaultMeasurementFilters", {
      ...NO_DEFAULT_MEASUREMENT_FILTERS,
      visibility: "false",
    });
    const { firstPage, currentSession } = twoPages();
    currentSession.settings.defaultMeasurementFilters = {
      ...NO_DEFAULT_MEASUREMENT_FILTERS,
      classification: "electrical",
    };
    renderPanel(currentSession, firstPage);

    expect(container!.querySelector(hallway)).toBeNull();
    expect(container!.querySelector(kitchen)).not.toBeNull();
    expect(container!.querySelector('[aria-label="Filters, 1 active"]')).not.toBeNull();
  });

  it("lets a project show everything while the app default filters", () => {
    setAppPreference("defaultMeasurementFilters", {
      ...NO_DEFAULT_MEASUREMENT_FILTERS,
      visibility: "false",
    });
    const { firstPage, currentSession } = twoPages();
    currentSession.settings.defaultMeasurementFilters = { ...NO_DEFAULT_MEASUREMENT_FILTERS };
    renderPanel(currentSession, firstPage);

    expect(container!.querySelector(hallway)).not.toBeNull();
    expect(container!.querySelector(kitchen)).not.toBeNull();
  });

  it("ignores a default classification that no longer exists", () => {
    const { firstPage, currentSession } = twoPages();
    currentSession.settings.defaultMeasurementFilters = {
      ...NO_DEFAULT_MEASUREMENT_FILTERS,
      classification: "deleted-value",
    };
    renderPanel(currentSession, firstPage);

    expect(container!.querySelector(hallway)).not.toBeNull();
    expect(container!.querySelector(kitchen)).not.toBeNull();
    expect(container!.querySelector('[aria-label="Filters"]')).not.toBeNull();
  });

  it("applies the defaults when the panel mounts, not when they change afterwards", () => {
    const { firstPage, currentSession } = twoPages();
    renderPanel(currentSession, firstPage);
    act(() =>
      setAppPreference("defaultMeasurementFilters", {
        ...NO_DEFAULT_MEASUREMENT_FILTERS,
        visibility: "false",
      }),
    );

    expect(container!.querySelector(hallway)).not.toBeNull();
    expect(container!.querySelector('[aria-label="Filters"]')).not.toBeNull();
  });
});
