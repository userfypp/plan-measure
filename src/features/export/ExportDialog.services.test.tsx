/* @vitest-environment jsdom */

import { strFromU8, unzipSync } from "fflate";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSession, Measurement } from "../../types/domain";
import { downloadExportFile } from "../../services/exportDownload";
import { ExportDialog } from "./ExportDialog";
import { stubDialogMethods } from "../../test/domTestUtils";

const mocks = vi.hoisted(() => ({ setError: vi.fn(), updateSettings: vi.fn() }));

vi.mock("../../app/state", () => ({
  useAppState: () => ({ setError: mocks.setError }),
}));

vi.mock("../../app/sessionState", () => ({
  useSessionState: () => ({ updateSettings: mocks.updateSettings }),
}));

// Real exporters; only the browser download is replaced.
vi.mock("../../services/exportDownload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/exportDownload")>()),
  downloadExportFile: vi.fn(),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let restoreDialogMethods = () => {};
let batchYields = 0;
const NativeMessageChannel = globalThis.MessageChannel;

// Uniform scale: 10 page units = 1000 mm. Line i is ((i % 5) + 1) m long.
// Five consecutive lines add up to 1 + 2 + 3 + 4 + 5 = 15 m.
function lineMeasurement(index: number): Measurement {
  return {
    id: `m-${index}`,
    name: `Line ${index}`,
    type: "line",
    points: [
      { x: 0, y: 0 },
      { x: ((index % 5) + 1) * 10, y: 0 },
    ],
    calibrationId: "uniform",
    classificationValueIds: [],
    visible: true,
  };
}

function sessionWith(count: number): CurrentSession {
  return {
    schemaVersion: 17,
    pdf: { name: "sample.pdf", size: 10, lastModified: 1 },
    pageCount: 1,
    currentPage: 1,
    pageLabelOverrides: {},
    pages: {
      1: {
        pageNumber: 1,
        calibrations: [
          {
            id: "uniform",
            name: "Uniform",
            mode: "uniform",
            start: { x: 0, y: 0 },
            end: { x: 10, y: 0 },
            referenceDistanceMm: 1000,
          },
        ],
        activeCalibrationId: "uniform",
        nextCalibrationNumber: 2,
        measurements: Array.from({ length: count }, (_, index) => lineMeasurement(index)),
        nextMeasurementNumber: {
          line: count + 1,
          polyline: 1,
          polygon: 1,
          rectangle: 1,
          ellipse: 1,
          cloud: 1,
          count: 1,
        },
      },
    },
    settings: {
      displayUnit: "m",
      showLabels: true,
      showMeasurements: true,
      showCalibration: true,
      labelClassificationDimensionId: null,
      measureClouds: false,
      defaultMeasurementFilters: null,
      currency: null,
      csvExport: { columnOverrides: {} },
      measurementDecimalPlaces: 2,
      areaDisplay: "auto",
    },
    classificationCatalog: { dimensions: [] },
    classificationRates: [],
  };
}

function renderDialog(session: CurrentSession) {
  const onClose = vi.fn();
  act(() => {
    root!.render(<ExportDialog session={session} pageLabels={["i"]} onClose={onClose} />);
  });
  return { onClose };
}

