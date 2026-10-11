// @vitest-environment jsdom

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CurrentSession, ViewTransform } from "../types/domain";
import { getMeasurementCalibration } from "../utils/calibration";
import { pageToScreen } from "../utils/coordinates";
import { lineLengthMm } from "../utils/geometry";
import {
  createPdfDocument,
  createPdfPage,
  installViewerDomDoubles,
  konvaPointerEvent,
  lastAnnotationLayer,
  resetKonvaCapture,
  stageHandler,
} from "../features/viewer/viewerTestUtils";
import { createEmptySession } from "./sessionState";
import { ThemeProvider } from "./themeState";
import { App } from "./App";

const lifecycle = vi.hoisted(() => ({
  session: null as CurrentSession | null,
  pdf: null as PDFDocumentProxy | null,
}));

vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }));
vi.mock("react-konva", async () => (await import("../features/viewer/viewerTestUtils")).createReactKonvaMock());
vi.mock("../features/viewer/PdfAnnotationLayer", async () =>
  (await import("../features/viewer/viewerTestUtils")).createAnnotationLayerMock());

// Sustituye solo el ciclo de vida (IndexedDB, parseo de PDF, autoguardado): "abrir un PDF" carga una sesión
// vacía de dos páginas y publica el documento doble; el resto de la aplicación es real.
vi.mock("./usePdfSessionLifecycle", () => ({
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
      loading: false,
      autosaveWarning: null,
      autosaveFailed: false,
      canRetryAutosave: false,
      projectOperationPending: false,
      retryAutosave: () => undefined,
      exportProject: () => undefined,
      autosaveUnavailable: false,
      chooseFile: async (file: File) => {
        loadSession(createEmptySession({ name: file.name, size: file.size, lastModified: 1 }, 2));
        setActivePdf({ document: lifecycle.pdf! });
      },
      openProject: () => undefined,
      refreshSavedProjects: async () => [],
      continueRecovery: () => undefined,
      discardRecovery: () => undefined,
      discardProject: async () => undefined,
      continueWithoutRecovery: () => undefined,
      showDiscardRecoveryConfirmation: () => undefined,
      hideDiscardRecoveryConfirmation: () => undefined,
      dismissAutosaveWarning: () => undefined,
      confirmPdfReplacement: () => undefined,
      cancelPdfReplacement: () => undefined,
    };
  },
}));

