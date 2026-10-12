import { describe, expect, it } from "vitest";
import {
  CANVAS_VISUAL_METRICS,
  canvasInteractionTargetScreenPx,
  circularHandleHitStrokeWidthScreenPx,
  labelTextPaint,
  resolveCanvasVisualRoles,
  scaleFillAlpha,
  scaledAlpha,
  scaledHandleRadiusScreenPx,
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

describe("canvas preference helpers", () => {
  it("scales fill alpha with a cap and leaves scale 1 and opaque colors untouched", () => {
    expect(scaleFillAlpha("#258a8810", 1)).toBe("#258a8810");
    expect(scaleFillAlpha("#258a8810", 0.5)).toBe("#258a8808");
    expect(scaleFillAlpha("#2465c718", 1.5)).toBe("#2465c724");
    expect(scaleFillAlpha("#2465c7f0", 1.5)).toBe("#2465c7ff");
    expect(scaleFillAlpha("#2465c7", 0.5)).toBe("#2465c7");
    expect(scaledAlpha(0.8, 1.5)).toBe(1);
    expect(scaledAlpha(0.14, 0.5)).toBeCloseTo(0.07);
  });

  it("scales only the visible handle radius, not the hit area", () => {
    expect(scaledHandleRadiusScreenPx(1)).toBe(CANVAS_VISUAL_METRICS.handleRadiusScreenPx);
    expect(scaledHandleRadiusScreenPx(1.5)).toBe(4.5);
    expect(circularHandleHitStrokeWidthScreenPx(32)).toBe(26);
  });

  it("keeps label text unchanged with a background and outlines it without one", () => {
    const roles = resolveCanvasVisualRoles("light");
    expect(labelTextPaint(roles, 0.6, 2)).toEqual({ fill: roles.labelText });
    expect(labelTextPaint(roles, 0, 2)).toMatchObject({
      fill: roles.labelBackground,
      stroke: roles.labelText,
      strokeWidth: 1.5,
    });
  });
});
