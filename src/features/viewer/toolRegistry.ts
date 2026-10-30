import type { Tool } from "../../types/domain";
import type { ActionId } from "../../utils/shortcuts/bindings";

export type ToolIconName =
  | "select"
  | "hand"
  | "line"
  | "polyline"
  | "polygon"
  | "rectangle"
  | "ellipse"
  | "cloud"
  | "count"
  | "calibrate"
  | "orthogonal"
  | "snap";

export interface ToolDefinition {
  id: Tool | "orthogonal" | "snap";
  label: string;
  description: string;
  /** The customizable shortcut that selects or toggles it; null while none is wired. */
  actionId: ActionId | null;
  icon: ToolIconName;
  inRail: boolean;
}

export interface ToolAvailability {
  enabled: boolean;
  disabledReason?: string;
}

export type ToolAvailabilityMap = Partial<Record<ToolDefinition["id"], ToolAvailability>>;

/**
 * The viewer's chrome reads this registry for labels, icons, and shortcut ids.
 * The keys behind `actionId` live in the shortcut store (utils/shortcuts).
 */
export const toolRegistry: readonly ToolDefinition[] = [
  {
    id: "select",
    label: "Select",
    description: "Select and edit measurements",
    actionId: "tool.select",
    icon: "select",
    inRail: true,
  },
  {
    id: "hand",
    label: "Hand",
    description: "Pan the page",
    actionId: "tool.hand",
    icon: "hand",
    inRail: true,
  },
  {
    id: "line",
    label: "Line",
    description: "Draw a two-point line",
    actionId: "tool.line",
    icon: "line",
    inRail: true,
  },
  {
    id: "polyline",
    label: "Polyline",
    description: "Draw an open polyline",
    actionId: "tool.polyline",
    icon: "polyline",
    inRail: true,
  },
  {
    id: "polygon",
    label: "Polygon",
    description: "Draw a closed polygon",
    actionId: "tool.polygon",
    icon: "polygon",
    inRail: true,
  },
  {
    id: "rectangle",
    label: "Rectangle",
    description: "Draw a rectangle from two opposite corners (Shift for a square)",
    actionId: "tool.rectangle",
    icon: "rectangle",
    inRail: true,
  },
  {
    id: "ellipse",
    label: "Ellipse",
    description: "Draw an ellipse inside a bounding box (Shift for a circle)",
    actionId: "tool.ellipse",
    icon: "ellipse",
    inRail: true,
  },
  {
    id: "cloud",
    label: "Cloud",
    description: "Draw a closed revision cloud",
    actionId: "tool.cloud",
    icon: "cloud",
    inRail: true,
  },
  {
    id: "count",
    label: "Count",
    description: "Mark multiple items in a count without a scale",
    actionId: "tool.count",
    icon: "count",
    inRail: true,
  },
  {
    id: "calibrate",
    label: "Calibrate",
    description: "Select two points for a scale reference",
    actionId: null,
    icon: "calibrate",
    inRail: false,
  },
  {
    id: "orthogonal",
    label: "Ortho",
    description: "Constrain drawing segments to horizontal or vertical",
    actionId: "mode.orthogonal",
    icon: "orthogonal",
    inRail: false,
  },
  {
    id: "snap",
    label: "Snap",
    description: "Snap new measurement points to visible measurement geometry",
    actionId: "mode.snap",
    icon: "snap",
    inRail: false,
  },
];

export const toolRailRegistry = toolRegistry.filter((tool) => tool.inRail);

export function getToolRailVerticalNeighbor(
  toolId: ToolDefinition["id"],
  direction: "up" | "down",
): ToolDefinition["id"] | null {
  const index = toolRailRegistry.findIndex((definition) => definition.id === toolId);
  if (index < 0 || toolRailRegistry.length === 0) return null;
  const step = direction === "up" ? -1 : 1;
  return (
    toolRailRegistry[(index + step + toolRailRegistry.length) % toolRailRegistry.length]?.id ?? null
  );
}

export function getToolAvailabilityState(
  definition: ToolDefinition,
  availability: ToolAvailabilityMap,
): { disabled: boolean; disabledReason: string } {
  const capability = availability[definition.id];
  return {
    disabled: capability?.enabled === false,
    disabledReason: capability?.disabledReason ?? definition.description,
  };
}