describe("App open, calibrate and measure flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetKonvaCapture();
    lifecycle.session = null;
    lifecycle.pdf = createPdfDocument({ 1: createPdfPage(), 2: createPdfPage() });
    installViewerDomDoubles();
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

  async function openPdf() {
    await act(async () => root.render(<ThemeProvider><App /></ThemeProvider>));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["%PDF"], "plan.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    // El visor y sus paneles se cargan con import() perezoso: se sondea dentro de act.
    await vi.waitFor(async () => {
      await act(async () => undefined);
      expect(container.querySelector("canvas")).not.toBeNull();
    });
  }

  const session = () => lifecycle.session!;
  const page = (pageNumber = 1) => session().pages[pageNumber]!;
  const transform = () => lastAnnotationLayer().transform as ViewTransform;

  function button(label: string): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === label,
    );
    if (!found) throw new Error(`Button ${label} was not rendered.`);
    return found;
  }

  async function press(label: string) {
    await act(async () => button(label).click());
  }

  async function menuItem(text: string) {
    const item = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((candidate) =>
      candidate.textContent?.startsWith(text));
    if (!item) throw new Error(`Menu item ${text} was not rendered.`);
    await act(async () => item.click());
  }

  async function clickPage(x: number, y: number) {
    await act(async () => stageHandler("onClick")(konvaPointerEvent(pageToScreen({ x, y }, transform()))));
  }

  async function setField(element: HTMLInputElement | HTMLSelectElement, value: string) {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });
  }

  /** Calibra la página 1 con una referencia horizontal de 200 unidades de página = 10 m (50 mm por unidad). */
  async function calibrate({ cancel = false } = {}) {
    await press("Add scale");
    await menuItem("Uniform");
    await clickPage(100, 100);
    await clickPage(300, 100);
    const dialog = document.querySelector("dialog")!;
    expect(dialog.textContent).toContain("Enter the real-world distance");
    await setField(dialog.querySelector<HTMLSelectElement>('select[aria-label="Calibration unit"]')!, "m");
    // Cambiar la unidad reinicia la distancia, así que se escribe después.
    await setField(dialog.querySelector<HTMLInputElement>("#calibration-distance")!, "10");
    if (cancel) {
      await act(async () => [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click());
    } else {
      await act(async () => dialog.querySelector("form")!.requestSubmit());
    }
  }

  it("opens a PDF into a two-page session with the viewer on page 1 and nothing measured", async () => {
    await openPdf();
    expect(session().pdf.name).toBe("plan.pdf");
    expect(session().pageCount).toBe(2);
    expect(container.querySelector('canvas[aria-label="PDF page 1"]')).not.toBeNull();
    expect(page().calibrations).toEqual([]);
    expect(page().measurements).toEqual([]);
  });

  it("creates a scale from two clicked points and a typed distance", async () => {
    await openPdf();
    await calibrate();
    expect(page().calibrations).toHaveLength(1);
    const [scale] = page().calibrations;
    expect(scale).toMatchObject({ mode: "uniform", referenceDistanceMm: 10000 });
    if (scale?.mode !== "uniform") throw new Error("Expected a uniform scale.");
    expect(scale.start.x).toBeCloseTo(100, 6);
    expect(scale.start.y).toBeCloseTo(100, 6);
    expect(scale.end.x).toBeCloseTo(300, 6);
    expect(page().activeCalibrationId).toBe(scale.id);
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("does not create a scale when the calibration dialog is cancelled", async () => {
    await openPdf();
    await calibrate({ cancel: true });
    expect(page().calibrations).toEqual([]);
    expect(page().activeCalibrationId).toBeNull();
  });

  it("measures a Line with the new scale, then undoes and redoes it", async () => {
    await openPdf();
    await calibrate();
    await press("Line, shortcut L");
    await clickPage(100, 200);
    await clickPage(300, 200);
    expect(page().measurements).toHaveLength(1);
    const line = page().measurements[0]!;
    expect(line).toMatchObject({ type: "line", name: "Line 1", calibrationId: page().activeCalibrationId });
    const calibration = getMeasurementCalibration(page(), line)!;
    expect(lineLengthMm(line.points, calibration)).toBeCloseTo(10000, 3);
    await press("Undo");
    expect(page().measurements).toEqual([]);
    expect(page().calibrations).toHaveLength(1);
    await press("Redo");
    expect(page().measurements).toEqual([line]);
  });

  it("cancels a pending Line with Escape without creating a measurement", async () => {
    await openPdf();
    await calibrate();
    await press("Line, shortcut L");
    await clickPage(100, 200);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    await clickPage(300, 200);
    expect(page().measurements).toEqual([]);
  });

  it("navigates to the next page and keeps page 1 measurements on page 1", async () => {
    await openPdf();
    await calibrate();
    await press("Line, shortcut L");
    await clickPage(100, 200);
    await clickPage(300, 200);
    await press("Next page");
    await vi.waitFor(async () => {
      await act(async () => undefined);
      expect(container.querySelector('canvas[aria-label="PDF page 2"]')).not.toBeNull();
    });
    expect(container.querySelector('canvas[aria-label="PDF page 1"]')).toBeNull();
    expect(lastAnnotationLayer().page).toMatchObject({ pageNumber: 2, measurements: [] });
    expect(page(1).measurements).toHaveLength(1);
    expect(page(2).measurements).toEqual([]);
    await press("Previous page");
    await vi.waitFor(async () => {
      await act(async () => undefined);
      expect(lastAnnotationLayer().page).toMatchObject({ pageNumber: 1 });
    });
    expect((lastAnnotationLayer().page as { measurements: unknown[] }).measurements).toHaveLength(1);
  });
  it("deselects the selected measurement when switching from Select to another tool", async () => {
    await openPdf();
    await calibrate();
    await press("Line, shortcut L");
    await clickPage(100, 200);
    await clickPage(300, 200);
    const id = page().measurements[0]!.id;
    await press("Select, shortcut V");
    await act(async () => (lastAnnotationLayer().onSelectMeasurement as (id: string, additive?: boolean) => void)(id, false));
    expect(lastAnnotationLayer().selectedMeasurementId).toBe(id);

    await press("Hand, shortcut H");
    expect(lastAnnotationLayer().selectedMeasurementId).toBeNull();

    // Same through the keyboard shortcut of a drawing tool.
    await press("Select, shortcut V");
    await act(async () => (lastAnnotationLayer().onSelectMeasurement as (id: string, additive?: boolean) => void)(id, false));
    expect(lastAnnotationLayer().selectedMeasurementId).toBe(id);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true, cancelable: true }));
    });
    expect(lastAnnotationLayer().selectedMeasurementId).toBeNull();
  });
});
