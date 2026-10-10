import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { LruRenderCache } from "../viewer/renderCache";
import { mainPdfBusy, mainPdfPage, subscribePdfPriority } from "../viewer/pdfRenderPriority";

export const THUMBNAIL_WIDTH = 144;
export const THUMBNAIL_HEIGHT = 104;
export const THUMBNAIL_MAX_DPR = 1.5;
export const MAX_THUMBNAILS = 32;
export const MAX_THUMBNAIL_PIXELS =
  THUMBNAIL_WIDTH * THUMBNAIL_HEIGHT * THUMBNAIL_MAX_DPR ** 2 * 24;
export const MAX_THUMBNAIL_WINDOW = Math.floor(
  MAX_THUMBNAIL_PIXELS / (THUMBNAIL_WIDTH * THUMBNAIL_HEIGHT * THUMBNAIL_MAX_DPR ** 2),
);

export function thumbnailViewport(page: PDFPageProxy, dpr: number) {
  const logical = page.getViewport({ scale: 1 }); // Includes the PDF's intrinsic rotation.
  const density = Math.min(THUMBNAIL_MAX_DPR, Math.max(1, dpr));
  const scale =
    Math.min(THUMBNAIL_WIDTH / logical.width, THUMBNAIL_HEIGHT / logical.height) * density;
  if (!(scale > 0 && Number.isFinite(scale))) throw new Error("Invalid thumbnail bounds");
  return page.getViewport({ scale });
}
function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}
interface Request {
  number: number;
  cancelled: boolean;
  task?: RenderTask;
}

// Also serialize cancellation across rapid close/reopen and document replacement.
let thumbnailOwner: object | null = null;
const waitingQueues = new Set<() => void>();

export class ThumbnailQueue {
  private readonly cache = new LruRenderCache<HTMLCanvasElement>(
    MAX_THUMBNAILS,
    MAX_THUMBNAIL_PIXELS,
    releaseCanvas,
  );
  private readonly failed = new Set<number>();
  private completedWindow = new Set<number>();
  private wanted: number[] = [];
  private active: Request | null = null;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribe: () => void;
  constructor(
    private readonly document: PDFDocumentProxy,
    private readonly notify: () => void,
  ) {
    this.unsubscribe = subscribePdfPriority(document, this.schedule);
    waitingQueues.add(this.schedule);
  }
  get(number: number) {
    return this.cache.get(String(number));
  }
  get size() {
    return this.cache.size;
  }
  get pixels() {
    return this.cache.pixels;
  }
  setWindow(numbers: number[]) {
    this.wanted = numbers;
    this.completedWindow = new Set(
      [...this.completedWindow].filter((number) => numbers.includes(number)),
    );
    if (this.active && (!numbers.includes(this.active.number) || mainPdfBusy(this.document)))
      this.cancel();
    this.notify();
    this.schedule();
  }
  private cancel() {
    if (!this.active) return;
    this.active.cancelled = true;
    this.active.task?.cancel();
  }
  private schedule = () => {
    if (mainPdfBusy(this.document)) this.cancel();
    if (this.disposed || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump();
    }, 0);
  };
  private async pump() {
    if (this.disposed || this.active || thumbnailOwner || mainPdfBusy(this.document)) return;
    const number = this.wanted.find(
      (number) =>
        !this.failed.has(number) && !this.completedWindow.has(number) && !this.get(number),
    );
    if (number === undefined) return;
    const request: Request = { number, cancelled: false };
    this.active = request;
    thumbnailOwner = request;
    let page: PDFPageProxy | undefined;
    let canvas: HTMLCanvasElement | undefined;
    try {
      page = await this.document.getPage(number);
      if (request.cancelled || this.disposed || mainPdfBusy(this.document)) return;
      const viewport = thumbnailViewport(page, window.devicePixelRatio || 1);
      canvas = window.document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Thumbnail canvas unavailable");
      request.task = page.render({ canvas, canvasContext: context, viewport });
      await request.task.promise;
      if (request.cancelled || this.disposed || !this.wanted.includes(number)) return;
      this.cache.set(String(number), canvas, canvas.width * canvas.height);
      // A caller larger than the cache must finish rather than rerender evicted rows forever.
      this.completedWindow.add(number);
      canvas = undefined; // Cache owns and explicitly releases the backing store.
      this.notify();
    } catch {
      if (!request.cancelled && !this.disposed) {
        this.failed.add(number); // One attempt per page for this panel lifetime.
        this.notify();
      }
    } finally {
      if (canvas) releaseCanvas(canvas);
      // PDF.js shares page proxies; leave the main page's resources to the viewer.
      if (page && number !== mainPdfPage(this.document)) page.cleanup();
      this.active = null;
      if (thumbnailOwner === request) thumbnailOwner = null;
      waitingQueues.forEach((schedule) => schedule());
    }
  }
  dispose() {
    this.disposed = true;
    this.wanted = [];
    this.cancel();
    this.unsubscribe();
    waitingQueues.delete(this.schedule);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.cache.clear();
    this.failed.clear();
    this.completedWindow.clear();
  }
}
