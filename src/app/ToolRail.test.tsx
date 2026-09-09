/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolAvailabilityMap } from "../features/viewer/toolRegistry";
import { ToolRail } from "./ToolRail";
import { useWorkspaceState, WorkspaceProvider } from "./workspaceState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function RailHarness({ availability = {} }: { availability?: ToolAvailabilityMap }) {
  const { chooseTool } = useWorkspaceState();
  return <ToolRail toolAvailability={availability} onChooseTool={chooseTool} />;
}

function renderRail(availability: ToolAvailabilityMap = {}) {
  act(() => {
    root!.render(
      <WorkspaceProvider>
        <RailHarness availability={availability} />
      </WorkspaceProvider>,
    );
  });
}

function toolButtons(): HTMLButtonElement[] {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>("button[data-tool-id]") ?? []);
}

function button(tool: string): HTMLButtonElement {
  const match = toolButtons().find((candidate) => candidate.dataset.toolId === tool);
  if (!match) throw new Error(`Tool ${tool} was not rendered.`);
  return match;
}

function press(key: string) {
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ToolRail V2", () => {
  it("renders exactly the five mutually exclusive primary tools", () => {
    renderRail();

    expect(toolButtons().map((candidate) => candidate.dataset.toolId)).toEqual([
      "select",
      "hand",
      "line",
      "polyline",
      "polygon",
    ]);
    expect(container?.querySelector('[data-tool-id="snap"]')).toBeNull();
    expect(container?.querySelector('[data-tool-id="orthogonal"]')).toBeNull();
    expect(container?.querySelector('[role="toolbar"]')?.getAttribute("aria-orientation")).toBe(
      "vertical",
    );
  });

  it("uses structural pressed state and switches the canonical active primary tool", () => {
    renderRail();

    expect(button("select").getAttribute("aria-pressed")).toBe("true");
    expect(button("polygon").getAttribute("aria-pressed")).toBe("false");
    act(() => button("polygon").click());
    expect(button("select").getAttribute("aria-pressed")).toBe("false");
    expect(button("polygon").getAttribute("aria-pressed")).toBe("true");
    expect(button("polygon").getAttribute("aria-label")).toContain("Polygon");
    expect(button("polygon").getAttribute("aria-keyshortcuts")).toBe("P");
  });

  it("supports vertical roving focus, Home/End, and skips unavailable tools", () => {
    renderRail({ line: { enabled: false, disabledReason: "Unavailable" } });

    act(() => button("select").focus());
    press("ArrowDown");
    expect(document.activeElement).toBe(button("hand"));
    press("ArrowDown");
    expect(document.activeElement).toBe(button("polyline"));
    press("End");
    expect(document.activeElement).toBe(button("polygon"));
    press("Home");
    expect(document.activeElement).toBe(button("select"));
    expect(toolButtons().filter((candidate) => candidate.tabIndex === 0)).toHaveLength(1);
  });
});
