/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readRecoveredPlanStartupWorkspacePreference,
  RECOVERED_PLAN_STARTUP_WORKSPACE_STORAGE_KEY,
  writeRecoveredPlanStartupWorkspacePreference,
} from "./recoveredPlanStartupPreference";

describe("recovered plan startup workspace preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to Scales when no preference has been stored", () => {
    expect(readRecoveredPlanStartupWorkspacePreference()).toBe("scales");
  });

  it.each(["scales", "measurements", "takeoff", "classifications"] as const)(
    "persists and restores %s",
    (workspace) => {
      writeRecoveredPlanStartupWorkspacePreference(workspace);
      expect(window.localStorage.getItem(RECOVERED_PLAN_STARTUP_WORKSPACE_STORAGE_KEY)).toBe(
        workspace,
      );
      expect(readRecoveredPlanStartupWorkspacePreference()).toBe(workspace);
    },
  );

  it("falls back to Scales for an unrecognized stored value", () => {
    window.localStorage.setItem(RECOVERED_PLAN_STARTUP_WORKSPACE_STORAGE_KEY, "details");
    expect(readRecoveredPlanStartupWorkspacePreference()).toBe("scales");
  });

  it("falls back to Scales when localStorage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(readRecoveredPlanStartupWorkspacePreference()).toBe("scales");
  });

  it("does not throw when localStorage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() => writeRecoveredPlanStartupWorkspacePreference("measurements")).not.toThrow();
  });
});
