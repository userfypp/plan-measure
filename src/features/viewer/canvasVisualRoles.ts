import { useMemo, useSyncExternalStore } from "react";
import { useTheme, type ResolvedTheme } from "../../app/themeState";

export const COARSE_POINTER_QUERY = "(any-pointer: coarse)";

/**
 * Semantic V2 roles consumed by Konva. These values mirror the validated V2
 * visual tokens, but are centralized here so render components never choose
 * raw colors or read CSS custom properties during pointer-driven rendering.
 *
 * PDF-space overlays intentionally remain theme-invariant: Light/Dark changes
 * shell chrome, not the PDF or measurement overlay palette drawn over it.
 */
export interface CanvasVisualRoles {
  theme: ResolvedTheme;
  measurementDefaultStroke: string;
  measurementDefaultFill: string;
  measurementSelectedStroke: string;
  measurementSelectedFill: string;
  measurementSelectedSoftFill: string;
  drawingDraftStroke: string;
  drawingDraftFill: string;
  calibrationStroke: string;
  referenceStroke: string;
  snapTarget: string;
  handleStroke: string;
  handleFill: string;
  labelText: string;
  labelBackground: string;
  pageHitRegionFill: string;
}

const DOCUMENT_OVERLAY_ROLES = {
  measurementDefaultStroke: "#258a88",
  measurementDefaultFill: "#258a8810",
  measurementSelectedStroke: "#2465c7",
  measurementSelectedFill: "#2465c718",
  measurementSelectedSoftFill: "#2465c710",
  drawingDraftStroke: "#2465c7",
  drawingDraftFill: "#2465c718",
  calibrationStroke: "#ac7620",
  referenceStroke: "#258a88",
  snapTarget: "#2465c7",
  handleStroke: "#2465c7",
  handleFill: "#ffffff",
  labelText: "#ffffff",
  labelBackground: "#242a31",
  // Keep the page hit rect practically transparent so the PDF raster remains
  // visually untouched while Stage background interactions still work.
  pageHitRegionFill: "rgba(255,255,255,0.001)",
} as const;

const LIGHT_CANVAS_VISUAL_ROLES: CanvasVisualRoles = Object.freeze({
  theme: "light",
  ...DOCUMENT_OVERLAY_ROLES,
});

const DARK_CANVAS_VISUAL_ROLES: CanvasVisualRoles = Object.freeze({
  theme: "dark",
  ...DOCUMENT_OVERLAY_ROLES,
});

export const CANVAS_VISUAL_METRICS = Object.freeze({
  measurementStrokeScreenPx: 1.5,
  measurementSelectedStrokeScreenPx: 2,
  measurementHitStrokeScreenPx: 12,
  draftStrokeScreenPx: 2,
  draftPreviewStrokeScreenPx: 1.6,
  calibrationStrokeScreenPx: 1.5,
  calibrationEmphasizedStrokeScreenPx: 2,
  handleRadiusScreenPx: 3,
  handleStrokeScreenPx: 2,
  interactionTargetFineScreenPx: 32,
  interactionTargetCoarseScreenPx: 44,
  snapMarkerSizeScreenPx: 6,
  snapMarkerStrokeScreenPx: 1.5,
  labelPaddingScreenPx: 4,
  measurementLabelFontSizeScreenPx: 12,
  calibrationLabelFontSizeScreenPx: 11,
  labelCornerRadiusScreenPx: 3,
  calibrationDashScreenPx: [6, 4] as const,
  draftPreviewDashScreenPx: [5, 4] as const,
  fontFamily: 'Arial, "Helvetica Neue", sans-serif',
});

export function resolveCanvasVisualRoles(theme: ResolvedTheme): CanvasVisualRoles {
  return theme === "dark" ? DARK_CANVAS_VISUAL_ROLES : LIGHT_CANVAS_VISUAL_ROLES;
}

export function useCanvasVisualRoles(): CanvasVisualRoles {
  const { resolvedTheme } = useTheme();
  return resolveCanvasVisualRoles(resolvedTheme);
}

export function canvasInteractionTargetScreenPx(coarsePointer: boolean): number {
  return coarsePointer
    ? CANVAS_VISUAL_METRICS.interactionTargetCoarseScreenPx
    : CANVAS_VISUAL_METRICS.interactionTargetFineScreenPx;
}

export function useCanvasInteractionTargetScreenPx(): number {
  const media = useMemo(
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(COARSE_POINTER_QUERY)
        : null,
    [],
  );
  const coarsePointer = useSyncExternalStore(
    (onStoreChange) => {
      if (!media) return () => undefined;
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    () => media?.matches ?? false,
    () => false,
  );
  return canvasInteractionTargetScreenPx(coarsePointer);
}

export function circularHandleHitStrokeWidthScreenPx(targetSizeScreenPx: number): number {
  return Math.max(0, targetSizeScreenPx - CANVAS_VISUAL_METRICS.handleRadiusScreenPx * 2);
}
