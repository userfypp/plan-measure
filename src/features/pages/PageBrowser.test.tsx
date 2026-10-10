// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageBrowser } from "./PageBrowser";
import {
  PAGE_OVERSCAN,
  PAGE_ROW_HEIGHT,
  filterPages,
  pageBrowserLabel,
  parsePhysicalPage,
} from "./pageBrowserModel";

let root: Root, container: HTMLDivElement;
let pdf: PDFDocumentProxy;
const navigate = vi.fn(),
  close = vi.fn();
const labels = Array.from({ length: 500 }, (_, index) =>
  index === 3 ? "iv" : index === 5 ? "Plan  A" : String(index + 1),
);
labels[399] = "Architectural drawings — Level four — Reflected ceiling layout with building services";
function list() {
  return container.querySelector<HTMLDivElement>('[role="listbox"]')!;
}
function input(name: string) {
  return container.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;
}
async function change(field: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(target: HTMLElement, value: string) {
  await act(async () =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
    ),
  );
}
async function mount(currentPage = 1, disabled = false, count = 500) {
  pdf = { ...pdf, numPages: count } as PDFDocumentProxy;
  await act(async () =>
    root.render(
      <PageBrowser
        document={pdf}
        labels={labels.slice(0, count)}
        currentPage={currentPage}
        navigationDisabled={disabled}
        onNavigate={navigate}
        onClose={close}
      />,
    ),
  );
  await act(async () => vi.advanceTimersByTimeAsync(10));
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  navigate.mockClear();
  close.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const page = {
    rotate: 0,
    getViewport: ({ scale }: { scale: number }) => ({ width: 800 * scale, height: 600 * scale }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    cleanup: vi.fn(),
  } as unknown as PDFPageProxy;
  pdf = { numPages: 500, getPage: vi.fn(async () => page) } as unknown as PDFDocumentProxy;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await vi.advanceTimersByTimeAsync(1);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("page browser", () => {
  it("mounts only the 500-page visible window plus margin, with fixed-height rows and bounded DOM", async () => {
    await mount(400);
    const rows = container.querySelectorAll<HTMLElement>('[role="option"]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(
      Math.ceil(320 / PAGE_ROW_HEIGHT) + PAGE_OVERSCAN * 2 + 1,
    );
    expect(container.querySelectorAll("*").length).toBeLessThan(100);
    rows.forEach((row) => expect(row.style.height).toBe(`${PAGE_ROW_HEIGHT}px`));
    expect(container.querySelector('[aria-current="page"]')?.getAttribute("data-page-number")).toBe(
      "400",
    );
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain("Current page");
    expect(list().scrollTop).toBeGreaterThan(0);
    expect(list().style.maxHeight).toBe("3040px");
    expect(pdf.getPage).toHaveBeenCalledTimes(rows.length);
    expect(input("Search labels")).toBe(document.activeElement);
    expect(container.querySelector(`[title="${labels[399]}"]`)).not.toBeNull();
  });
  it("requests only the new window on fast scroll and stops all requests on unmount", async () => {
    await mount();
    await act(async () => {
      list().scrollTop = 499 * PAGE_ROW_HEIGHT;
      list().dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(container.querySelectorAll('[role="option"]').length).toBeLessThanOrEqual(7);
    expect(container.querySelector('[data-page-number="500"]')).not.toBeNull();
    expect(pdf.getPage).toHaveBeenCalledTimes(7); // Four initial rows and three near the end.
    await act(async () => root.render(null));
    const requests = vi.mocked(pdf.getPage).mock.calls.length;
    await vi.advanceTimersByTimeAsync(50);
    expect(pdf.getPage).toHaveBeenCalledTimes(requests);
  });
  it("searches labels case/space-insensitively and physical numbers; Enter navigates a unique result", async () => {
    await mount();
    await change(input("Search labels"), "  PLAN   a  ");
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(container.querySelector('[title="Plan  A"]')).not.toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("1 page matches");
    await key(input("Search labels"), "Enter");
    expect(navigate).toHaveBeenCalledWith(6);
    await change(input("Search labels"), "4");
    expect(container.querySelector('[data-page-number="4"]')?.textContent).toContain("iv");
    expect(container.querySelector('[data-page-number="4"]')?.textContent).toContain("Page 4");
  });
  it("announces an empty result and restores the list using Clear search", async () => {
    await mount();
    await change(input("Search labels"), "absent");
    expect(container.textContent).toContain("No pages match");
    expect(list()).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe("0 pages match");
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Clear search"]')!.click(),
    );
    expect(list()).not.toBeNull();
    expect(input("Search labels").value).toBe("");
  });
  it("validates physical page range separately from PDF labels", async () => {
    await mount();
    const field = container.querySelector<HTMLInputElement>('input[type="number"]')!;
    for (const value of ["0", "501", "2.5", ""]) {
      await change(field, value);
      await act(async () =>
        field.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(navigate).not.toHaveBeenCalled();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("1 to 500");
    }
    await change(field, "4");
    await act(async () =>
      field.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
    );
    expect(navigate).toHaveBeenCalledWith(4);
    expect(field.hasAttribute("aria-invalid")).toBe(false);
  });
  it("uses one list tab stop, arrows, Home/End and Enter without global shortcut conflicts", async () => {
    await mount(4);
    const globalKey = vi.fn();
    window.addEventListener("keydown", globalKey);
    await act(async () => list().focus());
    expect(container.querySelectorAll('[role="option"][tabindex="0"]')).toHaveLength(0);
    await key(list(), "ArrowDown");
    await key(list(), "Enter");
    expect(navigate).toHaveBeenLastCalledWith(5);
    await key(list(), "End");
    expect(list().getAttribute("aria-activedescendant")).toContain("page-500");
    expect(container.querySelector('[data-page-number="500"]')).not.toBeNull();
    await key(list(), "Home");
    await key(list(), "Enter");
    expect(navigate).toHaveBeenLastCalledWith(1);
    await key(list(), "ArrowRight");
    await key(list(), "ArrowLeft");
    await key(list(), "v");
    expect(globalKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", globalKey);
  });
  it("preserves the drawing/scale workflow navigation guard and does not navigate the current page", async () => {
    await mount(1, true);
    await key(list(), "ArrowDown");
    await key(list(), "Enter");
    await change(input("Search labels"), "iv");
    await key(input("Search labels"), "Enter");
    expect(navigate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Finish or cancel");
    await mount(1, false);
    await change(input("Search labels"), "");
    await key(list(), "Home");
    await key(list(), "Enter");
    expect(navigate).not.toHaveBeenCalled();
  });
  it("closes with Escape, outside pointer and navigation in the narrow layout; supports one page", async () => {
    Object.defineProperty(window, "innerWidth", { value: 500, configurable: true });
    await mount(1, false, 1);
    expect(container.textContent).toContain("1 page");
    await key(input("Search labels"), "Escape");
    expect(close).toHaveBeenCalledTimes(1);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(close).toHaveBeenCalledTimes(2);
    await act(async () => container.querySelector<HTMLElement>('[role="option"]')!.click());
    expect(close).toHaveBeenCalledTimes(3);
    expect(navigate).not.toHaveBeenCalled();
  });
  it("leaves Escape to an existing dialog even when it dismisses before the window listener", async () => {
    await mount();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const control = document.createElement("button");
    dialog.append(control);
    document.body.append(dialog);
    const dismiss = () => dialog.remove();
    document.addEventListener("keydown", dismiss, { capture: true, once: true });
    await key(control, "Escape");
    expect(close).not.toHaveBeenCalled();
    await key(input("Search labels"), "Escape");
    expect(close).toHaveBeenCalledOnce();
  });
});
describe("page search model", () => {
  it("falls back to physical numbers and never guesses numeric labels for direct navigation", () => {
    expect(filterPages(5, null, " 4 ")).toEqual([4]);
    expect(filterPages(4, ["i", "ii", "iii", "iv"], " IV ")).toEqual([4]);
    expect(parsePhysicalPage("iv", 500)).toBeNull();
    expect(parsePhysicalPage("1e2", 500)).toBeNull();
    expect(pageBrowserLabel(1, ["  Plan A  "])).toBe("  Plan A  ");
  });
});
