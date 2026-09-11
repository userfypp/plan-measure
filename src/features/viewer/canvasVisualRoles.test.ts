import { describe, expect, it } from "vitest";
import {
  CANVAS_VISUAL_METRICS,
  canvasInteractionTargetScreenPx,
  circularHandleHitStrokeWidthScreenPx,
  resolveCanvasVisualRoles,
} from "./canvasVisualRoles";

describe("V2 canvas visual roles", () => {
  it("maps every governed overlay role to the validated V2 palette", () => {
    expect(resolveCanvasVisualRoles("light")).toEqual({
      theme: "light",
      measurementDefaultStroke: "#258a88",
      measurementDefaultFill: "#258a8810",
      measurementSelectedStroke: "#2465c7",
      measurementSelectedFill: "#2465c718",
      measurementSelectedSoftFill: "#2465c710",
      drawingDraftStroke: "#2465c7",
      drawingDraftFill: "#2465c718",
      calibrationStroke: "#ac7620",
      referenceStroke: "#258a88",
      snapTarget: "#2465c7",
      handleStroke: "#2465c7",
      handleFill: "#ffffff",
      labelText: "#ffffff",
      labelBackground: "#242a31",
      pageHitRegionFill: "rgba(255,255,255,0.001)",
    });
  });

  it("keeps document overlays invariant between Light and Dark while tracking the resolved theme", () => {
    const light = resolveCanvasVisualRoles("light");
    const dark = resolveCanvasVisualRoles("dark");
    const { theme: lightTheme, ...lightOverlay } = light;
    const { theme: darkTheme, ...darkOverlay } = dark;

    expect(lightTheme).toBe("light");
    expect(darkTheme).toBe("dark");
    expect(darkOverlay).toEqual(lightOverlay);
  });

  it("keeps compact optical handles while preserving 32/44 px interaction targets", () => {
    expect(CANVAS_VISUAL_METRICS.handleRadiusScreenPx * 2).toBe(6);
    expect(canvasInteractionTargetScreenPx(false)).toBe(32);
    expect(canvasInteractionTargetScreenPx(true)).toBe(44);

    for (const target of [32, 44]) {
      const hitStroke = circularHandleHitStrokeWidthScreenPx(target);
      expect(CANVAS_VISUAL_METRICS.handleRadiusScreenPx * 2 + hitStroke).toBe(target);
    }
  });
});
