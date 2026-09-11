// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(new URL("../../styles/global.css", import.meta.url), "utf8");
const buttonCss = readFileSync(new URL("./Button.module.css", import.meta.url), "utf8");
const iconButtonCss = readFileSync(new URL("./IconButton.module.css", import.meta.url), "utf8");
const menuCss = readFileSync(new URL("./AnchoredMenu.module.css", import.meta.url), "utf8");
const scalesCss = readFileSync(
  new URL("../../features/calibration/ScalesWorkspace.module.css", import.meta.url),
  "utf8",
);
const measurementRowCss = readFileSync(
  new URL("../../features/measurements/MeasurementRow.module.css", import.meta.url),
  "utf8",
);

describe("shared interactive-state contract", () => {
  it("uses a pointer for available buttons without overriding disabled semantics", () => {
    expect(globalCss).toMatch(
      /button:not\(:disabled\):not\(\[aria-disabled="true"\]\)\s*\{[^}]*cursor:\s*pointer;/s,
    );
    expect(globalCss).toMatch(
      /button:disabled,\s*button\[aria-disabled="true"\]\s*\{[^}]*cursor:\s*not-allowed;/s,
    );
    expect(globalCss).not.toContain("cursor: default !important");
    expect(globalCss).not.toMatch(/button[^{]*\*\s*\{[^}]*cursor:/s);
  });

  it("keeps neutral Button hover and active states distinct through shared surface and border roles", () => {
    expect(buttonCss).toMatch(
      /\.ghost:hover[^}]*background-color:\s*var\(--color-control-hover-surface\);[^}]*border-color:\s*var\(--color-control-hover-border\);/s,
    );
    expect(buttonCss).toMatch(
      /\.ghost:active[^}]*background-color:\s*var\(--color-control-active-surface\);[^}]*border-color:\s*var\(--color-control-active-border\);/s,
    );
  });

  it("preserves IconButton selected state while distinguishing selected hover and active", () => {
    expect(iconButtonCss).toMatch(
      /\.button\.pressed:hover[^}]*background-color:\s*var\(--color-selected\);[^}]*border-color:\s*var\(--color-control-hover-border\);/s,
    );
    expect(iconButtonCss).toMatch(
      /\.button\.pressed:active[^}]*background-color:\s*var\(--color-selected\);[^}]*border-color:\s*var\(--color-control-active-border\);/s,
    );
  });

  it("does not suppress the shared IconButton border on measurement visibility controls", () => {
    expect(measurementRowCss).toMatch(
      /\.actions \.visibilityButton\s*\{[^}]*border-color:\s*transparent;/s,
    );
    expect(measurementRowCss).not.toMatch(
      /\.actions \.visibilityButton\s*\{[^}]*border:\s*0;/s,
    );
  });

  it("gives menu items the shared hover/active language and preserves expanded disclosure state", () => {
    expect(menuCss).toMatch(
      /\.item:hover[^}]*border-color:\s*var\(--color-control-hover-border\);[^}]*background:\s*var\(--color-control-hover-surface\);/s,
    );
    expect(menuCss).toMatch(
      /\.item:active[^}]*border-color:\s*var\(--color-control-active-border\);[^}]*background:\s*var\(--color-control-active-surface\);/s,
    );
    expect(menuCss).toMatch(/\.item\[aria-disabled="true"\][^}]*cursor:\s*not-allowed;/s);
    expect(menuCss).not.toContain("!important");
    expect(scalesCss).toMatch(
      /\.disclosureButton\[aria-expanded="true"\]:hover[^}]*background:\s*var\(--color-selection-surface\);/s,
    );
    expect(scalesCss).toMatch(
      /\.disclosureButton\[aria-expanded="true"\]:active[^}]*background:\s*var\(--color-selection-surface\);/s,
    );
  });
});
