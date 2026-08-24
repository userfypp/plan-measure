import { describe, expect, it } from "vitest";
import { getToolShortcutLabel, type ToolShortcut } from "../../utils/keyboard";
import {
  getToolAvailabilityState,
  getToolDefinition,
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
    ]);
    expect(toolRegistry.find((tool) => tool.id === "calibrate")?.inRail).toBe(false);
  });

  it("derives rail shortcuts from the existing keyboard registry", () => {
    for (const tool of toolRailRegistry) {
      if (tool.id === "orthogonal") {
        expect(tool.shortcut).toBe("O");
      } else {
        expect(tool.shortcut).toBe(getToolShortcutLabel(tool.id as ToolShortcut));
      }
    }
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
