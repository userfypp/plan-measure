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

  it("keeps a viewer dialog above the keyboard help and scale check feedback", () => {
    const viewerCss = readFileSync(
      new URL("../features/viewer/PdfViewer.module.css", import.meta.url),
      "utf8",
    );
    const layer = (css: string, selector: string) =>
      css.match(new RegExp(`\\${selector}\\s*\\{[^}]*z-index:\\s*var\\((--z-[a-z]+)\\)`, "s"))?.[1];
    const order = ["--z-raised", "--z-controls", "--z-feedback", "--z-cursor", "--z-panel"];
    const shield = order.indexOf(layer(shellCss, ".viewerInteractionShield")!);
    expect(shield).toBeGreaterThan(order.indexOf(layer(viewerCss, ".keyboardFeedback")!));
    expect(shield).toBeGreaterThan(order.indexOf("--z-feedback"));
  });
});
