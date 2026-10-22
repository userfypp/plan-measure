import { PDFDocument, PDFName, PDFNumber, PDFPage, degrees } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { CurrentSession, Point } from "../../types/domain";
import { createAnnotatedPdf } from "./annotatedPdf";

const CROP = { x: 50, y: 40, width: 200, height: 120 };

function session(points: [Point, Point]): CurrentSession {
  return {
    schemaVersion: 15,
    pdf: { name: "plan.pdf", size: 10, lastModified: 1 },
    pageCount: 1,
    currentPage: 1,
    pages: {
      1: {
        pageNumber: 1,
        calibrations: [
          {
            id: "scale",
            name: "Scale 1",
            mode: "uniform",
            start: { x: 0, y: 0 },
            end: { x: 100, y: 0 },
            referenceDistanceMm: 1000,
          },
        ],
        activeCalibrationId: "scale",
        nextCalibrationNumber: 2,
        measurements: [
          {
            id: "line",
            name: "Line 1",
            type: "line",
            calibrationId: "scale",
            classificationValueIds: [],
            visible: true,
            points,
          },
        ],
        nextMeasurementNumber: { line: 2, polyline: 1, polygon: 1, rectangle: 1, ellipse: 1, cloud: 1, count: 1 },
      },
    },
    pageLabelOverrides: {},
    settings: {
      displayUnit: "m",
      areaDisplay: "auto",
      showLabels: true,
      showMeasurements: true,
      showCalibration: false,
      labelClassificationDimensionId: null,
      measureClouds: false,
      csvExport: { columnOverrides: {} },
      measurementDecimalPlaces: 2,
    },
    classificationCatalog: { dimensions: [] },
  };
}

async function realDocument(edit: (page: PDFPage) => void): Promise<PDFDocumentProxy> {
  const document = await PDFDocument.create();
  edit(document.addPage([400, 300]));
  const task = getDocument({ data: await document.save() });
  tasks.push(task);
  return task.promise as Promise<PDFDocumentProxy>;
}

const tasks: Array<{ destroy(): Promise<void> }> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tasks.splice(0).map((task) => task.destroy()));
});

function drawnLine(drawLine: MockInstance<PDFPage["drawLine"]>) {
  expect(drawLine).toHaveBeenCalledTimes(1);
  const { start, end, thickness } = drawLine.mock.calls[0]![0];
  return { start, end, thickness };
}

function drawnLabel(drawText: MockInstance<PDFPage["drawText"]>) {
  expect(drawText).toHaveBeenCalledTimes(1);
  const [text, options] = drawText.mock.calls[0]!;
  return { text, x: options!.x!, y: options!.y!, size: options!.size!, angle: options!.rotate?.angle ?? 0 };
}

function expectPoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

describe("annotated PDF export through real PDF.js viewports", () => {
  // Logical points are in the displayed (rotated) page; the expected points are PDF user space.
  it.each([
    [0, (p: Point) => ({ x: CROP.x + p.x, y: CROP.y + CROP.height - p.y })],
    [90, (p: Point) => ({ x: CROP.x + p.y, y: CROP.y + p.x })],
    [180, (p: Point) => ({ x: CROP.x + CROP.width - p.x, y: CROP.y + p.y })],
    [270, (p: Point) => ({ x: CROP.x + CROP.width - p.y, y: CROP.y + CROP.height - p.x })],
  ])("places geometry and labels inside the CropBox of a page rotated %i°", async (rotation, toPdf) => {
    const points: [Point, Point] = [
      { x: 10, y: 20 },
      { x: 110, y: 20 },
    ];
    const source = await realDocument((page) => {
      page.setCropBox(CROP.x, CROP.y, CROP.width, CROP.height);
      page.setRotation(degrees(rotation));
    });
    const drawLine = vi.spyOn(PDFPage.prototype, "drawLine");
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");

    await createAnnotatedPdf(session(points), source);

    const line = drawnLine(drawLine);
    expectPoint(line.start, toPdf(points[0]));
    expectPoint(line.end, toPdf(points[1]));
    expect(line.thickness).toBeCloseTo(1.5, 9);
    const label = drawnLabel(drawText);
    expect(label.text).toBe("1.00 m");
    expect(label.size).toBeCloseTo(12, 9);
    expect(((label.angle % 360) + 360) % 360).toBe(rotation);
    expect(label.x).toBeGreaterThanOrEqual(CROP.x);
    expect(label.x).toBeLessThanOrEqual(CROP.x + CROP.width);
    expect(label.y).toBeGreaterThanOrEqual(CROP.y);
    expect(label.y).toBeLessThanOrEqual(CROP.y + CROP.height);
  });

  it("scales geometry, strokes and labels by the page UserUnit", async () => {
    const points: [Point, Point] = [
      { x: 20, y: 40 },
      { x: 220, y: 40 },
    ];
    const source = await realDocument((page) => {
      page.node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
    });
    const drawLine = vi.spyOn(PDFPage.prototype, "drawLine");
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");

    await createAnnotatedPdf(session(points), source);

    const line = drawnLine(drawLine);
    expectPoint(line.start, { x: 10, y: 280 });
    expectPoint(line.end, { x: 110, y: 280 });
    expect(line.thickness).toBeCloseTo(0.75, 9);
    expect(drawnLabel(drawText).size).toBeCloseTo(6, 9);
  });
});
