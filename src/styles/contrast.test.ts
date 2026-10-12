// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = (readFileSync(new URL("./tokens.css", import.meta.url), "utf8") as string).replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

type Tokens = Record<string, string>;

function declarations(body: string): Tokens {
  const result: Tokens = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    result[match[1]!] = match[2]!.trim();
  }
  return result;
}

/** Declarations of every rule whose selector list contains exactly `selector`. */
function rule(selector: string): Tokens {
  const result: Tokens = {};
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]!.split(",").map((part) => part.trim());
    if (selectors.includes(selector)) Object.assign(result, declarations(match[2]!));
  }
  return result;
}

const LIGHT_BASE = rule(':root[data-theme="light"]');
const DARK_BASE = rule(':root[data-theme="dark"]');
const LIGHT_MORE = rule(':root[data-contrast="more"]:not([data-theme="dark"])');
const DARK_MORE = rule(':root[data-theme="dark"][data-contrast="more"]');

/** The cascade for each theme in high-contrast mode (the overrides win by specificity). */
const THEMES: Record<string, Tokens> = {
  light: { ...LIGHT_BASE, ...LIGHT_MORE },
  dark: { ...LIGHT_BASE, ...DARK_BASE, ...DARK_MORE },
};

function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
  const [r, g, b] = [1, 3, 5].map((index) => channel(parseInt(hex.slice(index, index + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

const SURFACES = [
  "--color-surface-panel",
  "--color-surface-shell",
  "--color-surface-field",
  "--color-surface-raised",
  "--color-selection-surface",
  "--color-control-hover-surface",
];

const TEXT = [
  "--color-text-primary",
  "--color-text-secondary",
  "--color-text-disabled",
  "--color-accent",
  "--color-accent-hover-semantic",
  "--color-accent-active-semantic",
  "--color-danger-semantic",
  "--color-danger-hover-semantic",
  "--color-danger-active-semantic",
];

const NON_TEXT = [
  "--color-divider",
  "--color-control-hover-border",
  "--color-control-active-border",
  "--color-switch-off-track",
  "--color-focus-semantic",
];

const STATUS = ["info", "success", "warning"];

describe.each(Object.keys(THEMES))("high contrast (%s theme)", (theme) => {
  const tokens = THEMES[theme]!;
  const value = (name: string): string => {
    const found = tokens[name];
    if (!found) throw new Error(`${name} is not defined for the ${theme} theme.`);
    return found;
  };

  it("keeps the override blocks present", () => {
    expect(Object.keys(theme === "light" ? LIGHT_MORE : DARK_MORE).length).toBeGreaterThan(10);
  });

  it.each(TEXT)("%s reaches 4.5:1 on every surface", (name) => {
    for (const surface of SURFACES) {
      expect(contrast(value(name), value(surface)), `${name} on ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it.each(NON_TEXT)("%s reaches 3:1 on the panel", (name) => {
    expect(contrast(value(name), value("--color-surface-panel"))).toBeGreaterThanOrEqual(3);
  });

  it.each(STATUS)("status %s reaches 4.5:1 on its surface and on the panel", (status) => {
    const color = value(`--color-status-${status}`);
    expect(contrast(color, value(`--color-status-${status}-surface`))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color, value("--color-surface-panel"))).toBeGreaterThanOrEqual(4.5);
  });
});
