/* @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceDrawerProvider } from "../../app/WorkspaceDrawerContext";
import { computeAuthoringCapability } from "../viewer/AuthoringCapability";
import type { Measurement, PageCalibration, PageState } from "../../types/domain";
import { resetAppPreferences, setAppPreference } from "../../utils/appPreferences";
import { scaleByRatio } from "../../utils/units";
import { scaleDisplayMetadata } from "../viewer/scaleDisplay";
import { createPageCalibrationFromRatio } from "./ratioCalibration";
import {
  preloadCustomRatioDialog,
  ScalesWorkspace,
  type ScalesWorkspaceProps,
} from "./ScalesWorkspace";
import { stubDialogMethods } from "../../test/domTestUtils";

const scalesCss = readFileSync(resolve(import.meta.dirname, "ScalesWorkspace.module.css"), "utf8");

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let restoreDialogMethods = () => {};

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

function createProps(overrides: Partial<ScalesWorkspaceProps> = {}): ScalesWorkspaceProps {
  return {
    page,
    displayUnit: "m",
    onAddScale: vi.fn(),
    onAddCustomRatioScale: vi.fn(),
    onAddPresetScale: vi.fn(),
    onSetRatio: vi.fn(),
    onRenameScale: vi.fn(),
    onRecalibrate: vi.fn(),
    onEditReference: vi.fn(),
    onCopyScale: vi.fn(),
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

// The disclosure toggle is the button whose title is the scale name; its accessible name also
// carries the ratio line.
function scaleToggle(name: string): HTMLButtonElement {
  const toggle = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button[aria-expanded]") ?? [],
  ).find((candidate) => candidate.querySelector("span[title]")?.getAttribute("title") === name);
  if (!toggle) throw new Error(`Scale toggle ${name} was not rendered.`);
  return toggle;
}

function scaleDetails(toggle: HTMLButtonElement): HTMLElement {
  const details = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
  if (!details) throw new Error("Expanded scale details were not rendered.");
  return details;
}

// Text buttons are found by their text, icon buttons by their accessible name.
function buttonWithin(element: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) =>
      candidate.textContent?.trim() === text || candidate.getAttribute("aria-label") === text,
  );
  if (!button) throw new Error(`Button ${text} was not rendered in the requested scale details.`);
  return button;
}

function expectIconOnly(button: HTMLButtonElement) {
  expect(button.querySelector("svg")).not.toBeNull();
  expect(button.textContent?.trim()).toBe("");
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

// The dialog is a lazy chunk; once loaded it mounts in the same commit as before.
beforeAll(() => preloadCustomRatioDialog());

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  restoreDialogMethods = stubDialogMethods();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  restoreDialogMethods();
  container?.remove();
  document.querySelectorAll('[role="menu"]').forEach((element) => element.remove());
  document.querySelectorAll("dialog").forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("ScalesWorkspace", () => {
  it("copies a scale directly from its collapsed page row", () => {
    const props = createProps();
    renderScales(props);
    const copy = buttonByLabel("Copy scale Ground floor");
    const disclosure = scaleToggle("Ground floor");
    expect(
      disclosure.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(disclosure.contains(copy)).toBe(false);
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    act(() => copy.click());
    expect(props.onCopyScale).toHaveBeenCalledWith(uniform);
  });

  it("deletes an unused scale from its details and explains why a used one cannot be deleted", () => {
    const onDeleteScale = vi.fn();
    renderScales(createProps({ onDeleteScale }));

    act(() => scaleToggle("Ground floor").click());
    const used = buttonByLabel("Delete scale Ground floor");
    expectIconOnly(used);
    expect(used.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(used.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe(
      "1 measurement uses this scale. Move it to another scale or delete it first.",
    );
    act(() => used.click());
    expect(onDeleteScale).not.toHaveBeenCalled();

    act(() => scaleToggle("Survey correction").click());
    const unused = buttonByLabel("Delete scale Survey correction");
    expect(unused.getAttribute("aria-disabled")).not.toBe("true");
    act(() => unused.click());
    expect(onDeleteScale).toHaveBeenCalledWith(xy);
  });

  it("blocks deleting scales during a scale workflow and offers no Delete without a handler", () => {
    renderScales(createProps({ onDeleteScale: vi.fn(), actionsDisabled: true }));
    act(() => scaleToggle("Survey correction").click());
    const blocked = buttonByLabel("Delete scale Survey correction");
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(blocked.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Finish or cancel the current scale workflow first.");

    renderScales(createProps());
    expect(container?.querySelector('button[aria-label^="Delete scale"]')).toBeNull();
  });

  it("moves focus to Add scale when a scale deleted from its Delete button takes focus with it", async () => {
    const props = createProps({ onDeleteScale: vi.fn() });
    renderScales(props);
    act(() => scaleToggle("Survey correction").click());
    const remove = buttonByLabel("Delete scale Survey correction");
    remove.focus();
    act(() => remove.click());
    renderScales({ ...props, page: { ...page, calibrations: [uniform] } });
    await Promise.resolve();
    expect(document.activeElement).toBe(buttonByLabel("Add scale"));
  });

  it("moves focus from the dialog fallback to Add scale after a confirmed delete only", async () => {
    const fallback = document.createElement("div");
    fallback.tabIndex = -1;
    fallback.setAttribute("data-dialog-focus-fallback", "");
    document.body.append(fallback);
    try {
      const props = createProps({ onDeleteScale: vi.fn() });
      renderScales(props);
      act(() => scaleToggle("Survey correction").click());
      act(() => buttonByLabel("Delete scale Survey correction").click());
      fallback.focus();
      renderScales({ ...props, page: { ...page, calibrations: [uniform] } });
      await Promise.resolve();
      expect(document.activeElement).toBe(buttonByLabel("Add scale"));

      // An undo that removes the inspected scale leaves focus in the viewer.
      renderScales(props);
      fallback.focus();
      renderScales({ ...props, page: { ...page, calibrations: [uniform] } });
      await Promise.resolve();
      expect(document.activeElement).toBe(fallback);
    } finally {
      fallback.remove();
    }
  });

  it("lists page scales, marks active status structurally, and keeps administration separate from switching", () => {
    renderScales(createProps());

    const active = scaleToggle("Ground floor");
    const inactive = scaleToggle("Survey correction");
    const activeRow = active.closest<HTMLElement>("li");
    const inactiveRow = inactive.closest<HTMLElement>("li");
    if (!activeRow) throw new Error("Active scale row was not rendered.");
    if (!inactiveRow) throw new Error("Inactive scale row was not rendered.");
    expect(activeRow.querySelector("[data-selected]")).not.toBeNull();
    expect(inactiveRow.querySelector("[data-selected]")).toBeNull();
    expect(active.textContent).toContain(", active");
    expect(inactive.textContent).not.toContain("active");
    expect(activeRow.textContent).not.toContain("Active");
    expect(activeRow.textContent).not.toContain("✓");
    expect(activeRow.textContent).not.toContain("···");
    expect(activeRow.textContent).toContain("Ground floor");
    expect(inactiveRow.textContent).not.toContain("Active");
    expect(container?.textContent).toContain(scaleDisplayMetadata(uniform).detailLabel);
    expect(container?.textContent).toContain(scaleDisplayMetadata(xy).detailLabel);
    expect(active.getAttribute("aria-expanded")).toBe("false");
    expect(inactive.getAttribute("aria-expanded")).toBe("false");
    expect(active.querySelector("svg")).toBeTruthy();
    expect(container?.textContent).toContain(
      "Before drawing, switch the active scale from the Viewer Dock. Changing it does not relink measurements.",
    );
    expect(scalesCss).toMatch(
      /\.scale\s*\{[^}]*composes:\s*item from "\.\.\/\.\.\/components\/ui\/Disclosure\.module\.css";/s,
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
    expect(scaleToggle("Ground floor")).toBeTruthy();
    expect(container?.textContent).toContain(
      "Changing the active scale does not relink measurements.",
    );
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

    const disclosure = scaleToggle(longName);
    const identity = disclosure.querySelector<HTMLElement>("span[title]");
    expect(identity?.textContent).toBe(longName);
    expect(identity?.title).toBe(longName);
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    act(() => disclosure.click());
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    act(() => buttonByLabel(`Rename scale ${longName}`).click());
    const input = container?.querySelector<HTMLInputElement>('input[aria-label="Scale name"]');
    expect(input?.value).toBe(longName);
  });

  it("expands compact X/Y administration with ratio, paired reference actions, and a recalibration footer", () => {
    const props = createProps();
    renderScales(props);
    const inspect = scaleToggle("Survey correction");
    expect(inspect.hasAttribute("aria-controls")).toBe(false);
    expect(
      container?.querySelector('[aria-label="Scale details for Survey correction"]'),
    ).toBeNull();

    act(() => inspect.click());
    const details = scaleDetails(inspect);
    expectIconOnly(buttonByLabel("Rename scale Survey correction"));
    expect(details.textContent).toContain(scaleDisplayMetadata(xy).ratioLabel);
    expectIconOnly(
      details.querySelector<HTMLButtonElement>('button[aria-label^="Set ratio for scale "]')!,
    );
    expect(details.textContent).toContain("X reference: 2.50 m");
    expect(details.textContent).toContain("Y reference: 3.00 m");
    expect(details.textContent).not.toContain("Scale name");
    const hiddenLabels = Array.from(details.querySelectorAll<HTMLElement>("span"))
      .filter((element) => element.className.includes("visuallyHidden"))
      .map((element) => element.textContent);
    expect(hiddenLabels).toEqual(["Effective ratio: ", "X reference: ", "Y reference: "]);
    expect(scalesCss).not.toMatch(
      /\.(detailSection|sectionLabel|identityField|fieldLabel|referenceInfo|referenceLabel|referenceRow|identityValueRow)\b/,
    );
    const recalibrate = buttonWithin(details, "Recalibrate scale");
    expectIconOnly(recalibrate);
    const editX = details.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit X reference points"]',
    );
    const editY = details.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit Y reference points"]',
    );
    if (!editX || !editY) throw new Error("X/Y reference actions were not rendered.");
    expectIconOnly(editX);
    expectIconOnly(editY);
    expect(scalesCss).toMatch(
      /\.rows\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\) auto;/s,
    );
    expect(scalesCss).toMatch(/\.row\s*\{[^}]*grid-template-columns:\s*subgrid;/s);
    expect(scalesCss).not.toMatch(
      /\.(renameForm|renameActions|recalibrateControl|recalibrateButton|deleteScaleControl|detailRows?)\b/,
    );

    act(() => editX.click());
    act(() => editY.click());
    act(() => recalibrate.click());
    expect(props.onRecalibrate).toHaveBeenCalledWith("xy");
    expect(props.onEditReference).toHaveBeenNthCalledWith(1, xy, "x");
    expect(props.onEditReference).toHaveBeenNthCalledWith(2, xy, "y");
    expect(page.measurements[0]?.calibrationId).toBe("uniform");

    renderScales({ ...props, actionsDisabled: true });
    const blockedRecalibrate = buttonWithin(details, "Recalibrate scale");
    expect(blockedRecalibrate.getAttribute("aria-disabled")).toBe("true");
    expectIconOnly(blockedRecalibrate);
    expect(
      document.getElementById(blockedRecalibrate.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("Finish or cancel the current scale workflow first.");
  });

  it("formats calibration references using the current imperial Viewer display mode", () => {
    renderScales(createProps({ displayUnit: "in" }));
    act(() => scaleToggle("Ground floor").click());
    expect(container?.querySelector('[title="39.37 in"]')).not.toBeNull();

    renderScales(createProps({ displayUnit: "ft" }));
    expect(container?.querySelector('[title="3.28 ft"]')).not.toBeNull();

    const architecturalPage: PageState = {
      ...page,
      calibrations: [{ ...uniform, referenceDistanceMm: 3771.9 }, xy],
    };
    renderScales(createProps({ page: architecturalPage, displayUnit: "ft-in" }));
    expect(
      Array.from(container?.querySelectorAll<HTMLElement>("[title]") ?? []).some(
        (element) => element.title === `12' 4 1/2"`,
      ),
    ).toBe(true);
  });

  it("groups point calibration and Custom ratio before a Standard ratios section", () => {
    const props = createProps();
    renderScales(props);
    const add = buttonByLabel("Add scale");
    const scaleList = container?.querySelector('ul[aria-label="Page scales"]');
    expect(scaleList?.nextElementSibling?.contains(add)).toBe(true);

    act(() => add.click());
    let items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items).toHaveLength(6);
    expect(items.map((item) => item.textContent)).toEqual([
      "UniformOne reference",
      "X/YSeparate X and Y references",
      "Custom ratioEnter 1:n",
      "1:20",
      "1:50",
      "1:100",
    ]);
    const sectionLabel = document.querySelector<HTMLElement>('[data-menu-section-label="true"]');
    expect(sectionLabel?.textContent).toBe("Standard ratios");
    expect(sectionLabel?.getAttribute("role")).toBe("separator");
    expect(sectionLabel?.getAttribute("aria-label")).toBe("Standard ratios");
    expect(scalesCss).toMatch(
      /\.addScaleMenu\[role="menu"\]\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*min\(var\(--geometry-scale-add-menu-max-width\),\s*calc\(100vw\s*-\s*var\(--space-16\)\)\);/s,
    );
    expect(scalesCss).toMatch(
      /\.addScaleMenu \[data-menu-section-label="true"\]\s*\{[^}]*padding:\s*var\(--space-8\) var\(--space-8\) 0;/s,
    );
    act(() => items[4]?.click());
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

  it("keeps the section heading out of keyboard navigation and visits all six options", () => {
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

    expect(document.querySelector('[data-menu-section-label="true"]')).not.toBe(
      document.activeElement,
    );
    expect(items.map((item) => item.tabIndex)).toEqual([-1, -1, -1, -1, -1, 0]);
  });

  it("opens Custom ratio with the next default scale name and saves through the direct callback", () => {
    const props = createProps();
    renderScales(props);
    const add = buttonByLabel("Add scale");
    act(() => add.click());
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    act(() => items[2]?.click());

    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    const name = document.querySelector<HTMLInputElement>("#custom-ratio-name");
    const ratio = document.querySelector<HTMLInputElement>("#custom-ratio-uniform");
    expect(dialog?.open).toBe(true);
    expect(name?.value).toBe("Scale 3");
    expect(document.activeElement).toBe(ratio);
    if (!ratio) throw new Error("Custom ratio denominator was not rendered.");
    setInputValue(ratio, "60");
    const save = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.textContent?.trim() === "Save scale",
    );
    if (!save) throw new Error("Custom ratio save action was not rendered.");
    act(() => save.click());

    expect(props.onAddCustomRatioScale).toHaveBeenCalledWith(
      "Scale 3",
      createPageCalibrationFromRatio({ mode: "uniform", denominator: 60 }),
    );
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("restores focus to Add scale when Custom ratio closes with Escape", async () => {
    renderScales(createProps());
    const add = buttonByLabel("Add scale");
    act(() => add.click());
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    act(() => items[2]?.click());
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    expect(document.activeElement).toBe(document.querySelector("#custom-ratio-uniform"));

    act(() =>
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(add);
  });

  it("sets a Uniform ratio in place, keeps mode fixed, and restores focus to Set ratio", async () => {
    const ratioCalibration: PageCalibration = {
      id: "uniform-50",
      name: "Scale 3",
      ...createPageCalibrationFromRatio({ mode: "uniform", denominator: 50 }),
    };
    const props = createProps({
      page: {
        ...page,
        calibrations: [ratioCalibration],
        activeCalibrationId: ratioCalibration.id,
      },
    });
    renderScales(props);
    const toggle = scaleToggle("Scale 3");
    act(() => toggle.click());
    const details = scaleDetails(toggle);
    const setRatio = buttonByLabel("Set ratio for scale Scale 3");
    expect(buttonWithin(details, "Recalibrate scale")).toBeTruthy();
    expect(
      details.querySelector('button[aria-label="Edit uniform reference points"]'),
    ).toBeTruthy();

    act(() => {
      setRatio.focus();
      setRatio.click();
    });
    const ratio = document.querySelector<HTMLInputElement>("#custom-ratio-uniform")!;
    expect(ratio.value).toBe("50");
    expect(document.activeElement).toBe(ratio);
    expect(document.querySelector('input[name="custom-ratio-mode"]')).toBeNull();
    expect(document.querySelector("#custom-ratio-name")).toBeNull();

    setInputValue(ratio, "60");
    act(() => buttonWithin(document.querySelector("dialog")!, "Save scale").click());
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(props.onSetRatio).toHaveBeenCalledWith(
      "uniform-50",
      createPageCalibrationFromRatio({ mode: "uniform", denominator: 60 }),
    );
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(setRatio);
    expect(props.onRecalibrate).not.toHaveBeenCalled();
    expect(props.onEditReference).not.toHaveBeenCalled();
  });

  it("derives Set ratio prefill from a non-canonical point calibration and replaces it canonically", () => {
    const denominator = 65.345;
    const pageDistance = 40;
    const pointCalibration: PageCalibration = {
      id: "point-uniform",
      name: "Point calibrated",
      mode: "uniform",
      start: { x: 13, y: 7 },
      end: { x: 53, y: 7 },
      referenceDistanceMm: pageDistance * scaleByRatio(denominator, 127, 360),
    };
    const props = createProps({
      page: {
        ...page,
        calibrations: [pointCalibration],
        activeCalibrationId: pointCalibration.id,
      },
    });
    renderScales(props);
    act(() => scaleToggle("Point calibrated").click());
    act(() => buttonByLabel("Set ratio for scale Point calibrated").click());

    const ratio = document.querySelector<HTMLInputElement>("#custom-ratio-uniform")!;
    expect(ratio.value).toBe("65.345");
    setInputValue(ratio, "50");
    act(() => buttonWithin(document.querySelector("dialog")!, "Save scale").click());

    expect(props.onSetRatio).toHaveBeenCalledWith(
      "point-uniform",
      createPageCalibrationFromRatio({ mode: "uniform", denominator: 50 }),
    );
  });

  it("sets X/Y ratios independently without swapping axes or exposing a mode selector", () => {
    const xyRatioCalibration: PageCalibration = {
      id: "xy-ratio",
      name: "Survey correction",
      ...createPageCalibrationFromRatio({ mode: "xy", xDenominator: 70, yDenominator: 30 }),
    };
    const props = createProps({
      page: {
        ...page,
        calibrations: [xyRatioCalibration],
        activeCalibrationId: xyRatioCalibration.id,
      },
    });
    renderScales(props);
    act(() => scaleToggle("Survey correction").click());
    act(() => buttonByLabel("Set ratio for scale Survey correction").click());

    const x = document.querySelector<HTMLInputElement>("#custom-ratio-x")!;
    const y = document.querySelector<HTMLInputElement>("#custom-ratio-y")!;
    expect(x.value).toBe("70");
    expect(y.value).toBe("30");
    expect(document.activeElement).toBe(x);
    expect(document.querySelector('input[name="custom-ratio-mode"]')).toBeNull();
    setInputValue(x, "80");
    setInputValue(y, "40");
    act(() => buttonWithin(document.querySelector("dialog")!, "Save scale").click());

    expect(props.onSetRatio).toHaveBeenCalledWith(
      "xy-ratio",
      createPageCalibrationFromRatio({ mode: "xy", xDenominator: 80, yDenominator: 40 }),
    );
  });

  it("keeps Uniform reference editing explicit and paired with its value", () => {
    const props = createProps();
    renderScales(props);
    const inspect = scaleToggle("Ground floor");
    act(() => inspect.click());
    const details = scaleDetails(inspect);

    expect(details.textContent).toContain("Uniform reference: 1.00 m");
    expect(details.textContent).toContain(scaleDisplayMetadata(uniform).ratioLabel);
    expectIconOnly(
      details.querySelector<HTMLButtonElement>('button[aria-label^="Set ratio for scale "]')!,
    );
    expectIconOnly(buttonWithin(details, "Recalibrate scale"));
    const edit = details.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit uniform reference points"]',
    );
    if (!edit) throw new Error("Uniform reference action was not rendered.");
    expectIconOnly(edit);
    act(() => edit.click());
    expect(props.onEditReference).toHaveBeenCalledWith(uniform, "uniform");
  });

  it("renames inline with focus, trimming, Enter/Save, no-op, validation, and focus restoration", () => {
    const props = createProps();
    renderScales(props);
    act(() => scaleToggle("Ground floor").click());
    let rename = buttonByLabel("Rename scale Ground floor");

    act(() => rename.click());
    const initialInput = scaleNameInput();
    expect(initialInput.closest("form")?.textContent).not.toContain("Scale name");
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
    const uniformDisclosure = scaleToggle("Ground floor");
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
    act(() => scaleToggle("Survey correction").click());
    expect(container?.querySelector('input[aria-label="Scale name"]')).toBeNull();
    expect(props.onRenameScale).not.toHaveBeenCalled();
  });

  it("keeps scale inspection available while precision actions are disabled with an accessible reason", () => {
    const reason = "Precision editing needs a fine pointer.";
    const props = createProps();
    renderScalesWithUnavailablePrecision(props, reason);

    const inspect = scaleToggle("Ground floor");
    expect(inspect.disabled).toBe(false);
    act(() => inspect.click());
    const details = scaleDetails(inspect);
    const recalibrate = buttonWithin(details, "Recalibrate scale");
    const edit = details.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit uniform reference points"]',
    );
    const rename = buttonByLabel("Rename scale Ground floor");
    const setRatio = buttonByLabel("Set ratio for scale Ground floor");
    if (!edit) throw new Error("Uniform edit action was not rendered.");
    const add = buttonByLabel("Add scale");

    expect(recalibrate.disabled).toBe(false);
    expect(edit.disabled).toBe(false);
    expect(rename.getAttribute("aria-disabled")).not.toBe("true");
    expect(setRatio.getAttribute("aria-disabled")).not.toBe("true");
    expect(recalibrate.getAttribute("aria-disabled")).toBe("true");
    expect(edit.getAttribute("aria-disabled")).toBe("true");
    expect(add.disabled).toBe(false);
    expect(
      document.getElementById(recalibrate.getAttribute("aria-describedby")!)?.textContent,
    ).toBe(reason);
    act(() => add.click());
    const addItems = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(addItems).toHaveLength(6);
    expect(addItems[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(addItems[1]?.getAttribute("aria-disabled")).toBe("true");
    expect(addItems[0]?.textContent).toContain(reason);
    expect(addItems[1]?.textContent).toContain(reason);
    expect(addItems.slice(2).every((item) => item.getAttribute("aria-disabled") !== "true")).toBe(
      true,
    );
    act(() => addItems[2]?.click());
    expect(document.querySelector("dialog")?.textContent).toContain("Custom ratio");
    expect(props.onAddScale).not.toHaveBeenCalled();
  });

  it("disables rename only for the calibration workflow lock, using the shared reason", () => {
    renderScales(createProps({ actionsDisabled: true }));
    act(() => scaleToggle("Ground floor").click());
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
    act(() => items[4]?.click());
    expect(props.onAddPresetScale).toHaveBeenCalledWith(50);
    act(() => add.click());
    items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    act(() => items[1]?.click());

    const uniformInspect = scaleToggle("Ground floor");
    act(() => uniformInspect.click());
    const uniformDetails = scaleDetails(uniformInspect);
    const rename = buttonByLabel("Rename scale Ground floor");
    act(() => rename.click());
    act(() => buttonWithin(uniformDetails, "Cancel").click());
    act(() => buttonWithin(uniformDetails, "Recalibrate scale").click());
    const editUniform = uniformDetails.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit uniform reference points"]',
    );
    if (!editUniform) throw new Error("Uniform edit action was not rendered.");
    act(() => editUniform.click());

    const xyInspect = scaleToggle("Survey correction");
    act(() => xyInspect.click());
    const xyDetails = scaleDetails(xyInspect);
    const editX = xyDetails.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit X reference points"]',
    );
    const editY = xyDetails.querySelector<HTMLButtonElement>(
      'button[aria-label="Edit Y reference points"]',
    );
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

describe("tool.calibrate shortcut", () => {
  function bindCalibrate(...combos: string[]) {
    act(() => setAppPreference("shortcutBindings", { "tool.calibrate": combos }));
  }

  afterEach(() => resetAppPreferences());

  it("shows the key on the Uniform option only while it is bound", () => {
    const optionTexts = () => {
      act(() => buttonByLabel("Add scale").click());
      const texts = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      ).map((item) => item.textContent);
      act(() => buttonByLabel("Add scale").click());
      return texts.slice(0, 2);
    };
    renderScales(createProps());
    expect(optionTexts()).toEqual(["UniformOne reference", "X/YSeparate X and Y references"]);

    bindCalibrate("B");
    expect(optionTexts()).toEqual(["UniformOne reference (B)", "X/YSeparate X and Y references"]);
  });
});
