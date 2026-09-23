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
    areaDisplay: "auto",
    measurementDecimalPlaces: 2,
    catalog,
    returnModule: "classifications",
    onBack: vi.fn(),
    onRename: vi.fn(),
    onSaveNote: vi.fn(),
    onAssignClassification: vi.fn(),
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

function classificationTrigger(): HTMLButtonElement {
  const trigger = container?.querySelector<HTMLButtonElement>(
    'section[aria-label="Classification assignment"] button[aria-haspopup="menu"]',
  );
  if (!trigger) throw new Error("Classification value trigger was not rendered.");
  return trigger;
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
    const summary = Array.from(container?.querySelectorAll<HTMLDivElement>("div") ?? []).find(
      (candidate) =>
        candidate.firstElementChild?.tagName === "STRONG" &&
        candidate.firstElementChild?.textContent === "Hallway" &&
        candidate.textContent?.includes("1.00 m"),
    );
    expect(summary).toBeTruthy();
    expect(summary?.childElementCount).toBe(2);
    expect(classificationTrigger().textContent).toContain("Electrical");
    expect(classificationTrigger().getAttribute("aria-expanded")).toBe("false");
    expect(container?.querySelector('section[aria-label="Classification assignment"] select')).toBeNull();
    expect(buttonByText("‹ Back to classifications")).toBeTruthy();
  });

  it("updates an existing measurement value when display precision changes", () => {
    renderDetails(createProps({ measurementDecimalPlaces: 2 }));
    expect(container?.textContent).toContain("1.00 m");

    renderDetails(createProps({ measurementDecimalPlaces: 3 }));
    expect(container?.textContent).toContain("1.000 m");
  });

  it("shows architectural linear values and acres in Details", () => {
    const polygon: Measurement = {
      ...firstMeasurement,
      id: "acre-polygon",
      type: "polygon",
      name: "Acre polygon",
      points: [
        { x: 0, y: 0 },
        { x: 66, y: 0 },
        { x: 66, y: 660 },
        { x: 0, y: 660 },
      ],
    };
    const baseCalibration = page.calibrations[0]!;
    if (baseCalibration.mode !== "uniform") throw new Error("Expected uniform calibration.");
    const acrePage: PageState = {
      ...page,
      calibrations: [
        {
          ...baseCalibration,
          end: { x: 1, y: 0 },
          referenceDistanceMm: 1524 / 5,
        },
        page.calibrations[1]!,
      ],
      measurements: [polygon],
    };

    renderDetails(
      createProps({
        page: acrePage,
        measurement: polygon,
        displayUnit: "ft-in",
        areaDisplay: "ac",
      }),
    );

    expect(container?.textContent).toContain("P 1452' · A 1.00 ac");
  });

  it("keeps a long linked scale name recoverable while allowing visual truncation", () => {
    const longScaleName = "Architectural presentation scale for the complete east wing";
    const longScalePage: PageState = {
      ...page,
      calibrations: page.calibrations.map((calibration) =>
        calibration.id === "historical" ? { ...calibration, name: longScaleName } : calibration,
      ),
    };

    renderDetails(createProps({ page: longScalePage }));

    const scaleValue = Array.from(container?.querySelectorAll<HTMLElement>("strong") ?? []).find(
      (candidate) => candidate.textContent?.startsWith(longScaleName),
    );
    expect(scaleValue?.title).toBe(
      `${longScaleName} · ${scaleDisplayMetadata(longScalePage.calibrations[0]!).ratioLabel}`,
    );
  });

  it("reflects a renamed linked scale without changing the measurement calibration link or value", () => {
    renderDetails(createProps());
    const originalValue = "1.00 m";
    expect(container?.textContent).toContain("Original scale");
    expect(container?.textContent).toContain(originalValue);

    const renamedPage: PageState = {
      ...page,
      calibrations: page.calibrations.map((calibration) =>
        calibration.id === firstMeasurement.calibrationId
          ? { ...calibration, name: "Original scale revised" }
          : calibration,
      ),
    };
    renderDetails(createProps({ page: renamedPage }));

    expect(container?.textContent).toContain("Original scale revised");
    expect(container?.textContent).toContain(originalValue);
    expect(firstMeasurement.calibrationId).toBe("historical");
  });

  it("wires Back, delete, and classification assignment while omitting the redundant geometry action", () => {
    const props = createProps();
    renderDetails(props);

    act(() => buttonByText("‹ Back to classifications").click());
    act(() => buttonByText("Delete measurement").click());
    const assignment = classificationTrigger();
    act(() => assignment.click());
    const unclassified = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    ).find((candidate) => candidate.textContent?.trim() === "Unclassified");
    if (!unclassified) throw new Error("Unclassified assignment option was not rendered.");
    act(() => unclassified.click());

    expect(props.onBack).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(props.onAssignClassification).toHaveBeenCalledWith("line-1", "trade", null);
    expect(container?.textContent).toContain("Organization");
    expect(container?.textContent).not.toContain("Edit geometry");
  });

  it("uses the shared menu trigger contract for compact classification assignment", () => {
    const props = createProps();
    renderDetails(props);

    const trigger = classificationTrigger();
    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toBe("Trade: Electrical");
    expect(trigger.textContent).toContain("Electrical");

    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    expect(items.map((item) => item.textContent?.trim())).toEqual(["Unclassified", "Electrical"]);
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true"]);

    act(() => items[1]?.click());
    expect(props.onAssignClassification).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
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

  it("saves an editable measurement note", () => {
    const props = createProps({
      measurement: { ...firstMeasurement, note: "Existing note" },
    });
    renderDetails(props);

    const textarea = container?.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) throw new Error("Measurement note editor was not rendered.");
    expect(textarea.value).toBe("Existing note");
    expect(textarea.getAttribute("aria-label")).toBe("Note");
    expect(container?.textContent).not.toContain("Note or description");
    expect(textarea.form?.id).toBe("measurement-note-form");
    expect(buttonByText("Save note").getAttribute("form")).toBe("measurement-note-form");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, "Check the ceiling height.");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => buttonByText("Save note").click());

    expect(props.onSaveNote).toHaveBeenCalledWith("Check the ceiling height.");
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
