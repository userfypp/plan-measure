// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(new URL("../../styles/global.css", import.meta.url), "utf8");
const tokensCss = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");
const buttonCss = readFileSync(new URL("./Button.module.css", import.meta.url), "utf8");
const iconButtonCss = readFileSync(new URL("./IconButton.module.css", import.meta.url), "utf8");
const switchCss = readFileSync(new URL("./Switch.module.css", import.meta.url), "utf8");
const menuCss = readFileSync(new URL("./AnchoredMenu.module.css", import.meta.url), "utf8");
const scalesCss = readFileSync(
  new URL("../../features/calibration/ScalesWorkspace.module.css", import.meta.url),
  "utf8",
);
const measurementRowCss = readFileSync(
  new URL("../../features/measurements/MeasurementRow.module.css", import.meta.url),
  "utf8",
);
const settingsCss = readFileSync(
  new URL("../../app/SettingsPopover.module.css", import.meta.url),
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

  it("gives enabled native selects distinct hover and active feedback", () => {
    expect(globalCss).toMatch(
      /select:hover:not\(:disabled\)\s*\{[^}]*border-color:\s*var\(--color-control-hover-border\);[^}]*background-color:\s*var\(--color-control-hover-surface\);/s,
    );
    expect(globalCss).toMatch(
      /select:active:not\(:disabled\)\s*\{[^}]*border-color:\s*var\(--color-control-active-border\);[^}]*background-color:\s*var\(--color-control-active-surface\);/s,
    );
  });

  it("keeps OFF switches visibly bounded and gives both switch states transient feedback", () => {
    expect(tokensCss).toContain("--color-switch-off-border:");
    expect(switchCss).toContain("border: var(--border-width) solid var(--color-switch-off-border)");
    expect(switchCss).toContain('.target:not([data-disabled="true"]) .track:hover');
    expect(switchCss).toContain('.target:not([data-disabled="true"]) .track:active');
    expect(switchCss).toContain(
      '.target:not([data-disabled="true"]) .input:checked + .track:hover',
    );
    expect(switchCss).toContain(
      '.target:not([data-disabled="true"]) .input:checked + .track:active',
    );
    expect(switchCss).toContain(".input:focus-visible + .track");
    expect(switchCss).toContain('.target[data-disabled="true"] .track');
  });

  it("keeps fine-pointer switch feedback on the visible track while preserving a coarse target", () => {
    expect(switchCss).toMatch(/\.target\s*\{[^}]*width:\s*36px;[^}]*height:\s*20px;/s);
    expect(switchCss).toMatch(/\.track\s*\{[^}]*width:\s*36px;[^}]*height:\s*20px;/s);
    expect(switchCss).toMatch(
      /@media \(any-pointer: coarse\)\s*\{[^}]*\.target\s*\{[^}]*width:\s*var\(--target-coarse\);[^}]*height:\s*var\(--target-coarse\);/s,
    );
    expect(switchCss).not.toContain("@media (pointer: coarse)");
    expect(switchCss).not.toMatch(/\.target[^}]*cursor:\s*pointer;/s);
    expect(switchCss).not.toMatch(/\.input:hover/);
  });

  it("keeps the selected Appearance segment distinct while still reacting to hover and active", () => {
    expect(settingsCss).toMatch(
      /\.appearanceOption\[aria-checked="true"\]:hover\s*\{[^}]*border-color:\s*var\(--color-control-hover-border\);[^}]*background:\s*var\(--color-selection-surface\);/s,
    );
    expect(settingsCss).toMatch(
      /\.appearanceOption\[aria-checked="true"\]:active\s*\{[^}]*border-color:\s*var\(--color-control-active-border\);[^}]*background:\s*var\(--color-selection-surface\);/s,
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
    expect(measurementRowCss).not.toMatch(/\.actions \.visibilityButton\s*\{[^}]*border:\s*0;/s);
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

  it("keeps selection menus compact on fine pointers without reducing the coarse target", () => {
    expect(menuCss).toMatch(/\.item\s*\{[^}]*min-height:\s*var\(--target-current\);/s);
    expect(menuCss).toMatch(/\.selectionMenu \.items\s*\{[^}]*gap:\s*0;/s);
    expect(menuCss).toMatch(
      /\.selectionMenu \.item\s*\{[^}]*grid-template-columns:\s*var\(--space-12\) minmax\(0, 1fr\);[^}]*gap:\s*var\(--space-4\);[^}]*padding-inline:\s*var\(--space-4\);/s,
    );
    expect(tokensCss).toMatch(/--target-fine:\s*32px;/);
    expect(tokensCss).toMatch(/--target-coarse:\s*44px;/);
    expect(tokensCss).toMatch(
      /@media \(any-pointer: coarse\)\s*\{[^}]*:root\s*\{[^}]*--target-current:\s*var\(--target-coarse\);/s,
    );
  });
});
