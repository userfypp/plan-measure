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
  const match = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
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
    expect(container.textContent).toContain("Your plan stays in this browser");
    expect(container.textContent).toContain("PDF files up to 100 MB");
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
