/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "../../types/domain";
import { ExportDialog } from "./ExportDialog";

const mocks = vi.hoisted(() => ({
  downloadCsv: vi.fn(),
  downloadClassificationAssignmentsCsv: vi.fn(),
  setError: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("../../app/state", () => ({
  useAppState: () => ({ setError: mocks.setError }),
}));

vi.mock("../../app/sessionState", () => ({
  useSessionState: () => ({ updateSettings: mocks.updateSettings }),
}));

vi.mock("../../services/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/csv")>();
  return {
    ...actual,
    downloadCsv: mocks.downloadCsv,
    downloadClassificationAssignmentsCsv: mocks.downloadClassificationAssignmentsCsv,
  };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function sessionFixture(): CurrentSession {
  return {
    schemaVersion: 11,
    pdf: { name: "sample.pdf", size: 10, lastModified: 1 },
    pageCount: 1,
    currentPage: 1,
    pageLabelOverrides: {},
    pages: {
      1: {
        pageNumber: 1,
        calibrations: [],
        activeCalibrationId: null,
        nextCalibrationNumber: 1,
        measurements: [],
        nextMeasurementNumber: { line: 1, polyline: 1, polygon: 1 },
      },
    },
    settings: {
      displayUnit: "m",
      showLabels: true,
      showMeasurements: true,
      showCalibration: true,
      csvExport: { columnOverrides: {} },
      measurementDecimalPlaces: 2,
      areaDisplay: "auto",
    },
    classificationCatalog: {
      dimensions: [
        {
          id: "trade",
          name: "Trade",
          archived: false,
          values: [{ id: "electrical", name: "Electrical", archived: false }],
        },
      ],
    },
  };
}

function renderDialog(
  session = sessionFixture(),
  annotatedPdfExporter: (() => Promise<void>) | null = vi.fn(async () => undefined),
) {
  const onClose = vi.fn();
  act(() => {
    root!.render(
      <ExportDialog
        session={session}
        pageLabels={["1"]}
        onExportAnnotatedPdf={annotatedPdfExporter ?? undefined}
        onClose={onClose}
      />,
    );
  });
  return { onClose, session, annotatedPdfExporter };
}

function dialog(): HTMLDialogElement {
  const element = document.querySelector<HTMLDialogElement>('[role="dialog"]');
  if (!element) throw new Error("Export dialog was not rendered.");
  return element;
}

function radio(name: string, value: string): HTMLInputElement {
  const input = dialog().querySelector<HTMLInputElement>(
    `input[type="radio"][name="${name}"][value="${value}"]`,
  );
  if (!input) throw new Error(`${name} option ${value} was not rendered.`);
  return input;
}

function formatRadio(value: "csv" | "annotated-pdf") {
  return radio("export-format", value);
}

function datasetRadio(value: "measurements" | "classification-assignments") {
  return radio("csv-data", value);
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(dialog().querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function selectClassificationAssignments() {
  act(() => datasetRadio("classification-assignments").click());
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
  mocks.downloadCsv.mockReset();
  mocks.downloadClassificationAssignmentsCsv.mockReset();
  mocks.setError.mockReset();
  mocks.updateSettings.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll('[role="dialog"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("ExportDialog", () => {
  it("defaults to CSV measurements with accessible native-radio format and dataset selectors", () => {
    renderDialog();

    expect(dialog().getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog().textContent).toContain("Export");
    expect(formatRadio("csv").closest("fieldset")?.querySelector("legend")?.textContent).toBe(
      "Export format",
    );
    expect(formatRadio("csv").checked).toBe(true);
    expect(formatRadio("annotated-pdf").checked).toBe(false);
    expect(
      datasetRadio("measurements").closest("fieldset")?.querySelector("legend")?.textContent,
    ).toBe("CSV data");
    expect(datasetRadio("measurements").checked).toBe(true);
    expect(datasetRadio("classification-assignments").checked).toBe(false);
    expect(button("Defaults")).toBeDefined();
    expect(button("All columns")).toBeDefined();
    expect(button("Required only")).toBeDefined();
    expect(dialog().textContent).toContain("Measurement name");
  });

  it("keeps presets as actions and applies them to the measurement column draft", () => {
    renderDialog();
    const measurementName = Array.from(
      dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).find((input) => input.parentElement?.textContent?.includes("Measurement name"));
    const referenceDistance = Array.from(
      dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).find((input) => input.parentElement?.textContent?.includes("Reference distance (mm)"));
    if (!measurementName || !referenceDistance)
      throw new Error("Expected CSV columns were not rendered.");

    expect(measurementName.checked).toBe(true);
    expect(referenceDistance.checked).toBe(false);

    act(() => button("All columns")!.click());
    expect(referenceDistance.checked).toBe(true);

    act(() => button("Required only")!.click());
    expect(measurementName.checked).toBe(false);

    act(() => button("Defaults")!.click());
    expect(measurementName.checked).toBe(true);
    expect(referenceDistance.checked).toBe(false);
  });

  it("keeps everyday scale fields in Scale and groups optional audit fields under Additional data", () => {
    renderDialog();
    const headings = Array.from(dialog().querySelectorAll<HTMLHeadingElement>("h3"));
    const scale = headings.find((heading) => heading.textContent === "Scale")?.closest("section");
    const additional = headings
      .find((heading) => heading.textContent === "Additional data")
      ?.closest("section");

    expect(scale?.textContent).toContain("Scale ID");
    expect(scale?.textContent).toContain("Scale name");
    expect(scale?.textContent).toContain("Scale mode");
    expect(scale?.textContent).not.toContain("Reference distance (mm)");
    expect(additional?.textContent).toContain("Reference distance (mm)");
    expect(additional?.textContent).toContain("PDF name");
    expect(additional?.textContent).toContain("Ratio denominator");
  });

  it("switches to Classification assignments and hides measurement presets and columns", () => {
    renderDialog();
    const classificationRadio = datasetRadio("classification-assignments");

    act(() => classificationRadio.focus());
    expect(document.activeElement).toBe(classificationRadio);
    selectClassificationAssignments();

    expect(classificationRadio.checked).toBe(true);
    expect(button("Defaults")).toBeUndefined();
    expect(button("All columns")).toBeUndefined();
    expect(button("Required only")).toBeUndefined();
    expect(dialog().textContent).not.toContain("Measurement name");
    expect(dialog().textContent).toContain("one row per assigned classification");
    expect(dialog().textContent).toContain("measurement_id");
  });

  it("uses the Measurements exporter and persists the normalized measurement draft", () => {
    const { onClose, session } = renderDialog();

    act(() => button("Export CSV")!.click());

    expect(mocks.downloadCsv).toHaveBeenCalledWith(session, ["1"], { columnOverrides: {} });
    expect(mocks.downloadClassificationAssignmentsCsv).not.toHaveBeenCalled();
    expect(mocks.updateSettings).toHaveBeenCalledWith({ csvExport: { columnOverrides: {} } });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses the Classification assignments exporter without persisting edited measurement CSV settings", () => {
    const { onClose, session } = renderDialog();
    const measurementName = Array.from(
      dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).find((input) => input.parentElement?.textContent?.includes("Measurement name"));
    if (!measurementName) throw new Error("Measurement name checkbox was not rendered.");

    act(() => measurementName.click());
    selectClassificationAssignments();
    act(() => button("Export CSV")!.click());

    expect(mocks.downloadClassificationAssignmentsCsv).toHaveBeenCalledWith(session, ["1"]);
    expect(mocks.downloadCsv).not.toHaveBeenCalled();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("switches to annotated PDF with focused export guidance and no CSV-only controls", () => {
    renderDialog();

    act(() => formatRadio("annotated-pdf").click());

    expect(formatRadio("annotated-pdf").checked).toBe(true);
    expect(dialog().querySelector('input[name="csv-data"]')).toBeNull();
    expect(button("Defaults")).toBeUndefined();
    expect(dialog().textContent).toContain("original PDF pages");
    expect(dialog().textContent).toContain("Hidden measurements are omitted");
    expect(button("Export PDF")).toBeDefined();
  });

  it("waits for annotated PDF generation, prevents duplicate actions, and closes after success", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const exporter = vi.fn(() => pending);
    const { onClose } = renderDialog(sessionFixture(), exporter);
    act(() => formatRadio("annotated-pdf").click());

    act(() => button("Export PDF")!.click());

    expect(exporter).toHaveBeenCalledOnce();
    expect(button("Exporting…")?.disabled).toBe(true);
    expect(button("Cancel")?.disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      release();
      await pending;
    });

    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.downloadCsv).not.toHaveBeenCalled();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it("reports an annotated PDF export failure and closes the dialog", async () => {
    const exporter = vi.fn(async () => {
      throw new Error("Could not write annotated PDF.");
    });
    const { onClose } = renderDialog(sessionFixture(), exporter);
    act(() => formatRadio("annotated-pdf").click());

    await act(async () => {
      button("Export PDF")!.click();
      await Promise.resolve();
    });

    expect(mocks.setError).toHaveBeenCalledWith("Could not write annotated PDF.");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables annotated PDF export until the source PDF runtime is available", () => {
    renderDialog(sessionFixture(), null);

    expect(formatRadio("annotated-pdf").disabled).toBe(true);
    expect(formatRadio("csv").disabled).toBe(false);
  });

  it("returns to CSV Measurements when the dialog is closed and opened again", () => {
    renderDialog();
    selectClassificationAssignments();
    act(() => formatRadio("annotated-pdf").click());
    expect(formatRadio("annotated-pdf").checked).toBe(true);

    act(() => root!.render(null));
    renderDialog();

    expect(formatRadio("csv").checked).toBe(true);
    expect(datasetRadio("measurements").checked).toBe(true);
    expect(datasetRadio("classification-assignments").checked).toBe(false);
  });
});
