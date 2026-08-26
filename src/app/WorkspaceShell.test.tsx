import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceShell } from "./WorkspaceShell";

const noop = () => undefined;

describe("WorkspaceShell layout", () => {
  it("renders the inspector inside the left rail below the tools", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceShell
        dragActive={false}
        onDragEnter={noop}
        onDragOver={noop}
        onDragLeave={noop}
        onDrop={noop}
        toolRail={<div>Tools</div>}
        leftPanel={<div>Inspector</div>}
        viewer={<div>PDF</div>}
        secondaryPanel={<div>Right panel</div>}
      />,
    );

    expect(markup).toContain('data-layout-slot="left-rail"');
    expect(markup).toContain('data-layout-slot="selection-inspector"');
    expect(markup).toContain("Tools");
    expect(markup).toContain("PDF");
    expect(markup).toContain("Right panel");
  });
});
