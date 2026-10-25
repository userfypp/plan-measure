// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(new URL("../../styles/global.css", import.meta.url), "utf8");
const tokensCss = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");
const scrollSurfaceCss = readFileSync(new URL("./scrollSurface.css", import.meta.url), "utf8");
const selectCss = readFileSync(new URL("./Select.module.css", import.meta.url), "utf8");
const popoverCss = readFileSync(new URL("./Popover.module.css", import.meta.url), "utf8");
const buttonCss = readFileSync(new URL("./Button.module.css", import.meta.url), "utf8");
const iconButtonCss = readFileSync(new URL("./IconButton.module.css", import.meta.url), "utf8");
const inputCss = readFileSync(new URL("./Input.module.css", import.meta.url), "utf8");
const textareaCss = readFileSync(new URL("./Textarea.module.css", import.meta.url), "utf8");
const switchCss = readFileSync(new URL("./Switch.module.css", import.meta.url), "utf8");
const menuCss = readFileSync(new URL("./AnchoredMenu.module.css", import.meta.url), "utf8");
const disclosureCss = readFileSync(new URL("./Disclosure.module.css", import.meta.url), "utf8");
const measurementRowCss = readFileSync(
  new URL("../../features/measurements/MeasurementRow.module.css", import.meta.url),
  "utf8",
);
const settingsCss = readFileSync(
  new URL("../../app/SettingsDialog.module.css", import.meta.url),
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

  it("keeps native select styling out of the global stylesheet now that every select is the custom Select", () => {
    expect(globalCss).not.toMatch(/(^|[\s,])select\s*[{:,]/m);
  });

  it("keeps OFF switches visibly bounded and gives both switch states transient feedback", () => {
    expect(tokensCss).toContain("--color-switch-off-track:");
    expect(switchCss).toContain("border: 0");
    expect(switchCss).toMatch(/\.track\s*\{[^}]*background-color:\s*var\(--color-switch-off-track\)/s);
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
    expect(switchCss).toMatch(/\.target\s*\{[^}]*width:\s*var\(--switch-width\);[^}]*height:\s*var\(--switch-height\);/s);
    expect(switchCss).toMatch(/\.track\s*\{[^}]*width:\s*var\(--switch-width\);[^}]*height:\s*var\(--switch-height\);/s);
    expect(switchCss).toMatch(
      /@media \(any-pointer: coarse\)\s*\{[^}]*\.target\s*\{[^}]*width:\s*var\(--target-coarse\);[^}]*height:\s*var\(--target-coarse\);/s,
    );
    expect(switchCss).not.toContain("@media (pointer: coarse)");
    expect(switchCss).not.toMatch(/\.target[^}]*cursor:\s*pointer;/s);
    expect(switchCss).not.toMatch(/\.input:hover/);
  });

  it("drops the Appearance segmented control CSS now that it is a Select", () => {
    expect(settingsCss).not.toContain("appearanceOption");
    expect(settingsCss).not.toContain("appearanceGroup");
  });

  it("preserves IconButton selected state while distinguishing selected hover and active", () => {
    expect(iconButtonCss).toMatch(
      /\.button\.pressed:hover[^}]*background-color:\s*var\(--color-selection-surface\);[^}]*border-color:\s*var\(--color-control-hover-border\);/s,
    );
    expect(iconButtonCss).toMatch(
      /\.button\.pressed:active[^}]*background-color:\s*var\(--color-selection-surface\);[^}]*border-color:\s*var\(--color-control-active-border\);/s,
    );
  });

  it("gives the primary IconButton the same accent states as the primary Button", () => {
    expect(iconButtonCss).toMatch(
      /\.primary\s*\{[^}]*background-color:\s*var\(--color-accent\);[^}]*border-color:\s*var\(--color-accent\);/s,
    );
    expect(iconButtonCss).toMatch(
      /\.primary:hover[^}]*background-color:\s*var\(--color-accent-hover-semantic\);[^}]*border-color:\s*var\(--color-accent-hover-semantic\);/s,
    );
    expect(iconButtonCss).toMatch(
      /\.primary:active[^}]*background-color:\s*var\(--color-accent-active-semantic\);[^}]*border-color:\s*var\(--color-accent-active-semantic\);/s,
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
      /\.item:hover[^}]*border-color:\s*transparent;[^}]*background:\s*var\(--color-control-hover-surface\);/s,
    );
    expect(menuCss).toMatch(
      /\.item:active[^}]*border-color:\s*transparent;[^}]*background:\s*var\(--color-control-active-surface\);/s,
    );
    expect(menuCss).toMatch(/\.item\[aria-disabled="true"\][^}]*cursor:\s*not-allowed;/s);
    expect(menuCss).not.toContain("!important");
    expect(disclosureCss).toMatch(
      /\.root\[data-selected\]:has\(> \.header:hover\),\s*\.root\[data-selected\]:has\(> \.header \.toggle:active\)\s*\{[^}]*background-color:\s*var\(--color-selection-surface\);/s,
    );
    expect(disclosureCss).toMatch(
      /\.toggle\s*\{[^}]*min-height:\s*var\(--target-current\);/s,
    );
  });

  it("keeps selection menus compact on fine pointers without reducing the coarse target", () => {
    expect(menuCss).toMatch(/\.item\s*\{[^}]*min-height:\s*var\(--target-current\);/s);
    expect(menuCss).toMatch(/\.selectionMenu \.items\s*\{[^}]*gap:\s*0;/s);
    expect(menuCss).toMatch(
      /\.item\[aria-checked="true"\]:not\(\[aria-disabled="true"\]\),\s*\.item\[aria-current="true"\]:not\(\[aria-disabled="true"\]\)\s*\{[^}]*background:\s*var\(--color-selection-surface\);/s,
    );
    expect(menuCss).not.toMatch(/\.marker|\.selectionCheck/);
    expect(tokensCss).toMatch(/--target-fine:\s*32px;/);
    expect(tokensCss).toMatch(/--target-coarse:\s*44px;/);
    expect(tokensCss).toMatch(
      /@media \(any-pointer: coarse\)\s*\{[^}]*:root\s*\{[^}]*--target-current:\s*var\(--target-coarse\);/s,
    );
  });

  it("gives Textarea the same state contract as Input", () => {
    for (const css of [inputCss, textareaCss]) {
      expect(css).toMatch(/\.control\s*\{[^}]*composes:[^;]*\bfocusRing\b[^;]*from global/s);
      expect(css).toContain(".control:hover:not(:disabled)");
      expect(css).toContain(".control:active:not(:disabled)");
      expect(css).toContain('.control[aria-invalid="true"]:not(:disabled)');
    }
    expect(textareaCss).toMatch(/resize:\s*vertical/);
  });

  it("shares a thin overlay-style scrollbar that never reserves a gutter", () => {
    expect(scrollSurfaceCss).toMatch(/scrollbar-width:\s*thin/);
    expect(scrollSurfaceCss).toMatch(/scrollbar-color:\s*var\(--color-scrollbar-thumb\)\s+transparent/);
    expect(scrollSurfaceCss).not.toContain("scrollbar-gutter");
    expect(tokensCss.match(/--color-scrollbar-thumb:/g)).toHaveLength(2);
    expect(popoverCss).toMatch(/composes:[^;]*\bscrollSurface\b[^;]*from global/);
    expect(selectCss).toMatch(/composes:[^;]*\bscrollSurface\b[^;]*from global/);
  });

  it("keeps the Select trigger as the only hit target so the cursor is uniform", () => {
    expect(selectCss).toMatch(/\.trigger\s*>\s*\*\s*\{[^}]*pointer-events:\s*none/s);
    expect(selectCss).toMatch(/\.trigger\s*\{[^}]*cursor:\s*pointer/s);
  });

  it("mirrors the coarse-pointer sizing under the larger touch targets preference", () => {
    expect(tokensCss).toMatch(
      /:root\[data-targets="large"\]\s*\{[^}]*--target-current:\s*var\(--target-coarse\);[^}]*--control-height-compact:\s*44px;/s,
    );
    expect(switchCss).toMatch(
      /:global\(:root\[data-targets="large"\]\)\s+\.target\s*\{[^}]*width:\s*var\(--target-coarse\);[^}]*height:\s*var\(--target-coarse\);/s,
    );
  });
});
