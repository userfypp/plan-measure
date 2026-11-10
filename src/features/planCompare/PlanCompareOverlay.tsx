import { useEffect, useLayoutEffect, useRef } from "react";
import { useTheme } from "../../app/themeState";
import type { ViewTransform } from "../../types/domain";
import { hexToRgb } from "../../utils/cloudColors";
import { screenToPage } from "../../utils/coordinates";
import type { LoadedPageData } from "../viewer/pdfViewerRaster";
import { planCompareSession, usePlanCompareState } from "./planCompareSession";
import { stopPlanCompare } from "./planCompareStore";
import type { PlanDiffPalette, Rgb } from "./planDiff";
import styles from "./PlanCompareOverlay.module.css";

export interface PlanCompareOverlayProps {
  /** The page shown, as loaded for the viewer. */
  data: LoadedPageData;
  transform: ViewTransform;
}

function tokenColor(style: CSSStyleDeclaration, token: string): Rgb {
  try {
    const { r, g, b } = hexToRgb(style.getPropertyValue(token).trim());
    return [r, g, b];
  } catch {
    return [0, 0, 0];
  }
}

/** The paper and ink colours of the active theme, from the semantic tokens. */
export function readPalette(): PlanDiffPalette {
  const style = window.getComputedStyle(window.document.documentElement);
  return {
    paper: tokenColor(style, "--color-surface-panel"),
    common: tokenColor(style, "--color-text-secondary"),
    added: tokenColor(style, "--color-success"),
    removed: tokenColor(style, "--color-danger"),
  };
}

/**
 * Draws the comparison over the PDF and under the measurements: paper, shared ink, and what was
 * added or removed. The image is computed once per page and alignment; zoom and pan only change
 * its transform. While aligning it takes the clicks from the canvas.
 */
export function PlanCompareOverlay({ data, transform }: PlanCompareOverlayProps) {
  const { pdfPage, bounds, pageNumber, document } = data;
  const state = usePlanCompareState();
  const { resolvedTheme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(transform);
  useLayoutEffect(() => {
    live.current = transform;
  });
  const documentRef = useRef(document);
  useEffect(() => {
    if (documentRef.current !== document) stopPlanCompare();
  }, [document]);

  useEffect(() => () => planCompareSession.forgetPage(), []);
  useEffect(() => {
    planCompareSession.setPalette(readPalette());
  }, [resolvedTheme]);
  useEffect(() => {
    planCompareSession.setCurrentPage({ pdfPage, bounds, pageNumber });
  }, [pdfPage, bounds, pageNumber]);

  const result = state.result?.pageNumber === pageNumber ? state.result : null;
  const aligning = state.align !== "off";

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !result) return;
    canvas.width = result.width;
    canvas.height = result.height;
    context.putImageData(
      new ImageData(result.rgba as Uint8ClampedArray<ArrayBuffer>, result.width, result.height),
      0,
      0,
    );
  }, [result]);

  useEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    if (!aligning || !root || !host) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      if (event.target instanceof Element && event.target.closest("[data-keyboard-controls]"))
        return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-keyboard-controls]"))
        return;
      event.preventDefault();
      event.stopPropagation();
      const origin = root.getBoundingClientRect();
      planCompareSession.pickAlignPoint(
        screenToPage(
          { x: event.clientX - origin.left, y: event.clientY - origin.top },
          live.current,
        ),
      );
    };
    host.addEventListener("pointerdown", onPointerDown, true);
    host.addEventListener("click", onClick, true);
    return () => {
      host.removeEventListener("pointerdown", onPointerDown, true);
      host.removeEventListener("click", onClick, true);
    };
  }, [aligning]);

  return (
    <div ref={rootRef} className={styles.overlay} data-plan-compare-align={state.align}>
      <canvas
        ref={canvasRef}
        className={styles.image}
        aria-hidden="true"
        hidden={!result}
        style={
          result
            ? {
                transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.zoom / result.scale})`,
              }
            : undefined
        }
      />
    </div>
  );
}
