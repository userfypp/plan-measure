// @vitest-environment jsdom

import {
  act,
  forwardRef,
  StrictMode,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession, SessionProvider, useSessionState } from "../../app/sessionState";
import { AppProvider, useAppState } from "../../app/state";
import { ThemeProvider } from "../../app/themeState";
import { useWorkspaceState, WorkspaceProvider } from "../../app/workspaceState";
import { loadPdf } from "../../services/pdf";
import type { PageState, Point, Tool, ViewTransform } from "../../types/domain";
import { pageToScreen, screenToPage } from "../../utils/coordinates";
import { PdfViewer } from "./PdfViewer";
import {
  AuthoringCapabilityProvider,
  computeAuthoringCapability,
  type AuthoringCapability,
} from "./AuthoringCapability";
import {
  ViewerNavigationProvider,
  type ViewerNavigationModel,
  type ViewerNavigationRegistration,
} from "./ViewerNavigation";
import {
  useViewerInteractionCommands,
  ViewerInteractionCommandsProvider,
} from "./ViewerInteractionCommands";
import { ViewerBottomExclusionProvider } from "./viewerLayout";

const pdfJs = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: {} as { workerSrc?: string },
}));

type CapturedProps = Record<string, unknown>;
interface MockStageProps {
  children?: ReactNode;
  [key: string]: unknown;
}
const konvaCapture = vi.hoisted(() => ({
  circles: [] as CapturedProps[],
  lines: [] as CapturedProps[],
  rects: [] as CapturedProps[],
  stages: [] as CapturedProps[],
  annotationLayers: [] as CapturedProps[],
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: pdfJs.getDocument,
  GlobalWorkerOptions: pdfJs.workerOptions,
}));

vi.mock("react-konva", () => ({
  Circle: (props: CapturedProps) => {
    konvaCapture.circles.push(props);
    return null;
  },
  Group: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Layer: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Line: (props: CapturedProps) => {
    konvaCapture.lines.push(props);
    return null;
  },
  Rect: (props: CapturedProps) => {
    konvaCapture.rects.push(props);
    return null;
  },
  Stage: forwardRef<unknown, MockStageProps>(({ children, ...props }, ref) => {
    const contentRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({ getContent: () => contentRef.current }));
    konvaCapture.stages.push({ ...props, children });
    const stageChildren = children as ReactNode;
    return (
      <div ref={contentRef} data-testid="konva-content">
        {stageChildren}
      </div>
    );
  }),
}));

vi.mock("./PdfAnnotationLayer", () => ({
  PdfAnnotationLayer: (props: CapturedProps) => {
    konvaCapture.annotationLayers.push(props);
    return null;
  },
}));

const PAGE_WIDTH = 600;
const PAGE_HEIGHT = 800;
const VIEWER_WIDTH = 1000;
const VIEWER_HEIGHT = 700;

const noop = () => undefined;
let sessionProbe: ReturnType<typeof useSessionState> | null = null;
let workspaceProbe: ReturnType<typeof useWorkspaceState> | null = null;
let interactionProbe: ReturnType<typeof useViewerInteractionCommands> | null = null;

function InteractionProbe() {
  const session = useSessionState();
  const workspace = useWorkspaceState();
  const interaction = useViewerInteractionCommands();
  useLayoutEffect(() => {
    sessionProbe = session;
    workspaceProbe = workspace;
    interactionProbe = interaction;
    return () => {
      if (sessionProbe === session) sessionProbe = null;
      if (workspaceProbe === workspace) workspaceProbe = null;
      if (interactionProbe === interaction) interactionProbe = null;
    };
  }, [interaction, session, workspace]);
  return null;
}

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

