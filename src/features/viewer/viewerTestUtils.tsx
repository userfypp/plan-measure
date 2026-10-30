// Helpers shared by the viewer behaviour tests (PdfViewer, PdfAnnotationLayer, App).
// No production logic: pdfjs/Konva/ResizeObserver doubles and session builders.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { vi } from "vitest";
import { createEmptySession } from "../../app/sessionState";
import { stubDialogMethods, stubMatchMedia } from "../../test/domTestUtils";
import type { CurrentSession, PageState, Point } from "../../types/domain";

export type CapturedProps = Record<string, unknown>;

export const PAGE_WIDTH = 600;
export const PAGE_HEIGHT = 800;
export const VIEWER_WIDTH = 1000;
export const VIEWER_HEIGHT = 700;

/** Props captured from the mocked react-konva components and PdfAnnotationLayer. */
export const konvaCapture = {
  circles: [] as CapturedProps[],
  lines: [] as CapturedProps[],
  rects: [] as CapturedProps[],
  labels: [] as CapturedProps[],
  texts: [] as CapturedProps[],
  layers: [] as CapturedProps[],
  stages: [] as CapturedProps[],
  annotationLayers: [] as CapturedProps[],
};

export function resetKonvaCapture(): void {
  for (const list of Object.values(konvaCapture)) list.length = 0;
}

/** Factory for `vi.mock("react-konva", ...)`: renders children and captures every node's props. */
export function createReactKonvaMock() {
  return {
    Circle: (props: CapturedProps) => {
      konvaCapture.circles.push(props);
      return null;
    },
    Group: forwardRef<unknown, { children?: ReactNode }>(({ children }, ref) => {
      const nodeRef = useRef({ cache: vi.fn(), clearCache: vi.fn(), position: vi.fn() });
      useImperativeHandle(ref, () => nodeRef.current);
      return <>{children}</>;
    }),
    Layer: forwardRef<unknown, { children?: ReactNode; [key: string]: unknown }>(
      ({ children, ...props }, ref) => {
        const nodeRef = useRef({ draw: vi.fn() });
        useImperativeHandle(ref, () => nodeRef.current);
        useLayoutEffect(() => {
          konvaCapture.layers.push({ ...props, node: nodeRef.current });
        });
        return <>{children}</>;
      },
    ),
    Line: (props: CapturedProps) => {
      konvaCapture.lines.push(props);
      return null;
    },
    Rect: (props: CapturedProps) => {
      konvaCapture.rects.push(props);
      return null;
    },
    Label: ({ children, ...props }: { children?: ReactNode } & CapturedProps) => {
      konvaCapture.labels.push(props);
      return <>{children}</>;
    },
    Tag: () => null,
    Text: (props: CapturedProps) => {
      konvaCapture.texts.push(props);
      return null;
    },
    Stage: forwardRef<unknown, { children?: ReactNode } & Record<string, unknown>>(
      ({ children, ...props }, ref) => {
        const contentRef = useRef<HTMLDivElement>(null);
        useImperativeHandle(ref, () => ({ getContent: () => contentRef.current }));
        konvaCapture.stages.push({ ...props });
        return (
          <div ref={contentRef} data-testid="konva-content">
            {children as ReactNode}
          </div>
        );
      },
    ),
  };
}

/** Factory for `vi.mock("./PdfAnnotationLayer", ...)`. */
export function createAnnotationLayerMock() {
  return {
    PdfAnnotationLayer: (props: CapturedProps) => {
      konvaCapture.annotationLayers.push(props);
      return null;
    },
  };
}

/** State shared between an App test and the `usePdfSessionLifecycle` double. */
export interface SessionLifecycleDouble {
  loading: boolean;
  /** Last session App published to the lifecycle. */
  session: CurrentSession | null;
  /** Document that "open a PDF" publishes. */
  pdf: PDFDocumentProxy | null;
  /** Session that "open a PDF" loads; an empty two-page session by default. */
  createSession?: (file: File) => CurrentSession;
}

/**
 * Replaces only the lifecycle (IndexedDB, PDF parsing, autosave) for `vi.mock`: "open a PDF" loads
 * the session from `lifecycle` and publishes its document double; the rest of App is real.
 */
export function createSessionLifecycleMock(lifecycle: SessionLifecycleDouble) {
  return {
    preloadPdfRuntime: async () => undefined,
    usePdfSessionLifecycle: (options: {
      session: CurrentSession | null;
      loadSession: (session: CurrentSession) => void;
    }) => {
      const [activePdf, setActivePdf] = useState<{ document: PDFDocumentProxy } | null>(null);
      const { session, loadSession } = options;
      useEffect(() => {
        lifecycle.session = session;
      }, [session]);
      return {
        saveStatusStore: undefined,
        activePdf: session ? activePdf : null,
        recovery: null,
        savedProjects: [],
        recoveryChecked: true,
        recoveryIssue: null,
        confirmDiscardRecovery: false,
        loading: lifecycle.loading,
        autosaveWarning: null,
        autosaveFailed: false,
        canRetryAutosave: false,
        projectOperationPending: false,
        retryAutosave: () => undefined,
        exportProject: () => undefined,
        autosaveUnavailable: false,
        chooseFile: async (file: File) => {
          loadSession(
            lifecycle.createSession?.(file) ??
              createEmptySession({ name: file.name, size: file.size, lastModified: 1 }, 2),
          );
          setActivePdf({ document: lifecycle.pdf! });
        },
        openProject: () => undefined,
        refreshSavedProjects: async () => [],
        continueRecovery: () => undefined,
        discardRecovery: () => undefined,
        discardProject: async () => undefined,
        closeProject: async () => undefined,
        continueWithoutRecovery: () => undefined,
        showDiscardRecoveryConfirmation: () => undefined,
        hideDiscardRecoveryConfirmation: () => undefined,
        dismissAutosaveWarning: () => undefined,
        confirmPdfReplacement: () => undefined,
        cancelPdfReplacement: () => undefined,
      };
    },
  };
}

