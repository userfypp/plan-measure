// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createProjectFile, readProjectFile } from "../services/projectFile";
import { getMeasurementCalibration } from "../utils/calibration";
import { isValidPageCalibration, measurementResultsMm } from "../utils/geometry";

const SAMPLE_PDF = "assets/orchard-house-sample.pdf";
const SAMPLE_PROJECT = "assets/orchard-house-sample.planmeasure";

// Reference values come from the sample PDF's own geometry (scripts/sample/geometry.mjs). The
// bundled measurements were drawn by hand, so they only agree within a small tolerance.
const REFERENCE: Record<number, Record<string, { area?: number; perimeter?: number; length?: number }>> = {
  2: {
    Parcel: { area: 1295, perimeter: 141.1 },
    House: { area: 110.5 },
    Parking: { area: 50 },
    "Axis of the path": { length: 13.8 },
    Pond: { area: 31.42 },
  },
  3: {
    Terrace: { area: 6, perimeter: 10 },
    Planter: { area: 0.5 },
    "North side of the plot": { length: 40 },
    "Terrain profile": { length: 40.26 },
  },
  4: {
    "Living / Dining": { area: 36.04, perimeter: 29 },
    Kitchen: { area: 18.81, perimeter: 18 },
    "Bedroom 1": { area: 12.48, perimeter: 14.2 },
    "Bedroom 2": { area: 9.6, perimeter: 12.4 },
    "North facade": { length: 13 },
  },
};

const COUNTS: Record<number, Record<string, number>> = {
  2: { Trees: 6 },
  4: { Windows: 10, Doors: 6 },
};

describe("bundled sample project", () => {
  async function loadSample() {
    const bytes = await readFile(SAMPLE_PROJECT);
    const { session, pdfBlob } = await readProjectFile(new Blob([new Uint8Array(bytes)]));
    return { session, pdfBlob };
  }

  it("embeds the original sample PDF and a consistent session", async () => {
    const { session, pdfBlob } = await loadSample();
    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
    expect(pdfBytes).toEqual(new Uint8Array(await readFile(SAMPLE_PDF)));
    expect(session.pdf).toMatchObject({ name: "orchard-house-sample.pdf", size: pdfBytes.byteLength });
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBe(6);
    expect(session.pageCount).toBe(6);
    expect(session.currentPage).toBe(4);
    expect(
      Object.fromEntries(
        Object.values(session.pages).map((page) => [page.pageNumber, page.measurements.length]),
      ),
    ).toEqual({ 1: 0, 2: 6, 3: 4, 4: 10, 5: 0, 6: 0 });
    expect((await readProjectFile(createProjectFile(session, pdfBlob))).session).toEqual(session);
  });

  it("keeps every measurement inside its page and calculable", async () => {
    const { session, pdfBlob } = await loadSample();
    const pdf = await PDFDocument.load(new Uint8Array(await pdfBlob.arrayBuffer()));
    for (const page of Object.values(session.pages)) {
      const { width, height } = pdf.getPage(page.pageNumber - 1).getSize();
      for (const calibration of page.calibrations)
        expect(isValidPageCalibration(calibration)).toBe(true);
      for (const measurement of page.measurements) {
        for (const point of measurement.points) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(width);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(height);
        }
        const calibration = getMeasurementCalibration(page, measurement);
        if (measurement.type === "count") {
          expect(calibration).toBeNull();
          continue;
        }
        expect(calibration).not.toBeNull();
        const results = measurementResultsMm(measurement, calibration!);
        for (const quantity of Object.values(results)) {
          if (quantity !== null) {
            expect(Number.isFinite(quantity)).toBe(true);
            expect(quantity).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("measures the sample sheets close to their drawn geometry", async () => {
    const { session } = await loadSample();
    const close = (actual: number, expected: number) =>
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(expected * 0.02, 0.05));
    for (const [pageNumber, expectedByName] of Object.entries(REFERENCE)) {
      const page = session.pages[Number(pageNumber)]!;
      for (const [name, expected] of Object.entries(expectedByName)) {
        const measurement = page.measurements.find((candidate) => candidate.name === name);
        expect(measurement, `${name} on page ${pageNumber}`).toBeDefined();
        const results = measurementResultsMm(measurement!, getMeasurementCalibration(page, measurement!));
        if (expected.area !== undefined) close(results.areaMm2! / 1e6, expected.area);
        if (expected.perimeter !== undefined) close(results.perimeterMm! / 1000, expected.perimeter);
        if (expected.length !== undefined) close(results.lengthMm! / 1000, expected.length);
      }
    }
    for (const [pageNumber, expectedByName] of Object.entries(COUNTS)) {
      const page = session.pages[Number(pageNumber)]!;
      for (const [name, total] of Object.entries(expectedByName)) {
        const measurement = page.measurements.find((candidate) => candidate.name === name);
        expect(measurement).toMatchObject({ type: "count", visible: true, calibrationId: null });
        expect(measurement!.points).toHaveLength(total);
      }
    }
  });

  it("showcases scales, classifications and a revision cloud", async () => {
    const { session } = await loadSample();
    expect(session.pages[3]!.calibrations.map((calibration) => calibration.mode)).toEqual([
      "uniform",
      "uniform",
      "xy",
    ]);
    const [dimension] = session.classificationCatalog.dimensions;
    expect(dimension).toMatchObject({ name: "House" });
    expect(dimension!.values.map((value) => value.name)).toEqual(["Living", "Kitchen", "Bedrooms"]);
    const ground = session.pages[4]!;
    const classified = ground.measurements.filter((measurement) => measurement.classificationValueIds.length > 0);
    expect(classified.map((measurement) => measurement.name).sort()).toEqual(
      ["Bedroom 1", "Bedroom 2", "Countertop (front)", "Dining table", "Kitchen", "Living / Dining"].sort(),
    );
    expect(ground.measurements.find((measurement) => measurement.type === "cloud")).toMatchObject({
      name: "Rev A",
      note: "Bathroom layout under review",
    });
  });
});
