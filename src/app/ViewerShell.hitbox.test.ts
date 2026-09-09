// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellCss = readFileSync(new URL("./ViewerShell.module.css", import.meta.url), "utf8");
const dockCss = readFileSync(
  new URL("../features/viewer/ViewerDock.module.css", import.meta.url),
  "utf8",
);

describe("Viewer Dock hit-testing contract", () => {
  it("lets the full-width measurement wrapper pass input through while the visible Dock remains interactive", () => {
    expect(shellCss).toMatch(/\.dock\s*\{[^}]*pointer-events:\s*none;/s);
    expect(dockCss).toMatch(/\.dock\s*\{[^}]*pointer-events:\s*auto;/s);
  });
});
