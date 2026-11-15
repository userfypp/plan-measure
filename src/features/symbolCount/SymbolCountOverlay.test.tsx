/* @vitest-environment jsdom */

import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../app/themeState";
import { WorkspaceProvider, useWorkspaceState } from "../../app/workspaceState";
import { stubMatchMedia } from "../../test/domTestUtils";
import type { PageState } from "../../types/domain";
import type { LoadedPageData } from "../viewer/pdfViewerRaster";
import { SymbolCountBar } from "./SymbolCountBar";
import { SYMBOL_COUNT_PAGE_PROBLEM, SymbolCountOverlay } from "./SymbolCountOverlay";
import { stopSymbolCount, symbolCountSession } from "./symbolCountSession";
import { getSymbolCount, startSymbolCount } from "./symbolCountStore";
import type { SymbolSearchCallbacks } from "./symbolSearch";

const mocks = vi.hoisted(() => ({
  renderPageGray: vi.fn(),
  createSymbolSearch: vi.fn(),
  updateMeasurement: vi.fn(),
}));

vi.mock("./pageRaster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pageRaster")>()),
  renderPageGray: mocks.renderPageGray,
}));

vi.mock("./symbolSearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./symbolSearch")>()),
  createSymbolSearch: mocks.createSymbolSearch,
}));

vi.mock("../../app/sessionState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../app/sessionState")>()),
  useSessionState: () => ({ updateMeasurement: mocks.updateMeasurement }),
}));

let root: Root;
let container: HTMLDivElement;
let host: HTMLDivElement;
let callbacks: SymbolSearchCallbacks | null = null;
const workerSearch = vi.fn();
const workerTerminate = vi.fn();
const completePath = vi.fn(() => true);

const pageData: LoadedPageData = {
  document: {} as PDFDocumentProxy,
  pageNumber: 1,
  pdfPage: {} as PDFPageProxy,
  bounds: { width: 200, height: 200, rotation: 0 },
};

const pageState: PageState = {
  pageNumber: 1,
  calibrations: [],
  activeCalibrationId: null,
  measurements: [],
  nextCalibrationNumber: 1,
  nextMeasurementNumber: {
    line: 1,
    polyline: 1,
    polygon: 1,
    rectangle: 1,
    ellipse: 1,
    cloud: 1,
    count: 1,
  },
};

function CountToolBootstrap() {
  const { activeTool, chooseTool } = useWorkspaceState();
  useLayoutEffect(() => {
    if (activeTool !== "count") chooseTool("count");
  }, [activeTool, chooseTool]);
  return null;
}

function mount() {
  act(() => {
    root.render(
      <ThemeProvider>
        <WorkspaceProvider>
          <CountToolBootstrap />
          <SymbolCountBar />
          <div
            ref={(node) => {
              if (node) host = node;
            }}
          >
            <SymbolCountOverlay
              data={pageData}
              page={pageState}
              transform={{ panX: 0, panY: 0, zoom: 1 }}
              viewport={{ width: 200, height: 200 }}
              completePath={completePath}
            />
          </div>
        </WorkspaceProvider>
      </ThemeProvider>,
    );
  });
  act(() => startSymbolCount());
}

function statusText(): string | null {
  return container.querySelector('[role="status"]')?.textContent ?? null;
}

function overlayPhase(): string | null {
  return (
    container
      .querySelector<HTMLElement>("[data-symbol-count-phase]")
      ?.getAttribute("data-symbol-count-phase") ?? null
  );
}

function pointerEvent(type: string, x: number, y: number): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "isPrimary", { value: true });
  return event;
}

