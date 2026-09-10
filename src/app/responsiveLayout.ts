export type ResponsiveMode = "wide" | "compact" | "narrow";

export const COMPACT_MAX_WIDTH = 1024;
export const NARROW_MAX_WIDTH = 800;
export const WORKSPACE_PANEL_WIDTH = 288;
export const WORKSPACE_DRAWER_WIDTH = 304;

export function responsiveModeForWidth(width: number): ResponsiveMode {
  if (!Number.isFinite(width) || width <= 0) return "wide";
  if (width <= NARROW_MAX_WIDTH) return "narrow";
  if (width <= COMPACT_MAX_WIDTH) return "compact";
  return "wide";
}

export function workspaceGeometry(
  mode: ResponsiveMode,
  drawerOpen: boolean,
): {
  panelReservedWidth: number;
  rightObstruction: number;
} {
  if (mode === "narrow") {
    return {
      panelReservedWidth: 0,
      rightObstruction: drawerOpen ? WORKSPACE_DRAWER_WIDTH : 0,
    };
  }
  return {
    panelReservedWidth: WORKSPACE_PANEL_WIDTH,
    rightObstruction: 0,
  };
}
