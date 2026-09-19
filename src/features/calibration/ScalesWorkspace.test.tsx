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
    displayUnit: "m",
    onAddScale: vi.fn(),
    onAddPresetScale: vi.fn(),
    onRenameScale: vi.fn(),
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

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function scaleNameInput(): HTMLInputElement {
  const input = container?.querySelector<HTMLInputElement>('input[aria-label="Scale name"]');
  if (!input) throw new Error("Scale rename input was not rendered.");
  return input;
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

    const active = buttonByLabel("Expand scale Ground floor, active");
    const inactive = buttonByLabel("Expand scale Survey correction");
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
    expect(container?.textContent).toContain(
      "Before drawing, switch the active scale from the Viewer Dock. Changing it does not relink measurements.",
    );
    expect(scalesCss).toMatch(
      /\.disclosureButton\s*\{[^}]*width:\s*var\(--target-current\);[^}]*min-width:\s*var\(--target-current\);[^}]*height:\s*var\(--target-current\);[^}]*min-height:\s*var\(--target-current\);/s,
    );
  });

  it("keeps zero- and one-scale pages clear without suggesting a switch that is not available", () => {
    renderScales(
      createProps({
        page: {
          ...page,
          calibrations: [],
          activeCalibrationId: null,
        },
      }),
    );
    expect(container?.textContent).toContain("Add a scale to begin measuring.");
    expect(container?.textContent).not.toContain("Viewer Dock");
    expect(container?.textContent).not.toContain("Changing the active scale");

    renderScales(
      createProps({
        page: {
          ...page,
          calibrations: [uniform],
          activeCalibrationId: uniform.id,
        },
      }),
    );
    expect(buttonByLabel("Expand scale Ground floor, active")).toBeTruthy();
    expect(container?.textContent).toContain("Changing the active scale does not relink measurements.");
    expect(container?.textContent).not.toContain("Viewer Dock");
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

    const disclosure = buttonByLabel(`Expand scale ${longName}, active`);
    const identity = container?.querySelector<HTMLElement>("article strong");
    expect(identity?.textContent).toBe(longName);
    expect(identity?.title).toBe(longName);
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    act(() => disclosure.click());
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    const detailName = container?.querySelector<HTMLElement>("strong[title]");
    expect(detailName?.title).toBe(longName);
    act(() => buttonByLabel(`Rename scale ${longName}`).click());
    const input = container?.querySelector<HTMLInputElement>('input[aria-label="Scale name"]');
    expect(input?.value).toBe(longName);
  });

  it("expands X/Y administration with identity, paired reference actions, and a recalibration footer", () => {
    const props = createProps();
    renderScales(props);
    const inspect = buttonByLabel("Expand scale Survey correction");
    const detailsId = inspect.getAttribute("aria-controls");
    if (!detailsId) throw new Error("Scale disclosure did not expose aria-controls.");
    expect(document.getElementById(detailsId)?.hasAttribute("hidden")).toBe(true);

    act(() => inspect.click());
    const details = document.getElementById(detailsId);
    if (!details) throw new Error("Expanded X/Y details were not rendered.");
    expect(details.hasAttribute("hidden")).toBe(false);
    expect(details.textContent).toContain("IdentityScale nameSurvey correctionRename");
    expect(details.textContent).toContain("CalibrationX reference2.50 mEdit points");
    expect(details.textContent).toContain("Y reference3.00 mEdit points");
    expect(buttonWithin(details, "Recalibrate scale").className).toContain("secondary");
    const editX = details.querySelector<HTMLButtonElement>('button[aria-label="Edit X reference points"]');
    const editY = details.querySelector<HTMLButtonElement>('button[aria-label="Edit Y reference points"]');
    if (!editX || !editY) throw new Error("X/Y reference actions were not rendered.");
    expect(editX.textContent?.trim()).toBe("Edit points");
    expect(editY.textContent?.trim()).toBe("Edit points");
    expect(scalesCss).toContain("grid-template-columns: minmax(0, 1fr) auto;");
    expect(scalesCss).toMatch(/\.renameForm\s*\{[^}]*display:\s*grid;/s);
    expect(scalesCss).toMatch(/\.recalibrateButton\s*\{[^}]*width:\s*100%;/s);

    act(() => buttonWithin(details, "Recalibrate scale").click());
    act(() => editX.click());
    act(() => editY.click());
    expect(props.onRecalibrate).toHaveBeenCalledWith("xy");
    expect(props.onEditReference).toHaveBeenNthCalledWith(1, xy, "x");
    expect(props.onEditReference).toHaveBeenNthCalledWith(2, xy, "y");
    expect(page.measurements[0]?.calibrationId).toBe("uniform");
  });

  it("formats calibration references using the current imperial Viewer display mode", () => {
    renderScales(createProps({ displayUnit: "in" }));
    act(() => buttonByLabel("Expand scale Ground floor, active").click());
    expect(container?.textContent).toContain("Reference39.37 in");

    renderScales(createProps({ displayUnit: "ft" }));
    expect(container?.textContent).toContain("Reference3.28 ft");

    const architecturalPage: PageState = {
      ...page,
      calibrations: [{ ...uniform, referenceDistanceMm: 3771.9 }, xy],
    };
    renderScales(createProps({ page: architecturalPage, displayUnit: "ft-in" }));
    expect(container?.textContent).toContain('Reference12\' 4 1/2"');
  });

  it("groups compact manual modes before a Standard ratios section", () => {
    const props = createProps();
    renderScales(props);
    const add = buttonByLabel("Add scale");
    const scaleList = container?.querySelector('[role="list"][aria-label="Page scales"]');
    expect(scaleList?.nextElementSibling?.contains(add)).toBe(true);

    act(() => add.click());
    let items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.textContent)).toEqual([
      "UniformOne reference",
      "X/YSeparate X and Y references",
      "1:20",
      "1:50",
      "1:100",
    ]);
    const sectionLabel = document.querySelector<HTMLElement>('[data-menu-section-label="true"]');
    expect(sectionLabel?.textContent).toBe("Standard ratios");
    expect(sectionLabel?.getAttribute("role")).toBe("separator");
    expect(sectionLabel?.getAttribute("aria-label")).toBe("Standard ratios");
    expect(scalesCss).toMatch(
      /\.addScaleMenu\[role="menu"\]\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*min\(224px,\s*calc\(100vw\s*-\s*var\(--space-16\)\)\);/s,
    );
    expect(scalesCss).toMatch(
      /\.addScaleMenu \[data-menu-section-label="true"\]\s*\{[^}]*padding:\s*var\(--space-4\) var\(--space-8\) 0;/s,
    );
    act(() => items[3]?.click());
    expect(props.onAddPresetScale).toHaveBeenCalledWith(50);

    act(() => add.click());
    items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    act(() => items[1]?.click());
    expect(props.onAddScale).toHaveBeenCalledWith("xy");

    act(() => add.click());
    items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    act(() => items[0]?.click());
    expect(props.onAddScale).toHaveBeenCalledWith("uniform");
  });

  it("keeps the section heading out of keyboard navigation and visits all five options", () => {
    renderScales(createProps());
    act(() => buttonByLabel("Add scale").click());
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(items[0]);

    for (let index = 1; index < items.length; index += 1) {
      act(() =>
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
        ),
      );
      expect(document.activeElement).toBe(items[index]);
    }

    expect(document.querySelector('[data-menu-section-label="true"]')).not.toBe(document.activeElement);
    expect(items.map((item) => item.tabIndex)).toEqual([-1, -1, -1, -1, 0]);
  });

  it("keeps Uniform reference editing explicit and paired with its value", () => {
    const props = createProps();
    renderScales(props);
    const inspect = buttonByLabel("Expand scale Ground floor, active");
    const detailsId = inspect.getAttribute("aria-controls");
    if (!detailsId) throw new Error("Uniform scale disclosure did not expose aria-controls.");
    act(() => inspect.click());
    const details = document.getElementById(detailsId);
    if (!details) throw new Error("Expanded Uniform details were not rendered.");

    expect(details.textContent).toContain("CalibrationReference1.00 mEdit points");
    expect(buttonWithin(details, "Recalibrate scale").className).toContain("secondary");
    const edit = details.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit uniform reference points"]',
    );
    if (!edit) throw new Error("Uniform reference action was not rendered.");
    expect(edit.textContent?.trim()).toBe("Edit points");
    act(() => edit.click());
    expect(props.onEditReference).toHaveBeenCalledWith(uniform, "uniform");
  });

  it("renames inline with focus, trimming, Enter/Save, no-op, validation, and focus restoration", () => {
    const props = createProps();
    renderScales(props);
    act(() => buttonByLabel("Expand scale Ground floor, active").click());
    let rename = buttonByLabel("Rename scale Ground floor");

    act(() => rename.click());
    const initialInput = scaleNameInput();
    expect(initialInput.closest("form")?.textContent).toContain("Scale name");
    expect(document.activeElement).toBe(initialInput);
    expect(initialInput.value).toBe("Ground floor");
    expect(initialInput.selectionStart).toBe(0);
    expect(initialInput.selectionEnd).toBe("Ground floor".length);
    act(() => initialInput.blur());
    expect(container?.querySelector('input[aria-label="Scale name"]')).toBe(initialInput);
    expect(props.onRenameScale).not.toHaveBeenCalled();
    act(() => initialInput.focus());
    setInputValue(initialInput, "  Ground floor revised  ");
    act(() =>
      initialInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      ),
    );
    expect(props.onRenameScale).toHaveBeenCalledWith("uniform", "Ground floor revised");
    expect(container?.querySelector('input[aria-label="Scale name"]')).toBeNull();
    rename = buttonByLabel("Rename scale Ground floor");
    expect(document.activeElement).toBe(rename);

    act(() => rename.click());
    const noOpInput = scaleNameInput();
    setInputValue(noOpInput, " Ground floor ");
    act(() => buttonWithin(noOpInput.closest("form")!, "Save").click());
    expect(props.onRenameScale).toHaveBeenCalledTimes(1);
    rename = buttonByLabel("Rename scale Ground floor");
    expect(document.activeElement).toBe(rename);

    act(() => rename.click());
    const validationInput = scaleNameInput();
    setInputValue(validationInput, "   ");
    act(() => buttonWithin(validationInput.closest("form")!, "Save").click());
    expect(validationInput.getAttribute("aria-invalid")).toBe("true");
    const errorId = validationInput.getAttribute("aria-describedby");
    expect(errorId).not.toBeNull();
    expect(document.getElementById(errorId!)?.textContent).toBe("Scale name cannot be empty.");
    expect(document.getElementById(errorId!)?.getAttribute("role")).toBe("alert");
    expect(container?.querySelector('input[aria-label="Scale name"]')).toBe(validationInput);

    setInputValue(validationInput, "Temporary");
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => validationInput.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(container?.querySelector('input[aria-label="Scale name"]')).toBeNull();
    expect(props.onRenameScale).toHaveBeenCalledTimes(1);
    rename = buttonByLabel("Rename scale Ground floor");
    expect(document.activeElement).toBe(rename);

    act(() => rename.click());
    const duplicateInput = scaleNameInput();
    setInputValue(duplicateInput, "  Survey correction  ");
    act(() => buttonWithin(duplicateInput.closest("form")!, "Save").click());
    expect(props.onRenameScale).toHaveBeenLastCalledWith("uniform", "Survey correction");
    expect(props.onRenameScale).toHaveBeenCalledTimes(2);
  });

  it("supports Cancel and discards drafts when the scale collapses or another scale expands", () => {
    const props = createProps();
    renderScales(props);
    const uniformDisclosure = buttonByLabel("Expand scale Ground floor, active");
    act(() => uniformDisclosure.click());
    let rename = buttonByLabel("Rename scale Ground floor");
    act(() => rename.click());
    const cancelInput = scaleNameInput();
    setInputValue(cancelInput, "Temporary");
    act(() => buttonWithin(cancelInput.closest("form")!, "Cancel").click());
    expect(props.onRenameScale).not.toHaveBeenCalled();
    rename = buttonByLabel("Rename scale Ground floor");
    expect(document.activeElement).toBe(rename);

    act(() => rename.click());
    const collapseInput = scaleNameInput();
    setInputValue(collapseInput, "Discard on collapse");
    act(() => uniformDisclosure.click());
    expect(container?.querySelector('input[aria-label="Scale name"]')).toBeNull();
    expect(props.onRenameScale).not.toHaveBeenCalled();

    act(() => uniformDisclosure.click());
    act(() => buttonByLabel("Rename scale Ground floor").click());
    const switchInput = scaleNameInput();
    setInputValue(switchInput, "Discard on switch");
    act(() => buttonByLabel("Expand scale Survey correction").click());
    expect(container?.querySelector('input[aria-label="Scale name"]')).toBeNull();
    expect(props.onRenameScale).not.toHaveBeenCalled();
  });

  it("keeps scale inspection available while precision actions are disabled with an accessible reason", () => {
    const reason = "Precision editing needs a fine pointer.";
    renderScalesWithUnavailablePrecision(createProps(), reason);

    const inspect = buttonByLabel("Expand scale Ground floor, active");
    expect(inspect.disabled).toBe(false);
    act(() => inspect.click());
    const detailsId = inspect.getAttribute("aria-controls");
    const details = detailsId ? document.getElementById(detailsId) : null;
    if (!details) throw new Error("Scale details were not rendered.");
    const recalibrate = buttonWithin(details, "Recalibrate scale");
    const edit = details.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit uniform reference points"]',
    );
    const rename = buttonByLabel("Rename scale Ground floor");
    if (!edit) throw new Error("Uniform edit action was not rendered.");
    const add = buttonByLabel("Add scale");

    expect(recalibrate.disabled).toBe(false);
    expect(edit.disabled).toBe(false);
    expect(rename.getAttribute("aria-disabled")).not.toBe("true");
    expect(recalibrate.getAttribute("aria-disabled")).toBe("true");
    expect(edit.getAttribute("aria-disabled")).toBe("true");
    expect(add.disabled).toBe(false);
    expect(document.getElementById(recalibrate.getAttribute("aria-describedby")!)?.textContent).toBe(
      reason,
    );
    act(() => add.click());
    const addItems = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(addItems).toHaveLength(5);
    expect(addItems[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(addItems[1]?.getAttribute("aria-disabled")).toBe("true");
    expect(addItems[0]?.textContent).toContain(reason);
    expect(addItems[1]?.textContent).toContain(reason);
    expect(addItems.slice(2).every((item) => item.getAttribute("aria-disabled") !== "true")).toBe(
      true,
    );
  });

  it("disables rename only for the calibration workflow lock, using the shared reason", () => {
    renderScales(createProps({ actionsDisabled: true }));
    act(() => buttonByLabel("Expand scale Ground floor, active").click());
    const rename = buttonByLabel("Rename scale Ground floor");
    expect(rename.disabled).toBe(false);
    expect(rename.getAttribute("aria-disabled")).toBe("true");
    const reasonId = rename.getAttribute("aria-describedby");
    expect(reasonId).not.toBeNull();
    expect(document.getElementById(reasonId!)?.textContent).toBe(
      "Finish or cancel the current scale workflow first.",
    );
    act(() => rename.click());
    expect(container?.querySelector('input[aria-label="Scale name"]')).toBeNull();
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
    act(() => items[3]?.click());
    expect(props.onAddPresetScale).toHaveBeenCalledWith(50);
    act(() => add.click());
    items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    act(() => items[1]?.click());

    const uniformInspect = buttonByLabel("Expand scale Ground floor, active");
    act(() => uniformInspect.click());
    const uniformDetails = document.getElementById(uniformInspect.getAttribute("aria-controls")!);
    if (!uniformDetails) throw new Error("Uniform details were not rendered.");
    const rename = buttonByLabel("Rename scale Ground floor");
    act(() => rename.click());
    act(() => buttonWithin(uniformDetails, "Cancel").click());
    act(() => buttonWithin(uniformDetails, "Recalibrate scale").click());
    const editUniform = uniformDetails.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit uniform reference points"]',
    );
    if (!editUniform) throw new Error("Uniform edit action was not rendered.");
    act(() => editUniform.click());

    const xyInspect = buttonByLabel("Expand scale Survey correction");
    act(() => xyInspect.click());
    const xyDetails = document.getElementById(xyInspect.getAttribute("aria-controls")!);
    if (!xyDetails) throw new Error("X/Y details were not rendered.");
    const editX = xyDetails.querySelector<HTMLButtonElement>('button[aria-label="Edit X reference points"]');
    const editY = xyDetails.querySelector<HTMLButtonElement>('button[aria-label="Edit Y reference points"]');
    if (!editX || !editY) throw new Error("X/Y edit actions were not rendered.");
    act(() => editX.click());
    act(() => editY.click());

    expect(request).toHaveBeenCalledTimes(6);
    expect(props.onAddPresetScale).toHaveBeenCalledTimes(1);
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
