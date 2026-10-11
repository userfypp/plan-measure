// Helpers compartidos por los tests de comportamiento del visor (PdfViewer, PdfAnnotationLayer, App).
// No contiene lógica de producción: dobles de pdfjs/Konva/ResizeObserver y generadores de sesión.

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { vi } from "vitest";
import { createEmptySession } from "../../app/sessionState";
import type { CurrentSession, PageState, Point } from "../../types/domain";

export type CapturedProps = Record<string, unknown>;

export const PAGE_WIDTH = 600;
export const PAGE_HEIGHT = 800;
export const VIEWER_WIDTH = 1000;
export const VIEWER_HEIGHT = 700;

/** Props capturadas de los componentes react-konva y de PdfAnnotationLayer mockeados. */
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

/** Fábrica para `vi.mock("react-konva", ...)`: renderiza hijos y captura las props de cada nodo. */
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
        return <div ref={contentRef} data-testid="konva-content">{children as ReactNode}</div>;
      },
    ),
  };
}

/** Fábrica para `vi.mock("./PdfAnnotationLayer", ...)`. */
export function createAnnotationLayerMock() {
  return {
    PdfAnnotationLayer: (props: CapturedProps) => {
      konvaCapture.annotationLayers.push(props);
      return null;
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

/** Evento Konva con el puntero en `screen`. `onStage` simula un clic sobre el fondo del Stage. */
export function konvaPointerEvent(
  screen: Point,
  {
    button = 0,
    onStage = false,
    deltaY = 0,
    shiftKey = false,
  }: { button?: number; onStage?: boolean; deltaY?: number; shiftKey?: boolean } = {},
) {
  const stage = { getPointerPosition: () => ({ ...screen }), getStage: () => stage, name: () => "" };
  const target = onStage ? stage : { getStage: () => stage, name: () => "" };
  return { target, evt: { button, deltaY, shiftKey, preventDefault: vi.fn() } };
}

export function rect(width: number, height: number): DOMRect {
  return {
    x: 0, y: 0, width, height, top: 0, right: width, bottom: height, left: 0, toJSON: () => ({}),
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
 * Instala los dobles de DOM que necesita el visor en jsdom (matchMedia, ResizeObserver, canvas y
 * tamaño del visor). Debe llamarse en `beforeEach`; `vi.restoreAllMocks()`/`unstubAllGlobals()` lo revierten.
 */
export function installViewerDomDoubles(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("(any-pointer: fine)"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
  // jsdom no implementa <dialog>.show()/showModal()/close(); basta con reflejar el atributo `open`.
  for (const method of ["show", "showModal"] as const) {
    Object.defineProperty(HTMLDialogElement.prototype, method, {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
  }
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
  ControlledResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  );
  const viewerRect = rect(VIEWER_WIDTH, VIEWER_HEIGHT);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    // El visor y el marco del ViewerShell (que mide la capacidad de edición) ocupan todo el viewport.
    return this.getAttribute("aria-label")?.startsWith("PDF viewer, page") ||
      this.hasAttribute("data-authoring-capability")
      ? viewerRect
      : // Resto de elementos (p. ej. el dock): vacíos y pegados al borde inferior, sin obstruir el visor.
        { ...rect(0, 0), y: VIEWER_HEIGHT, top: VIEWER_HEIGHT, bottom: VIEWER_HEIGHT };
  });
}

/**
 * Sustituye requestAnimationFrame por una cola manual: los tests vacían la cola con `flush()`,
 * sin esperas reales.
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

export function createPdfPage(dimensions = { width: PAGE_WIDTH, height: PAGE_HEIGHT }): PDFPageProxy {
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

/** Sesión con `pageCount` páginas; la página 1 queda calibrada a 10 px de página = 1 m (100 mm/px). */
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
