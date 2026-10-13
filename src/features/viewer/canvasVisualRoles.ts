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
  pageGrid: string;
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
  pageGrid: "#6b7280",
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
  draftStrokeScreenPx: 2,
  draftPreviewStrokeScreenPx: 1.6,
  calibrationStrokeScreenPx: 1.5,
  calibrationEmphasizedStrokeScreenPx: 2,
  countMarkerRadiusScreenPx: 6,
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
  cloudStrokeScreenPx: 2.75,
  cloudSelectedStrokeScreenPx: 3.25,
  cloudSelectedHaloBlurScreenPx: 6,
  cloudSelectedFillOpacity: 0.14,
  calibrationDashScreenPx: [6, 4] as const,
  draftPreviewDashScreenPx: [5, 4] as const,
  // Drawing guides of the box shapes (rectangle, ellipse): thin and translucent.
  boxGuideStrokeScreenPx: 1,
  boxGuideOpacity: 0.55,
  boxGuideAxisOpacity: 0.28,
  boxGuideHandleSizeScreenPx: 7,
  boxGuideHandleStrokeScreenPx: 1,
  boxGuideCenterCrossHalfScreenPx: 4,
  boxGuideDimensionFontSizeScreenPx: 11,
  boxGuideDimensionOffsetScreenPx: 8,
  boxGuideDimensionMinSideScreenPx: 28,
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

/** Hit area is derived from the base radius, so the Handle size preference never changes it. */
export function circularHandleHitStrokeWidthScreenPx(targetSizeScreenPx: number): number {
  return Math.max(0, targetSizeScreenPx - CANVAS_VISUAL_METRICS.handleRadiusScreenPx * 2);
}

/** Visible handle radius in screen px for a Handle size multiplier. */
export function scaledHandleRadiusScreenPx(scale: number): number {
  return CANVAS_VISUAL_METRICS.handleRadiusScreenPx * scale;
}

/**
 * Scales the alpha of a `#rrggbb` / `#rrggbbaa` color (capped at 1). Colors
 * without an alpha channel, or a scale of 1, are returned unchanged.
 */
export function scaleFillAlpha(color: string, scale: number): string {
  if (scale === 1 || !/^#[0-9a-f]{8}$/i.test(color)) return color;
  const alpha = parseInt(color.slice(7, 9), 16);
  const scaled = Math.min(255, Math.round(alpha * scale));
  return `${color.slice(0, 7)}${scaled.toString(16).padStart(2, "0")}`;
}

/** Same as `scaleFillAlpha` for a cloud fill given as color + 0-1 alpha. */
export function scaledAlpha(alpha: number, scale: number): number {
  return Math.min(1, alpha * scale);
}

/**
 * Text paint for measurement labels. Without a background the text would be
 * unreadable on light plans, so it flips to the dark role with a light halo.
 */
export function labelTextPaint(
  roles: Pick<CanvasVisualRoles, "labelText" | "labelBackground">,
  backgroundOpacity: number,
  zoom: number,
) {
  if (backgroundOpacity > 0) return { fill: roles.labelText };
  return {
    fill: roles.labelBackground,
    stroke: roles.labelText,
    strokeWidth: 3 / zoom,
    fillAfterStrokeEnabled: true,
  };
}
