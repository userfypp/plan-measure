// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../app/themeState";
import { App } from "../app/App";
import type { useSessionState } from "../app/sessionState";
import { chooseSearchSelectOption } from "../components/ui/searchSelectTestUtils";
import { chooseSelectOption } from "../components/ui/selectTestUtils";
import type { Measurement, PageState, ViewTransform } from "../types/domain";
import { resetAppPreferences, setAppPreference } from "../utils/appPreferences";
import { pageToScreen } from "../utils/coordinates";
import type { ShortcutBindings } from "../utils/shortcuts/bindings";
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

// PdfAnnotationLayer is `memo`: any prop with a new identity re-renders the layer and compares all
// its measurements (thousands on a real plan). This test drives the real app and pins which props
// each interaction may change. A new prop that changes on every render (an inline callback, or a
// recreated array or object) breaks a step that should leave the layer alone.

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
// The real session, read through the hook so a step can change a setting the UI does not offer yet.
const sessionCommands = vi.hoisted(() => ({
  current: null as ReturnType<typeof useSessionState> | null,
}));
vi.mock("../app/sessionState", async (importOriginal) => {
  const original = await importOriginal<typeof import("../app/sessionState")>();
  return {
    ...original,
    useSessionState: () => (sessionCommands.current = original.useSessionState()),
  };
});
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
  session.classificationCatalog = {
    dimensions: [
      {
        id: "dimension-1",
        name: "Element",
        archived: false,
        values: [{ id: "value-1", name: "Wall", archived: false }],
      },
    ],
  };
  return session;
}

type Callback = (...args: never[]) => void;

describe("annotation layer prop stability in App", () => {
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
    resetAppPreferences();
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

  it("each interaction changes only its own props and callbacks never change", async () => {
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
    const rebind = (bindings: ShortcutBindings) =>
      act(async () => setAppPreference("shortcutBindings", bindings));
    const typeNumber = (index: number, value: string) =>
      act(async () => {
        const input = document.querySelectorAll<HTMLInputElement>('dialog input[type="number"]')[
          index
        ]!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          value,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
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
      // The outgoing page re-renders only to drop its selection; the incoming one mounts.
      [
        "página siguiente",
        () => press("Next page"),
        ["selectedMeasurementId", "selectedMeasurementIds"],
      ],
      ["página anterior", () => press("Previous page"), []],
      // Shortcuts are read when a key is pressed and by labels; the layer never receives them.
      ["cambiar un atajo ajeno al lienzo", () => rebind({ "view.zoomIn": ["Z"] }), []],
      ["mover Línea a otra tecla", () => rebind({ "view.zoomIn": ["Z"], "tool.line": ["Q"] }), []],
      ["elegir Línea con su nueva tecla", () => keydown("q"), ["activeTool"]],
      ["volver a Selección con la nueva tecla", () => keydown("Escape"), ["activeTool"]],
      [
        "ir a Clasificaciones",
        async () => {
          await press("Workspace module: Scales");
          const entry = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
            (candidate) => candidate.textContent?.trim() === "Classifications",
          );
          await act(async () => entry!.click());
          // Dimensions start closed: open the one that holds the value.
          await vi.waitFor(async () => {
            await act(async () => undefined);
            const dimension = [
              ...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]'),
            ].find((candidate) => candidate.textContent?.startsWith("Element"));
            if (!dimension) throw new Error("Dimension Element was not rendered.");
            await act(async () => dimension.click());
          });
          button("Actions for value Wall");
        },
        [],
      ],
      [
        "editar la cantidad derivada y el precio de un valor",
        async () => {
          await press("Quantity and price for value Wall");
          chooseSelectOption(
            document.querySelector<HTMLElement>("dialog [data-select-trigger]")!,
            "Area from length",
          );
          await typeNumber(0, "2.7");
          await typeNumber(1, "25");
          // The project has no currency yet: the dialog asks for one and sets it on save.
          chooseSearchSelectOption(
            [...document.querySelectorAll<HTMLElement>("dialog [data-select-trigger]")].find(
              (trigger) => trigger.textContent === "Choose a currency",
            )!,
            "Euro (EUR)",
          );
          await press("Save");
          expect(sessionCommands.current!.session!.settings.currency).toBe("EUR");
        },
        [],
      ],
      [
        "cambiar la moneda en Ajustes",
        async () => {
          await press("Settings");
          await vi.waitFor(() => {
            if (!document.querySelector('[role="tab"]')) throw new Error("Settings not loaded.");
          });
          await act(async () =>
            [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
              .find((tab) => tab.textContent === "View")!
              .click(),
          );
          const label = [...document.querySelectorAll<HTMLElement>("span[id]")].find(
            (candidate) => candidate.textContent === "Currency",
          )!;
          chooseSearchSelectOption(
            document.querySelector<HTMLElement>(`button[aria-labelledby~="${label.id}"]`)!,
            "US Dollar (USD)",
          );
          await press("Done");
        },
        [],
      ],
    ];

    const observed: Array<[string, string[]]> = [];
    for (const [name, run] of steps) {
      // Compare only with the page presented when the step starts: another page mounts afresh.
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
    // The two edits above did reach the session; only the layer never saw them.
    expect(sessionCommands.current!.session!.classificationRates).toEqual([
      {
        valueId: "value-1",
        derivation: { source: "length", factorMm: 2700 },
        price: { amount: 25, basis: "derived", unit: "m²" },
      },
    ]);
    expect(sessionCommands.current!.session!.settings.currency).toBe("USD");

    // No render of any page gets a new identity for a callback or a fixed value.
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
