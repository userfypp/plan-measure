import type { Tool } from "../../types/domain";
import {
  getShortcutLabel,
  getToolShortcutLabel,
  viewerShortcuts,
  type ToolShortcut,
} from "../../utils/keyboard";

export type ToolIconName =
  "select" | "hand" | "line" | "polyline" | "polygon" | "calibrate" | "orthogonal";

export interface ToolDefinition {
  id: Tool | "orthogonal";
  label: string;
  description: string;
  shortcut: string | null;
  icon: ToolIconName;
  inRail: boolean;
}

export interface ToolAvailability {
  enabled: boolean;
  disabledReason?: string;
}

export type ToolAvailabilityMap = Partial<Record<ToolDefinition["id"], ToolAvailability>>;

function shortcutLabelForTool(tool: ToolShortcut): string {
  return (
    viewerShortcuts.find(
      (shortcut) => typeof shortcut.action !== "string" && shortcut.action.tool === tool,
    )?.label ?? tool
  );
}

/**
 * The viewer's chrome reads this registry for labels, icons, and shortcuts.
 * Keyboard dispatch itself remains owned by utils/keyboard.ts.
 */
export const toolRegistry: readonly ToolDefinition[] = [
  {
    id: "select",
    label: shortcutLabelForTool("select"),
    description: "Select and edit measurements",
    shortcut: getToolShortcutLabel("select"),
    icon: "select",
    inRail: true,
  },
  {
    id: "hand",
    label: shortcutLabelForTool("hand"),
    description: "Pan the page",
    shortcut: getToolShortcutLabel("hand"),
    icon: "hand",
    inRail: true,
  },
  {
    id: "line",
    label: shortcutLabelForTool("line"),
    description: "Draw a two-point line",
    shortcut: getToolShortcutLabel("line"),
    icon: "line",
    inRail: true,
  },
  {
    id: "polyline",
    label: shortcutLabelForTool("polyline"),
    description: "Draw an open polyline",
    shortcut: getToolShortcutLabel("polyline"),
    icon: "polyline",
    inRail: true,
  },
  {
    id: "polygon",
    label: shortcutLabelForTool("polygon"),
    description: "Draw a closed polygon",
    shortcut: getToolShortcutLabel("polygon"),
    icon: "polygon",
    inRail: true,
  },
  {
    id: "calibrate",
    label: "Calibrate",
    description: "Select two points for a scale reference",
    shortcut: null,
    icon: "calibrate",
    inRail: false,
  },
  {
    id: "orthogonal",
    label: "Ortho",
    description: "Constrain drawing segments to horizontal or vertical",
    shortcut: getShortcutLabel("toggle-orthogonal"),
    icon: "orthogonal",
    inRail: true,
  },
];

export const toolRailRegistry = toolRegistry.filter((tool) => tool.inRail);

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

export function getToolDefinition(tool: Tool): ToolDefinition {
  return toolRegistry.find((definition) => definition.id === tool) ?? toolRegistry[0]!;
}
