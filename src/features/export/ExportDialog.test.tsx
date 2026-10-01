/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "../../types/domain";
import { ExportDialog } from "./ExportDialog";

const mocks = vi.hoisted(() => ({
  downloadCsv: vi.fn(),
  downloadSpreadsheet: vi.fn(),
  downloadDataJson: vi.fn(),
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

vi.mock("../../services/spreadsheetExport", () => ({
  downloadSpreadsheet: mocks.downloadSpreadsheet,
}));
vi.mock("../../services/dataJson", () => ({ downloadDataJson: mocks.downloadDataJson }));

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

function select(name: "export-format" | "csv-data"): HTMLSelectElement {
  const element = dialog().querySelector<HTMLSelectElement>(`select[name="${name}"]`);
  if (!element) throw new Error(`Select ${name} was not rendered.`);
  return element;
}

function choose(name: "export-format" | "csv-data", value: string) {
  act(() => {
    const element = select(name);
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(dialog().querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function selectClassificationAssignments() {
  choose("csv-data", "classification-assignments");
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
  mocks.downloadSpreadsheet.mockReset().mockResolvedValue(undefined);
  mocks.downloadDataJson.mockReset();
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
  it("shows accessible format explanations only for JSON and annotated PDF", () => {
    renderDialog();
    for (const format of ["csv", "xlsx", "ods", "json", "annotated-pdf", "csv"]) {
      choose("export-format", format);
      const id = select("export-format").getAttribute("aria-describedby");
      if (format === "json" || format === "annotated-pdf") {
        expect(id).toBeTruthy();
        expect(dialog().getAttribute("aria-describedby")).toBe(id);
        const explanation = document.getElementById(id!)!;
        expect(explanation.textContent).toContain(
          format === "json" ? "Does not include the PDF" : "Hidden measurements are excluded",
        );
      } else {
        expect(id).toBeNull();
        expect(dialog().getAttribute("aria-describedby")).toBeNull();
        expect(dialog().querySelector("p")).toBeNull();
      }
    }
  });

  it("defaults to CSV measurements with labeled selectors and compact column groups", () => {
    renderDialog();

    expect(dialog().getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog().textContent).toContain("Export");
    expect(select("export-format").value).toBe("csv");
    expect(dialog().querySelector(`label[for="${select("export-format").id}"]`)?.textContent).toBe(
      "Format",
    );
    expect(select("csv-data").value).toBe("measurements");
    expect(dialog().querySelector(`label[for="${select("csv-data").id}"]`)?.textContent).toBe(
      "Data",
    );
    expect(dialog().querySelector("details")).toBeNull();
    expect(dialog().querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      "Measurements",
    );
    expect(button("Defaults")).toBeDefined();
    expect(button("All columns")).toBeDefined();
    expect(button("Required only")).toBeDefined();
    expect(dialog().textContent).toContain("Measurement name");
  });

  it("switches column groups with the keyboard without losing the selected columns", () => {
    renderDialog();
    const tabs = Array.from(dialog().querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(dialog().querySelectorAll<HTMLDivElement>('[role="tabpanel"]'));
    expect(panels.map((panel) => panel.hidden)).toEqual([false, true, true]);
    act(() => {
      tabs[0]!.focus();
      tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs[2]!.getAttribute("aria-selected")).toBe("true");
    expect(panels.map((panel) => panel.hidden)).toEqual([true, true, false]);
    act(() =>
      tabs[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(document.activeElement).toBe(tabs[0]);
    expect(panels[0]!.hidden).toBe(false);
    expect(button("Export CSV")).toBeDefined();
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

  it("keeps everyday scale fields in Scale and groups optional audit fields in the Technical data tab", () => {
    renderDialog();
    const headings = Array.from(dialog().querySelectorAll<HTMLHeadingElement>("h3"));
    const scale = headings.find((heading) => heading.textContent === "Scale")?.closest("section");
    const additional = Array.from(dialog().querySelectorAll('[role="tabpanel"]')).find((panel) =>
      panel.id.endsWith("-additional"),
    );
    expect(additional?.hasAttribute("hidden")).toBe(true);

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
    const classificationSelect = select("csv-data");

    act(() => classificationSelect.focus());
    expect(document.activeElement).toBe(classificationSelect);
    selectClassificationAssignments();

    expect(classificationSelect.value).toBe("classification-assignments");
    expect(button("Defaults")).toBeUndefined();
    expect(button("All columns")).toBeUndefined();
    expect(button("Required only")).toBeUndefined();
    expect(dialog().textContent).not.toContain("Measurement name");
    expect(dialog().querySelector('[role="tablist"]')).toBeNull();
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

    choose("export-format", "annotated-pdf");

    expect(select("export-format").value).toBe("annotated-pdf");
    expect(dialog().querySelector('select[name="csv-data"]')).toBeNull();
    expect(button("Defaults")).toBeUndefined();
    expect(dialog().querySelector('[role="tablist"]')).toBeNull();
    expect(button("Export PDF")).toBeDefined();
  });

  it("waits for annotated PDF generation, prevents duplicate actions, and closes after success", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const exporter = vi.fn(() => pending);
    const { onClose } = renderDialog(sessionFixture(), exporter);
    choose("export-format", "annotated-pdf");

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
    choose("export-format", "annotated-pdf");

    await act(async () => {
      button("Export PDF")!.click();
      await Promise.resolve();
    });

    expect(mocks.setError).toHaveBeenCalledWith("Could not write annotated PDF.");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables annotated PDF export until the source PDF runtime is available", () => {
    renderDialog(sessionFixture(), null);

    expect(
      select("export-format").querySelector<HTMLOptionElement>('option[value="annotated-pdf"]')
        ?.disabled,
    ).toBe(true);
    expect(
      select("export-format").querySelector<HTMLOptionElement>('option[value="csv"]')?.disabled,
    ).toBe(false);
  });

  it("returns to CSV Measurements when the dialog is closed and opened again", () => {
    renderDialog();
    selectClassificationAssignments();
    choose("export-format", "annotated-pdf");
    expect(select("export-format").value).toBe("annotated-pdf");

    act(() => root!.render(null));
    renderDialog();

    expect(select("export-format").value).toBe("csv");
    expect(select("csv-data").value).toBe("measurements");
  });
  it.each(["xlsx", "ods"])(
    "exports %s with both datasets and the selected measurement columns",
    async (format) => {
      const { session, onClose } = renderDialog();
      act(() => button("Required only")!.click());
      choose("csv-data", "classification-assignments");
      choose("export-format", format);
      expect(dialog().querySelector('select[name="csv-data"]')).toBeNull();
      expect(dialog().querySelector('[role="tablist"]')).not.toBeNull();
      await act(async () => button(`Export ${format.toUpperCase()}`)!.click());
      expect(mocks.downloadSpreadsheet).toHaveBeenCalledWith(
        format,
        session,
        ["1"],
        expect.any(Object),
      );
      expect(mocks.updateSettings).toHaveBeenCalledOnce();
      expect(mocks.downloadClassificationAssignmentsCsv).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledOnce();
    },
  );

  it("exports complete JSON without column controls or persisting a tabular draft", () => {
    const { session, onClose } = renderDialog();
    act(() => button("Required only")!.click());
    choose("export-format", "json");
    expect(dialog().querySelector("details")).toBeNull();
    expect(dialog().querySelector('select[name="csv-data"]')).toBeNull();
    act(() => button("Export JSON")!.click());
    expect(mocks.downloadDataJson).toHaveBeenCalledWith(session, ["1"]);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("retains the column draft across format and dataset changes", () => {
    renderDialog();
    act(() => button("Required only")!.click());
    choose("export-format", "json");
    choose("export-format", "ods");
    const name = Array.from(
      dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).find((input) => input.parentElement?.textContent?.includes("Measurement name"));
    expect(name?.checked).toBe(false);
    choose("export-format", "csv");
    choose("csv-data", "classification-assignments");
    choose("csv-data", "measurements");
    expect(
      Array.from(dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find(
        (input) => input.parentElement?.textContent?.includes("Measurement name"),
      )?.checked,
    ).toBe(false);
  });

  it("locks all controls and prevents duplicate spreadsheet exports until generation completes", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.downloadSpreadsheet.mockReturnValue(pending);
    const { onClose } = renderDialog();
    choose("export-format", "xlsx");
    act(() => button("Export XLSX")!.click());
    expect(select("export-format").matches(":disabled")).toBe(true);
    expect(button("All columns")?.matches(":disabled")).toBe(true);
    expect(button("Cancel")?.disabled).toBe(true);
    act(() =>
      dialog()
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    act(() =>
      dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.downloadSpreadsheet).toHaveBeenCalledOnce();
    await act(async () => {
      release();
      await pending;
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(["xlsx", "ods", "json"])(
    "reports %s failure without saving column settings",
    async (format) => {
      const error = new Error("Cannot export this data.");
      mocks.downloadSpreadsheet.mockRejectedValue(error);
      mocks.downloadDataJson.mockImplementation(() => {
        throw error;
      });
      const { onClose } = renderDialog();
      choose("export-format", format);
      await act(async () => button(`Export ${format.toUpperCase()}`)!.click());
      expect(mocks.setError).toHaveBeenCalledWith(error.message);
      expect(mocks.updateSettings).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledOnce();
    },
  );
});
