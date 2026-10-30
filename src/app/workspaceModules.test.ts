import { describe, expect, it } from "vitest";
import { ACTION_IDS } from "../utils/shortcuts/bindings";
import { WORKSPACE_MODULES, workspaceModuleForAction } from "./workspaceModules";

describe("workspaceModuleForAction", () => {
  it("steps through the modules in switcher order and wraps around", () => {
    expect(WORKSPACE_MODULES.map((module) => module.id)).toEqual([
      "measurements",
      "takeoff",
      "classifications",
      "scales",
    ]);

    expect(workspaceModuleForAction("workspace.next", "measurements")).toBe("takeoff");
    expect(workspaceModuleForAction("workspace.next", "takeoff")).toBe("classifications");
    expect(workspaceModuleForAction("workspace.next", "classifications")).toBe("scales");
    expect(workspaceModuleForAction("workspace.next", "scales")).toBe("measurements");
    expect(workspaceModuleForAction("workspace.previous", "scales")).toBe("classifications");
    expect(workspaceModuleForAction("workspace.previous", "measurements")).toBe("scales");
  });

  it("jumps straight to a module, whichever one is open", () => {
    expect(workspaceModuleForAction("workspace.measurements", "scales")).toBe("measurements");
    expect(workspaceModuleForAction("workspace.takeoff", "takeoff")).toBe("takeoff");
    expect(workspaceModuleForAction("workspace.classifications", "measurements")).toBe(
      "classifications",
    );
    expect(workspaceModuleForAction("workspace.scales", "measurements")).toBe("scales");
  });

  it("answers null for every action that is not a workspace one", () => {
    for (const action of ACTION_IDS.filter((id) => !id.startsWith("workspace."))) {
      expect(workspaceModuleForAction(action, "measurements")).toBeNull();
    }
  });
});
