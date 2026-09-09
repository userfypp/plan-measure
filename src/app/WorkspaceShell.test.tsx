import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceShell } from "./WorkspaceShell";

const noop = () => undefined;

describe("WorkspaceShell layout", () => {
  it("renders one Workspace Panel to the left of the existing tool rail and viewer", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceShell
        dragActive={false}
        onDragEnter={noop}
        onDragOver={noop}
        onDragLeave={noop}
        onDrop={noop}
        workspacePanel={<div>Workspace panel</div>}
        toolRail={<div>Tools</div>}
        viewer={<div>PDF</div>}
      />,
    );

    expect(markup).toContain('data-layout-slot="workspace-panel-host"');
    expect(markup).toContain('data-layout-slot="left-rail"');
    expect(markup).not.toContain("selection-inspector");
    expect(markup).not.toContain("secondary-panel");
    expect(markup).toContain("Workspace panel");
    expect(markup).toContain("Tools");
    expect(markup).toContain("PDF");
  });
});
