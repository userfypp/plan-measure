import { ACTION_IDS, type ActionId } from "../../utils/shortcuts/bindings";

/** Groups of the Shortcuts panel, in display order. */
export const SHORTCUT_GROUPS = [
  "Tools",
  "Drawing aids",
  "Edit",
  "Measurement",
  "View",
  "Pages",
  "Workspaces",
  "App",
] as const;

export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

/** The read-only group that lists the keys no preset or user binding can take. */
export const FIXED_KEYS_GROUP = "Fixed keys";

export interface ActionCatalogEntry {
  readonly id: ActionId;
  /** The wording used on screen (toolbar, dock and workspace switcher). */
  readonly label: string;
  readonly group: ShortcutGroup;
  readonly description: string;
}

const DEFINITIONS: Readonly<Record<ActionId, Omit<ActionCatalogEntry, "id">>> = {
  "tool.select": {
    label: "Select",
    group: "Tools",
    description: "Select and edit measurements",
  },
  "tool.hand": { label: "Hand", group: "Tools", description: "Pan the page by dragging" },
  "tool.line": { label: "Line", group: "Tools", description: "Draw a two-point line" },
  "tool.polyline": { label: "Polyline", group: "Tools", description: "Draw an open polyline" },
  "tool.polygon": { label: "Polygon", group: "Tools", description: "Draw a closed polygon" },
  "tool.rectangle": {
    label: "Rectangle",
    group: "Tools",
    description: "Draw a rectangle from two opposite corners",
  },
  "tool.ellipse": {
    label: "Ellipse",
    group: "Tools",
    description: "Draw an ellipse inside a bounding box",
  },
  "tool.cloud": { label: "Cloud", group: "Tools", description: "Draw a closed revision cloud" },
  "tool.count": { label: "Count", group: "Tools", description: "Mark multiple items in a count" },
  "tool.calibrate": {
    label: "Calibrate",
    group: "Tools",
    description: "Pick two points to set a scale reference",
  },
  "mode.orthogonal": {
    label: "Ortho",
    group: "Drawing aids",
    description: "Turn constraining segments to horizontal or vertical on or off",
  },
  "mode.snap": {
    label: "Snap",
    group: "Drawing aids",
    description: "Turn snapping to visible measurement geometry on or off",
  },
  "edit.undo": { label: "Undo", group: "Edit", description: "Undo the last change" },
  "edit.redo": { label: "Redo", group: "Edit", description: "Redo the last undone change" },
  "edit.copy": { label: "Copy", group: "Edit", description: "Copy the selected measurements" },
  "edit.paste": { label: "Paste", group: "Edit", description: "Paste the copied measurements" },
  "edit.delete": {
    label: "Delete",
    group: "Edit",
    description: "Delete the selected measurements",
  },
  "edit.duplicate": {
    label: "Duplicate",
    group: "Edit",
    description: "Duplicate the selected measurements",
  },
  "edit.rename": {
    label: "Rename",
    group: "Edit",
    description: "Rename the selected measurement",
  },
  "measurement.toggleDetails": {
    label: "Details",
    group: "Measurement",
    description: "Open the details of the selected measurement",
  },
  "measurement.toggleVisibility": {
    label: "Show or hide",
    group: "Measurement",
    description: "Hide or show the selected measurements on the plan",
  },
  "view.zoomIn": { label: "Zoom in", group: "View", description: "Zoom in on the page" },
  "view.zoomOut": { label: "Zoom out", group: "View", description: "Zoom out of the page" },
  "view.fitPage": {
    label: "Fit page",
    group: "View",
    description: "Fit the whole page in the view",
  },
  "view.fitWidth": {
    label: "Fit width",
    group: "View",
    description: "Fit the page width to the view",
  },
  "view.actualSize": {
    label: "Actual size",
    group: "View",
    description: "Show the page at its actual size",
  },
  "page.previous": {
    label: "Previous page",
    group: "Pages",
    description: "Go to the previous page",
  },
  "page.next": { label: "Next page", group: "Pages", description: "Go to the next page" },
  "page.first": { label: "First page", group: "Pages", description: "Go to the first page" },
  "page.last": { label: "Last page", group: "Pages", description: "Go to the last page" },
  "page.panel": { label: "Pages", group: "Pages", description: "Open or close the Pages panel" },
  "workspace.next": {
    label: "Next workspace",
    group: "Workspaces",
    description: "Switch to the next workspace",
  },
  "workspace.previous": {
    label: "Previous workspace",
    group: "Workspaces",
    description: "Switch to the previous workspace",
  },
  "workspace.measurements": {
    label: "Measurements",
    group: "Workspaces",
    description: "Open the Measurements workspace",
  },
  "workspace.takeoff": {
    label: "Takeoff",
    group: "Workspaces",
    description: "Open the Takeoff workspace",
  },
  "workspace.classifications": {
    label: "Classifications",
    group: "Workspaces",
    description: "Open the Classifications workspace",
  },
  "workspace.scales": {
    label: "Scales",
    group: "Workspaces",
    description: "Open the Scales workspace",
  },
  "app.projects": { label: "Projects", group: "App", description: "Open the saved projects" },
  "app.export": { label: "Export", group: "App", description: "Open the export options" },
  "app.settings": { label: "Settings", group: "App", description: "Open the settings" },
  "app.toggleTheme": {
    label: "Toggle theme",
    group: "App",
    description: "Switch between the light and dark appearance",
  },
};

