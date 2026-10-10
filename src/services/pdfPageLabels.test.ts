import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFName, PDFNumber, PDFString } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdf, readPdfPageLabels } from "./pdf";

const mocked = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ getDocument: mocked.getDocument, GlobalWorkerOptions: {} }));
afterEach(() => vi.restoreAllMocks());
async function generatedPdf(withLabels: boolean) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 120; i++) pdf.addPage([200, 300]);
  if (withLabels) {
    const context = pdf.context;
    pdf.catalog.set(
      PDFName.of("PageLabels"),
      context.obj({
        Nums: [
          PDFNumber.of(0),
          context.obj({ S: PDFName.of("r") }),
          PDFNumber.of(4),
          context.obj({ S: PDFName.of("D"), P: PDFString.of("Plan-"), St: PDFNumber.of(7) }),
          PDFNumber.of(10),
          context.obj({ S: PDFName.of("D"), St: PDFNumber.of(1) }),
        ],
      }),
    );
  }
  return pdf.save();
}
describe("PDF page labels", () => {
  it.each([false, true])(
    "reads generated PDF metadata without requesting/rendering pages (labels=%s)",
    async (withLabels) => {
      const task = getDocument({ data: await generatedPdf(withLabels), useSystemFonts: true });
      const document = await task.promise;
      const getPage = vi.spyOn(document, "getPage");
      try {
        const labels = await readPdfPageLabels(document);
        if (withLabels) {
          expect(labels).toHaveLength(120);
          expect(labels!.slice(0, 6)).toEqual(["i", "ii", "iii", "iv", "Plan-7", "Plan-8"]);
          expect(labels![10]).toBe("1");
          expect(labels![119]).toBe("110");
        } else expect(labels).toBeNull();
        expect(getPage).not.toHaveBeenCalled();
      } finally {
        await task.destroy();
      }
    },
  );
  it("falls back quietly when label loading fails or returns malformed metadata", async () => {
    const warn = vi.spyOn(console, "warn"),
      error = vi.spyOn(console, "error");
    for (const getPageLabels of [
      vi.fn().mockRejectedValue(new Error("bad labels")),
      vi.fn().mockResolvedValue(["too short"]),
      vi.fn().mockResolvedValue([2, 3]),
    ]) {
      expect(
        await readPdfPageLabels({ numPages: 2, getPageLabels } as unknown as PDFDocumentProxy),
      ).toBeNull();
    }
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
  it("opens the document while labels remain unresolved", async () => {
    let finish!: (labels: string[]) => void;
    const document = {
      numPages: 2,
      getPageLabels: vi.fn(
        () =>
          new Promise<string[]>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    mocked.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy: vi.fn() });
    const result = await loadPdf(new Blob(["mock"]));
    expect(result.document).toBe(document);
    expect(result.pageLabels).toBeNull();
    finish(["i", "ii"]);
    expect(await result.pageLabelsReady).toEqual(["i", "ii"]);
  });
});
