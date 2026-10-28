import { describe, expect, it } from "vitest";
import {
  CLOUD_COLOR_PALETTE,
  CLOUD_FILL_OPACITY,
  DEFAULT_CLOUD_COLOR,
  hexToRgb,
  isCloudColor,
  resolveCloudColor,
  withHexAlpha,
} from "./cloudColors";

describe("cloud color palette", () => {
  it("has unique lowercase RGB colors and labels, including the default", () => {
    const colors = CLOUD_COLOR_PALETTE.map(({ value }) => value);
    const labels = CLOUD_COLOR_PALETTE.map(({ label }) => label);
    expect(colors.length).toBeGreaterThan(0);
    expect(new Set(colors).size).toBe(colors.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const { value, label } of CLOUD_COLOR_PALETTE) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
      expect(label.trim()).not.toBe("");
      expect(isCloudColor(value)).toBe(true);
      expect(resolveCloudColor(value)).toBe(value);
    }
    expect(colors).toContain(DEFAULT_CLOUD_COLOR);
    expect(DEFAULT_CLOUD_COLOR).toBe("#d92d20");
    expect(CLOUD_FILL_OPACITY).toBe(0.08);
  });

  it.each([undefined, null, "", "#D92D20", "#000000", "red", 42, {}])(
    "rejects a value outside the palette: %s",
    (value) => expect(isCloudColor(value)).toBe(false),
  );

  it.each([undefined, "", "#D92D20", "#000000", "red"])(
    "falls back to review red for %s",
    (value) => expect(resolveCloudColor(value)).toBe("#d92d20"),
  );
});

describe("hexToRgb", () => {
  it.each<[string, { r: number; g: number; b: number }]>([
    ["#000000", { r: 0, g: 0, b: 0 }],
    ["#ffffff", { r: 255, g: 255, b: 255 }],
    ["#d92d20", { r: 217, g: 45, b: 32 }],
    ["#01AbF0", { r: 1, g: 171, b: 240 }],
  ])("converts %s into separate channels", (color, expected) => {
    expect(hexToRgb(color)).toEqual(expected);
  });
});

describe("withHexAlpha", () => {
  it.each<[number, string]>([
    [0, "00"],
    [1, "ff"],
    [0.5, "80"],
    [0.08, "14"],
    [0.01, "03"],
    [-0.5, "00"],
    [1.5, "ff"],
    [-Infinity, "00"],
    [Infinity, "ff"],
    [NaN, "00"],
  ])("rounds and clamps alpha %s to %s", (alpha, suffix) => {
    expect(withHexAlpha("#d92d20", alpha)).toBe(`#d92d20${suffix}`);
  });
});
