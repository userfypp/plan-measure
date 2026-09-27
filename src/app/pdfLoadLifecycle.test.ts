import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import type { LoadedPdf } from "../services/pdf";
import {
  canActivatePdf,
  PdfLoadLifecycle,
  scheduleRetiredPdfRelease,
  shouldConfirmPdfReplacement,
} from "./pdfLoadLifecycle";

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

  it("confirms only protected recovery or an in-progress PDF activation", () => {
    expect(shouldConfirmPdfReplacement({ pdfActivating: false, recoveryProtected: true })).toBe(true);
    expect(shouldConfirmPdfReplacement({ pdfActivating: false, recoveryProtected: false })).toBe(false);
    expect(shouldConfirmPdfReplacement({ pdfActivating: true, recoveryProtected: false })).toBe(
      true,
    );
  });

  it("releases only PDFs retired when its post-commit callback was scheduled", () => {
    const first = fakeLoadedPdf();
    const second = fakeLoadedPdf();
    const retiredPdfs = [first.loaded];
    const scheduledCallbacks: VoidFunction[] = [];
    const destroy = vi.fn(async (loaded: LoadedPdf) => {
      await loaded.loadingTask.destroy();
    });

    scheduleRetiredPdfRelease(retiredPdfs, (callback) => scheduledCallbacks.push(callback), destroy);
    retiredPdfs.push(second.loaded);
    scheduledCallbacks[0]!();

    expect(destroy).toHaveBeenCalledExactlyOnceWith(first.loaded);
    expect(retiredPdfs).toEqual([second.loaded]);
    expect(second.destroy).not.toHaveBeenCalled();

    scheduleRetiredPdfRelease(retiredPdfs, (callback) => scheduledCallbacks.push(callback), destroy);
    scheduledCallbacks[1]!();
    expect(destroy).toHaveBeenNthCalledWith(2, second.loaded);
  });
});