export function lastStage(): CapturedProps {
  const stage = konvaCapture.stages.at(-1);
  if (!stage) throw new Error("Stage was not rendered.");
  return stage;
}

export function lastAnnotationLayer(): CapturedProps {
  const layer = konvaCapture.annotationLayers.at(-1);
  if (!layer) throw new Error("Annotation layer was not rendered.");
  return layer;
}

export type StageHandler = (event: unknown) => void;

export function stageHandler(name: string): StageHandler {
  const handler = lastStage()[name] as StageHandler | undefined;
  if (!handler) throw new Error(`Stage handler ${name} was not captured.`);
  return handler;
}

/** Konva event with the pointer at `screen`. `onStage` simulates a click on the Stage background. */
export function konvaPointerEvent(
  screen: Point,
  {
    button = 0,
    onStage = false,
    deltaY = 0,
    shiftKey = false,
  }: { button?: number; onStage?: boolean; deltaY?: number; shiftKey?: boolean } = {},
) {
  const stage = {
    getPointerPosition: () => ({ ...screen }),
    getStage: () => stage,
    name: () => "",
  };
  const target = onStage ? stage : { getStage: () => stage, name: () => "" };
  return { target, evt: { button, deltaY, shiftKey, preventDefault: vi.fn() } };
}

export function rect(width: number, height: number): DOMRect {
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

export class ControlledResizeObserver implements ResizeObserver {
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
}

/**
 * Installs the DOM doubles the viewer needs in jsdom (matchMedia, `<dialog>`, ResizeObserver, canvas
 * and viewer size). Call it in `beforeEach`; `vi.restoreAllMocks()`/`unstubAllGlobals()` undo it,
 * except the `<dialog>` methods, which stay for the rest of the file.
 */
export function installViewerDomDoubles(): void {
  stubMatchMedia((query) => query.includes("(any-pointer: fine)"));
  stubDialogMethods();
  ControlledResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  );
  const viewerRect = rect(VIEWER_WIDTH, VIEWER_HEIGHT);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    // The viewer and the ViewerShell frame (which measures the authoring capability) fill the viewport.
    return this.getAttribute("aria-label")?.startsWith("PDF viewer, page") ||
      this.hasAttribute("data-authoring-capability")
      ? viewerRect
      : // Other elements (the dock, say): empty and pinned to the bottom edge, clear of the viewer.
        { ...rect(0, 0), y: VIEWER_HEIGHT, top: VIEWER_HEIGHT, bottom: VIEWER_HEIGHT };
  });
}

/**
 * Replaces requestAnimationFrame with a manual queue: tests drain it with `flush()`, without real
 * waits.
 */
export function installManualAnimationFrames() {
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextId++;
    queue.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    queue.delete(id);
  });
  return {
    flush() {
      const pending = [...queue.entries()];
      queue.clear();
      for (const [, callback] of pending) callback(performance.now());
    },
  };
}

export function createPdfPage(
  dimensions = { width: PAGE_WIDTH, height: PAGE_HEIGHT },
): PDFPageProxy {
  return {
    rotate: 0,
    getViewport: ({ scale, rotation = 0 }: { scale: number; rotation?: number }) => ({
      width: dimensions.width * scale,
      height: dimensions.height * scale,
      rotation,
    }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }) as unknown as RenderTask),
    cleanup: vi.fn(() => true),
  } as unknown as PDFPageProxy;
}

export function createPdfDocument(
  pages: Record<number, PDFPageProxy> = { 1: createPdfPage() },
): PDFDocumentProxy {
  const numPages = Math.max(...Object.keys(pages).map(Number));
  return {
    numPages,
    getPage: vi.fn(async (pageNumber: number) => {
      const page = pages[pageNumber];
      if (!page) throw new Error(`Missing test page ${pageNumber}.`);
      return page;
    }),
    getPageLabels: vi.fn(async () => null),
  } as unknown as PDFDocumentProxy;
}

/** Session with `pageCount` pages; page 1 is calibrated at 10 page px = 1 m (100 mm/px). */
export function createCalibratedSession(pageCount = 1, { calibrated = true } = {}): CurrentSession {
  const session = createEmptySession({ name: "plan.pdf", size: 10, lastModified: 1 }, pageCount);
  if (!calibrated) return session;
  const page = session.pages[1] as PageState;
  session.pages[1] = {
    ...page,
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
  return session;
}
