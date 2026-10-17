// @vitest-environment jsdom

import { chooseSelectOption } from "../components/ui/selectTestUtils";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewTransform } from "../types/domain";
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
  type SessionLifecycleDouble,
} from "../features/viewer/viewerTestUtils";
import { ThemeProvider } from "./themeState";
import { App } from "./App";

const lifecycle = vi.hoisted((): SessionLifecycleDouble => ({
  loading: false,
  session: null,
  pdf: null,
}));

vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }));
vi.mock("react-konva", async () => (await import("../features/viewer/viewerTestUtils")).createReactKonvaMock());
vi.mock("../features/viewer/PdfAnnotationLayer", async () =>
  (await import("../features/viewer/viewerTestUtils")).createAnnotationLayerMock());

vi.mock("./usePdfSessionLifecycle", async () =>
  (await import("../features/viewer/viewerTestUtils")).createSessionLifecycleMock(lifecycle));

describe("App open, calibrate and measure flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetKonvaCapture();
    lifecycle.loading = false;
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
    // El diálogo se carga con import() perezoso.
    await vi.waitFor(async () => {
      await act(async () => undefined);
      expect(document.querySelector("dialog")).not.toBeNull();
    });
    const dialog = document.querySelector("dialog")!;
    expect(dialog.textContent).toContain("Enter the real-world distance");
    chooseSelectOption(dialog.querySelector<HTMLButtonElement>('button[aria-label="Calibration unit"]')!, "Metres");
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

  it("hands focus to the plan when a new scale starts, so the keyboard can place it", async () => {
    await openPdf();
    await press("Add scale");
    await menuItem("Uniform");
    await vi.waitFor(() => {
      expect(document.activeElement?.hasAttribute("data-dialog-focus-fallback")).toBe(true);
    });
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

  it("blocks edits and global shortcuts while another PDF is loading", async () => {
    await openPdf();
    await calibrate();
    await press("Line, shortcut L");
    await clickPage(100, 200);
    await clickPage(300, 200);
    const before = session();
    lifecycle.loading = true;
    await act(async () => root.render(<ThemeProvider><App /></ThemeProvider>));
    expect(container.querySelector('[inert][aria-busy="true"]')).not.toBeNull();
    const loadingStatus = [...container.querySelectorAll('[role="status"]')].find(element => element.textContent === "Loading PDF…");
    expect(loadingStatus?.textContent).toBe("Loading PDF…");
    expect(loadingStatus?.closest("[inert]")).toBeNull();
    await act(async () => {
      for (const key of ["z", "c", "v", "Delete", "Enter", "Escape"]) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: key.length === 1, bubbles: true }));
      }
    });
    expect(session()).toBe(before);
    lifecycle.loading = false;
    await act(async () => root.render(<ThemeProvider><App /></ThemeProvider>));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true })));
    expect(page().measurements).toEqual([]);
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
