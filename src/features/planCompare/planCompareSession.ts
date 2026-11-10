import type { PDFPageProxy } from "pdfjs-dist";
import { useSyncExternalStore } from "react";
import type { LoadedPdf } from "../../services/pdf";
import { PdfUserError, validatePdfFile } from "../../services/pdfValidation";
import type { LogicalPageBounds, Point } from "../../types/domain";
import { logicalPageBoundsFromViewport } from "../../utils/coordinates";
import { chooseRasterScale, renderPageGray } from "../symbolCount/pageRaster";
import type { GrayImage } from "../symbolCount/templateMatch";
import type { PlanDiffImage, PlanDiffPalette } from "./planDiff";
import { createPlanDiff, type CreatePlanDiff } from "./planDiffWorkerClient";

export type PlanComparePhase = "idle" | "loading" | "ready" | "error";
/** Which click of "Align" is expected next, if it is on. */
export type PlanCompareAlign = "off" | "other" | "current";

export const PLAN_COMPARE_PAGE_PROBLEM = "The pages could not be compared.";
export const PLAN_COMPARE_OPEN_PROBLEM =
  "The PDF could not be loaded. Check the file and try again.";
/** The raster is as fine as a 20-unit feature allows within the pixel budget. */
const DETAIL_FEATURE_SIZE = 20;

export interface PlanCompareResult extends PlanDiffImage {
  /** Page of the current version it shows. */
  pageNumber: number;
  /** Raster pixels per page unit. */
  scale: number;
}

export interface PlanCompareState {
  phase: PlanComparePhase;
  fileName: string | null;
  /** Pages of the other PDF. */
  pageCount: number;
  /** Page of the other PDF shown. */
  otherPage: number;
  /** Where the other version is moved to, in page units. */
  offset: Point;
  align: PlanCompareAlign;
  message: string | null;
  result: PlanCompareResult | null;
}

export interface PlanCompareCurrentPage {
  pdfPage: PDFPageProxy;
  bounds: LogicalPageBounds;
  pageNumber: number;
}

const NO_OFFSET: Point = { x: 0, y: 0 };

const INITIAL_STATE: PlanCompareState = {
  phase: "idle",
  fileName: null,
  pageCount: 0,
  otherPage: 1,
  offset: NO_OFFSET,
  align: "off",
  message: null,
  result: null,
};

export interface PlanCompareDependencies {
  loadPdf: (file: File) => Promise<LoadedPdf>;
  createDiff: CreatePlanDiff;
  renderGray: typeof renderPageGray;
}

const defaultDependencies: PlanCompareDependencies = {
  loadPdf: async (file) => (await import("../../services/pdf")).loadPdf(file),
  createDiff: createPlanDiff,
  renderGray: renderPageGray,
};

/** The page of the other PDF a page of the plan is compared with by default. */
export function defaultOtherPage(pageNumber: number, pageCount: number): number {
  return Math.min(Math.max(pageNumber, 1), Math.max(pageCount, 1));
}

