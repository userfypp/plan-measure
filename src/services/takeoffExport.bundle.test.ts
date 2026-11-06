import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession, Measurement } from "../types/domain";
import { downloadExportFile } from "./exportDownload";
import { downloadCsvWithTakeoff } from "./takeoffExport";

vi.mock("./exportDownload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./exportDownload")>()),
  downloadExportFile: vi.fn(),
}));

afterEach(() => vi.mocked(downloadExportFile).mockClear());

// Uniform scale: 10 page units = 1000 mm, so 100 mm per unit. A horizontal line of
// k * 10 units is k metres long.
const line = (id: string, metres: number): Measurement => ({
  id,
  name: id,
  type: "line",
  points: [
    { x: 0, y: 0 },
    { x: metres * 10, y: 0 },
  ],
  calibrationId: "uniform",
  classificationValueIds: [],
  visible: true,
});

// Page 1: 300 lines of 2 m = 600 m. Page 2: 201 lines of 3 m = 603 m. 501 lines, 1203 m.
function bigSession(): CurrentSession {
  const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
  const calibration = {
    id: "uniform",
    name: "Uniform",
    mode: "uniform" as const,
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    referenceDistanceMm: 1000,
  };
  for (const [pageNumber, count, metres] of [
    [1, 300, 2],
    [2, 201, 3],
  ] as const) {
    const page = session.pages[pageNumber]!;
    page.calibrations = [calibration];
    page.measurements = Array.from({ length: count }, (_, index) =>
      line(`p${pageNumber}-${index}`, metres),
    );
  }
  return session;
}

function table(csv: string) {
  const [header, ...lines] = csv
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n");
  const columns = header!.split(",");
  return lines.map((text) => {
    const cells = text.split(",");
    return Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
  });
}

async function exportBundle(
  selection: Parameters<typeof downloadCsvWithTakeoff>[1],
  pageLabels: readonly string[] | null = ["i", "ii"],
) {
  await downloadCsvWithTakeoff(bigSession(), selection, pageLabels);
  const [contents, fileName, mimeType] = vi.mocked(downloadExportFile).mock.calls[0]!;
  const files = Object.fromEntries(
    Object.entries(unzipSync(contents as Uint8Array)).map(([name, bytes]) => [
      name,
      strFromU8(bytes),
    ]),
  );
  return { files, fileName, mimeType };
}

describe("CSV + Takeoff zip with more than 500 measurements", () => {
  it("contains exactly the measurement, project and selected breakdown files", async () => {
    const { files, fileName, mimeType } = await exportBundle({
      includeProjectTotals: true,
      breakdowns: ["page", "type"],
      classificationDimensionIds: [],
    });

    expect(fileName).toBe("plan-measurements.zip");
    expect(mimeType).toBe("application/zip");
    expect(Object.keys(files).sort()).toEqual([
      "by-page.csv",
      "by-type.csv",
      "measurements.csv",
      "project-totals.csv",
    ]);
  });

  it("writes every measurement row with its hand-computed length", async () => {
    const { files } = await exportBundle({
      includeProjectTotals: true,
      breakdowns: ["page"],
      classificationDimensionIds: [],
    });
    const rows = table(files["measurements.csv"]!);

    expect(rows).toHaveLength(501);
    expect(rows[0]).toMatchObject({ measurement_id: "p1-0", page: "1", page_label: "i" });
    expect(rows[299]).toMatchObject({ measurement_id: "p1-299", page: "1", length: "2.00" });
    expect(rows[300]).toMatchObject({ measurement_id: "p2-0", page: "2", page_label: "ii" });
    expect(rows[500]).toMatchObject({
      measurement_id: "p2-200",
      page: "2",
      page_label: "ii",
      length: "3.00",
      unit: "m",
    });
    // 300 * 2 m + 201 * 3 m
    const total = rows.reduce((sum, row) => sum + Number(row.length), 0);
    expect(total).toBe(1203);
  });

  it("writes hand-computed project, page and type totals", async () => {
    const { files } = await exportBundle({
      includeProjectTotals: true,
      breakdowns: ["page", "type"],
      classificationDimensionIds: [],
    });

    // 300 * 2 m + 201 * 3 m = 600 m + 603 m
    expect(table(files["project-totals.csv"]!)).toMatchObject([
      { section: "project", group: "Project totals", measurement_count: "501", length: "1203" },
    ]);
    expect(table(files["by-page.csv"]!)).toMatchObject([
      { group: "i", measurement_count: "300", length: "600" },
      { group: "ii", measurement_count: "201", length: "603" },
    ]);
    expect(table(files["by-type.csv"]!)).toMatchObject([
      { group: "Line", measurement_count: "501", length: "1203" },
    ]);
  });

  it("omits the project file when only a breakdown is selected", async () => {
    const { files } = await exportBundle({
      includeProjectTotals: false,
      breakdowns: ["page"],
      classificationDimensionIds: [],
    });

    expect(Object.keys(files).sort()).toEqual(["by-page.csv", "measurements.csv"]);
    expect(table(files["measurements.csv"]!)).toHaveLength(501);
  });
});
