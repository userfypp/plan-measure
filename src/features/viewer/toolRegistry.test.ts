import { describe, expect, it } from "vitest";
import { getToolShortcutLabel, type ToolShortcut } from "../../utils/keyboard";
import {
  getToolAvailabilityState,
  getToolDefinition,
  getToolRailVerticalNeighbor,
  toolRailRegistry,
  toolRegistry,
} from "./toolRegistry";

describe("viewer tool registry", () => {
  it("keeps the frequent-tool rail ordered and separate from calibration", () => {
    expect(toolRailRegistry.map((tool) => tool.id)).toEqual([
      "select",
      "hand",
      "line",
      "polyline",
      "polygon",
    ]);
    expect(toolRegistry.find((tool) => tool.id === "calibrate")?.inRail).toBe(false);
    expect(toolRegistry.find((tool) => tool.id === "orthogonal")?.inRail).toBe(false);
    expect(toolRegistry.find((tool) => tool.id === "snap")?.inRail).toBe(false);
  });

  it("derives rail shortcuts from the existing keyboard registry", () => {
    for (const tool of toolRailRegistry) {
      expect(tool.shortcut).toBe(getToolShortcutLabel(tool.id as ToolShortcut));
    }
  });

  it("keeps vertical keyboard navigation aligned with the compact five-tool rail", () => {
    expect(getToolRailVerticalNeighbor("select", "down")).toBe("hand");
    expect(getToolRailVerticalNeighbor("hand", "down")).toBe("line");
    expect(getToolRailVerticalNeighbor("line", "down")).toBe("polyline");
    expect(getToolRailVerticalNeighbor("polyline", "down")).toBe("polygon");
    expect(getToolRailVerticalNeighbor("polygon", "down")).toBe("select");
    expect(getToolRailVerticalNeighbor("select", "up")).toBe("polygon");
    expect(getToolRailVerticalNeighbor("snap", "down")).toBeNull();
  });

  it("provides context metadata for the temporary calibration tool", () => {
    expect(getToolDefinition("calibrate")).toMatchObject({
      label: "Calibrate",
      shortcut: null,
      inRail: false,
      icon: "calibrate",
    });
  });

  it("applies coordinator-provided availability without deriving domain state", () => {
    const line = getToolDefinition("line");

    expect(
      getToolAvailabilityState(line, {
        line: { enabled: false, disabledReason: "Add a scale first" },
      }),
    ).toEqual({ disabled: true, disabledReason: "Add a scale first" });
    expect(getToolAvailabilityState(line, { line: { enabled: true } })).toEqual({
      disabled: false,
      disabledReason: line.description,
    });
  });
});
