// @vitest-environment jsdom
import { act, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppProvider } from "./state";
import { ViewerShell } from "./ViewerShell";
import { createEmptySession, SessionProvider, useSessionState } from "./sessionState";
import { WorkspaceProvider } from "./workspaceState";
import { useViewerNavigationRegistration } from "../features/viewer/ViewerNavigation";

let root: Root, container: HTMLDivElement;
const shapes = vi.fn(),
  measurements = vi.fn(),
  pageChange = vi.fn();
const getPage = vi.fn(
  async () =>
    ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 800 * scale, height: 600 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      cleanup: vi.fn(),
    }) as unknown as PDFPageProxy,
);
const pdf = { numPages: 500, getPage } as unknown as PDFDocumentProxy;
function ViewerProbe() {
  shapes();
  const register = useViewerNavigationRegistration();
  const { session, updatePage } = useSessionState();
  useLayoutEffect(() => {
    if (session)
      register?.({
        pageNumber: session.currentPage,
        pageCount: session.pageCount,
        zoom: 1,
        onPageChange: (number) => {
          pageChange(number);
          updatePage(number);
        },
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onFit: vi.fn(),
      });
  }, [register, session, updatePage]);
  return <div data-testid="shapes" />;
}
function MeasurementProbe() {
  measurements();
  return <div>Measurements</div>;
}
function Harness() {
  const { loadSession, session } = useSessionState();
  const [document, setDocument] = useState(pdf);
  useLayoutEffect(() => {
    if (!session)
      loadSession(createEmptySession({ name: "500.pdf", size: 1, lastModified: 1 }, 500));
  }, [loadSession, session]);
  if (!session) return null;
  return (
    <>
      <MeasurementProbe />
      <button
        onClick={() => setDocument({ numPages: 500, getPage } as unknown as PDFDocumentProxy)}
      >
        Replace test document
      </button>
      <ViewerShell pdfDocument={document} sourcePageLabels={null}>
        <ViewerProbe />
      </ViewerShell>
    </>
  );
}
async function click(name: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  )!;
  await act(async () => button.click());
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  getPage.mockClear();
  shapes.mockClear();
  measurements.mockClear();
  pageChange.mockClear();
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
it("isolates Pages state/thumbnail updates from shapes and measurements, with no requests while closed", async () => {
  await act(async () =>
    root.render(
      <AppProvider>
        <SessionProvider>
          <WorkspaceProvider>
            <Harness />
          </WorkspaceProvider>
        </SessionProvider>
      </AppProvider>,
    ),
  );
  await act(async () => vi.dynamicImportSettled());
  expect(getPage).not.toHaveBeenCalled();
  const shapeCount = shapes.mock.calls.length,
    measurementCount = measurements.mock.calls.length;
  await click("Pages");
  await act(async () => vi.dynamicImportSettled());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(getPage).toHaveBeenCalled();
  const search = container.querySelector<HTMLInputElement>('[aria-label="Search labels"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "500");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(shapes).toHaveBeenCalledTimes(shapeCount);
  expect(measurements).toHaveBeenCalledTimes(measurementCount);
  await act(async () =>
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
  );
  expect(pageChange).toHaveBeenLastCalledWith(500);
  await click("Close pages");
  expect(container.querySelector('[aria-label="Pages"]')).toBeNull();
  expect(document.activeElement?.getAttribute("aria-controls")).toBe("page-browser");
  getPage.mockClear();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  expect(getPage).not.toHaveBeenCalled();
  await click("Previous page");
  expect(pageChange).toHaveBeenLastCalledWith(499);
  await click("Next page");
  expect(pageChange).toHaveBeenLastCalledWith(500);
  await click("Pages");
  await act(async () => vi.dynamicImportSettled());
  await click("Replace test document");
  expect(container.querySelector('[aria-label="Pages"]')).toBeNull();
  expect(
    container.querySelector('[aria-controls="page-browser"]')?.getAttribute("aria-pressed"),
  ).toBe("false");
});
