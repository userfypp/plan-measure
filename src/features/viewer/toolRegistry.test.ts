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
      "orthogonal",
      "snap",
    ]);
    expect(toolRailRegistry.findIndex((tool) => tool.id === "snap") % 3).toBe(0);
    expect(toolRegistry.find((tool) => tool.id === "calibrate")?.inRail).toBe(false);
  });

  it("derives rail shortcuts from the existing keyboard registry", () => {
    for (const tool of toolRailRegistry) {
      if (tool.id === "orthogonal" || tool.id === "snap") {
        expect(tool.shortcut).toBe(tool.id === "orthogonal" ? "O" : "S");
      } else {
        expect(tool.shortcut).toBe(getToolShortcutLabel(tool.id as ToolShortcut));
      }
    }
  });

  it("keeps vertical keyboard navigation aligned with the actual three-column grid", () => {
    expect(getToolRailVerticalNeighbor("select", "down")).toBe("polyline");
    expect(getToolRailVerticalNeighbor("polyline", "down")).toBe("snap");
    expect(getToolRailVerticalNeighbor("snap", "down")).toBe("select");
    expect(getToolRailVerticalNeighbor("select", "up")).toBe("snap");
    expect(getToolRailVerticalNeighbor("hand", "down")).toBe("polygon");
    expect(getToolRailVerticalNeighbor("polygon", "down")).toBe("hand");
    expect(getToolRailVerticalNeighbor("line", "down")).toBe("orthogonal");
    expect(getToolRailVerticalNeighbor("orthogonal", "down")).toBe("line");
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
