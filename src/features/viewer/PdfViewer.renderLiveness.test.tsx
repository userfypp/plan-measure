// @vitest-environment jsdom

import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "../../app/sessionState";
import { AppProvider, useAppState } from "../../app/state";
import { WorkspaceProvider } from "../../app/workspaceState";
import { loadPdf } from "../../services/pdf";
import type { PageState } from "../../types/domain";
import { PdfViewer } from "./PdfViewer";
import {
  ViewerNavigationProvider,
  type ViewerNavigationModel,
  type ViewerNavigationRegistration,
} from "./ViewerNavigation";
import { ViewerBottomExclusionProvider } from "./viewerLayout";

const pdfJs = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: {} as { workerSrc?: string },
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: pdfJs.getDocument,
  GlobalWorkerOptions: pdfJs.workerOptions,
}));

vi.mock("react-konva", () => ({
  Circle: () => null,
  Group: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Layer: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Line: () => null,
  Rect: () => null,
  Stage: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("./PdfAnnotationLayer", () => ({
  PdfAnnotationLayer: () => null,
}));

const PAGE_WIDTH = 600;
const PAGE_HEIGHT = 800;
const VIEWER_WIDTH = 1000;
const VIEWER_HEIGHT = 700;

const noop = () => undefined;

function createPageState(pageNumber: number): PageState {
  return {
    pageNumber,
    calibrations: [],
    activeCalibrationId: null,
    nextCalibrationNumber: 1,
    measurements: [],
    nextMeasurementNumber: { line: 1, polyline: 1, polygon: 1 },
  };
}

class ControlledResizeObserver implements ResizeObserver {
  static instances: ControlledResizeObserver[] = [];

  readonly callback: ResizeObserverCallback;
  target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ControlledResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.target = target;
  }

  unobserve(): void {}

  disconnect(): void {}

  emit(width: number, height: number): void {
    if (!this.target) throw new Error("ResizeObserver has no observed target.");
    const contentRect = rect(width, height) as DOMRectReadOnly;
    this.callback(
      [
        {
          target: this.target,
          contentRect,
        } as ResizeObserverEntry,
      ],
      this,
    );
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface RenderTaskController {
  task: RenderTask;
  resolve: () => void;
  reject: (error: unknown) => void;
  cancel: ReturnType<typeof vi.fn>;
}

function renderingCancelledError(): Error {
  const error = new Error("Rendering cancelled");
  error.name = "RenderingCancelledException";
  return error;
}

function controlledRenderTask(cancelRejects = true): RenderTaskController {
  const completion = deferred<void>();
  const cancel = vi.fn(() => {
    if (cancelRejects) completion.reject(renderingCancelledError());
  });
  return {
    task: {
      promise: completion.promise,
      cancel,
    } as unknown as RenderTask,
    resolve: () => completion.resolve(undefined),
    reject: completion.reject,
    cancel,
  };
}

function resolvedRenderTask(): RenderTask {
  return {
    promise: Promise.resolve(),
    cancel: vi.fn(),
  } as unknown as RenderTask;
}

interface PdfPageDouble {
  page: PDFPageProxy;
  render: ReturnType<typeof vi.fn>;
}

function createPdfPage(renderTaskFactory: () => RenderTask = resolvedRenderTask): PdfPageDouble {
  const render = vi.fn(() => renderTaskFactory());
  const page = {
    rotate: 0,
    getViewport: ({ scale, rotation = 0 }: { scale: number; rotation?: number }) => ({
      width: PAGE_WIDTH * scale,
      height: PAGE_HEIGHT * scale,
      rotation,
    }),
    render,
  } as unknown as PDFPageProxy;
  return { page, render };
}

function createPdfDocument(pages: Record<number, PDFPageProxy>): {
  document: PDFDocumentProxy;
  getPage: ReturnType<typeof vi.fn>;
} {
  const pageNumbers = Object.keys(pages).map(Number);
  const getPage = vi.fn(async (pageNumber: number) => {
    const page = pages[pageNumber];
    if (!page) throw new Error(`Missing test page ${pageNumber}.`);
    return page;
  });
  const document = {
    numPages: Math.max(...pageNumbers),
    getPage,
    getPageLabels: vi.fn(async () => null),
  } as unknown as PDFDocumentProxy;
  return { document, getPage };
}

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function ErrorProbe() {
  const { state } = useAppState();
  return <output data-testid="viewer-error">{state.error ?? ""}</output>;
}

interface ViewerHarnessProps {
  document: PDFDocumentProxy;
  page?: PageState;
  registerNavigation?: ViewerNavigationRegistration;
  bottomExclusion?: number;
}

function ViewerHarness({
  document,
  page = createPageState(1),
  registerNavigation = noop,
  bottomExclusion = 0,
}: ViewerHarnessProps) {
  return (
    <AppProvider>
      <ErrorProbe />
      <SessionProvider>
        <WorkspaceProvider>
          <ViewerBottomExclusionProvider bottomExclusion={bottomExclusion}>
            <ViewerNavigationProvider registerNavigation={registerNavigation}>
              <PdfViewer
                document={document}
                page={page}
                onPageChange={noop}
                onPageBoundsChange={noop}
                onViewZoomChange={noop}
                activeMeasurementEditId={null}
                onMeasurementEditActiveChange={noop}
                onChooseTool={noop}
                onCalibrationCandidate={noop}
                onCalibrationCancel={noop}
                calibrationReferenceEdit={null}
                measurementEditingBlocked={false}
                onCalibrationReferencePointsChange={noop}
                onCalibrationReferenceEditCancel={noop}
                onCalibrationReferenceEditSave={noop}
              />
            </ViewerNavigationProvider>
          </ViewerBottomExclusionProvider>
        </WorkspaceProvider>
      </SessionProvider>
    </AppProvider>
  );
}

describe("PdfViewer render liveness", () => {
  let container: HTMLDivElement;
  let root: Root;
  let viewerRect: DOMRect;
  let drawImage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    viewerRect = rect(VIEWER_WIDTH, VIEWER_HEIGHT);
    drawImage = vi.fn();
    ControlledResizeObserver.instances = [];
    pdfJs.getDocument.mockReset();
    vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ({ drawImage }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute("aria-label")?.startsWith("PDF viewer, page")
        ? viewerRect
        : rect(0, 0);
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function canvas(pageNumber = 1): HTMLCanvasElement {
    const element = container.querySelector<HTMLCanvasElement>(
      `canvas[aria-label="PDF page ${pageNumber}"]`,
    );
    if (!element) throw new Error(`PDF page ${pageNumber} canvas was not mounted.`);
    return element;
  }

  function observer(): ControlledResizeObserver {
    const instance = ControlledResizeObserver.instances.at(-1);
    if (!instance) throw new Error("ResizeObserver was not installed.");
    return instance;
  }

  async function mountViewer(
    document: PDFDocumentProxy,
    options: {
      page?: PageState;
      registerNavigation?: ViewerNavigationRegistration;
      strict?: boolean;
      bottomExclusion?: number;
    } = {},
  ) {
    const content = (
      <ViewerHarness
        document={document}
        page={options.page}
        registerNavigation={options.registerNavigation}
        bottomExclusion={options.bottomExclusion}
      />
    );
    await act(async () => {
      root.render(options.strict ? <StrictMode>{content}</StrictMode> : content);
    });
  }

  it("starts rasterization when the mounted viewer is already non-zero before ResizeObserver publishes", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });

    await mountViewer(runtime.document);

    expect(runtime.getPage).toHaveBeenCalledWith(1);
    expect(observer().target?.getBoundingClientRect()).toMatchObject({
      width: VIEWER_WIDTH,
      height: VIEWER_HEIGHT,
    });
    expect(pdfPage.render).toHaveBeenCalledTimes(1);
    expect(Number.parseFloat(canvas().style.width)).toBeLessThan(PAGE_WIDTH);
    expect(canvas().style.visibility).toBe("visible");
    expect(container.textContent).not.toContain("Rendering page…");
  });

  it("waits for a later positive ResizeObserver size when the page resolves before layout exists", async () => {
    viewerRect = rect(0, 0);
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });

    await mountViewer(runtime.document);

    expect(runtime.getPage).toHaveBeenCalledWith(1);
    expect(pdfPage.render).not.toHaveBeenCalled();
    expect(canvas().style.width).toBe(`${PAGE_WIDTH}px`);
    expect(canvas().style.visibility).toBe("hidden");
    expect(container.textContent).toContain("Rendering page…");

    viewerRect = rect(VIEWER_WIDTH, VIEWER_HEIGHT);
    await act(async () => observer().emit(VIEWER_WIDTH, VIEWER_HEIGHT));

    expect(pdfPage.render).toHaveBeenCalledTimes(1);
    expect(canvas().style.visibility).toBe("visible");
    expect(container.textContent).not.toContain("Rendering page…");
  });

  it("does not restart the raster for an unchanged ResizeObserver size", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });

    await mountViewer(runtime.document);
    expect(pdfPage.render).toHaveBeenCalledTimes(1);

    await act(async () => observer().emit(VIEWER_WIDTH, VIEWER_HEIGHT));

    expect(pdfPage.render).toHaveBeenCalledTimes(1);
    expect(canvas().style.visibility).toBe("visible");
  });

  it.each([
    ["Blob", () => new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" })],
    [
      "File",
      () =>
        new File([new Uint8Array([1, 2, 3])], "recovered.pdf", {
          type: "application/pdf",
          lastModified: 1,
        }),
    ],
  ])("renders a recovered %s through the PDF runtime", async (_label, sourceFactory) => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });
    const loadingTask = {
      promise: Promise.resolve(runtime.document),
      destroy: vi.fn(async () => undefined),
      onPassword: null,
    };
    pdfJs.getDocument.mockReturnValue(loadingTask);

    const loaded = await loadPdf(sourceFactory());
    await mountViewer(loaded.document);

    expect(pdfJs.getDocument).toHaveBeenCalledTimes(1);
    expect(pdfJs.getDocument.mock.calls[0]?.[0]?.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(pdfPage.render).toHaveBeenCalledTimes(1);
    expect(canvas().style.visibility).toBe("visible");
  });

  it("loads and renders the recovered current page when it is not page 1", async () => {
    const page1 = createPdfPage();
    const page2 = createPdfPage();
    const runtime = createPdfDocument({ 1: page1.page, 2: page2.page });

    await mountViewer(runtime.document, { page: createPageState(2) });

    expect(runtime.getPage).toHaveBeenCalledTimes(1);
    expect(runtime.getPage).toHaveBeenCalledWith(2);
    expect(page1.render).not.toHaveBeenCalled();
    expect(page2.render).toHaveBeenCalledTimes(1);
    expect(canvas(2).style.visibility).toBe("visible");
  });

  it("cancels a pending raster on resize and lets the successor reveal the page", async () => {
    const first = controlledRenderTask();
    const second = controlledRenderTask();
    const tasks = [first, second];
    const pdfPage = createPdfPage(() => {
      const task = tasks.shift();
      if (!task) throw new Error("Unexpected extra render task.");
      return task.task;
    });
    const runtime = createPdfDocument({ 1: pdfPage.page });

    await mountViewer(runtime.document);
    expect(pdfPage.render).toHaveBeenCalledTimes(1);

    viewerRect = rect(900, 650);
    await act(async () => observer().emit(900, 650));

    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(pdfPage.render).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="viewer-error"]')?.textContent).toBe("");
    expect(canvas().style.visibility).toBe("hidden");

    await act(async () => second.resolve());

    expect(canvas().style.visibility).toBe("visible");
    expect(container.textContent).not.toContain("Rendering page…");
    expect(container.querySelector('[data-testid="viewer-error"]')?.textContent).toBe("");
  });

  it("cancels pending rasters for zoom and Fit and only the latest successor reveals the page", async () => {
    const first = controlledRenderTask();
    const second = controlledRenderTask();
    const third = controlledRenderTask();
    const tasks = [first, second, third];
    const pdfPage = createPdfPage(() => {
      const task = tasks.shift();
      if (!task) throw new Error("Unexpected extra render task.");
      return task.task;
    });
    const runtime = createPdfDocument({ 1: pdfPage.page });
    let navigation: ViewerNavigationModel | null = null;
    const registerNavigation: ViewerNavigationRegistration = (next) => {
      navigation = next;
    };

    await mountViewer(runtime.document, { registerNavigation });
    expect(pdfPage.render).toHaveBeenCalledTimes(1);

    await act(async () => navigation?.onZoomIn());
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(pdfPage.render).toHaveBeenCalledTimes(2);

    await act(async () => navigation?.onFit());
    expect(second.cancel).toHaveBeenCalledTimes(1);
    expect(pdfPage.render).toHaveBeenCalledTimes(3);
    expect(canvas().style.visibility).toBe("hidden");

    await act(async () => third.resolve());

    expect(canvas().style.visibility).toBe("visible");
    expect(container.querySelector('[data-testid="viewer-error"]')?.textContent).toBe("");
  });

  it("keeps Fit and programmatic zoom inert when the Dock exclusion leaves no safe viewport", async () => {
    viewerRect = rect(320, 40);
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });
    let navigation: ViewerNavigationModel | null = null;
    const registerNavigation: ViewerNavigationRegistration = (next) => {
      navigation = next;
    };

    await mountViewer(runtime.document, { registerNavigation, bottomExclusion: 40 });
    expect(pdfPage.render).toHaveBeenCalledTimes(1);
    expect((navigation as ViewerNavigationModel | null)?.zoom).toBe(1);

    await act(async () => navigation?.onFit());
    await act(async () => navigation?.onZoomIn());
    await act(async () => navigation?.onZoomOut());

    expect(pdfPage.render).toHaveBeenCalledTimes(1);
    expect((navigation as ViewerNavigationModel | null)?.zoom).toBe(1);
    expect(canvas().style.left).not.toMatch(/NaN|Infinity/);
    expect(canvas().style.top).not.toMatch(/NaN|Infinity/);
    expect(canvas().style.width).not.toMatch(/NaN|Infinity/);
    expect(canvas().style.height).not.toMatch(/NaN|Infinity/);
  });

  it("ignores a stale completion after replacing the document and page while rendering", async () => {
    const stale = controlledRenderTask(false);
    const current = controlledRenderTask();
    const firstPage = createPdfPage(() => stale.task);
    const secondPage = createPdfPage(() => current.task);
    const firstDocument = createPdfDocument({ 1: firstPage.page });
    const secondDocument = createPdfDocument({ 1: createPdfPage().page, 2: secondPage.page });

    await mountViewer(firstDocument.document);
    expect(firstPage.render).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<ViewerHarness document={secondDocument.document} page={createPageState(2)} />);
    });

    expect(stale.cancel).toHaveBeenCalledTimes(1);
    expect(secondDocument.getPage).toHaveBeenCalledWith(2);
    expect(secondPage.render).toHaveBeenCalledTimes(1);

    await act(async () => stale.resolve());
    expect(drawImage).not.toHaveBeenCalled();
    expect(canvas(2).style.visibility).toBe("hidden");

    await act(async () => current.resolve());

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(canvas(2).style.visibility).toBe("visible");
  });

  it("keeps intentional RenderingCancelledException silent when an invalidation has a successor", async () => {
    const cancelled = controlledRenderTask();
    const successor = controlledRenderTask();
    const tasks = [cancelled, successor];
    const pdfPage = createPdfPage(() => {
      const task = tasks.shift();
      if (!task) throw new Error("Unexpected extra render task.");
      return task.task;
    });
    const runtime = createPdfDocument({ 1: pdfPage.page });

    await mountViewer(runtime.document);
    viewerRect = rect(950, 675);
    await act(async () => observer().emit(950, 675));

    expect(cancelled.cancel).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="viewer-error"]')?.textContent).toBe("");

    await act(async () => successor.resolve());

    expect(canvas().style.visibility).toBe("visible");
    expect(container.querySelector('[data-testid="viewer-error"]')?.textContent).toBe("");
  });

  it("surfaces a genuine current render failure instead of marking the canvas ready", async () => {
    const failed = controlledRenderTask(false);
    const pdfPage = createPdfPage(() => failed.task);
    const runtime = createPdfDocument({ 1: pdfPage.page });
    const consoleError = vi.spyOn(console, "error").mockImplementation(noop);

    await mountViewer(runtime.document);
    await act(async () => failed.reject(new Error("Raster failed")));

    expect(consoleError).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="viewer-error"]')?.textContent).toBe(
      "This PDF page could not be rendered.",
    );
    expect(canvas().style.visibility).toBe("hidden");
    expect(container.textContent).toContain("Rendering page…");
  });

  it("converges to a visible current page under StrictMode effect replay", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });

    await mountViewer(runtime.document, { strict: true });

    expect(runtime.getPage).toHaveBeenCalled();
    expect(pdfPage.render).toHaveBeenCalled();
    expect(canvas().style.visibility).toBe("visible");
    expect(container.textContent).not.toContain("Rendering page…");
  });
});
