/* @vitest-environment jsdom */

import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDFDocument, PDFPage, degrees } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSession, PageState } from "../../types/domain";
import {
  annotatedPdfFileName,
  createAnnotatedPdf,
  downloadAnnotatedPdf,
  planAnnotatedPdfMeasurements,
} from "./annotatedPdf";

function pageFixture(): PageState {
  return {
    pageNumber: 1,
    calibrations: [
      {
        id: "scale-1",
        name: "Scale 1",
        mode: "uniform",
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        referenceDistanceMm: 1000,
      },
    ],
    activeCalibrationId: "scale-1",
    nextCalibrationNumber: 2,
    measurements: [
      {
        id: "line-visible",
        name: "Visible line",
        type: "line",
        calibrationId: "scale-1",
        classificationValueIds: [],
        visible: true,
        points: [
          { x: 10, y: 20 },
          { x: 110, y: 20 },
        ],
      },
      {
        id: "line-hidden",
        name: "Hidden line",
        type: "line",
        calibrationId: "scale-1",
        classificationValueIds: [],
        visible: false,
        points: [
          { x: 10, y: 40 },
          { x: 110, y: 40 },
        ],
      },
    ],
    nextMeasurementNumber: { line: 3, polyline: 1, polygon: 1 },
  };
}

function sessionFixture(pageCount = 1): CurrentSession {
  const page = pageFixture();
  const pages: Record<number, PageState> = { 1: page };
  if (pageCount > 1) {
    pages[2] = {
      ...page,
      pageNumber: 2,
      measurements: [],
    };
  }
  return {
    schemaVersion: 11,
    pdf: { name: "sample.pdf", size: 10, lastModified: 1 },
    pageCount,
    currentPage: 1,
    pages,
    pageLabelOverrides: {},
    settings: {
      displayUnit: "m",
      areaDisplay: "auto",
      showLabels: true,
      showMeasurements: true,
      showCalibration: false,
      csvExport: { columnOverrides: {} },
      measurementDecimalPlaces: 2,
    },
    classificationCatalog: { dimensions: [] },
  };
}

async function sourcePdf(pageCount = 1): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([200, 120]);
  if (pageCount > 1) {
    const rotated = document.addPage([300, 180]);
    rotated.setRotation(degrees(90));
  }
  return document.save();
}

function sourceDocument(bytes: Uint8Array, pageCount = 1): PDFDocumentProxy {
  return {
    numPages: pageCount,
    getData: vi.fn(async () => bytes),
    getPage: vi.fn(async (pageNumber: number) => {
      const rotated = pageNumber === 2;
      const width = rotated ? 180 : 200;
      const height = rotated ? 300 : 120;
      return {
        rotate: rotated ? 90 : 0,
        getViewport: () => ({
          width,
          height,
          rotation: rotated ? 90 : 0,
          convertToPdfPoint: (x: number, y: number) => (rotated ? [y, x] : [x, 120 - y]),
        }),
      };
    }),
  } as unknown as PDFDocumentProxy;
}