export function createPlanCompareSession(dependencies: Partial<PlanCompareDependencies> = {}) {
  const { loadPdf, createDiff, renderGray } = { ...defaultDependencies, ...dependencies };
  let state = INITIAL_STATE;
  let other: LoadedPdf | null = null;
  let current: PlanCompareCurrentPage | null = null;
  let palette: PlanDiffPalette | null = null;
  let diff: ReturnType<CreatePlanDiff> | null = null;
  let scale = 1;
  let controller: AbortController | null = null;
  let openGeneration = 0;
  let alignReference: Point | null = null;
  const listeners = new Set<() => void>();

  function set(patch: Partial<PlanCompareState>) {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  }

  function endDiff() {
    controller?.abort();
    controller = null;
    diff?.terminate();
    diff = null;
  }

  function fail(message: string) {
    endDiff();
    set({ phase: "error", message, result: null, align: "off" });
  }

  function requestDiff() {
    if (!diff || !palette) return;
    diff.diff(Math.round(state.offset.x * scale), Math.round(state.offset.y * scale), palette);
  }

  /** Renders both pages and starts the comparison; later changes of alignment reuse the renders. */
  async function start() {
    if (!other || !current || !palette) return;
    endDiff();
    const job = new AbortController();
    controller = job;
    const { pdfPage, bounds, pageNumber } = current;
    const document = other.document;
    const otherPage = state.otherPage;
    set({ phase: "loading", message: null, result: null });
    try {
      scale = chooseRasterScale(DETAIL_FEATURE_SIZE, bounds.width, bounds.height);
      const now: GrayImage = await renderGray(pdfPage, bounds, scale, job.signal);
      if (job.signal.aborted) return;
      const otherPdfPage = await document.getPage(otherPage);
      const otherBounds = logicalPageBoundsFromViewport(otherPdfPage.getViewport({ scale: 1 }));
      const before: GrayImage = await renderGray(otherPdfPage, otherBounds, scale, job.signal);
      if (job.signal.aborted) return;
      diff = createDiff(now, before, {
        onResult: (image) => {
          if (job.signal.aborted) return;
          set({ phase: "ready", message: null, result: { ...image, pageNumber, scale } });
        },
        onError: (message) => {
          if (!job.signal.aborted) fail(message);
        },
      });
      requestDiff();
    } catch {
      if (!job.signal.aborted) fail(PLAN_COMPARE_PAGE_PROBLEM);
    }
  }

  /** Drops the other PDF and the worker; what the page gave (page, colours) stays. */
  function release() {
    openGeneration += 1;
    endDiff();
    const loaded = other;
    other = null;
    void loaded?.loadingTask.destroy().catch(() => undefined);
    alignReference = null;
  }

  function toInitial() {
    if (state === INITIAL_STATE) return;
    state = INITIAL_STATE;
    for (const listener of [...listeners]) listener();
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Back to the first state; drops the other PDF and the worker but keeps the page and colours. */
    close() {
      release();
      toInitial();
    },
    /**
     * Forgets the page and colours, as the overlay unmounts. The other PDF and its loading stay:
     * the bar owns them, and a remount (StrictMode, a page change) must not cancel the comparison.
     */
    forgetPage() {
      current = null;
      palette = null;
    },
    /** Loads the other version; it is only kept in memory. */
    async open(file: File) {
      release();
      const generation = openGeneration;
      state = { ...INITIAL_STATE, phase: "loading", fileName: file.name };
      for (const listener of [...listeners]) listener();
      try {
        validatePdfFile(file);
        const loaded = await loadPdf(file);
        if (generation !== openGeneration) {
          void loaded.loadingTask.destroy().catch(() => undefined);
          return;
        }
        other = loaded;
        const pageCount = loaded.document.numPages;
        set({ pageCount, otherPage: defaultOtherPage(current?.pageNumber ?? 1, pageCount) });
        void start();
      } catch (error) {
        if (generation !== openGeneration) return;
        set({
          phase: "error",
          message: error instanceof PdfUserError ? error.message : PLAN_COMPARE_OPEN_PROBLEM,
        });
      }
    },
    /** The page of the plan on screen; the other page follows its number. */
    setCurrentPage(page: PlanCompareCurrentPage) {
      const changed = current?.pageNumber !== page.pageNumber || current?.pdfPage !== page.pdfPage;
      current = page;
      if (!changed) return;
      if (other) set({ otherPage: defaultOtherPage(page.pageNumber, state.pageCount) });
      void start();
    },
    /** The paper and ink colours for the active theme. */
    setPalette(next: PlanDiffPalette) {
      palette = next;
      if (diff) requestDiff();
      else void start();
    },
    selectPage(otherPage: number) {
      if (!other || otherPage === state.otherPage) return;
      if (otherPage < 1 || otherPage > state.pageCount) return;
      set({ otherPage });
      void start();
    },
    /** Asks for the two clicks that move the other version onto this one. */
    beginAlign() {
      if (state.phase !== "ready") return;
      alignReference = null;
      set({ align: "other" });
    },
    cancelAlign() {
      alignReference = null;
      if (state.align !== "off") set({ align: "off" });
    },
    /** A click on the page, in page units, while aligning. */
    pickAlignPoint(point: Point) {
      if (state.align === "other") {
        alignReference = point;
        set({ align: "current" });
        return;
      }
      if (state.align !== "current" || !alignReference) return;
      const offset = {
        x: state.offset.x + point.x - alignReference.x,
        y: state.offset.y + point.y - alignReference.y,
      };
      alignReference = null;
      set({ align: "off", offset });
      requestDiff();
    },
    resetAlignment() {
      alignReference = null;
      if (state.offset === NO_OFFSET && state.align === "off") return;
      set({ align: "off", offset: NO_OFFSET });
      requestDiff();
    },
  };
}

export type PlanCompareSession = ReturnType<typeof createPlanCompareSession>;

export const planCompareSession = createPlanCompareSession();

export function usePlanCompareState(session: PlanCompareSession = planCompareSession) {
  return useSyncExternalStore(session.subscribe, session.getState, session.getState);
}