function dialog(): HTMLDialogElement {
  const element = document.querySelector<HTMLDialogElement>('[role="dialog"]');
  if (!element) throw new Error("Export dialog was not rendered.");
  return element;
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(dialog().querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function column(label: string): HTMLInputElement {
  const input = Array.from(
    dialog().querySelectorAll<HTMLInputElement>('[aria-label="Measurement columns"] input'),
  ).find((candidate) => candidate.parentElement?.textContent?.includes(label));
  if (!input) throw new Error(`Column ${label} was not rendered.`);
  return input;
}

function checkSummary(text: string) {
  const label = Array.from(dialog().querySelectorAll("label")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!label) throw new Error(`Missing summary option ${text}`);
  act(() => label.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
}

// The batched exporter yields on macrotasks, so wait for the download instead of flushing microtasks.
async function exportWith(label: string) {
  await act(async () => {
    button(label)!.click();
    await vi.waitFor(() => expect(downloadExportFile).toHaveBeenCalled());
  });
}

function downloaded() {
  expect(downloadExportFile).toHaveBeenCalledOnce();
  const [contents, fileName, mimeType] = vi.mocked(downloadExportFile).mock.calls[0]!;
  return { contents, fileName, mimeType };
}

function csvRows(csv: string) {
  const [header, ...lines] = csv
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n");
  const columns = header!.split(",");
  return {
    header: header!,
    rows: lines.map((line) => {
      const cells = line.split(",");
      return Object.fromEntries(columns.map((name, index) => [name, cells[index]]));
    }),
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  restoreDialogMethods = stubDialogMethods();
  vi.mocked(downloadExportFile).mockClear();
  mocks.setError.mockReset();
  mocks.updateSettings.mockReset();
  batchYields = 0;
  // The batched exporter yields to the main thread through a MessageChannel; the plain one never does.
  vi.stubGlobal(
    "MessageChannel",
    class extends NativeMessageChannel {
      constructor() {
        super();
        batchYields += 1;
      }
    },
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  vi.unstubAllGlobals();
  restoreDialogMethods();
  container?.remove();
  document.querySelectorAll('[role="dialog"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("ExportDialog with the real CSV exporters", () => {
  beforeEach(() => {
    // Freeze the clock so only the 200-row limit closes a batch, never the 8 ms budget.
    vi.spyOn(performance, "now").mockReturnValue(0);
  });

  it("exports 500 measurements in a single pass", async () => {
    const { onClose } = renderDialog(sessionWith(500));
    batchYields = 0;

    await exportWith("Export CSV");

    const { contents, fileName, mimeType } = downloaded();
    const { rows } = csvRows(contents as string);
    expect(batchYields).toBe(0);
    expect(fileName).toBe("sample-measurements.csv");
    expect(mimeType).toBe("text/csv;charset=utf-8");
    expect(rows).toHaveLength(500);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("switches to the batched exporter at 501 measurements and keeps every row", async () => {
    const { onClose } = renderDialog(sessionWith(501));
    batchYields = 0;

    await exportWith("Export CSV");

    const { rows } = csvRows(downloaded().contents as string);
    // 501 rows are flushed in batches of 200: yields after rows 200 and 400.
    expect(batchYields).toBe(2);
    expect(rows).toHaveLength(501);
    expect(rows.map((row) => row.measurement_id)).toEqual(
      Array.from({ length: 501 }, (_, index) => `m-${index}`),
    );
    expect(rows[0]).toMatchObject({ page: "1", page_label: "i", length: "1.00", unit: "m" });
    expect(rows[4]).toMatchObject({ measurement_id: "m-4", length: "5.00" });
    expect(rows[500]).toMatchObject({ measurement_id: "m-500", length: "1.00" });
    // 100 groups of five lines (15 m each) plus the last line (1 m).
    expect(rows.reduce((sum, row) => sum + Number(row.length), 0)).toBe(1501);
    expect(mocks.updateSettings).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([500, 501])(
    "writes the columns selected in the dialog for %i measurements",
    async (count) => {
      renderDialog(sessionWith(count));

      act(() => column("Measurement name").click());
      act(() => column("Page label").click());
      act(() => column("Reference distance (mm)").click());
      batchYields = 0;
      await exportWith("Export CSV");

      const { header, rows } = csvRows(downloaded().contents as string);
      expect(batchYields).toBe(count === 501 ? 2 : 0);
      expect(header).toBe(
        "page,measurement_id,type,calibration_id,calibration_name,calibration_mode,calibration_reference_mm,length,perimeter,area,unit,area_unit",
      );
      expect(rows).toHaveLength(count);
      expect(rows[2]).toEqual({
        page: "1",
        measurement_id: "m-2",
        type: "Line",
        calibration_id: "uniform",
        calibration_name: "Uniform",
        calibration_mode: "uniform",
        calibration_reference_mm: "1000",
        length: "3.00",
        perimeter: "",
        area: "",
        unit: "m",
        area_unit: "",
      });
    },
  );

  it("bundles more than 500 measurements with the selected summaries in the ZIP", async () => {
    renderDialog(sessionWith(501));
    act(() => column("Measurement name").click());
    checkSummary("Project totals");
    checkSummary("By page");

    await exportWith("Export ZIP");

    const { contents, fileName, mimeType } = downloaded();
    const files = Object.fromEntries(
      Object.entries(unzipSync(contents as Uint8Array)).map(([name, bytes]) => [
        name,
        strFromU8(bytes),
      ]),
    );
    expect(fileName).toBe("sample-measurements.zip");
    expect(mimeType).toBe("application/zip");
    expect(Object.keys(files).sort()).toEqual([
      "by-page.csv",
      "measurements.csv",
      "project-totals.csv",
    ]);
    const measurements = csvRows(files["measurements.csv"]!);
    expect(measurements.header.split(",")).not.toContain("name");
    expect(measurements.rows).toHaveLength(501);
    // 100 groups of five lines (15 m each) plus the last line (1 m).
    expect(csvRows(files["project-totals.csv"]!).rows).toMatchObject([
      { measurement_count: "501", length: "1501" },
    ]);
    expect(csvRows(files["by-page.csv"]!).rows).toMatchObject([
      { group: "i", measurement_count: "501", length: "1501" },
    ]);
  });
});
