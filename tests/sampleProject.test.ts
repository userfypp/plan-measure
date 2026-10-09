import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createProjectFile, readProjectFile } from "../src/services/projectFile";
import { getMeasurementCalibration } from "../src/utils/calibration";
import { isValidPageCalibration, measurementResultsMm } from "../src/utils/geometry";

describe("bundled sample project", () => {
  it("opens the bundled sample with the original PDF and calculable measurements", async () => {
    const bytes = await readFile("assets/plan_measure_demo_floor_plan_clean_A3_1-50.planmeasure");
    const { session, pdfBlob } = await readProjectFile(new Blob([new Uint8Array(bytes)]));
    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
    const originalPdf = await readFile("assets/plan_measure_demo_floor_plan_clean_A3_1-50.pdf");
    expect(pdfBytes).toEqual(new Uint8Array(originalPdf));
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBe(session.pageCount);
    expect(Object.values(session.pages).flatMap((page) => page.measurements)).toHaveLength(5);
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
    expect((await readProjectFile(createProjectFile(session, pdfBlob))).session).toEqual(session);
  });
});
