import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import type { LoadedPdf } from "../services/pdf";
import { canActivatePdf, PdfLoadLifecycle, shouldConfirmPdfReplacement } from "./pdfLoadLifecycle";

function fakeLoadedPdf() {
  const destroy = vi.fn().mockResolvedValue(undefined);
  const loaded = {
    document: {} as PDFDocumentProxy,
    loadingTask: { destroy } as unknown as PDFDocumentLoadingTask,
    pageLabels: null,
  } satisfies LoadedPdf;
  return { loaded, destroy };
}

describe("PDF load lifecycle", () => {
  it("keeps a normally completed load activatable without a pending candidate", () => {
    const lifecycle = new PdfLoadLifecycle();
    const candidate = {};
    const generation = lifecycle.begin();

    expect(canActivatePdf(lifecycle, generation, candidate, null, false)).toBe(true);
  });

  it("invalidates an older load and destroys an obsolete result only once", async () => {
    const lifecycle = new PdfLoadLifecycle();
    const first = fakeLoadedPdf();
    const second = fakeLoadedPdf();

    const firstGeneration = lifecycle.begin();
    const secondGeneration = lifecycle.begin();

    expect(lifecycle.isCurrent(firstGeneration)).toBe(false);
    expect(lifecycle.isCurrent(secondGeneration)).toBe(true);

    await lifecycle.destroy(first.loaded);
    await lifecycle.destroy(first.loaded);

    expect(first.destroy).toHaveBeenCalledOnce();
    expect(second.destroy).not.toHaveBeenCalled();
  });

  it("requires the pending candidate only for confirmed replacement", () => {
    const lifecycle = new PdfLoadLifecycle();
    const candidate = {};
    const otherCandidate = {};
    const generation = lifecycle.begin();

    expect(canActivatePdf(lifecycle, generation, candidate, candidate, true)).toBe(true);
    expect(canActivatePdf(lifecycle, generation, candidate, otherCandidate, true)).toBe(false);
  });

  it("protects an unreadable saved session until replacement is explicitly confirmed", () => {
    expect(shouldConfirmPdfReplacement({ sessionLoaded: false, pdfRuntimeLoaded: false, pdfActivating: false, recoveryProtected: true })).toBe(true);
    expect(shouldConfirmPdfReplacement({ sessionLoaded: false, pdfRuntimeLoaded: false, pdfActivating: false, recoveryProtected: false })).toBe(false);
  });
});
