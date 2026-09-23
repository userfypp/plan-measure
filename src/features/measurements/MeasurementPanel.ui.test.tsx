/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSession, Measurement, PageState } from "../../types/domain";

const state = vi.hoisted(() => ({
  session: null as CurrentSession | null,
  selectedMeasurementId: null as string | null,
}));

vi.mock("../../app/sessionState", () => ({ useSessionState: () => ({ session: state.session }) }));
vi.mock("../../app/workspaceState", () => ({
  useWorkspaceState: () => ({ selectedMeasurementId: state.selectedMeasurementId }),
}));

import { MeasurementPanel } from "./MeasurementPanel";
import { TakeoffWorkspace } from "./TakeoffWorkspace";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function measurement(overrides: Partial<Measurement> = {}): Measurement {
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
    nextMeasurementNumber: { line: 2, polyline: 1, polygon: 1 },
  };
}

function session(pages: Record<number, PageState>, withCatalog = true): CurrentSession {
  return {
    schemaVersion: 11,
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

function renderPanel(currentSession: CurrentSession, activePage: PageState) {
  state.session = currentSession;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <MeasurementPanel
        page={activePage}
        onSelectMeasurement={() => undefined}
        onSetMeasurementVisibility={() => undefined}
        onSetMeasurementsVisibility={() => undefined}
      />,
    );
  });
}

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
});

describe("MeasurementPanel and TakeoffWorkspace", () => {
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

    function choose(index: number, value: string) {
      const select = container!.querySelectorAll<HTMLSelectElement>("header select")[index]!;
      act(() => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    choose(0, "trade");
    choose(1, "status");
    expect(Array.from(container!.querySelectorAll<HTMLSelectElement>("header select"), (select) => select.value)).toEqual([
      "trade", "status",
    ]);
    const electrical = container!.querySelector('[aria-label="Electrical measurement group"]');
    expect(electrical?.querySelector('[aria-label="Approved measurement group"]')).not.toBeNull();
    expect(container!.querySelectorAll('[data-measurement-id="line-1"][data-measurement-control="selection"]')).toHaveLength(1);

    choose(0, "status");
    expect(Array.from(container!.querySelectorAll<HTMLSelectElement>("header select"), (select) => select.value)).toEqual([
      "status", "trade",
    ]);
    const approved = container!.querySelector('[aria-label="Approved measurement group"]');
    expect(approved?.querySelector('[aria-label="Electrical measurement group"]')).not.toBeNull();

    choose(1, "");
    expect(Array.from(container!.querySelectorAll<HTMLSelectElement>("header select"), (select) => select.value)).toEqual([
      "status", "",
    ]);

    act(() => container!.querySelector<HTMLButtonElement>('[aria-label="Clear all grouping"]')!.click());
    expect(Array.from(container!.querySelectorAll<HTMLSelectElement>("header select"), (select) => select.value)).toEqual([
      "",
    ]);
    expect(container!.querySelector('[aria-label="Measurements grouped by classification"]')).toBeNull();
    expect(container!.querySelector('[aria-label="Select measurement Hallway"]')).not.toBeNull();
  });

  it("keeps Measurements dedicated to its list", () => {
    const activePage = page([measurement()]);
    renderPanel(session({ 1: activePage }), activePage);

    expect(container?.querySelector('aside[aria-label="Measurements on current page"]')).not.toBeNull();
    expect(container?.textContent).not.toContain("Summary");
    expect(container?.textContent).not.toContain("List");
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
    const breakdown = container?.querySelector("#takeoff-breakdown") as HTMLSelectElement;
    expect(breakdown.labels?.[0]?.textContent).toBe("Breakdown");
    expect(breakdown.value).toBe("none");
    expect(breakdown.dataset.viewerShortcuts).toBe("enabled");
    expect(container?.querySelector('[aria-label^="Breakdown by"]')).toBeNull();
    expect(Array.from(breakdown.options).map((option) => option.text)).toEqual([
      "None",
      "Page",
      "Type",
      "Classification",
    ]);
    act(() => {
      breakdown.value = "page";
      breakdown.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container?.textContent).toContain("Project totals");
    expect(container?.querySelector('[aria-label="Breakdown by page"]')).not.toBeNull();
    act(() => {
      breakdown.value = "type";
      breakdown.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const typeBreakdown = container?.querySelector('[aria-label="Breakdown by type"]');
    expect(typeBreakdown).not.toBeNull();
    const lineGroup = typeBreakdown?.querySelector('[aria-label="Line totals"]');
    expect(lineGroup?.textContent).toContain("Length");
    expect(lineGroup?.textContent).not.toContain("Perimeter");
    expect(lineGroup?.textContent).not.toContain("Area");
    act(() => {
      breakdown.value = "classification";
      breakdown.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const dimension = container?.querySelector<HTMLSelectElement>(
      'select[aria-label="Dimension"]',
    );
    expect(dimension).not.toBeNull();
    expect(dimension?.dataset.viewerShortcuts).toBe("enabled");
    act(() => {
      breakdown.value = "none";
      breakdown.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container?.querySelector('select[aria-label="Dimension"]')).toBeNull();
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
