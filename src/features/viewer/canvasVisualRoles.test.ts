import { describe, expect, it } from "vitest";
import {
  CANVAS_VISUAL_METRICS,
  canvasInteractionTargetScreenPx,
  circularHandleHitStrokeWidthScreenPx,
  contrastRatio,
  LABEL_TEXT_COLORS,
  labelTextPaint,
  resolveCanvasVisualRoles,
  resolveLabelColors,
  scaleFillAlpha,
  scaledAlpha,
  scaledHandleRadiusScreenPx,
} from "./canvasVisualRoles";
import { LABEL_BACKGROUND_OPACITY, type LabelTextColor } from "../../utils/appPreferences";

/** The opaque color a translucent color shows over white paper. */
function overWhite(color: string, alpha: number) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
  return `#${channels
    .map((channel) =>
      Math.round(channel * alpha + 255 * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

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
      pageGrid: "#6b7280",
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
    const colors = { text: "#ffffff", background: "#242a31" };
    expect(labelTextPaint(colors, 0.75, 2)).toEqual({ fill: "#ffffff" });
    expect(labelTextPaint(colors, 0, 2)).toEqual({
      fill: "#ffffff",
      stroke: "#242a31",
      strokeWidth: 1.5,
      fillAfterStrokeEnabled: true,
    });
  });

  it("measures WCAG contrast", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  it("keeps automatic label text readable over the plan for every background", () => {
    const roles = resolveCanvasVisualRoles("light");
    // Solid and translucent: white text on the dark label.
    for (const opacity of [LABEL_BACKGROUND_OPACITY.solid, LABEL_BACKGROUND_OPACITY.translucent]) {
      expect(resolveLabelColors(roles, "auto", opacity)).toEqual({
        text: roles.labelText,
        background: roles.labelBackground,
      });
    }
    // None: the plan shows through, so dark text inside a light halo.
    expect(resolveLabelColors(roles, "auto", LABEL_BACKGROUND_OPACITY.none)).toEqual({
      text: roles.labelBackground,
      background: roles.labelText,
    });
    expect(resolveCanvasVisualRoles("dark").labelText).toBe(roles.labelText);
  });

  it("keeps AA contrast on a translucent label over white paper", () => {
    const roles = resolveCanvasVisualRoles("light");
    // An unselected label draws its background at 88 % of the preference opacity.
    const opacity = 0.88 * LABEL_BACKGROUND_OPACITY.translucent;
    const names = ["auto", ...Object.keys(LABEL_TEXT_COLORS)] as LabelTextColor[];
    for (const name of names) {
      const colors = resolveLabelColors(roles, name, opacity);
      const background = overWhite(colors.background, opacity);
      expect(contrastRatio(colors.text, background), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("pairs every chosen label color with an AA background in every mode", () => {
    const roles = resolveCanvasVisualRoles("light");
    for (const [name, color] of Object.entries(LABEL_TEXT_COLORS)) {
      for (const opacity of Object.values(LABEL_BACKGROUND_OPACITY)) {
        const colors = resolveLabelColors(roles, name as keyof typeof LABEL_TEXT_COLORS, opacity);
        expect(colors.text, name).toBe(color);
        expect(contrastRatio(colors.text, colors.background), name).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(resolveLabelColors(roles, "black", 1).background).toBe(roles.labelText);
    expect(resolveLabelColors(roles, "white", 1).background).toBe(roles.labelBackground);
  });
});
