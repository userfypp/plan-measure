import { createContext, useContext, type ReactNode } from "react";
import type { Point } from "../../types/domain";

export interface ViewerSize {
  width: number;
  height: number;
}

export interface SafeViewerLayout {
  size: ViewerSize;
  center: Point | null;
}

export function viewerOverlayBottom(
  bottomExclusion: number,
  viewerHeight = Number.POSITIVE_INFINITY,
  defaultBottom = 14,
  gap = 8,
): number {
  const desiredBottom = Math.max(defaultBottom, Math.max(0, bottomExclusion) + gap);
  return Math.min(Math.max(0, viewerHeight), desiredBottom);
}

export function safeViewerLayout(
  viewerSize: ViewerSize,
  bottomExclusion: number,
): SafeViewerLayout {
  const safeWidth = Math.max(0, viewerSize.width);
  const viewerHeight = Math.max(0, viewerSize.height);
  const exclusion = Math.max(0, bottomExclusion);
  const safeHeight = Math.max(0, viewerHeight - exclusion);
  return {
    size: { width: safeWidth, height: safeHeight },
    center:
      safeWidth > 0 && safeHeight > 0
        ? { x: safeWidth / 2, y: safeHeight / 2 }
        : null,
  };
}

const ViewerBottomExclusionContext = createContext(0);

export function ViewerBottomExclusionProvider({
  bottomExclusion,
  children,
}: {
  bottomExclusion: number;
  children: ReactNode;
}) {
  return (
    <ViewerBottomExclusionContext.Provider value={bottomExclusion}>
      {children}
    </ViewerBottomExclusionContext.Provider>
  );
}

export function useViewerBottomExclusion(): number {
  return useContext(ViewerBottomExclusionContext);
}