/** Every action in panel order: by group, then by the stable action order. */
export const CATALOG: readonly ActionCatalogEntry[] = Object.freeze(
  SHORTCUT_GROUPS.flatMap((group) =>
    ACTION_IDS.filter((id) => DEFINITIONS[id].group === group).map((id) =>
      Object.freeze({ id, ...DEFINITIONS[id] }),
    ),
  ),
);

export const CATALOG_BY_ID: Readonly<Record<ActionId, ActionCatalogEntry>> = Object.freeze(
  Object.fromEntries(CATALOG.map((entry) => [entry.id, entry])) as Record<
    ActionId,
    ActionCatalogEntry
  >,
);

export interface FixedKeyRow {
  readonly id: string;
  readonly label: string;
  /** Key caps as shown to the user; alternatives of the same row are listed side by side. */
  readonly keys: readonly string[];
  readonly description: string;
  /** The `RESERVED` combos the row stands for, so a test can keep both lists in sync. */
  readonly combos: readonly string[];
}

/**
 * Keys that handle themselves and cannot be rebound, shown read-only in the
 * "Fixed keys" group. They mirror the viewer's fixed handler (pan, finish,
 * cancel) and the keyboard drawing and editing handler.
 */
export const FIXED_KEYS: readonly FixedKeyRow[] = Object.freeze([
  {
    id: "pan",
    label: "Pan",
    keys: ["Space"],
    description: "Hold to pan the page with any tool",
    combos: ["Space"],
  },
  {
    id: "place",
    label: "Place point or select",
    keys: ["Space"],
    description:
      "With keyboard drawing and editing on, place a point or select the measurement at the keyboard cursor",
    combos: ["Space"],
  },
  {
    id: "extend-selection",
    label: "Add to selection",
    keys: ["Shift+Space"],
    description:
      "With keyboard drawing and editing on, add the measurement at the keyboard cursor to the selection",
    combos: ["Shift+Space"],
  },
  {
    id: "finish",
    label: "Finish",
    keys: ["Enter"],
    description:
      "Complete the path in progress, save a keyboard edit, or leave the tool when nothing is in progress",
    combos: ["Enter"],
  },
  {
    id: "cancel",
    label: "Cancel",
    keys: ["Esc"],
    description: "Cancel the drawing, calibration or keyboard edit in progress, or leave the tool",
    combos: ["Escape"],
  },
  {
    id: "move",
    label: "Move",
    keys: ["Arrow keys"],
    description:
      "With keyboard drawing and editing on, move the keyboard cursor, preview an edit, or pan with the Hand tool",
    combos: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"],
  },
  {
    id: "move-fast",
    label: "Move faster",
    keys: ["Shift+Arrow keys"],
    description: "Move or pan in larger steps; holding an arrow key also accelerates",
    combos: ["Shift+ArrowLeft", "Shift+ArrowRight", "Shift+ArrowUp", "Shift+ArrowDown"],
  },
  {
    id: "edit-selection",
    label: "Edit selection",
    keys: ["E"],
    description:
      "With keyboard drawing and editing on, start editing the selected measurement from the Select tool",
    combos: ["E", "Shift+E"],
  },
  {
    id: "next-point",
    label: "Next edit point",
    keys: ["N", "]"],
    description: "While keyboard editing, move to the next point of the measurement",
    combos: ["N", "]"],
  },
  {
    id: "previous-point",
    label: "Previous edit point",
    keys: ["Shift+N", "["],
    description: "While keyboard editing, move to the previous point of the measurement",
    combos: ["Shift+N", "["],
  },
  {
    id: "focus",
    label: "Move focus",
    keys: ["Tab", "Shift+Tab"],
    description: "Move keyboard focus to the next or previous control",
    combos: ["Tab", "Shift+Tab"],
  },
]);

/**
 * Lowercase text a panel search matches against: the label, the group and the
 * keys as shown, so "line", "edit" and "ctrl+z" all find their rows.
 */
export function buildSearchText(label: string, group: string, keys: readonly string[]): string {
  return [label, group, ...keys].join(" ").toLowerCase();
}
