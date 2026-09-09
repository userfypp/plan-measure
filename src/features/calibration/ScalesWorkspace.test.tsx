/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Measurement, PageCalibration, PageState } from "../../types/domain";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { ScalesWorkspace, type ScalesWorkspaceProps } from "./ScalesWorkspace";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const uniform: PageCalibration = {
  id: "uniform",
  name: "Ground floor",
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },
  referenceDistanceMm: 1000,
};

const xy: PageCalibration = {
  id: "xy",
  name: "Survey correction",
  mode: "xy",
  xReference: {
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    referenceDistanceMm: 2500,
  },
  yReference: {
    start: { x: 0, y: 0 },
    end: { x: 0, y: 10 },
    referenceDistanceMm: 3000,
  },
};

const historicalMeasurement: Measurement = {
  id: "line-1",
  type: "line",
  name: "Hallway",
  calibrationId: uniform.id,
  classificationValueIds: [],
  visible: true,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
};

const page: PageState = {
  pageNumber: 1,
  calibrations: [uniform, xy],
  activeCalibrationId: uniform.id,
  nextCalibrationNumber: 3,
  measurements: [historicalMeasurement],
  nextMeasurementNumber: { line: 2, polyline: 1, polygon: 1 },
};

function createProps(overrides: Partial<ScalesWorkspaceProps> = {}): ScalesWorkspaceProps {
  return {
    page,
    onAddScale: vi.fn(),
    onRecalibrate: vi.fn(),
    onEditReference: vi.fn(),
    ...overrides,
  };
}

function renderScales(props: ScalesWorkspaceProps) {
  act(() => root!.render(<ScalesWorkspace {...props} />));
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button with label ${label} was not rendered.`);
  return button;
}

function buttonWithin(element: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button ${text} was not rendered in the requested scale details.`);
  return button;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
  document.querySelectorAll('[role="menu"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("ScalesWorkspace", () => {
  it("lists page scales, marks active status structurally, and keeps administration separate from switching", () => {
    renderScales(createProps());

    const active = buttonByLabel("Inspect scale Ground floor, active");
    const inactive = buttonByLabel("Inspect scale Survey correction");
    expect(active.textContent).toContain("Active");
    expect(active.textContent).toContain("Ground floor");
    expect(inactive.textContent).not.toContain("Active");
    expect(container?.textContent).toContain(scaleDisplayMetadata(uniform).detailLabel);
    expect(container?.textContent).toContain(scaleDisplayMetadata(xy).detailLabel);
    expect(active.getAttribute("aria-expanded")).toBe("false");
    expect(inactive.getAttribute("aria-expanded")).toBe("false");
  });

  it("expands X/Y administration with separate Edit X and Edit Y commands", () => {
    const props = createProps();
    renderScales(props);
    const inspect = buttonByLabel("Inspect scale Survey correction");
    const detailsId = inspect.getAttribute("aria-controls");
    if (!detailsId) throw new Error("Scale disclosure did not expose aria-controls.");
    expect(document.getElementById(detailsId)?.hasAttribute("hidden")).toBe(true);

    act(() => inspect.click());
    const details = document.getElementById(detailsId);
    if (!details) throw new Error("Expanded X/Y details were not rendered.");
    expect(details.hasAttribute("hidden")).toBe(false);
    expect(details.textContent).toContain("X reference2.50 m");
    expect(details.textContent).toContain("Y reference3.00 m");

    act(() => buttonWithin(details, "Recalibrate").click());
    act(() => buttonWithin(details, "Edit X").click());
    act(() => buttonWithin(details, "Edit Y").click());
    expect(props.onRecalibrate).toHaveBeenCalledWith("xy");
    expect(props.onEditReference).toHaveBeenNthCalledWith(1, xy, "x");
    expect(props.onEditReference).toHaveBeenNthCalledWith(2, xy, "y");
    expect(page.measurements[0]?.calibrationId).toBe("uniform");
  });

  it("offers exactly Uniform and X/Y from the single Add scale disclosure", () => {
    const props = createProps();
    renderScales(props);
    const add = buttonByLabel("Add scale");

    act(() => add.click());
    let items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.textContent)).toEqual([
      "UniformOne reference",
      "X/YSeparate X and Y references",
    ]);
    act(() => items[1]?.click());
    expect(props.onAddScale).toHaveBeenCalledWith("xy");

    act(() => add.click());
    items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    act(() => items[0]?.click());
    expect(props.onAddScale).toHaveBeenCalledWith("uniform");
  });

  it("keeps Uniform reference editing explicit", () => {
    const props = createProps();
    renderScales(props);
    const inspect = buttonByLabel("Inspect scale Ground floor, active");
    const detailsId = inspect.getAttribute("aria-controls");
    if (!detailsId) throw new Error("Uniform scale disclosure did not expose aria-controls.");
    act(() => inspect.click());
    const details = document.getElementById(detailsId);
    if (!details) throw new Error("Expanded Uniform details were not rendered.");

    expect(details.textContent).toContain("Reference1.00 m");
    act(() => buttonWithin(details, "Edit reference").click());
    expect(props.onEditReference).toHaveBeenCalledWith(uniform, "uniform");
  });
});
