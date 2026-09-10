import { describe, expect, it } from "vitest";
import {
  responsiveModeForWidth,
  workspaceGeometry,
  WORKSPACE_DRAWER_WIDTH,
  WORKSPACE_PANEL_WIDTH,
} from "./responsiveLayout";

describe("responsiveLayout", () => {
  it.each([
    [1440, "wide"],
    [1025, "wide"],
    [1024, "compact"],
    [900, "compact"],
    [820, "compact"],
    [801, "compact"],
    [800, "narrow"],
    [768, "narrow"],
    [480, "narrow"],
  ] as const)("maps %dpx to %s", (width, mode) => {
    expect(responsiveModeForWidth(width)).toBe(mode);
  });

  it("keeps the 288px panel docked outside Narrow", () => {
    expect(workspaceGeometry("wide", false)).toEqual({
      panelReservedWidth: WORKSPACE_PANEL_WIDTH,
      rightObstruction: 0,
    });
    expect(workspaceGeometry("compact", true)).toEqual({
      panelReservedWidth: WORKSPACE_PANEL_WIDTH,
      rightObstruction: 0,
    });
    expect(WORKSPACE_PANEL_WIDTH).toBe(288);
  });

  it("turns the same panel into a non-reserving 304px Narrow obstruction only while open", () => {
    expect(workspaceGeometry("narrow", false)).toEqual({
      panelReservedWidth: 0,
      rightObstruction: 0,
    });
    expect(workspaceGeometry("narrow", true)).toEqual({
      panelReservedWidth: 0,
      rightObstruction: WORKSPACE_DRAWER_WIDTH,
    });
    expect(WORKSPACE_DRAWER_WIDTH).toBe(304);
  });
});