function createPdfPage(
  renderTaskFactory: () => RenderTask = resolvedRenderTask,
  dimensions = { width: PAGE_WIDTH, height: PAGE_HEIGHT },
): PdfPageDouble {
  const render = vi.fn(() => renderTaskFactory());
  const page = {
    rotate: 0,
    getViewport: ({ scale, rotation = 0 }: { scale: number; rotation?: number }) => ({
      width: dimensions.width * scale,
      height: dimensions.height * scale,
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
  authoringCapability?: AuthoringCapability;
  onChooseTool?: (tool: Tool) => void;
  onCalibrationCandidate?: (points: [Point, Point]) => void;
}

function ViewerHarness({
  document,
  page = createPageState(1),
  registerNavigation = noop,
  bottomExclusion = 0,
  authoringCapability = computeAuthoringCapability({
    viewerSize: { width: VIEWER_WIDTH, height: VIEWER_HEIGHT },
    rightObstruction: 0,
    bottomExclusion: 0,
    finePointer: true,
  }),
  onChooseTool = noop,
  onCalibrationCandidate = noop,
}: ViewerHarnessProps) {
  return (
    <ThemeProvider>
      <AppProvider>
        <ErrorProbe />
        <SessionProvider>
          <WorkspaceProvider>
            <ViewerInteractionCommandsProvider>
              <InteractionProbe />
              <AuthoringCapabilityProvider capability={authoringCapability}>
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
                      onChooseTool={onChooseTool}
                      onCalibrationCandidate={onCalibrationCandidate}
                      onCalibrationCancel={noop}
                      calibrationReferenceEdit={null}
                      measurementEditingBlocked={false}
                      onCalibrationReferencePointsChange={noop}
                      onCalibrationReferenceEditCancel={noop}
                    />
                  </ViewerNavigationProvider>
                </ViewerBottomExclusionProvider>
              </AuthoringCapabilityProvider>
            </ViewerInteractionCommandsProvider>
          </WorkspaceProvider>
        </SessionProvider>
      </AppProvider>
    </ThemeProvider>
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
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }));
    viewerRect = rect(VIEWER_WIDTH, VIEWER_HEIGHT);
    drawImage = vi.fn();
    ControlledResizeObserver.instances = [];
    konvaCapture.circles.length = 0;
    konvaCapture.lines.length = 0;
    konvaCapture.rects.length = 0;
    konvaCapture.stages.length = 0;
    konvaCapture.annotationLayers.length = 0;
    sessionProbe = null;
    workspaceProbe = null;
    interactionProbe = null;
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
    sessionProbe = null;
    workspaceProbe = null;
    interactionProbe = null;
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

  function stageContent(): HTMLDivElement {
    const stageContent = container.querySelector<HTMLDivElement>("[data-testid=konva-content]");
    if (!stageContent) throw new Error("Konva content was not mounted.");
    return stageContent;
  }

  function stageCursor(): string {
    return stageContent().style.cursor;
  }

  async function mountViewer(
    document: PDFDocumentProxy,
    options: {
      page?: PageState;
      registerNavigation?: ViewerNavigationRegistration;
      strict?: boolean;
      bottomExclusion?: number;
      authoringCapability?: AuthoringCapability;
      onChooseTool?: (tool: Tool) => void;
      onCalibrationCandidate?: (points: [Point, Point]) => void;
    } = {},
  ) {
    const content = (
      <ViewerHarness
        document={document}
        page={options.page}
        registerNavigation={options.registerNavigation}
        bottomExclusion={options.bottomExclusion}
        authoringCapability={options.authoringCapability}
        onChooseTool={options.onChooseTool}
        onCalibrationCandidate={options.onCalibrationCandidate}
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

  it("preserves a zoom made during an active pan and continues from the current translation", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });
    let navigation: ViewerNavigationModel | null = null;
    const registerNavigation: ViewerNavigationRegistration = (next) => {
      navigation = next;
    };

    await mountViewer(runtime.document, { registerNavigation });
    const initialZoom = (navigation as ViewerNavigationModel | null)?.zoom;
    if (initialZoom === undefined) throw new Error("Viewer navigation was not registered.");
    const initialLeft = Number.parseFloat(canvas().style.left);
    const initialTop = Number.parseFloat(canvas().style.top);
    const stage = konvaCapture.stages.at(-1);
    const onMouseDown = stage?.onMouseDown as ((event: unknown) => void) | undefined;
    const onMouseMove = stage?.onMouseMove as ((event: unknown) => void) | undefined;
    if (!onMouseDown || !onMouseMove) throw new Error("Stage pan handlers were not captured.");
    const panEvent = (x: number, y: number, button = 1) => ({
      target: {
        getStage: () => ({ getPointerPosition: () => ({ x, y }) }),
      },
      evt: { button, preventDefault: vi.fn() },
    });

    await act(async () => {
      onMouseDown(panEvent(100, 100));
      onMouseMove(panEvent(130, 120));
    });
    expect(Number.parseFloat(canvas().style.left)).toBeCloseTo(initialLeft + 30);
    expect(Number.parseFloat(canvas().style.top)).toBeCloseTo(initialTop + 20);

    await act(async () => navigation?.onZoomIn());
    expect((navigation as ViewerNavigationModel | null)?.zoom).toBeCloseTo(initialZoom * 1.25);
    const zoomedLeft = Number.parseFloat(canvas().style.left);
    const zoomedTop = Number.parseFloat(canvas().style.top);
    const currentStage = konvaCapture.stages.at(-1);
    const continuePan = currentStage?.onMouseMove as ((event: unknown) => void) | undefined;
    const finishPan = currentStage?.onMouseUp as (() => void) | undefined;
    if (!continuePan || !finishPan) throw new Error("Updated Stage pan handlers were not captured.");

    await act(async () => continuePan(panEvent(140, 135)));
    expect(Number.parseFloat(canvas().style.left)).toBeCloseTo(zoomedLeft + 10);
    expect(Number.parseFloat(canvas().style.top)).toBeCloseTo(zoomedTop + 15);

    await act(async () => finishPan());
    expect((navigation as ViewerNavigationModel | null)?.zoom).toBeCloseTo(initialZoom * 1.25);
    expect(Number.parseFloat(canvas().style.left)).toBeCloseTo(zoomedLeft + 10);
    expect(Number.parseFloat(canvas().style.top)).toBeCloseTo(zoomedTop + 15);
  });

  it("pans on the first Space-drag after an outside control held focus", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });

    await mountViewer(runtime.document);
    const viewer = container.querySelector<HTMLElement>('[role="region"]');
    if (!viewer) throw new Error("Viewer focus surface was not mounted.");

    const outsideControl = document.createElement("button");
    document.body.append(outsideControl);
    outsideControl.focus();
    await act(async () => {
      outsideControl.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
      );
    });
    expect(konvaCapture.annotationLayers.at(-1)?.spacePan).toBe(true);

    const stage = konvaCapture.stages.at(-1);
    const onMouseDown = stage?.onMouseDown as ((event: unknown) => void) | undefined;
    const onMouseMove = stage?.onMouseMove as ((event: unknown) => void) | undefined;
    const onMouseUp = stage?.onMouseUp as (() => void) | undefined;
    if (!onMouseDown || !onMouseMove || !onMouseUp) {
      throw new Error("Stage pan handlers were not captured.");
    }
    const panEvent = (x: number, y: number) => ({
      target: { getStage: () => ({ getPointerPosition: () => ({ x, y }) }) },
      evt: { button: 0, preventDefault: vi.fn() },
    });
    const initialLeft = Number.parseFloat(canvas().style.left);
    await act(async () => {
      viewer.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      onMouseDown(panEvent(100, 100));
      onMouseMove(panEvent(130, 120));
    });

    expect(document.activeElement).toBe(viewer);
    expect(Number.parseFloat(canvas().style.left)).toBeCloseTo(initialLeft + 30);

    await act(async () => onMouseUp());
    const updatedStage = konvaCapture.stages.at(-1);
    const secondMouseDown = updatedStage?.onMouseDown as ((event: unknown) => void) | undefined;
    const secondMouseMove = updatedStage?.onMouseMove as ((event: unknown) => void) | undefined;
    const secondMouseUp = updatedStage?.onMouseUp as (() => void) | undefined;
    if (!secondMouseDown || !secondMouseMove || !secondMouseUp) {
      throw new Error("Updated Stage pan handlers were not captured.");
    }
    await act(async () => {
      secondMouseDown(panEvent(130, 120));
      secondMouseMove(panEvent(160, 140));
    });
    expect(Number.parseFloat(canvas().style.left)).toBeCloseTo(initialLeft + 60);

    await act(async () => {
      secondMouseUp();
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
    });
    outsideControl.remove();
  });

  it("updates the Stage cursor for stationary-pointer viewer state changes", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });
    let navigation: ViewerNavigationModel | null = null;
    const registerNavigation: ViewerNavigationRegistration = (next) => {
      navigation = next;
    };

    await mountViewer(runtime.document, { registerNavigation });
    const initialStageContent = stageContent();
    expect(stageCursor()).toBe("default");

    // No mousemove: changing tools while the pointer is already over the Stage
    // must update the cursor property on that existing interaction surface.
    await act(async () => workspaceProbe!.chooseTool("line"));
    expect(stageContent()).toBe(initialStageContent);
    expect(stageCursor()).toBe("crosshair");

    // Snap changes viewer state without changing the selected tool or moving the pointer.
    await act(async () => workspaceProbe!.toggleSnap());
    expect(stageContent()).toBe(initialStageContent);
    expect(stageCursor()).toBe("crosshair");

    // Space-pan is another stationary-pointer transition with a distinct cursor.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    });
    expect(stageContent()).toBe(initialStageContent);
    expect(stageCursor()).toBe("grab");

    // Normal pointer movement remains wired after the state transitions.
    const onMouseMove = konvaCapture.stages.at(-1)?.onMouseMove as
      | ((event: unknown) => void)
      | undefined;
    if (!onMouseMove) throw new Error("Stage mouse-move handler was not captured.");
    await act(async () =>
      onMouseMove({
        target: { getStage: () => ({ getPointerPosition: () => ({ x: 100, y: 100 }) }) },
        evt: { button: 0 },
      }),
    );
    expect(stageContent()).toBe(initialStageContent);
    expect(stageCursor()).toBe("grab");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keyup", { key: " " })));
    expect(stageContent()).toBe(initialStageContent);
    expect(stageCursor()).toBe("crosshair");

    await act(async () => navigation?.onZoomIn());
    expect(stageContent()).toBe(initialStageContent);
    expect(stageCursor()).toBe("crosshair");
  });

  it("accepts calibration points on an exact screen edge without admitting outside pointers", async () => {
    const dimensions = { width: 595.276, height: 841.89 };
    const pdfPage = createPdfPage(resolvedRenderTask, dimensions);
    const runtime = createPdfDocument({ 1: pdfPage.page });
    const onCalibrationCandidate = vi.fn<(points: [Point, Point]) => void>();
    let navigation: ViewerNavigationModel | null = null;
    const registerNavigation: ViewerNavigationRegistration = (next) => {
      navigation = next;
    };

    await mountViewer(runtime.document, { registerNavigation, onCalibrationCandidate });
    await act(async () => navigation?.onZoomIn());
    const layer = konvaCapture.annotationLayers.at(-1);
    const transform = layer?.transform as ViewTransform;
    const edgePointer = pageToScreen({ x: dimensions.width, y: 100 }, transform);
    expect(screenToPage(edgePointer, transform).x).toBeGreaterThan(dimensions.width);

    await act(async () => workspaceProbe!.chooseTool("calibrate"));
    const clickAt = async (point: Point) => {
      const onClick = konvaCapture.stages.at(-1)?.onClick as
        | ((event: unknown) => void)
        | undefined;
      if (!onClick) throw new Error("Stage click handler was not captured.");
      await act(async () =>
        onClick({
          target: { getStage: () => ({ getPointerPosition: () => point }) },
          evt: { button: 0 },
        }),
      );
    };

    await clickAt(edgePointer);
    expect(workspaceProbe?.draft).toMatchObject({
      type: "calibrate",
      points: [{ x: dimensions.width, y: 100 }],
    });

    const interiorPoint = { x: 100, y: 100 };
    await clickAt(pageToScreen(interiorPoint, transform));
    const candidate = onCalibrationCandidate.mock.calls[0]?.[0];
    expect(candidate?.[0]).toEqual({ x: dimensions.width, y: 100 });
    expect(candidate?.[1]?.x).toBeCloseTo(interiorPoint.x);
    expect(candidate?.[1]?.y).toBeCloseTo(interiorPoint.y);

    await act(async () => workspaceProbe!.chooseTool("calibrate"));
    await clickAt({ x: edgePointer.x + 1, y: edgePointer.y });
    expect(workspaceProbe?.draft).toBeNull();
    expect(onCalibrationCandidate).toHaveBeenCalledTimes(1);
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

  it("finishes a valid path through the canonical viewer command exactly once and ignores incomplete drafts", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });
    const session = createEmptySession({ name: "plan.pdf", size: 10, lastModified: 1 }, 1);
    session.pages[1] = {
      ...session.pages[1]!,
      calibrations: [
        {
          id: "scale-1",
          name: "Scale 1",
          mode: "uniform",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          referenceDistanceMm: 1000,
        },
      ],
      activeCalibrationId: "scale-1",
      nextCalibrationNumber: 2,
    };

    await mountViewer(runtime.document, { page: session.pages[1] });
    await act(async () => sessionProbe!.loadSession(session));
    await act(async () => {
      workspaceProbe!.chooseTool("polyline");
      workspaceProbe!.startDraft({
        type: "path",
        measurementType: "polyline",
        points: [
          { x: 1, y: 1 },
          { x: 10, y: 1 },
        ],
      });
    });

    await act(async () => interactionProbe!.completeCurrentDraft());
    expect(sessionProbe?.session?.pages[1]?.measurements).toHaveLength(1);
    expect(workspaceProbe?.draft).toBeNull();
    const polyline = sessionProbe?.session?.pages[1]?.measurements[0];
    expect(polyline?.name).toBe("Polyline 1");
    expect(workspaceProbe?.selectedMeasurementId).toBe(polyline?.id);
    await act(async () => interactionProbe!.completeCurrentDraft());
    expect(sessionProbe?.session?.pages[1]?.measurements).toHaveLength(1);

    await act(async () => {
      workspaceProbe!.chooseTool("polygon");
      workspaceProbe!.startDraft({
        type: "path",
        measurementType: "polygon",
        points: [
          { x: 1, y: 1 },
          { x: 10, y: 1 },
        ],
      });
    });
    await act(async () => interactionProbe!.completeCurrentDraft());
    expect(sessionProbe?.session?.pages[1]?.measurements).toHaveLength(1);
    expect(workspaceProbe?.draft).not.toBeNull();

    await act(async () =>
      workspaceProbe!.updateDraft({
        type: "path",
        measurementType: "polygon",
        points: [
          { x: 1, y: 1 },
          { x: 10, y: 1 },
          { x: 10, y: 10 },
        ],
      }),
    );
    await act(async () => interactionProbe!.completeCurrentDraft());
    expect(sessionProbe?.session?.pages[1]?.measurements).toHaveLength(2);
    const polygon = sessionProbe?.session?.pages[1]?.measurements[1];
    expect(polygon?.name).toBe("Polygon 1");
    expect(workspaceProbe?.selectedMeasurementId).toBe(polygon?.id);
  });

  it("selects a newly completed Line while keeping the Line tool armed", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });
    const session = createEmptySession({ name: "plan.pdf", size: 10, lastModified: 1 }, 1);
    session.pages[1] = {
      ...session.pages[1]!,
      calibrations: [
        {
          id: "scale-1",
          name: "Scale 1",
          mode: "uniform",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          referenceDistanceMm: 1000,
        },
      ],
      activeCalibrationId: "scale-1",
      nextCalibrationNumber: 2,
    };

    await mountViewer(runtime.document, { page: session.pages[1] });
    await act(async () => sessionProbe!.loadSession(session));
    await act(async () => workspaceProbe!.chooseTool("line"));

    const clickPagePoint = async (point: Point) => {
      const onClick = konvaCapture.stages.at(-1)?.onClick as ((event: unknown) => void) | undefined;
      const transform = konvaCapture.annotationLayers.at(-1)?.transform as ViewTransform;
      if (!onClick || !transform) throw new Error("Drawing stage was not ready.");
      await act(async () =>
        onClick({
          target: {
            getStage: () => ({ getPointerPosition: () => pageToScreen(point, transform) }),
          },
          evt: { button: 0 },
        }),
      );
    };

    await clickPagePoint({ x: 20, y: 20 });
    await clickPagePoint({ x: 80, y: 20 });

    const line = sessionProbe?.session?.pages[1]?.measurements[0];
    expect(line?.name).toBe("Line 1");
    expect(workspaceProbe?.selectedMeasurementId).toBe(line?.id);
    expect(workspaceProbe?.activeTool).toBe("line");
    expect(workspaceProbe?.draft).toBeNull();
  });

  it("cancels an in-progress Line when Escape reaches the window after canvas drawing", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });

    await mountViewer(runtime.document);
    await act(async () => workspaceProbe!.chooseTool("line"));

    const onClick = konvaCapture.stages.at(-1)?.onClick as ((event: unknown) => void) | undefined;
    if (!onClick) throw new Error("Stage click handler was not captured.");
    const transform = konvaCapture.annotationLayers.at(-1)?.transform as ViewTransform;
    await act(async () =>
      onClick({
        target: {
          getStage: () => ({
            getPointerPosition: () => pageToScreen({ x: 100, y: 100 }, transform),
          }),
        },
        evt: { button: 0 },
      }),
    );
    expect(workspaceProbe?.draft).toMatchObject({
      type: "path",
      measurementType: "line",
    });
    expect(workspaceProbe?.draft?.type === "path" && workspaceProbe.draft.points).toHaveLength(1);

    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );

    expect(workspaceProbe?.activeTool).toBe("line");
    expect(workspaceProbe?.draft).toBeNull();
  });

  it("preserves an existing draft across capability loss, blocks new precision shortcuts, and still allows safe Finish", async () => {
    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });
    const session = createEmptySession({ name: "plan.pdf", size: 10, lastModified: 1 }, 1);
    session.pages[1] = {
      ...session.pages[1]!,
      calibrations: [
        {
          id: "scale-1",
          name: "Scale 1",
          mode: "uniform",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          referenceDistanceMm: 1000,
        },
      ],
      activeCalibrationId: "scale-1",
      nextCalibrationNumber: 2,
    };
    const onChooseTool = vi.fn();
    const available = computeAuthoringCapability({
      viewerSize: { width: 800, height: 600 },
      rightObstruction: 0,
      bottomExclusion: 0,
      finePointer: true,
    });
    const gated = computeAuthoringCapability({
      viewerSize: { width: 768, height: 600 },
      rightObstruction: 304,
      bottomExclusion: 0,
      finePointer: true,
    });

    await mountViewer(runtime.document, {
      page: session.pages[1],
      authoringCapability: available,
      onChooseTool,
    });
    await act(async () => sessionProbe!.loadSession(session));
    await act(async () => {
      workspaceProbe!.chooseTool("polyline");
      workspaceProbe!.startDraft({
        type: "path",
        measurementType: "polyline",
        points: [
          { x: 1, y: 1 },
          { x: 10, y: 1 },
        ],
      });
    });

    await act(async () => {
      root.render(
        <ViewerHarness
          document={runtime.document}
          page={session.pages[1]}
          authoringCapability={gated}
          onChooseTool={onChooseTool}
        />,
      );
    });
    expect(workspaceProbe?.activeTool).toBe("polyline");
    expect(workspaceProbe?.draft).toMatchObject({
      measurementType: "polyline",
      points: [
        { x: 1, y: 1 },
        { x: 10, y: 1 },
      ],
    });

    const viewer = container.querySelector<HTMLElement>('[aria-label^="PDF viewer, page"]')!;
    await act(async () =>
      viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true })),
    );
    expect(onChooseTool).not.toHaveBeenCalled();
    await act(async () =>
      viewer.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true })),
    );
    expect(onChooseTool).toHaveBeenCalledWith("hand");

    await act(async () => interactionProbe!.completeCurrentDraft());
    expect(sessionProbe?.session?.pages[1]?.measurements).toHaveLength(1);
    expect(workspaceProbe?.draft).toBeNull();
  });

  it("renders V2 draft/Snap semantics and uses coarse hit targets on a hybrid pointer", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(any-pointer: coarse)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const pdfPage = createPdfPage();
    const runtime = createPdfDocument({ 1: pdfPage.page });
    const session = createEmptySession({ name: "plan.pdf", size: 10, lastModified: 1 }, 1);
    session.settings.showMeasurements = true;
    session.pages[1] = {
      ...session.pages[1]!,
      calibrations: [
        {
          id: "scale-1",
          name: "Scale 1",
          mode: "uniform",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
          referenceDistanceMm: 1000,
        },
      ],
      activeCalibrationId: "scale-1",
      measurements: [
        {
          id: "snap-line",
          name: "Snap line",
          type: "line",
          calibrationId: "scale-1",
          classificationValueIds: [],
          visible: true,
          points: [
            { x: 100, y: 100 },
            { x: 140, y: 100 },
          ],
        },
      ],
    };
    const hybridCapability = computeAuthoringCapability({
      viewerSize: { width: VIEWER_WIDTH, height: VIEWER_HEIGHT },
      rightObstruction: 0,
      bottomExclusion: 0,
      finePointer: true,
    });

    await mountViewer(runtime.document, {
      page: session.pages[1],
      authoringCapability: hybridCapability,
    });
    await act(async () => sessionProbe!.loadSession(session));
    await act(async () => {
      workspaceProbe!.chooseTool("polygon");
      workspaceProbe!.setSnap(true);
      workspaceProbe!.startDraft({
        type: "path",
        measurementType: "polygon",
        points: [
          { x: 200, y: 200 },
          { x: 250, y: 200 },
          { x: 250, y: 250 },
        ],
      });
    });

    const stage = konvaCapture.stages.at(-1);
    const onMouseMove = stage?.onMouseMove as ((event: unknown) => void) | undefined;
    if (!onMouseMove) throw new Error("Stage mouse-move handler was not captured.");
    konvaCapture.circles.length = 0;
    konvaCapture.lines.length = 0;
    konvaCapture.rects.length = 0;
    konvaCapture.annotationLayers.length = 0;

    await act(async () => {
      onMouseMove({
        target: {
          getStage: () => ({
            getPointerPosition: () => ({ x: 337, y: 105.5 }),
          }),
        },
      });
    });

    expect(hybridCapability.available).toBe(true);
    expect(konvaCapture.annotationLayers.at(-1)?.interactionTargetScreenPx).toBe(44);

    const pageHit = konvaCapture.rects.find((props) => props.name === "page-background");
    expect(pageHit?.fill).toBe("rgba(255,255,255,0.001)");

    const draftFill = konvaCapture.lines.find(
      (props) => props.closed === true && props.strokeEnabled === false,
    );
    expect(draftFill).toMatchObject({ fill: "#2465c718", listening: false });

    const confirmed = konvaCapture.lines.find(
      (props) => Array.isArray(props.points) && props.points.length === 6 && props.dash === undefined,
    );
    expect(confirmed).toMatchObject({
      stroke: "#2465c7",
      lineCap: "round",
      lineJoin: "round",
      listening: false,
    });

    const dashedPreview = konvaCapture.lines.filter((props) => Array.isArray(props.dash));
    expect(dashedPreview).toHaveLength(2);
    for (const preview of dashedPreview) {
      expect(preview).toMatchObject({
        stroke: "#2465c7",
        dash: [5 / 0.815, 4 / 0.815],
        listening: false,
      });
    }

    expect(konvaCapture.circles).toHaveLength(3);
    for (const point of konvaCapture.circles) {
      expect(point).toMatchObject({
        radius: 3 / 0.815,
        fill: "#ffffff",
        stroke: "#2465c7",
      });
    }

    const snapMarker = konvaCapture.rects.find(
      (props) => props.rotation === 45 && props.listening === false,
    );
    expect(snapMarker).toMatchObject({
      width: 6 / 0.815,
      height: 6 / 0.815,
      fill: "#ffffff",
      stroke: "#2465c7",
      rotation: 45,
      listening: false,
    });
  });
});
