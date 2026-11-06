import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../app/sessionState";
import type { CurrentSession, Measurement, PageCalibration } from "../types/domain";
import { buildCsv, buildCsvInBatches, downloadCsvInBatches, NoMeasurementsError } from "./csv";
import { downloadExportFile } from "./exportDownload";

vi.mock("./exportDownload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./exportDownload")>()),
  downloadExportFile: vi.fn(),
}));

afterEach(() => vi.mocked(downloadExportFile).mockClear());

// Uniform scale: 10 page units = 1000 mm, so 100 mm per unit. A horizontal line of
// k * 10 units is k metres long.
const UNIFORM: PageCalibration = {
  id: "uniform",
  name: "Uniform",
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },
  referenceDistanceMm: 1000,
};

// 1.7976931348623157e308 mm over 1e-300 page units overflows to an infinite scale.
const INFINITE_SCALE: PageCalibration = {
  id: "infinite",
  name: "Infinite",
  mode: "uniform",
  start: { x: 0, y: 0 },
  end: { x: 1e-300, y: 0 },
  referenceDistanceMm: Number.MAX_VALUE,
};

const line = (id: string, metres: number, calibrationId = "uniform"): Measurement => ({
  id,
  name: id,
  type: "line",
  points: [
    { x: 0, y: 0 },
    { x: metres * 10, y: 0 },
  ],
  calibrationId,
  classificationValueIds: [],
  visible: true,
});

function sessionWith(
  pageCount: number,
  pages: Record<number, Measurement[]>,
  calibrations: Record<number, PageCalibration> = {},
): CurrentSession {
  const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, pageCount);
  for (const [key, measurements] of Object.entries(pages)) {
    const page = session.pages[Number(key)]!;
    page.calibrations = [calibrations[Number(key)] ?? UNIFORM];
    page.measurements = measurements;
  }
  return session;
}

function rows(csv: string) {
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

const fast = async () => {};
const many = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => line(`${prefix}-${index}`, 2));

describe("CSV batches with pages missing from the session", () => {
  it("skips uninitialized pages and numbers and labels the rest like the single pass", async () => {
    const session = sessionWith(4, { 1: many("a", 250), 4: many("d", 250) });
    delete session.pages[2];
    delete session.pages[3];
    session.pageLabelOverrides = { 4: "A-4" };

    const batched = await buildCsvInBatches(session, ["i"], undefined, fast);
    const parsed = rows(batched);

    expect(batched).toBe(buildCsv(session, ["i"]));
    expect(parsed).toHaveLength(500);
    expect(parsed.slice(0, 250).every((row) => row.page === "1" && row.page_label === "i")).toBe(
      true,
    );
    expect(parsed.slice(250).every((row) => row.page === "4" && row.page_label === "A-4")).toBe(
      true,
    );
    expect(parsed[0]).toMatchObject({ measurement_id: "a-0", length: "2.00" });
    expect(parsed[499]).toMatchObject({ measurement_id: "d-249", length: "2.00" });
  });

  it("leaves the label empty when the source labels do not reach the page", async () => {
    const session = sessionWith(3, { 1: many("a", 100), 3: many("c", 101) });

    const parsed = rows(await buildCsvInBatches(session, ["i", "ii"], undefined, fast));

    expect(parsed).toHaveLength(201);
    expect(parsed[0]).toMatchObject({ page: "1", page_label: "i" });
    expect(parsed[200]).toMatchObject({ measurement_id: "c-100", page: "3", page_label: "" });
  });

  it("ignores pages numbered beyond the page count", async () => {
    const session = sessionWith(1, { 1: many("a", 201) });
    session.pages[2] = { ...session.pages[1]!, pageNumber: 2, measurements: many("ghost", 5) };

    const parsed = rows(await buildCsvInBatches(session, null, undefined, fast));

    expect(parsed).toHaveLength(201);
    expect(parsed.some((row) => row.measurement_id?.startsWith("ghost"))).toBe(false);
  });

  it("rejects with NoMeasurementsError, as the single pass does, when no initialized page has measurements", async () => {
    const session = sessionWith(3, { 1: [] });
    delete session.pages[2];
    delete session.pages[3];

    await expect(buildCsvInBatches(session, null, undefined, fast)).rejects.toBeInstanceOf(
      NoMeasurementsError,
    );
    expect(() => buildCsv(session)).toThrow(NoMeasurementsError);
  });
});

describe("CSV batches with non-finite scales", () => {
  // Page 1 fills one full batch of 200 and a partial one, so rows are already serialized
  // when page 2 fails.
  const failing = () =>
    sessionWith(2, { 1: many("ok", 250), 2: [line("bad", 1, "infinite")] }, { 2: INFINITE_SCALE });

  it("rejects the batched build like the single pass, with the same error", async () => {
    const yieldToMain = vi.fn(fast);
    let single: unknown;
    try {
      buildCsv(failing());
    } catch (error) {
      single = error;
    }

    expect(single).toBeInstanceOf(RangeError);
    await expect(buildCsvInBatches(failing(), null, undefined, yieldToMain)).rejects.toThrow(
      (single as Error).message,
    );
    // The first batch was already processed: the failure is not a pre-check.
    expect(yieldToMain).toHaveBeenCalledTimes(1);
  });

  it("downloads nothing when the export fails", async () => {
    await expect(downloadCsvInBatches(failing())).rejects.toBeInstanceOf(RangeError);

    expect(downloadExportFile).not.toHaveBeenCalled();
  });

  it("downloads the complete file once when every scale is finite", async () => {
    const session = sessionWith(1, { 1: many("ok", 250) });

    await downloadCsvInBatches(session, null);

    expect(downloadExportFile).toHaveBeenCalledOnce();
    const [contents, fileName, mimeType] = vi.mocked(downloadExportFile).mock.calls[0]!;
    expect(fileName).toBe("plan-measurements.csv");
    expect(mimeType).toBe("text/csv;charset=utf-8");
    expect(rows(contents as string)).toHaveLength(250);
  });
});