describe("annotated PDF export", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a safe annotated-PDF filename from the source PDF name", () => {
    expect(annotatedPdfFileName("Level 01.pdf")).toBe("Level 01-annotated.pdf");
    expect(annotatedPdfFileName("folder\\Level/01.PDF")).toBe("folder_Level_01-annotated.pdf");
    expect(annotatedPdfFileName(".pdf")).toBe("plan-annotated.pdf");
  });

  it("plans only visible measurements and includes value labels when labels are enabled", () => {
    const session = sessionFixture();
    const page = session.pages[1]!;
    const plans = planAnnotatedPdfMeasurements(
      page,
      { width: 200, height: 120, rotation: 0 },
      session.settings,
      (text) => ({ width: text.length * 6 + 8, height: 20 }),
    );

    expect(plans).toHaveLength(1);
    expect(plans[0]?.measurement.id).toBe("line-visible");
    expect(plans[0]?.label?.text).toBe("1.00 m");
    expect(plans[0]?.label?.placement.x).toBeGreaterThanOrEqual(0);
    expect(plans[0]?.label?.placement.y).toBeGreaterThanOrEqual(0);
  });

  it("keeps visible geometry while omitting labels that are hidden or lack a scale", () => {
    const session = sessionFixture();
    const page = session.pages[1]!;
    const withoutLabels = planAnnotatedPdfMeasurements(
      page,
      { width: 200, height: 120, rotation: 0 },
      { ...session.settings, showLabels: false },
      () => ({ width: 40, height: 20 }),
    );
    expect(withoutLabels).toHaveLength(1);
    expect(withoutLabels[0]?.label).toBeNull();

    const missingScale = {
      ...page,
      measurements: [{ ...page.measurements[0]!, calibrationId: "missing" }],
    };
    const withoutScaleLabel = planAnnotatedPdfMeasurements(
      missingScale,
      { width: 200, height: 120, rotation: 0 },
      session.settings,
      () => ({ width: 40, height: 20 }),
    );
    expect(withoutScaleLabel).toHaveLength(1);
    expect(withoutScaleLabel[0]?.label).toBeNull();

    expect(
      planAnnotatedPdfMeasurements(
        page,
        { width: 200, height: 120, rotation: 0 },
        { ...session.settings, showMeasurements: false },
        () => ({ width: 40, height: 20 }),
      ),
    ).toEqual([]);
  });

  it("writes visible measurement geometry and labels while preserving original pages", async () => {
    const source = await sourcePdf(2);
    const session = sessionFixture(2);
    const drawLine = vi.spyOn(PDFPage.prototype, "drawLine");
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");

    const output = await createAnnotatedPdf(session, sourceDocument(source, 2));
    const exported = await PDFDocument.load(output);
    const pages = exported.getPages();

    expect(drawLine).toHaveBeenCalledTimes(1);
    expect(drawText).toHaveBeenCalledTimes(1);
    expect(drawText.mock.calls[0]?.[0]).toBe("1.00 m");
    expect(pages).toHaveLength(2);
    expect(pages[0]?.getSize()).toEqual({ width: 200, height: 120 });
    expect(pages[1]?.getSize()).toEqual({ width: 300, height: 180 });
    expect(pages[1]?.getRotation().angle).toBe(90);
    expect(output.byteLength).toBeGreaterThan(source.byteLength);
  });

  it("keeps labels aligned with the displayed axes on rotated source pages", async () => {
    const source = await sourcePdf(2);
    const session = sessionFixture(2);
    session.pages[1]!.measurements = [];
    session.pages[2] = {
      ...pageFixture(),
      pageNumber: 2,
    };
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");

    await createAnnotatedPdf(session, sourceDocument(source, 2));

    expect(drawText).toHaveBeenCalledTimes(1);
    expect(drawText.mock.calls[0]?.[1]?.rotate?.angle).toBe(90);
  });

  it("scales stroke and text metrics through the PDF viewport transform", async () => {
    const source = await sourcePdf();
    const session = sessionFixture();
    const scaledDocument = {
      numPages: 1,
      getData: vi.fn(async () => source),
      getPage: vi.fn(async () => ({
        rotate: 0,
        getViewport: () => ({
          width: 400,
          height: 240,
          rotation: 0,
          convertToPdfPoint: (x: number, y: number) => [x / 2, (240 - y) / 2],
        }),
      })),
    } as unknown as PDFDocumentProxy;
    const drawLine = vi.spyOn(PDFPage.prototype, "drawLine");
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");

    await createAnnotatedPdf(session, scaledDocument);

    expect(drawLine.mock.calls[0]?.[0].thickness).toBe(0.75);
    expect(drawText.mock.calls[0]?.[1]?.size).toBe(6);
  });

  it("exports polyline segments and a closed polygon using the shared measurement styles", async () => {
    const source = await sourcePdf();
    const session = sessionFixture();
    session.pages[1]!.measurements = [
      {
        ...session.pages[1]!.measurements[0]!,
        id: "polyline",
        type: "polyline",
        points: [
          { x: 10, y: 20 },
          { x: 80, y: 20 },
          { x: 80, y: 70 },
        ],
      },
      {
        ...session.pages[1]!.measurements[0]!,
        id: "polygon",
        type: "polygon",
        points: [
          { x: 120, y: 20 },
          { x: 180, y: 20 },
          { x: 180, y: 80 },
          { x: 120, y: 80 },
        ],
      },
    ];
    const drawLine = vi.spyOn(PDFPage.prototype, "drawLine");
    const drawSvgPath = vi.spyOn(PDFPage.prototype, "drawSvgPath");

    await createAnnotatedPdf(session, sourceDocument(source));

    expect(drawLine).toHaveBeenCalledTimes(6);
    expect(drawLine.mock.calls.every(([options]) => options.thickness === 1.5)).toBe(true);
    expect(drawSvgPath).toHaveBeenCalled();
    expect(
      drawSvgPath.mock.calls.some(
        ([path, options]) => path.endsWith("Z") && options?.opacity === 16 / 255,
      ),
    ).toBe(true);
  });

  it("rejects a source PDF whose page count no longer matches the session", async () => {
    const source = await sourcePdf();

    await expect(createAnnotatedPdf(sessionFixture(2), sourceDocument(source, 1))).rejects.toThrow(
      "saved page count",
    );
  });

  it("downloads the generated PDF with the annotated filename and PDF MIME type", async () => {
    const source = await sourcePdf();
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob;
      return "blob:annotated-pdf";
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    let downloadName = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });
    const timeout = vi.spyOn(window, "setTimeout").mockImplementation((handler: TimerHandler) => {
      if (typeof handler === "function") handler();
      return 1;
    });

    await downloadAnnotatedPdf(sessionFixture(), sourceDocument(source));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe("application/pdf");
    expect(click).toHaveBeenCalledOnce();
    expect(downloadName).toBe("sample-annotated.pdf");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:annotated-pdf");
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 60_000);

    click.mockRestore();
    timeout.mockRestore();
  });
});
