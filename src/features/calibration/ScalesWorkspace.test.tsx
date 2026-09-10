/* @vitest-environment jsdom */

// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceDrawerProvider } from "../../app/WorkspaceDrawerContext";
import { computeAuthoringCapability } from "../viewer/AuthoringCapability";
import type { Measurement, PageCalibration, PageState } from "../../types/domain";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { ScalesWorkspace, type ScalesWorkspaceProps } from "./ScalesWorkspace";

const scalesCss = readFileSync("src/features/calibration/ScalesWorkspace.module.css", "utf8");

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

function renderScalesWithUnavailablePrecision(props: ScalesWorkspaceProps, reason: string) {
  const capability = computeAuthoringCapability({
    viewerSize: { width: 479, height: 500 },
    rightObstruction: 0,
    bottomExclusion: 0,
    finePointer: true,
  });
  act(() =>
    root!.render(
      <WorkspaceDrawerProvider
        value={{
          isNarrow: true,
          narrowVersion: 1,
          open: true,
          close: () => undefined,
          currentCapability: capability,
          capabilityWithoutDrawer: capability,
          canRecoverAuthoringByClosingWorkspace: false,
          precisionActionAvailable: false,
          precisionDisabledReason: reason,
          requestPrecisionAuthoring: () => false,
        }}
      >
        <ScalesWorkspace {...props} />
      </WorkspaceDrawerProvider>,
    ),
  );
}

