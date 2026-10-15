// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../app/themeState";
import { App } from "../app/App";
import type { Measurement, PageState, ViewTransform } from "../types/domain";
import { pageToScreen } from "../utils/coordinates";
import {
  createCalibratedSession,
  createPdfDocument,
  createPdfPage,
  installManualAnimationFrames,
  installViewerDomDoubles,
  konvaCapture,
  konvaPointerEvent,
  lastAnnotationLayer,
  resetKonvaCapture,
  stageHandler,
  type CapturedProps,
  type SessionLifecycleDouble,
} from "../features/viewer/viewerTestUtils";

// PdfAnnotationLayer es `memo`: cualquier prop con identidad nueva vuelve a renderizar la capa y
// compara todas sus medidas (miles en un plano real). Este test recorre la aplicación real y fija
// qué props puede cambiar cada interacción. Una prop nueva que cambie en cada render (callback en
// línea, array u objeto recreado) rompe un paso que debía dejar la capa intacta.

const lifecycle = vi.hoisted((): SessionLifecycleDouble => ({
  loading: false,
  session: null,
  pdf: null,
}));

vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }));
vi.mock("react-konva", async () =>
  (await import("../features/viewer/viewerTestUtils")).createReactKonvaMock(),
);
vi.mock("../features/viewer/PdfAnnotationLayer", async () =>
  (await import("../features/viewer/viewerTestUtils")).createAnnotationLayerMock(),
);
vi.mock("../app/usePdfSessionLifecycle", async () =>
  (await import("../features/viewer/viewerTestUtils")).createSessionLifecycleMock(lifecycle),
);

function measuredSession() {
  const session = createCalibratedSession(2);
  session.pages[1]!.measurements = Array.from({ length: 20 }, (_, i): Measurement => ({
    id: `m-${i}`,
    name: `Medición ${i}`,
    type: "line",
    points: [
      { x: 20 + i * 25, y: 40 },
      { x: 20 + i * 25, y: 300 },
    ],
    calibrationId: "scale-1",
    classificationValueIds: [],
    visible: true,
  }));
  return session;
}

type Callback = (...args: never[]) => void;

