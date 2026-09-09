/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassificationCatalog, Measurement, PageState } from "../../types/domain";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { MeasurementDetails, type MeasurementDetailsProps } from "./MeasurementDetails";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const firstMeasurement: Measurement = {
  id: "line-1",
  type: "line",
  name: "Hallway",
  calibrationId: "historical",
  classificationValueIds: ["electrical"],
  visible: true,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
};

const secondMeasurement: Measurement = {
  ...firstMeasurement,
  id: "line-2",
  name: "Lobby",
  classificationValueIds: [],
};

const page: PageState = {
  pageNumber: 7,
  calibrations: [
    {
      id: "historical",
      name: "Original scale",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
    {
      id: "active",
      name: "Current active scale",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 5000,
    },
  ],
  activeCalibrationId: "active",
  nextCalibrationNumber: 3,
  measurements: [firstMeasurement, secondMeasurement],
  nextMeasurementNumber: { line: 3, polyline: 1, polygon: 1 },
};

const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [{ id: "electrical", name: "Electrical", archived: false }],
    },
  ],
};

function createProps(overrides: Partial<MeasurementDetailsProps> = {}): MeasurementDetailsProps {
  return {
    page,
    measurement: firstMeasurement,
    displayUnit: "m",
    catalog,
    returnModule: "classifications",
    onBack: vi.fn(),
    onRename: vi.fn(),
    onAssignClassification: vi.fn(),
    onEditGeometry: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

function renderDetails(props: MeasurementDetailsProps) {
  act(() => root!.render(<MeasurementDetails key={props.measurement.id} {...props} />));
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button ${text} was not rendered.`);
  return button;
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
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("MeasurementDetails", () => {
  it("derives result and linked scale from the selected measurement, not the active scale", () => {
    renderDetails(createProps());

    expect(container?.textContent).toContain("Hallway");
    expect(container?.textContent).toContain("1.00 m");
    expect(container?.textContent).toContain(
      `Original scale · ${scaleDisplayMetadata(page.calibrations[0]!).ratioLabel}`,
    );
    expect(container?.textContent).not.toContain("Current active scale");
    expect(container?.textContent).toContain("Uniform");
    expect(container?.textContent).toContain("Page7");
    expect(container?.querySelector<HTMLSelectElement>('select[id*="-line-1-trade"]')?.value).toBe(
      "electrical",
    );
    expect(buttonByText("‹ Back to classifications")).toBeTruthy();
  });

  it("wires Back, geometry edit, delete, and classification assignment to existing commands", () => {
    const props = createProps();
    renderDetails(props);

    act(() => buttonByText("‹ Back to classifications").click());
    act(() => buttonByText("Edit geometry").click());
    act(() => buttonByText("Delete measurement").click());
    const assignment = container?.querySelector<HTMLSelectElement>('select[id*="-line-1-trade"]');
    if (!assignment) throw new Error("Classification assignment select was not rendered.");
    act(() => {
      assignment.value = "";
      assignment.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(props.onBack).toHaveBeenCalledOnce();
    expect(props.onEditGeometry).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(props.onAssignClassification).toHaveBeenCalledWith("line-1", "trade", null);
  });

  it("renames through the canonical command and trims the submitted name", () => {
    const props = createProps();
    renderDetails(props);
    act(() => buttonByText("Rename").click());
    const input = container?.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("Rename input was not rendered.");

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "  Main hallway  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = input.closest("form");
    if (!form) throw new Error("Rename form was not rendered.");
    act(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(props.onRename).toHaveBeenCalledWith("Main hallway");
    expect(container?.querySelector("input")).toBeNull();
  });

  it("resets local rename UI when canonical selection changes while Details stays open", () => {
    const props = createProps();
    renderDetails(props);
    act(() => buttonByText("Rename").click());
    expect(container?.querySelector("input")).not.toBeNull();

    renderDetails(createProps({ ...props, measurement: secondMeasurement }));

    expect(container?.querySelector("input")).toBeNull();
    expect(container?.textContent).toContain("Lobby");
    expect(container?.getAttribute("aria-label")).toBeNull();
    expect(container?.querySelector('section[aria-label="Details for Lobby"]')).not.toBeNull();
  });
});
