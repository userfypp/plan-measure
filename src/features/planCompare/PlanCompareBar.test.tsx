/* @vitest-environment jsdom */

import type { PDFPageProxy } from "pdfjs-dist";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { LoadedPdf } from "../../services/pdf";
import { chooseSelectOption } from "../../components/ui/selectTestUtils";
import { ALIGN_CURRENT_PROMPT, ALIGN_OTHER_PROMPT, PlanCompareBar } from "./PlanCompareBar";
import { createPlanCompareSession } from "./planCompareSession";
import { getPlanCompare, startPlanCompare, stopPlanCompare } from "./planCompareStore";
import type { PlanDiffPalette } from "./planDiff";
import type { PlanDiff, PlanDiffCallbacks } from "./planDiffWorkerClient";

const palette: PlanDiffPalette = {
  paper: [255, 255, 255],
  common: [1, 1, 1],
  added: [2, 2, 2],
  removed: [3, 3, 3],
};

let root: Root;
let container: HTMLDivElement;
let callbacks: PlanDiffCallbacks;
let diff: Mock<PlanDiff["diff"]>;
let getPage: ReturnType<typeof vi.fn>;
let session: ReturnType<typeof createPlanCompareSession>;

function makeSession() {
  diff = vi.fn<PlanDiff["diff"]>();
  getPage = vi.fn(async () => ({ getViewport: () => ({ width: 10, height: 10, rotation: 0 }) }));
  return createPlanCompareSession({
    loadPdf: async () =>
      ({
        document: { numPages: 3, getPage },
        loadingTask: { destroy: async () => undefined },
      }) as unknown as LoadedPdf,
    createDiff: (_now, _before, given) => {
      callbacks = given;
      return { diff, terminate: vi.fn() };
    },
    renderGray: async () => ({ data: new Uint8Array(4), width: 2, height: 2 }),
  });
}

const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
const status = () => container.querySelector('[role="status"]')?.textContent;

function button(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === name,
  );
  if (!found) throw new Error(`No button ${name}.`);
  return found;
}

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
}

async function showResult() {
  session.setPalette(palette);
  session.setCurrentPage({
    pdfPage: {} as PDFPageProxy,
    bounds: { width: 10, height: 10, rotation: 0 },
    pageNumber: 2,
  });
  act(() => startPlanCompare(new File(["%PDF"], "rev-b.pdf", { type: "application/pdf" })));
  await flush();
  await flush();
  act(() => callbacks.onResult({ width: 2, height: 2, rgba: new Uint8ClampedArray(16) }));
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  session = makeSession();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<PlanCompareBar session={session} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  stopPlanCompare();
});

describe("PlanCompareBar", () => {
  it("shows that the other PDF is loading, then what it is compared with", async () => {
    act(() => startPlanCompare(new File(["%PDF"], "rev-b.pdf", { type: "application/pdf" })));
    expect(status()).toBe("Loading…");
    await showResult();
    expect(status()).toBe("Comparing with rev-b.pdf");
    expect(container.textContent).toContain("Removed");
    expect(container.textContent).toContain("Added");
    expect(container.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe(
      "Compare plans controls",
    );
  });

  it("explains a file that cannot be compared", async () => {
    act(() => startPlanCompare(new File(["x"], "notes.txt", { type: "text/plain" })));
    await flush();
    expect(status()).toBe("Unsupported file type. Choose a PDF file.");
    expect(container.textContent).not.toContain("Removed");
    expect(container.querySelector('[aria-label="Page of the other PDF"]')).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "Close",
    ]);
  });

  it("offers the page of the other PDF, the same number by default", async () => {
    await showResult();
    const select = container.querySelector<HTMLElement>('[aria-label="Page of the other PDF"]')!;
    expect(select.textContent).toContain("Page 2");
    chooseSelectOption(select, "Page 3");
    await flush();
    expect(getPage).toHaveBeenLastCalledWith(3);
    expect(session.getState().otherPage).toBe(3);
  });

  it("walks through the two alignment clicks and resets the alignment", async () => {
    await showResult();
    expect(container.textContent).not.toContain("Reset alignment");
    act(() => button("Align").click());
    expect(status()).toBe(ALIGN_OTHER_PROMPT);
    expect(button("Align").disabled).toBe(true);
    act(() => session.pickAlignPoint({ x: 1, y: 1 }));
    expect(status()).toBe(ALIGN_CURRENT_PROMPT);
    act(() => session.pickAlignPoint({ x: 3, y: 4 }));
    expect(status()).toBe("Comparing with rev-b.pdf");
    expect(diff).toHaveBeenLastCalledWith(4, 6, palette);
    act(() => button("Reset alignment").click());
    expect(diff).toHaveBeenLastCalledWith(0, 0, palette);
    expect(container.textContent).not.toContain("Reset alignment");
  });

  it("Escape cancels the alignment first and then closes the comparison", async () => {
    await showResult();
    act(() => button("Align").click());
    pressEscape();
    expect(session.getState().align).toBe("off");
    expect(getPlanCompare().active).toBe(true);
    pressEscape();
    expect(getPlanCompare().active).toBe(false);
  });

  it("Close ends the comparison and releases the other PDF", async () => {
    await showResult();
    act(() => button("Close").click());
    expect(getPlanCompare().active).toBe(false);
    act(() => root.render(<PlanCompareBar session={session} />));
    expect(session.getState().phase).toBe("idle");
  });
});
