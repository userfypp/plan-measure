// @ts-expect-error Vitest executes this contract in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("page browser visual contract", () => {
  it("uses existing tokens, truncates labels and keeps paper rasters contained without animation", () => {
    const css = readFileSync(new URL("./PageBrowser.module.css", import.meta.url), "utf8");
    expect(css).toContain("text-overflow: ellipsis");
    expect(css).toContain("white-space: nowrap");
    expect(css).toContain("object-fit: contain");
    expect(css).toContain("var(--focus-outline)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(css).not.toContain("animation:");
    expect(css).toContain("--geometry-workspace-drawer-width");
  });

  it("clamps portrait and landscape previews inside the fixed thumbnail slot", () => {
    const css = readFileSync(new URL("./PageBrowser.module.css", import.meta.url), "utf8");
    const rule = (selector: string) =>
      css.match(new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`))?.[1] ?? "";
    // A grid track sizes itself to the canvas, so a percentage max-height never clamps a tall page.
    expect(rule(".thumbnail")).toContain("display: flex");
    expect(rule(".thumbnail")).not.toContain("border:");
    expect(rule(".thumbnail canvas")).toContain("max-height: 100%");
    expect(rule(".thumbnail canvas")).toContain("max-width: 100%");
  });
});
