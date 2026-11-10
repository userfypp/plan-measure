import type { PDFPageProxy } from "pdfjs-dist";
import { describe, expect, it, vi } from "vitest";
import type { LoadedPdf } from "../../services/pdf";
import { PdfUserError } from "../../services/pdfValidation";
import type { PlanDiffImage, PlanDiffPalette } from "./planDiff";
import type { PlanDiffCallbacks } from "./planDiffWorkerClient";
import {
  PLAN_COMPARE_OPEN_PROBLEM,
  PLAN_COMPARE_PAGE_PROBLEM,
  createPlanCompareSession,
  defaultOtherPage,
} from "./planCompareSession";

const palette: PlanDiffPalette = {
  paper: [255, 255, 255],
  common: [1, 1, 1],
  added: [2, 2, 2],
  removed: [3, 3, 3],
};

const pdfFile = (name = "rev-b.pdf") => new File(["%PDF"], name, { type: "application/pdf" });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function currentPage(pageNumber: number) {
  return {
    pdfPage: { id: `current-${pageNumber}` } as unknown as PDFPageProxy,
    bounds: { width: 100, height: 50, rotation: 0 as const },
    pageNumber,
  };
}

function setup(pageCount = 3) {
  let callbacks!: PlanDiffCallbacks;
  const diff = vi.fn();
  const terminate = vi.fn();
  const createDiff = vi.fn((_now, _before, given: PlanDiffCallbacks) => {
    callbacks = given;
    return { diff, terminate };
  });
  const destroy = vi.fn(async () => undefined);
  const getPage = vi.fn(async (pageNumber: number) => ({
    pageNumber,
    getViewport: () => ({ width: 100, height: 50, rotation: 0 }),
  }));
  const loadPdf = vi.fn(
    async () =>
      ({
        document: { numPages: pageCount, getPage },
        loadingTask: { destroy },
      }) as unknown as LoadedPdf,
  );
  const renderGray = vi.fn(async () => ({ data: new Uint8Array(4), width: 2, height: 2 }));
  const session = createPlanCompareSession({ loadPdf, createDiff, renderGray });
  const image = (): PlanDiffImage => ({ width: 2, height: 2, rgba: new Uint8ClampedArray(16) });
  return {
    session,
    diff,
    terminate,
    createDiff,
    destroy,
    getPage,
    loadPdf,
    renderGray,
    callbacks: () => callbacks,
    image,
  };
}

async function ready(pageNumber = 2, pageCount = 3) {
  const context = setup(pageCount);
  context.session.setPalette(palette);
  context.session.setCurrentPage(currentPage(pageNumber));
  await context.session.open(pdfFile());
  await flush();
  context.callbacks().onResult(context.image());
  return context;
}

describe("defaultOtherPage", () => {
  it("is the same page number, kept within the other PDF", () => {
    expect(defaultOtherPage(2, 5)).toBe(2);
    expect(defaultOtherPage(9, 5)).toBe(5);
    expect(defaultOtherPage(0, 5)).toBe(1);
  });
});