function renderScalesWithRecoverablePrecision(
  props: ScalesWorkspaceProps,
  requestPrecisionAuthoring: (start: () => void) => boolean,
) {
  const current = computeAuthoringCapability({
    viewerSize: { width: 768, height: 600 },
    rightObstruction: 304,
    bottomExclusion: 0,
    finePointer: true,
  });
  const withoutDrawer = computeAuthoringCapability({
    viewerSize: { width: 768, height: 600 },
    rightObstruction: 0,
    bottomExclusion: 0,
    finePointer: true,
  });
  act(() =>
    root!.render(
      <WorkspaceDrawerProvider
        value={{
          isNarrow: true,
          narrowVersion: 1,
          open: true,
          close: () => undefined,
          currentCapability: current,
          capabilityWithoutDrawer: withoutDrawer,
          canRecoverAuthoringByClosingWorkspace: true,
          precisionActionAvailable: true,
          precisionDisabledReason: current.unavailableReason ?? "Unavailable",
          requestPrecisionAuthoring,
        }}
      >
        <ScalesWorkspace {...props} />
      </WorkspaceDrawerProvider>,
    ),
  );
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
    const activeRow = active.closest<HTMLElement>('[role="listitem"]');
    if (!activeRow) throw new Error("Active scale row was not rendered.");
    expect(activeRow.textContent).toContain("Active");
    expect(activeRow.textContent).not.toContain("✓");
    expect(activeRow.textContent).not.toContain("···");
    expect(activeRow.textContent).toContain("Ground floor");
    expect(inactive.textContent).not.toContain("Active");
    expect(container?.textContent).toContain(scaleDisplayMetadata(uniform).detailLabel);
    expect(container?.textContent).toContain(scaleDisplayMetadata(xy).detailLabel);
    expect(active.getAttribute("aria-expanded")).toBe("false");
    expect(inactive.getAttribute("aria-expanded")).toBe("false");
    expect(active.querySelector("svg")).toBeTruthy();
    expect(scalesCss).toMatch(
      /\.disclosureButton\s*\{[^}]*width:\s*var\(--target-current\);[^}]*min-width:\s*var\(--target-current\);[^}]*height:\s*var\(--target-current\);[^}]*min-height:\s*var\(--target-current\);/s,
    );
  });

  it("keeps disclosure and long-name recovery on the dedicated governed target", () => {
    const longName = "Ground floor – north extension with a deliberately long calibration name";
    renderScales(
      createProps({
        page: {
          ...page,
          calibrations: [{ ...uniform, name: longName }, xy],
        },
      }),
    );

    const disclosure = buttonByLabel(`Inspect scale ${longName}, active`);
    const identity = container?.querySelector<HTMLElement>("article strong");
    expect(identity?.textContent).toBe(longName);
    expect(identity?.title).toBe(longName);
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    act(() => disclosure.click());
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
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
    expect(buttonWithin(details, "Recalibrate").className).toContain("ghost");
    expect(buttonWithin(details, "Edit X").className).toContain("ghost");
    expect(buttonWithin(details, "Edit Y").className).toContain("ghost");

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
    const scaleList = container?.querySelector('[role="list"][aria-label="Page scales"]');
    expect(scaleList?.nextElementSibling?.contains(add)).toBe(true);

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
    expect(buttonWithin(details, "Recalibrate").className).toContain("ghost");
    expect(buttonWithin(details, "Edit reference").className).toContain("ghost");
    act(() => buttonWithin(details, "Edit reference").click());
    expect(props.onEditReference).toHaveBeenCalledWith(uniform, "uniform");
  });

  it("keeps scale inspection available while precision actions are disabled with an accessible reason", () => {
    const reason = "Precision editing needs a fine pointer.";
    renderScalesWithUnavailablePrecision(createProps(), reason);

    const inspect = buttonByLabel("Inspect scale Ground floor, active");
    expect(inspect.disabled).toBe(false);
    act(() => inspect.click());
    const detailsId = inspect.getAttribute("aria-controls");
    const details = detailsId ? document.getElementById(detailsId) : null;
    if (!details) throw new Error("Scale details were not rendered.");
    const recalibrate = buttonWithin(details, "Recalibrate");
    const edit = buttonWithin(details, "Edit reference");
    const add = buttonByLabel("Add scale");

    expect(recalibrate.disabled).toBe(false);
    expect(edit.disabled).toBe(false);
    expect(recalibrate.getAttribute("aria-disabled")).toBe("true");
    expect(edit.getAttribute("aria-disabled")).toBe("true");
    expect(add.disabled).toBe(false);
    expect(document.getElementById(recalibrate.getAttribute("aria-describedby")!)?.textContent).toBe(
      reason,
    );
    act(() => add.click());
    const addItems = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(addItems).toHaveLength(2);
    expect(addItems.every((item) => item.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(addItems.every((item) => item.textContent?.includes(reason))).toBe(true);
  });

  it("routes every scale spatial entry through the shared recoverable-authoring handoff", () => {
    const props = createProps();
    const pending: Array<() => void> = [];
    const request = vi.fn((start: () => void) => {
      pending.push(start);
      return true;
    });
    renderScalesWithRecoverablePrecision(props, request);

    const add = buttonByLabel("Add scale");
    expect(add.disabled).toBe(false);
    act(() => add.click());
    let items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    act(() => items[0]?.click());
    act(() => add.click());
    items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    act(() => items[1]?.click());

    const uniformInspect = buttonByLabel("Inspect scale Ground floor, active");
    act(() => uniformInspect.click());
    const uniformDetails = document.getElementById(uniformInspect.getAttribute("aria-controls")!);
    if (!uniformDetails) throw new Error("Uniform details were not rendered.");
    act(() => buttonWithin(uniformDetails, "Recalibrate").click());
    act(() => buttonWithin(uniformDetails, "Edit reference").click());

    const xyInspect = buttonByLabel("Inspect scale Survey correction");
    act(() => xyInspect.click());
    const xyDetails = document.getElementById(xyInspect.getAttribute("aria-controls")!);
    if (!xyDetails) throw new Error("X/Y details were not rendered.");
    act(() => buttonWithin(xyDetails, "Edit X").click());
    act(() => buttonWithin(xyDetails, "Edit Y").click());

    expect(request).toHaveBeenCalledTimes(6);
    expect(props.onAddScale).not.toHaveBeenCalled();
    expect(props.onRecalibrate).not.toHaveBeenCalled();
    expect(props.onEditReference).not.toHaveBeenCalled();

    pending.forEach((start) => start());
    expect(props.onAddScale).toHaveBeenNthCalledWith(1, "uniform");
    expect(props.onAddScale).toHaveBeenNthCalledWith(2, "xy");
    expect(props.onRecalibrate).toHaveBeenCalledWith("uniform");
    expect(props.onEditReference).toHaveBeenCalledWith(uniform, "uniform");
    expect(props.onEditReference).toHaveBeenCalledWith(xy, "x");
    expect(props.onEditReference).toHaveBeenCalledWith(xy, "y");
  });
});
