import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSessionState } from "../../app/sessionState";
import { useWorkspaceState } from "../../app/workspaceState";
import type { PageState, Point, ViewTransform } from "../../types/domain";
import { screenToPage, pageToScreen } from "../../utils/coordinates";
import { isBlockingOverlayOpen } from "../../utils/shortcuts/dispatcher";
import { CANVAS_VISUAL_METRICS, useCanvasVisualRoles } from "../viewer/canvasVisualRoles";
import type { LoadedPageData } from "../viewer/pdfViewerRaster";
import { chooseRasterScale, renderPageGray } from "./pageRaster";
import {
  SMALL_BOX_MESSAGE,
  hitMatch,
  matchStatus,
  symbolCountSession,
  stopSymbolCount,
  useSymbolCountState,
} from "./symbolCountSession";
import styles from "./SymbolCountOverlay.module.css";

/** A drag shorter than this on both sides is a click, not a box. */
const MIN_DRAG_SCREEN_PX = 4;
/** Markers smaller than this on screen are drawn and hit at this size. */
const MIN_MARKER_SCREEN_PX = 12;

export const SYMBOL_COUNT_PAGE_PROBLEM = "The page could not be searched.";

export interface SymbolCountOverlayProps {
  /** The page shown, as loaded for the viewer. */
  data: LoadedPageData;
  page: PageState;
  transform: ViewTransform;
  viewport: { width: number; height: number };
  /** Adds the items as a new count, when no count is selected. */
  completePath: (measurementType: "count", points: Point[]) => boolean;
}

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectBetween(a: Point, b: Point): ScreenRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Draws the box and the matches of "Find similar symbols" over the page. While a box is being
 * picked it takes the pointer from the canvas; while reviewing, only clicks on a match.
 */
