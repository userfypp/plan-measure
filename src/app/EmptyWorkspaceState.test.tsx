/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmptyWorkspaceState, WorkspaceShell } from "./WorkspaceShell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

describe("EmptyWorkspaceState", () => {
  it("names the screen and offers opening a PDF or the sample", () => {
    const onOpenPdf = vi.fn();
    const onOpenSample = vi.fn();
    act(() =>
      root.render(
        <EmptyWorkspaceState onOpenPdf={onOpenPdf} onOpenSample={onOpenSample} disabled={false} />,
      ),
    );
    const region = container.querySelector("section");
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Open a plan to start measuring");
    expect(region?.getAttribute("aria-labelledby")).toBe(heading?.id);
    act(() => button("Open PDF").click());
    act(() => button("Try a sample").click());
    expect(onOpenPdf).toHaveBeenCalledTimes(1);
    expect(onOpenSample).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Files stay in this browser.");
    expect(container.textContent).not.toContain("100 MiB");
    expect(container.querySelector("#start-projects-title")).toBeNull();
  });

  it("disables both actions while the workspace is busy", () => {
    const onOpenPdf = vi.fn();
    act(() =>
      root.render(<EmptyWorkspaceState onOpenPdf={onOpenPdf} onOpenSample={vi.fn()} disabled />),
    );
    expect(button("Open PDF").disabled).toBe(true);
    expect(button("Try a sample").disabled).toBe(true);
    act(() => button("Open PDF").click());
    expect(onOpenPdf).not.toHaveBeenCalled();
  });
});

describe("EmptyWorkspaceState recent projects", () => {
  const make = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `p${index}`,
      name: `Project ${index}`,
      pageCount: index === 0 ? 1 : 3,
      savedAt: 1_700_000_000_000 + index,
      isCurrent: index === 0,
    }));
  const byLabel = (label: string) => {
    const match = [...container.querySelectorAll<HTMLButtonElement>("ul button")].find((row) =>
      row.textContent?.startsWith(label),
    );
    if (!match) throw new Error(`Missing: ${label}`);
    return match;
  };
  const rows = () => container.querySelectorAll("li button");

  function renderWith(props: Partial<Parameters<typeof EmptyWorkspaceState>[0]>) {
    act(() =>
      root.render(
        <EmptyWorkspaceState
          onOpenPdf={vi.fn()}
          onOpenSample={vi.fn()}
          disabled={false}
          {...props}
        />,
      ),
    );
  }

  it("shows no recent projects panel without projects", () => {
    renderWith({ projects: [] });
    expect(container.querySelector("#start-projects-title")).toBeNull();
    expect(container.textContent).not.toContain("All projects");
  });

  it("lists projects with current badge and page counts", () => {
    renderWith({ projects: make(2) });
    expect(container.querySelector("#start-projects-title")?.textContent).toBe("Recent projects");
    expect(byLabel("Project 0").textContent).toContain("1 page");
    expect(byLabel("Project 0").textContent).not.toContain("1 pages");
    expect(byLabel("Project 0").textContent).toContain("Current");
    expect(byLabel("Project 1").textContent).toContain("3 pages");
    expect(byLabel("Project 1").textContent).not.toContain("Current");
  });

  it("caps rows at five and opens all projects", () => {
    const onShowAllProjects = vi.fn();
    renderWith({ projects: make(8), onShowAllProjects });
    expect(rows()).toHaveLength(5);
    act(() => button("All projects").click());
    expect(onShowAllProjects).toHaveBeenCalledTimes(1);
  });

  it("opens a project from its row", () => {
    const onOpenProject = vi.fn();
    renderWith({ projects: make(2), onOpenProject });
    act(() => byLabel("Project 1").click());
    expect(onOpenProject).toHaveBeenCalledWith("p1");
  });

  it("disables rows and All projects while busy", () => {
    const onOpenProject = vi.fn();
    const onShowAllProjects = vi.fn();
    renderWith({ projects: make(2), disabled: true, onOpenProject, onShowAllProjects });
    expect([...rows()].every((row) => (row as HTMLButtonElement).disabled)).toBe(true);
    expect(button("All projects").disabled).toBe(true);
    act(() => byLabel("Project 1").click());
    expect(onOpenProject).not.toHaveBeenCalled();
  });
});

describe("empty WorkspaceShell drop target", () => {
  const noop = () => undefined;
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = noop;
        unobserve = noop;
        disconnect = noop;
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderShell(dragActive: boolean) {
    act(() =>
      root.render(
        <WorkspaceShell
          isEmpty
          dragActive={dragActive}
          onDragEnter={noop}
          onDragOver={noop}
          onDragLeave={noop}
          onDrop={noop}
          dropOverlay="Drop PDF to open it"
          emptyState={<p>start</p>}
        />,
      ),
    );
  }

  it("shows the drop overlay only while a file is dragged over the empty screen", () => {
    renderShell(false);
    expect(container.textContent).not.toContain("Drop PDF to open it");
    renderShell(true);
    expect(container.textContent).toContain("Drop PDF to open it");
  });
});
