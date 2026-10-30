import type { ActionId } from "../utils/shortcuts/bindings";
import type { WorkspaceModule } from "./workspaceState";

/** The workspace modules in switcher order. */
export const WORKSPACE_MODULES: Array<{ id: WorkspaceModule; label: string }> = [
  { id: "measurements", label: "Measurements" },
  { id: "takeoff", label: "Takeoff" },
  { id: "classifications", label: "Classifications" },
  { id: "scales", label: "Scales" },
];

/** The module a workspace shortcut selects: a direct jump, or a step through the list that wraps. */
export function workspaceModuleForAction(
  action: ActionId,
  current: WorkspaceModule,
): WorkspaceModule | null {
  if (action === "workspace.next" || action === "workspace.previous") {
    const count = WORKSPACE_MODULES.length;
    const step = action === "workspace.next" ? 1 : -1;
    const index = WORKSPACE_MODULES.findIndex((candidate) => candidate.id === current);
    return WORKSPACE_MODULES[(index + step + count) % count]!.id;
  }
  return WORKSPACE_MODULES.find((candidate) => action === `workspace.${candidate.id}`)?.id ?? null;
}