export function SymbolCountOverlay({
  data,
  page,
  transform,
  viewport,
  completePath,
}: SymbolCountOverlayProps) {
  const { pdfPage, bounds } = data;
  const { activeTool, selectedMeasurementId, selectedMeasurementIds } = useWorkspaceState();
  const { updateMeasurement } = useSessionState();
  const target =
    selectedMeasurementIds.length === 1
      ? page.measurements.find(
          (measurement) =>
            measurement.id === selectedMeasurementId &&
            measurement.type === "count" &&
            measurement.visible,
        )
      : undefined;
  const existingPoints = target?.points ?? [];
  const onAddPoints = (points: Point[]) => {
    if (target) {
      updateMeasurement({
        pageNumber: page.pageNumber,
        id: target.id,
        points: [...target.points, ...points],
      });
    } else {
      completePath("count", points);
    }
  };
  const state = useSymbolCountState();
  const roles = useCanvasVisualRoles();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelDragRef = useRef<(() => void) | null>(null);
  const [drag, setDrag] = useState<ScreenRect | null>(null);
  const live = useRef({ pdfPage, bounds, transform, existingPoints, onAddPoints });
  useLayoutEffect(() => {
    live.current = { pdfPage, bounds, transform, existingPoints, onAddPoints };
  });
  // The search belongs to the Count tool and to the page it started on.
  const startPageRef = useRef(page.pageNumber);
  useEffect(() => {
    if (activeTool !== "count" || page.pageNumber !== startPageRef.current) stopSymbolCount();
  }, [activeTool, page.pageNumber]);

  useEffect(() => {
    symbolCountSession.setCommitHandler((points) => live.current.onAddPoints(points));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isBlockingOverlayOpen()) return;
      if (event.target instanceof Element && event.target.closest('[role="menu"]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (cancelDragRef.current) cancelDragRef.current();
      else stopSymbolCount();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      abortRef.current?.abort();
      symbolCountSession.reset();
    };
  }, []);

  const picking = state.phase === "pick";
  const reviewing = state.phase === "review";

  useEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    if (!picking || !root || !host) return;

    async function search(rect: ScreenRect) {
      const {
        pdfPage: page,
        bounds: pageBounds,
        transform: view,
        existingPoints: existing,
      } = live.current;
      const first = screenToPage({ x: rect.x, y: rect.y }, view);
      const second = screenToPage({ x: rect.x + rect.width, y: rect.y + rect.height }, view);
      const left = Math.min(Math.max(first.x, 0), pageBounds.width);
      const top = Math.min(Math.max(first.y, 0), pageBounds.height);
      const right = Math.min(Math.max(second.x, 0), pageBounds.width);
      const bottom = Math.min(Math.max(second.y, 0), pageBounds.height);
      if (right - left <= 0 || bottom - top <= 0) {
        symbolCountSession.backToPick(SMALL_BOX_MESSAGE);
        return;
      }
      const scale = chooseRasterScale(
        Math.max(right - left, bottom - top),
        pageBounds.width,
        pageBounds.height,
      );
      symbolCountSession.beginScan();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const image = await renderPageGray(page, pageBounds, scale, controller.signal);
        if (controller.signal.aborted) return;
        const x = Math.min(Math.floor(left * scale), image.width - 1);
        const y = Math.min(Math.floor(top * scale), image.height - 1);
        symbolCountSession.startSearch({
          image,
          scale,
          box: {
            x,
            y,
            width: Math.max(1, Math.min(Math.ceil(right * scale), image.width) - x),
            height: Math.max(1, Math.min(Math.ceil(bottom * scale), image.height) - y),
          },
          existing,
        });
      } catch {
        if (!controller.signal.aborted) symbolCountSession.fail(SYMBOL_COUNT_PAGE_PROBLEM);
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || cancelDragRef.current) return;
      if (event.target instanceof Element && event.target.closest("[data-keyboard-controls]"))
        return;
      const origin = root.getBoundingClientRect();
      const start = { x: event.clientX - origin.left, y: event.clientY - origin.top };
      event.preventDefault();
      event.stopPropagation();
      const rectAt = (moveEvent: PointerEvent) =>
        rectBetween(start, {
          x: moveEvent.clientX - origin.left,
          y: moveEvent.clientY - origin.top,
        });
      const finish = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        cancelDragRef.current = null;
        setDrag(null);
      };
      const onMove = (moveEvent: PointerEvent) => setDrag(rectAt(moveEvent));
      const onUp = (upEvent: PointerEvent) => {
        const rect = rectAt(upEvent);
        finish();
        if (rect.width < MIN_DRAG_SCREEN_PX && rect.height < MIN_DRAG_SCREEN_PX) return;
        void search(rect);
      };
      const onCancel = () => finish();
      cancelDragRef.current = finish;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    };
    // The click that follows a drag must not reach the canvas either.
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-keyboard-controls]"))
        return;
      event.stopPropagation();
    };
    host.addEventListener("pointerdown", onPointerDown, true);
    host.addEventListener("click", onClick, true);
    return () => {
      host.removeEventListener("pointerdown", onPointerDown, true);
      host.removeEventListener("click", onClick, true);
      cancelDragRef.current?.();
    };
  }, [picking]);

  useEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    if (!reviewing || !root || !host) return;
    const onClick = (event: MouseEvent) => {
      const origin = root.getBoundingClientRect();
      const view = live.current.transform;
      const point = screenToPage(
        { x: event.clientX - origin.left, y: event.clientY - origin.top },
        view,
      );
      const hit = hitMatch(
        symbolCountSession.getState(),
        point,
        MIN_MARKER_SCREEN_PX / 2 / view.zoom,
      );
      if (hit === null) return;
      event.preventDefault();
      event.stopPropagation();
      symbolCountSession.toggleExcluded(hit);
    };
    host.addEventListener("click", onClick, true);
    return () => host.removeEventListener("click", onClick, true);
  }, [reviewing]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(viewport.width * ratio));
    const height = Math.max(1, Math.round(viewport.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);
    if (!reviewing) return;
    const path = (index: number) => {
      const match = state.matches[index]!;
      const center = pageToScreen(match, transform);
      const w = Math.max(match.width * transform.zoom, MIN_MARKER_SCREEN_PX);
      const h = Math.max(match.height * transform.zoom, MIN_MARKER_SCREEN_PX);
      context.beginPath();
      context.rect(center.x - w / 2, center.y - h / 2, w, h);
    };
    const statuses = state.matches.map((_, index) => matchStatus(state, index));
    context.lineWidth = CANVAS_VISUAL_METRICS.draftPreviewStrokeScreenPx;
    context.strokeStyle = roles.pageGrid;
    context.setLineDash([...CANVAS_VISUAL_METRICS.draftPreviewDashScreenPx]);
    statuses.forEach((status, index) => {
      if (status !== "excluded") return;
      path(index);
      context.stroke();
    });
    context.setLineDash([]);
    context.lineWidth = CANVAS_VISUAL_METRICS.measurementSelectedStrokeScreenPx;
    context.strokeStyle = roles.measurementSelectedStroke;
    context.fillStyle = roles.measurementSelectedSoftFill;
    statuses.forEach((status, index) => {
      if (status !== "accepted") return;
      path(index);
      context.fill();
      context.stroke();
    });
  }, [state, reviewing, transform, viewport.width, viewport.height, roles]);

  return (
    <div ref={rootRef} className={styles.overlay} data-symbol-count-phase={state.phase}>
      <canvas ref={canvasRef} className={styles.markers} aria-hidden="true" />
      {drag && (
        <div
          className={styles.box}
          style={{ left: drag.x, top: drag.y, width: drag.width, height: drag.height }}
        />
      )}
    </div>
  );
}
