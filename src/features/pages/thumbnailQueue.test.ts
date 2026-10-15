// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import {
  mainPdfBusy,
  mainPdfRenderMs,
  setMainPdfBusy,
  setMainPdfPage,
  setMainPdfRasterSource,
  setMainPdfRenderMs,
} from "../viewer/pdfRenderPriority";
import {
  DEFERRED_PREVIEW_FILE_BYTES,
  DEFERRED_PREVIEW_RENDER_MS,
  MAX_THUMBNAILS,
  MAX_THUMBNAIL_PIXELS,
  ThumbnailQueue,
  acquireThumbnailQueue,
  parkedThumbnails,
  prefetchThumbnails,
  thumbnailFromRaster,
  thumbnailViewport,
} from "./thumbnailQueue";
import { releaseRetainedThumbnails } from "./thumbnailRetention";

function pdfDouble({ automatic = false, rotation = 0, width = 800, height = 600 } = {}) {
  let active = 0,
    maximum = 0;
  const tasks: { finish: () => void; cancel: ReturnType<typeof vi.fn> }[] = [];
  const cleanup = vi.fn();
  const render = vi.fn(() => {
    let resolve!: () => void, reject!: (reason: Error) => void;
    const promise = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    active++;
    maximum = Math.max(maximum, active);
    const cancel = vi.fn(() => {
      reject(new Error("Cancelled"));
    });
    tasks.push({ finish: resolve, cancel });
    void promise.then(
      () => active--,
      () => active--,
    );
    if (automatic) resolve();
    return { promise, cancel } as unknown as RenderTask;
  });
  const page = {
    rotate: rotation,
    getViewport: ({ scale }: { scale: number }) => ({
      width: (rotation % 180 ? height : width) * scale,
      height: (rotation % 180 ? width : height) * scale,
      rotation,
    }),
    cleanup,
    render,
  } as unknown as PDFPageProxy;
  const getPage = vi.fn(async () => page);
  const document = { numPages: 500, getPage } as unknown as PDFDocumentProxy;
  return {
    document,
    page,
    getPage,
    render,
    tasks,
    cleanup,
    maximum: () => maximum,
    active: () => active,
  };
}
const queues: ThumbnailQueue[] = [];
function queue(document: PDFDocumentProxy, fileBytes = 0) {
  const result = new ThumbnailQueue(document, vi.fn(), fileBytes);
  queues.push(result);
  return result;
}
async function tick() {
  await vi.advanceTimersByTimeAsync(1);
}
function raster(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
let drawImage: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
});
afterEach(async () => {
  releaseRetainedThumbnails();
  queues.splice(0).forEach((item) => item.dispose());
  await tick();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("demand-driven thumbnails", () => {
  it("makes zero requests while closed and cancels on disposal", async () => {
    const pdf = pdfDouble();
    const thumbnails = queue(pdf.document);
    await tick();
    expect(pdf.getPage).not.toHaveBeenCalled();
    thumbnails.setWindow([1, 2, 3]);
    await tick();
    expect(pdf.render).toHaveBeenCalledTimes(1);
    thumbnails.dispose();
    expect(pdf.tasks[0]!.cancel).toHaveBeenCalledTimes(1);
    await tick();
    expect(pdf.render).toHaveBeenCalledTimes(1);
    expect(thumbnails.size).toBe(0);
  });
  it("serializes renders, prioritizes the supplied visible window and cancels fast scrolling", async () => {
    const pdf = pdfDouble();
    const thumbnails = queue(pdf.document);
    thumbnails.setWindow([3, 4, 2, 5]);
    await tick();
    expect(pdf.getPage.mock.calls[0]).toEqual([3]);
    expect(pdf.maximum()).toBe(1);
    thumbnails.setWindow([3, 4, 2, 5]);
    await tick();
    expect(pdf.maximum()).toBe(1);
    expect(pdf.render).toHaveBeenCalledTimes(1);
    thumbnails.setWindow([400, 401]);
    expect(pdf.tasks[0]!.cancel).toHaveBeenCalledTimes(1);
    await tick();
    expect(pdf.getPage.mock.calls.at(-1)).toEqual([400]);
    pdf.tasks.at(-1)!.finish();
    await tick();
    expect(pdf.getPage.mock.calls.at(-1)).toEqual([401]);
    expect(pdf.maximum()).toBe(1);
    expect(thumbnails.get(3)).toBeUndefined();
  });
  it("waits for cancellation to settle across close/reopen and document replacement", async () => {
    const first = pdfDouble(),
      second = pdfDouble();
    const old = queue(first.document),
      next = queue(second.document);
    old.setWindow([2]);
    await tick();
    old.dispose();
    next.setWindow([1]);
    expect(second.render).not.toHaveBeenCalled();
    await tick();
    expect(first.active()).toBe(0);
    expect(second.maximum()).toBe(1);
  });
  it("yields to the main render and pan/zoom, without cleaning its shared active page", async () => {
    const pdf = pdfDouble();
    const thumbnails = queue(pdf.document);
    const owner = {};
    setMainPdfPage(pdf.document, 10);
    setMainPdfBusy(pdf.document, owner, true);
    thumbnails.setWindow([10, 11]);
    await tick();
    expect(pdf.getPage).not.toHaveBeenCalled();
    setMainPdfBusy(pdf.document, owner, false);
    await tick();
    expect(pdf.render).toHaveBeenCalledTimes(1);
    setMainPdfBusy(pdf.document, owner, true);
    expect(pdf.tasks[0]!.cancel).toHaveBeenCalled();
    await tick();
    expect(pdf.cleanup).not.toHaveBeenCalled();
    expect(mainPdfBusy(pdf.document)).toBe(true);
    setMainPdfBusy(pdf.document, owner, false);
    await tick();
    pdf.tasks.at(-1)!.finish();
    await tick();
    expect(pdf.maximum()).toBe(1);
  });
  it.each([1, 3])(
    "bounds and releases the LRU by entries and pixels after traversing 500 pages twice (DPR %s)",
    async (dpr) => {
      Object.defineProperty(window, "devicePixelRatio", { value: dpr, configurable: true });
      const pdf = pdfDouble({ automatic: true });
      const thumbnails = queue(pdf.document);
      let firstCanvas: HTMLCanvasElement | undefined;
      for (let lap = 0; lap < 2; lap++)
        for (let number = 1; number <= 500; number++) {
          thumbnails.setWindow([number]);
          await tick();
          expect(thumbnails.size).toBeLessThanOrEqual(MAX_THUMBNAILS);
          expect(thumbnails.pixels).toBeLessThanOrEqual(MAX_THUMBNAIL_PIXELS);
          if (!firstCanvas) firstCanvas = thumbnails.get(1);
        }
      expect(firstCanvas!.width).toBe(0);
      expect(pdf.maximum()).toBe(1);
      const last = thumbnails.get(500)!;
      thumbnails.dispose();
      expect(last.width).toBe(0);
      expect(thumbnails.pixels).toBe(0);
      expect(pdf.cleanup).toHaveBeenCalledTimes(998); // Main page 1 remains owned by the viewer.
    },
  );
  it("does not retry failed pages or report errors in the console", async () => {
    const pdf = pdfDouble();
    pdf.getPage.mockRejectedValue(new Error("broken"));
    const error = vi.spyOn(console, "error"),
      warn = vi.spyOn(console, "warn");
    const thumbnails = queue(pdf.document);
    thumbnails.setWindow([3]);
    await tick();
    for (let i = 0; i < 5; i++) {
      thumbnails.setWindow([3]);
      await tick();
    }
    expect(pdf.getPage).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
  it("finishes a visible window larger than the cache without repeatedly rendering evicted pages", async () => {
    const pdf = pdfDouble({ automatic: true });
    const thumbnails = queue(pdf.document);
    thumbnails.setWindow(Array.from({ length: 40 }, (_, index) => index + 1));
    await vi.advanceTimersByTimeAsync(80);
    expect(pdf.render).toHaveBeenCalledTimes(40);
    expect(thumbnails.size).toBeLessThanOrEqual(MAX_THUMBNAILS);
    expect(thumbnails.pixels).toBeLessThanOrEqual(MAX_THUMBNAIL_PIXELS);
    const requests = pdf.getPage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20);
    expect(pdf.getPage).toHaveBeenCalledTimes(requests);
    thumbnails.setWindow([]);
    thumbnails.setWindow([1]);
    await tick();
    expect(thumbnails.get(1)).toBeDefined();
  });
  it("cancels an unresolved getPage before creating its render", async () => {
    const pdf = pdfDouble();
    let resolve!: (page: PDFPageProxy) => void;
    pdf.getPage.mockReturnValue(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    const thumbnails = queue(pdf.document);
    thumbnails.setWindow([2]);
    await tick();
    thumbnails.setWindow([]);
    resolve(pdf.page);
    await tick();
    expect(pdf.render).not.toHaveBeenCalled();
  });
  it.each([0, 90, 180, 270])(
    "caps the backing raster on enormous pages and honors rotation %s",
    (rotation) => {
      const pdf = pdfDouble({ rotation, width: 100_000, height: 50_000 });
      const viewport = thumbnailViewport(pdf.page, 4);
      expect(viewport.width).toBeLessThanOrEqual(216);
      expect(viewport.height).toBeLessThanOrEqual(156);
      expect(viewport.rotation).toBe(rotation);
      expect(viewport.width > viewport.height).toBe(rotation % 180 === 0);
    },
  );
  it("copies a completed main background without decoding the page again", async () => {
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    const pdf = pdfDouble({ automatic: true });
    const background = raster(2400, 1800);
    setMainPdfPage(pdf.document, 1);
    setMainPdfRasterSource(pdf.document, (number) => (number === 1 ? background : undefined));
    const notify = vi.fn();
    const thumbnails = new ThumbnailQueue(pdf.document, notify);
    queues.push(thumbnails);
    thumbnails.setWindow([1, 2]);
    expect(thumbnails.get(1)).toBeDefined(); // Ready before the panel paints.
    expect(notify).toHaveBeenCalled();
    await tick();
    await tick();
    expect(pdf.getPage.mock.calls).toEqual([[2]]);
    const thumbnail = thumbnails.get(1)!;
    expect([thumbnail.width, thumbnail.height]).toEqual([208, 156]);
    expect(drawImage).toHaveBeenCalledWith(background, 0, 0, 208, 156);
    expect(background.width).toBe(2400); // The viewer keeps ownership of its raster.
  });
  it("stops reusing a background once the viewer withdraws its source", async () => {
    const pdf = pdfDouble();
    const withdraw = setMainPdfRasterSource(pdf.document, () => raster(800, 600));
    withdraw();
    const thumbnails = queue(pdf.document);
    thumbnails.setWindow([1]);
    await tick();
    expect(pdf.getPage.mock.calls).toEqual([[1]]);
  });
  it.each([0, 90])(
    "keeps the orientation of a background rendered with rotation %s",
    (rotation) => {
      const background = rotation ? raster(1800, 2400) : raster(2400, 1800);
      const thumbnail = thumbnailFromRaster(background, 1)!;
      expect(thumbnail.width > thumbnail.height).toBe(rotation === 0);
      expect(thumbnail.width).toBeLessThanOrEqual(144);
      expect(thumbnail.height).toBeLessThanOrEqual(104);
    },
  );
  it("pauses decodes of unrendered pages in a large file until previews are requested", async () => {
    const pdf = pdfDouble({ automatic: true });
    setMainPdfPage(pdf.document, 1);
    setMainPdfRasterSource(pdf.document, (number) => (number === 1 ? raster(800, 600) : undefined));
    const thumbnails = queue(pdf.document, DEFERRED_PREVIEW_FILE_BYTES);
    thumbnails.setWindow([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(20);
    expect(thumbnails.get(1)).toBeDefined();
    expect(pdf.getPage).not.toHaveBeenCalled();
    expect(thumbnails.deferred).toBe(true);
    thumbnails.loadDeferred();
    expect(thumbnails.deferred).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(pdf.getPage.mock.calls).toEqual([[2], [3]]);
    expect(pdf.maximum()).toBe(1);
  });
  it("pauses decodes while the current page was expensive to render", async () => {
    const pdf = pdfDouble({ automatic: true });
    setMainPdfPage(pdf.document, 4);
    setMainPdfRenderMs(pdf.document, 4, DEFERRED_PREVIEW_RENDER_MS);
    const thumbnails = queue(pdf.document, DEFERRED_PREVIEW_FILE_BYTES - 1);
    thumbnails.setWindow([5]);
    await tick();
    expect(pdf.getPage).not.toHaveBeenCalled();
    expect(thumbnails.deferred).toBe(true);
    // A cheaper render of the same page, such as the fit view after zooming in, wins.
    setMainPdfRenderMs(pdf.document, 4, DEFERRED_PREVIEW_RENDER_MS - 1);
    setMainPdfRenderMs(pdf.document, 4, DEFERRED_PREVIEW_RENDER_MS * 2);
    expect(mainPdfRenderMs(pdf.document, 4)).toBe(DEFERRED_PREVIEW_RENDER_MS - 1);
    thumbnails.setWindow([5]);
    await tick();
    expect(pdf.getPage.mock.calls).toEqual([[5]]);
  });
});
describe("thumbnails across panels", () => {
  function acquire(document: PDFDocumentProxy, notify = vi.fn()) {
    const result = acquireThumbnailQueue(document, notify);
    queues.push(result);
    return result;
  }
  it("keeps a closed panel's previews for the next panel of the same document only", async () => {
    const pdf = pdfDouble({ automatic: true }),
      other = pdfDouble({ automatic: true });
    const first = acquire(pdf.document);
    first.setWindow([1, 2]);
    await tick();
    await tick();
    expect(first.size).toBe(2);
    first.park();
    expect([...parkedThumbnails(pdf.document).keys()]).toEqual([1, 2]);
    expect(parkedThumbnails(pdf.document, 1).size).toBe(0);
    expect(parkedThumbnails(other.document).size).toBe(0);

    const notify = vi.fn();
    const reopened = acquire(pdf.document, notify);
    expect(reopened).toBe(first);
    reopened.setWindow([1, 2]);
    await tick();
    expect(pdf.render).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalled();
    expect(parkedThumbnails(pdf.document).size).toBe(0); // Owned by the open panel again.

    reopened.park();
    const replaced = acquire(other.document);
    expect(replaced).not.toBe(first);
    expect(first.size).toBe(0);
    expect(parkedThumbnails(pdf.document).size).toBe(0);
  });
  it("stops rendering when parked and when its document's thumbnails are released", async () => {
    const pdf = pdfDouble();
    const thumbnails = acquire(pdf.document);
    thumbnails.setWindow([1, 2]);
    await tick();
    thumbnails.park();
    expect(pdf.tasks[0]!.cancel).toHaveBeenCalledTimes(1);
    await tick();
    expect(pdf.render).toHaveBeenCalledTimes(1);
    releaseRetainedThumbnails();
    expect(parkedThumbnails(pdf.document).size).toBe(0);
    expect(acquire(pdf.document)).not.toBe(thumbnails);
  });
  it("prefetches the first previews for a panel that opens afterwards", async () => {
    const pdf = pdfDouble();
    prefetchThumbnails(pdf.document, [3, 4]);
    await tick();
    expect(pdf.getPage.mock.calls).toEqual([[3]]);
    pdf.tasks[0]!.finish();
    await tick();
    expect([...parkedThumbnails(pdf.document).keys()]).toEqual([3]);

    const notify = vi.fn();
    const panel = acquire(pdf.document, notify);
    expect(panel.get(3)).toBeDefined();
    pdf.tasks[1]!.finish(); // The prefetch's render of page 4 continues for the panel.
    await tick();
    expect(notify).toHaveBeenCalled();
    expect(panel.get(4)).toBeDefined();

    prefetchThumbnails(pdf.document, [9]); // A panel is open: nothing to prepare.
    await tick();
    expect(pdf.render).toHaveBeenCalledTimes(2);
  });
  it("drops kept previews rendered for another pixel density", async () => {
    const dpr = window.devicePixelRatio;
    try {
      Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
      const pdf = pdfDouble({ automatic: true });
      const first = acquire(pdf.document);
      first.setWindow([1]);
      await tick();
      await tick();
      Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
      first.park(); // Parked after the change, but its previews are still 1x.
      expect(parkedThumbnails(pdf.document).size).toBe(0);
      expect(acquire(pdf.document)).not.toBe(first);
      expect(first.size).toBe(0);
    } finally {
      Object.defineProperty(window, "devicePixelRatio", { value: dpr, configurable: true });
    }
  });
  it("asks again before decoding a heavy document's previews in a new panel", async () => {
    const pdf = pdfDouble({ automatic: true });
    const first = acquireThumbnailQueue(pdf.document, vi.fn(), DEFERRED_PREVIEW_FILE_BYTES);
    queues.push(first);
    first.setWindow([1]);
    first.loadDeferred();
    await vi.advanceTimersByTimeAsync(20);
    expect(first.get(1)).toBeDefined();
    first.park();

    prefetchThumbnails(pdf.document, [2], DEFERRED_PREVIEW_FILE_BYTES);
    await vi.advanceTimersByTimeAsync(20);
    expect(pdf.getPage.mock.calls).toEqual([[1]]);
    const reopened = acquireThumbnailQueue(pdf.document, vi.fn(), DEFERRED_PREVIEW_FILE_BYTES);
    expect(reopened).toBe(first);
    expect(reopened.deferred).toBe(true);
  });
});