describe("plan compare session", () => {
  it("loads the other PDF, compares the same page and shows the result", async () => {
    const { session, createDiff, diff, getPage, callbacks, image } = setup();
    session.setPalette(palette);
    session.setCurrentPage(currentPage(2));
    const opening = session.open(pdfFile("rev-b.pdf"));
    expect(session.getState()).toMatchObject({ phase: "loading", fileName: "rev-b.pdf" });
    await opening;
    await flush();
    expect(session.getState()).toMatchObject({ pageCount: 3, otherPage: 2 });
    expect(getPage).toHaveBeenCalledWith(2);
    expect(createDiff).toHaveBeenCalledTimes(1);
    expect(diff).toHaveBeenCalledWith(0, 0, palette);
    callbacks().onResult(image());
    const state = session.getState();
    expect(state.phase).toBe("ready");
    expect(state.result).toMatchObject({ width: 2, height: 2, pageNumber: 2 });
  });

  it("keeps loading when the page is forgotten and shown again", async () => {
    const { session, createDiff } = setup();
    session.setPalette(palette);
    session.setCurrentPage(currentPage(2));
    const opening = session.open(pdfFile());
    session.forgetPage();
    session.setPalette(palette);
    session.setCurrentPage(currentPage(2));
    await opening;
    await flush();
    expect(session.getState().phase).toBe("loading");
    expect(createDiff).toHaveBeenCalledTimes(1);
  });

  it("waits for the page and the colours before comparing", async () => {
    const { session, createDiff } = setup();
    await session.open(pdfFile());
    await flush();
    expect(createDiff).not.toHaveBeenCalled();
    expect(session.getState().phase).toBe("loading");
    session.setPalette(palette);
    session.setCurrentPage(currentPage(1));
    await flush();
    expect(createDiff).toHaveBeenCalledTimes(1);
  });

  it("compares the page that matches the new one when the plan changes page", async () => {
    const { session, createDiff, terminate, getPage } = await ready(1);
    session.selectPage(3);
    await flush();
    expect(session.getState().otherPage).toBe(3);
    session.setCurrentPage(currentPage(2));
    await flush();
    expect(session.getState().otherPage).toBe(2);
    expect(getPage).toHaveBeenLastCalledWith(2);
    expect(createDiff).toHaveBeenCalledTimes(3);
    expect(terminate).toHaveBeenCalledTimes(2);
    expect(session.getState().result).toBeNull();
  });

  it("keeps the other page within its page count", async () => {
    const { session } = await ready(1, 2);
    session.setCurrentPage(currentPage(7));
    await flush();
    expect(session.getState().otherPage).toBe(2);
    session.selectPage(9);
    expect(session.getState().otherPage).toBe(2);
  });

  it("aligns with two clicks and compares again with the translation", async () => {
    const { session, createDiff, diff } = await ready();
    expect(session.getState().align).toBe("off");
    session.beginAlign();
    expect(session.getState().align).toBe("other");
    session.pickAlignPoint({ x: 10, y: 20 });
    expect(session.getState().align).toBe("current");
    session.pickAlignPoint({ x: 14, y: 17 });
    expect(session.getState()).toMatchObject({ align: "off", offset: { x: 4, y: -3 } });
    expect(diff).toHaveBeenLastCalledWith(8, -6, palette);
    expect(createDiff).toHaveBeenCalledTimes(1);
    session.beginAlign();
    session.pickAlignPoint({ x: 0, y: 0 });
    session.pickAlignPoint({ x: 1, y: 1 });
    expect(session.getState().offset).toEqual({ x: 5, y: -2 });
  });

  it("cancels an alignment without moving anything", async () => {
    const { session, diff } = await ready();
    diff.mockClear();
    session.beginAlign();
    session.pickAlignPoint({ x: 10, y: 20 });
    session.cancelAlign();
    expect(session.getState()).toMatchObject({ align: "off", offset: { x: 0, y: 0 } });
    session.pickAlignPoint({ x: 3, y: 3 });
    expect(session.getState().offset).toEqual({ x: 0, y: 0 });
    expect(diff).not.toHaveBeenCalled();
  });

  it("resets the alignment", async () => {
    const { session, diff } = await ready();
    session.beginAlign();
    session.pickAlignPoint({ x: 0, y: 0 });
    session.pickAlignPoint({ x: 6, y: 6 });
    session.resetAlignment();
    expect(session.getState().offset).toEqual({ x: 0, y: 0 });
    expect(diff).toHaveBeenLastCalledWith(0, 0, palette);
  });

  it("scales the translation to the render", async () => {
    const { session, diff } = await ready();
    session.beginAlign();
    session.pickAlignPoint({ x: 0, y: 0 });
    session.pickAlignPoint({ x: 0.5, y: 1 });
    const [dx, dy] = diff.mock.calls.at(-1)!;
    expect(Number.isInteger(dx)).toBe(true);
    expect(dy).toBeGreaterThan(dx);
  });

  it("compares again with a new palette without rendering the pages again", async () => {
    const { session, diff, renderGray } = await ready();
    const renders = renderGray.mock.calls.length;
    const dark = { ...palette, paper: [0, 0, 0] as const };
    session.setPalette(dark);
    expect(diff).toHaveBeenLastCalledWith(0, 0, dark);
    expect(renderGray.mock.calls.length).toBe(renders);
  });

  it("reports a file that is not a PDF", async () => {
    const { session, loadPdf } = setup();
    await session.open(new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(session.getState()).toMatchObject({
      phase: "error",
      message: "Unsupported file type. Choose a PDF file.",
    });
    expect(loadPdf).not.toHaveBeenCalled();
  });

  it("reports an invalid PDF", async () => {
    const { session, loadPdf } = setup();
    loadPdf.mockRejectedValueOnce(new PdfUserError("This PDF is invalid or corrupt."));
    await session.open(pdfFile());
    expect(session.getState()).toMatchObject({
      phase: "error",
      message: "This PDF is invalid or corrupt.",
    });
    loadPdf.mockRejectedValueOnce(new Error("boom"));
    await session.open(pdfFile());
    expect(session.getState().message).toBe(PLAN_COMPARE_OPEN_PROBLEM);
  });

  it("reports a page that cannot be rendered and a failed comparison", async () => {
    const { session, renderGray, callbacks } = setup();
    session.setPalette(palette);
    session.setCurrentPage(currentPage(1));
    renderGray.mockRejectedValueOnce(new Error("no"));
    await session.open(pdfFile());
    await flush();
    expect(session.getState()).toMatchObject({
      phase: "error",
      message: PLAN_COMPARE_PAGE_PROBLEM,
    });
    await session.open(pdfFile());
    await flush();
    callbacks().onError("The comparison could not finish.");
    expect(session.getState()).toMatchObject({
      phase: "error",
      message: "The comparison could not finish.",
    });
  });

  it("closes: drops the other PDF and the worker", async () => {
    const { session, terminate, destroy } = await ready();
    session.close();
    expect(session.getState().phase).toBe("idle");
    expect(session.getState().result).toBeNull();
    expect(terminate).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it("ignores a PDF that finishes loading after another was chosen", async () => {
    const { session, loadPdf, destroy, createDiff } = setup();
    session.setPalette(palette);
    session.setCurrentPage(currentPage(1));
    const first = session.open(pdfFile("a.pdf"));
    const second = session.open(pdfFile("b.pdf"));
    await Promise.all([first, second]);
    await flush();
    expect(loadPdf).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(createDiff).toHaveBeenCalledTimes(1);
    expect(session.getState().fileName).toBe("b.pdf");
  });
});