describe("estabilidad de props de la capa de anotaciones en App", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    resetKonvaCapture();
    lifecycle.loading = false;
    lifecycle.session = null;
    lifecycle.pdf = createPdfDocument({ 1: createPdfPage(), 2: createPdfPage() });
    lifecycle.createSession = measuredSession;
    installViewerDomDoubles();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete lifecycle.createSession;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function openPdf() {
    await act(async () =>
      root.render(
        <ThemeProvider>
          <App />
        </ThemeProvider>,
      ),
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["%PDF"], "plan.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await vi.waitFor(async () => {
      await act(async () => undefined);
      expect(container.querySelector("canvas")).not.toBeNull();
    });
  }

  function button(label: string) {
    const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) =>
        (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === label,
    );
    if (!found) throw new Error(`Button ${label} was not rendered.`);
    return found;
  }

  const layer = () => lastAnnotationLayer();
  const pageNumber = (capture: CapturedProps) => (capture.page as PageState).pageNumber;
  const screen = (x: number, y: number) =>
    pageToScreen({ x, y }, layer().transform as ViewTransform);
  const stage = (name: string, ...args: Parameters<typeof konvaPointerEvent>) =>
    act(async () => stageHandler(name)(konvaPointerEvent(...args)));
  const press = (label: string) => act(async () => button(label).click());
  const callback = <T extends Callback>(name: string) => layer()[name] as T;
  const keydown = (key: string) =>
    act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });

  it("cada interacción cambia solo las props que le corresponden y los callbacks no cambian nunca", async () => {
    const frames = installManualAnimationFrames();
    await openPdf();
    await act(async () => frames.flush());

    const select = (id: string) =>
      act(async () =>
        callback<(id: string, additive?: boolean) => void>("onSelectMeasurement")(id),
      );
    const editActive = (active: boolean) =>
      act(async () =>
        callback<(id: string, active: boolean) => void>("onMeasurementEditActiveChange")(
          "m-3",
          active,
        ),
      );
    const steps: Array<[name: string, run: () => Promise<unknown>, changes: string[]]> = [
      [
        "pasar el puntero",
        async () => {
          await stage("onMouseMove", screen(200, 500));
          await stage("onMouseMove", screen(210, 510));
        },
        [],
      ],
      ["elegir Línea", () => press("Line, shortcut L"), ["activeTool"]],
      ["primer punto del borrador", () => stage("onClick", screen(100, 500)), []],
      [
        "mover el borrador",
        async () => {
          await stage("onMouseMove", screen(150, 520));
          await stage("onMouseMove", screen(200, 540));
        },
        [],
      ],
      [
        "terminar la línea",
        () => stage("onClick", screen(250, 560)),
        ["page", "selectedMeasurementId", "selectedMeasurementIds"],
      ],
      ["volver a Selección", () => keydown("Escape"), ["activeTool"]],
      ["seleccionar", () => select("m-3"), ["selectedMeasurementId", "selectedMeasurementIds"]],
      ["seleccionar la misma", () => select("m-3"), []],
      [
        "registrar cancelaciones de gestos",
        () =>
          act(async () => {
            callback<(id: string, cancel: () => void) => void>(
              "onWholeMeasurementDragCancellationChange",
            )("m-3", () => undefined);
            callback<(id: string, owner: object, cancel: () => void) => void>(
              "onVertexDragCancellationChange",
            )("m-3", {}, () => undefined);
          }),
        [],
      ],
      ["empezar a editar", () => editActive(true), ["activeMeasurementEditId"]],
      ["terminar de editar", () => editActive(false), ["activeMeasurementEditId"]],
      [
        "zoom con la rueda",
        () => stage("onWheel", { x: 500, y: 350 }, { deltaY: -100 }),
        ["cullTransform", "transform"],
      ],
      [
        "desplazar con el botón central",
        async () => {
          await stage("onMouseDown", { x: 400, y: 300 }, { button: 1 });
          await stage("onMouseMove", { x: 380, y: 310 });
          await act(async () => {
            stageHandler("onMouseUp")(konvaPointerEvent({ x: 380, y: 310 }));
            stageHandler("onClick")(konvaPointerEvent({ x: 380, y: 310 }));
          });
        },
        ["cullTransform", "isPanning", "transform"],
      ],
      ["botón de acercar", () => press("Zoom in"), ["cullTransform", "transform"]],
      ["ajustar página", () => press("Fit page"), ["cullTransform", "transform"]],
      [
        "abrir y cerrar un menú",
        async () => {
          await press("View options");
          await press("View options");
        },
        [],
      ],
      ["ocultar desde el panel", () => press("Hide measurement Medición 0"), ["page"]],
      ["deshacer", () => press("Undo"), ["page"]],
      ["cambiar de módulo", () => press("Workspace module: Scales"), []],
      [
        "abrir y cerrar filtros",
        async () => {
          await press("Filters");
          await press("Filters");
        },
        [],
      ],
      // La página saliente solo vuelve a renderizar para soltar su selección; la entrante se monta.
      [
        "página siguiente",
        () => press("Next page"),
        ["selectedMeasurementId", "selectedMeasurementIds"],
      ],
      ["página anterior", () => press("Previous page"), []],
    ];

    const observed: Array<[string, string[]]> = [];
    for (const [name, run] of steps) {
      // Solo se compara con la página presentada al empezar el paso: otra página se monta de nuevo.
      const before = konvaCapture.annotationLayers.at(-1)!;
      const start = konvaCapture.annotationLayers.length;
      await run();
      await act(async () => frames.flush());
      const latest = new Map([[pageNumber(before), before]]);
      const changes = new Set<string>();
      for (const capture of konvaCapture.annotationLayers.slice(start)) {
        const previous = latest.get(pageNumber(capture));
        latest.set(pageNumber(capture), capture);
        if (!previous) continue;
        for (const key of new Set([...Object.keys(previous), ...Object.keys(capture)])) {
          if (!Object.is(previous[key], capture[key])) changes.add(key);
        }
      }
      observed.push([name, [...changes].sort()]);
    }

    expect(observed).toEqual(steps.map(([name, , changes]) => [name, changes]));
    expect(pageNumber(layer())).toBe(1);

    // Ningún render, de ninguna página, recibe otra identidad para un callback o un valor fijo.
    const captures = konvaCapture.annotationLayers;
    const fixed = Object.keys(captures[0]!).filter(
      (key) =>
        typeof captures[0]![key] === "function" ||
        ["visualRoles", "labelDimension", "viewport"].includes(key),
    );
    expect(fixed).toContain("onSelectMeasurement");
    expect(fixed).toContain("visualRoles");
    for (const key of fixed) {
      expect(new Set(captures.map((capture) => capture[key])), key).toHaveProperty("size", 1);
    }
  });
});
