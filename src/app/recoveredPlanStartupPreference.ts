import type { WorkspaceModule } from "./workspaceState";

export type RecoveredPlanStartupWorkspace = Extract<
  WorkspaceModule,
  "scales" | "measurements" | "classifications"
>;

export const RECOVERED_PLAN_STARTUP_WORKSPACE_STORAGE_KEY =
  "plan-measure.recovered-plan-startup-workspace";

export function sanitizeRecoveredPlanStartupWorkspace(
  value: string | null,
): RecoveredPlanStartupWorkspace {
  return value === "measurements" || value === "classifications" || value === "scales"
    ? value
    : "scales";
}

export function readRecoveredPlanStartupWorkspacePreference(): RecoveredPlanStartupWorkspace {
  try {
    return sanitizeRecoveredPlanStartupWorkspace(
      window.localStorage.getItem(RECOVERED_PLAN_STARTUP_WORKSPACE_STORAGE_KEY),
    );
  } catch {
    return "scales";
  }
}

export function writeRecoveredPlanStartupWorkspacePreference(
  workspace: RecoveredPlanStartupWorkspace,
): void {
  try {
    window.localStorage.setItem(RECOVERED_PLAN_STARTUP_WORKSPACE_STORAGE_KEY, workspace);
  } catch {
    // The preference remains usable for this page even if browser storage is unavailable.
  }
}