async function dragBox(x1: number, y1: number, x2: number, y2: number) {
  await act(async () => {
    host.dispatchEvent(pointerEvent("pointerdown", x1, y1));
    window.dispatchEvent(pointerEvent("pointermove", x2, y2));
    window.dispatchEvent(pointerEvent("pointerup", x2, y2));
    await Promise.resolve();
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  callbacks = null;
  workerSearch.mockReset();
  workerTerminate.mockReset();
  completePath.mockClear();
  mocks.updateMeasurement.mockReset();
  mocks.renderPageGray.mockReset();
  mocks.createSymbolSearch.mockReset();
  mocks.createSymbolSearch.mockImplementation((_image, given: SymbolSearchCallbacks) => {
    callbacks = given;
    return { search: workerSearch, terminate: workerTerminate };
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  stopSymbolCount();
  symbolCountSession.reset();
});

describe("SymbolCountOverlay error recovery", () => {
  it("keeps the error message after a page render failure and accepts a new box to retry", async () => {
    mocks.renderPageGray
      .mockRejectedValueOnce(new Error("render failed"))
      .mockResolvedValueOnce({ data: new Uint8Array(40_000), width: 200, height: 200 });

    mount();
    expect(overlayPhase()).toBe("pick");

    await dragBox(20, 20, 60, 60);
    expect(overlayPhase()).toBe("error");
    expect(statusText()).toBe(SYMBOL_COUNT_PAGE_PROBLEM);
    expect(getSymbolCount().active).toBe(true);

    // A short click without dragging keeps the error message visible.
    await dragBox(25, 25, 26, 26);
    expect(overlayPhase()).toBe("error");
    expect(statusText()).toBe(SYMBOL_COUNT_PAGE_PROBLEM);
    expect(mocks.renderPageGray).toHaveBeenCalledTimes(1);

    // Dragging a new box retries without leaving Find similar mode.
    await dragBox(30, 30, 70, 70);
    expect(mocks.renderPageGray).toHaveBeenCalledTimes(2);
    expect(overlayPhase()).toBe("scanning");
    expect(statusText()).toBe("Searching the page… 0%");

    act(() => {
      callbacks!.onResult({ matches: [{ x: 50, y: 50, width: 20, height: 20, score: 0.95 }] });
    });
    expect(overlayPhase()).toBe("review");
    expect(statusText()).toBe("1 match");

    const add = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.startsWith("Add 1 item"),
    )!;
    act(() => add.click());
    expect(completePath).toHaveBeenCalledWith("count", [{ x: 50, y: 50 }]);
    expect(getSymbolCount().active).toBe(false);
  });

  it("accepts a new box after the worker fails", async () => {
    mocks.renderPageGray.mockResolvedValue({
      data: new Uint8Array(40_000),
      width: 200,
      height: 200,
    });

    mount();
    await dragBox(10, 10, 50, 50);
    act(() => callbacks!.onError("The search could not finish."));
    expect(overlayPhase()).toBe("error");
    expect(statusText()).toBe("The search could not finish.");

    await dragBox(40, 40, 80, 80);
    expect(mocks.renderPageGray).toHaveBeenCalledTimes(2);
    expect(workerSearch).toHaveBeenCalledTimes(2);
    expect(overlayPhase()).toBe("scanning");
    expect(statusText()).toBe("Searching the page… 0%");

    act(() => {
      callbacks!.onResult({ matches: [{ x: 60, y: 60, width: 20, height: 20, score: 0.9 }] });
    });
    expect(overlayPhase()).toBe("review");
    expect(statusText()).toBe("1 match");
  });

  it("recovers when an orientation re-search fails and keeps Escape working in error phase", async () => {
    mocks.renderPageGray.mockResolvedValue({
      data: new Uint8Array(40_000),
      width: 200,
      height: 200,
    });

    mount();
    await dragBox(10, 10, 50, 50);
    act(() => {
      callbacks!.onResult({ matches: [{ x: 30, y: 30, width: 20, height: 20, score: 0.95 }] });
    });
    expect(overlayPhase()).toBe("review");

    const orientation = container.querySelector<HTMLInputElement>(
      '[aria-label="Any orientation"]',
    )!;
    act(() => orientation.click());
    act(() => callbacks!.onError("The search could not finish."));
    expect(overlayPhase()).toBe("error");
    expect(statusText()).toBe("The search could not finish.");

    // Escape mid-drag cancels the box drag without leaving Find similar mode.
    act(() => {
      host.dispatchEvent(pointerEvent("pointerdown", 20, 20));
      window.dispatchEvent(pointerEvent("pointermove", 60, 60));
    });
    expect(container.querySelector("[data-symbol-count-phase] div")).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector("[data-symbol-count-phase] div")).toBeNull();
    expect(getSymbolCount().active).toBe(true);
    expect(statusText()).toBe("The search could not finish.");

    // Dragging a new box retries cleanly.
    await dragBox(20, 20, 60, 60);
    expect(mocks.renderPageGray).toHaveBeenCalledTimes(2);
    expect(overlayPhase()).toBe("scanning");

    // Escape when not dragging leaves Find similar mode.
    act(() => callbacks!.onError("The search could not finish."));
    expect(overlayPhase()).toBe("error");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(getSymbolCount().active).toBe(false);
  });
});
