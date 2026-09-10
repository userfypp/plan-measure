/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AuthoringCapabilityProvider,
  computeAuthoringCapability,
} from "../features/viewer/AuthoringCapability";
import type { ToolAvailabilityMap } from "../features/viewer/toolRegistry";
import { ToolRail } from "./ToolRail";
import { WorkspaceDrawerProvider } from "./WorkspaceDrawerContext";
import { useWorkspaceState, WorkspaceProvider } from "./workspaceState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function RailHarness({
  availability = {},
  narrow = false,
  narrowVersion = narrow ? 1 : 0,
  precisionAvailable = true,
}: {
  availability?: ToolAvailabilityMap;
  narrow?: boolean;
  narrowVersion?: number;
  precisionAvailable?: boolean;
}) {
  const { chooseTool } = useWorkspaceState();
  const capability = computeAuthoringCapability({
    viewerSize: { width: 900, height: 700 },
    rightObstruction: 0,
    bottomExclusion: 0,
    finePointer: precisionAvailable,
  });
  return (
    <AuthoringCapabilityProvider capability={capability}>
      <WorkspaceDrawerProvider
        value={{
          isNarrow: narrow,
          narrowVersion,
          open: false,
          close: () => undefined,
          currentCapability: capability,
          capabilityWithoutDrawer: capability,
          canRecoverAuthoringByClosingWorkspace: false,
          precisionActionAvailable: capability.available,
          precisionDisabledReason:
            capability.unavailableReason ?? "Precision authoring unavailable.",
          requestPrecisionAuthoring: (start) => {
            if (!capability.available) return false;
            start();
            return true;
          },
        }}
      >
        <ToolRail toolAvailability={availability} onChooseTool={chooseTool} />
      </WorkspaceDrawerProvider>
    </AuthoringCapabilityProvider>
  );
}

function renderRail(
  availability: ToolAvailabilityMap = {},
  options: { narrow?: boolean; narrowVersion?: number; precisionAvailable?: boolean } = {},
) {
  act(() => {
    root!.render(
      <WorkspaceProvider>
        <RailHarness availability={availability} {...options} />
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

  it("supports vertical roving focus, Home/End, and keeps unavailable tools focusable for their reason", () => {
    renderRail({ line: { enabled: false, disabledReason: "Unavailable" } });

    act(() => button("select").focus());
    press("ArrowDown");
    expect(document.activeElement).toBe(button("hand"));
    expect(button("select").getAttribute("aria-pressed")).toBe("true");
    expect(button("hand").getAttribute("aria-pressed")).toBe("false");
    press("ArrowDown");
    expect(document.activeElement).toBe(button("line"));
    expect(button("line").getAttribute("aria-disabled")).toBe("true");
    press("ArrowDown");
    expect(document.activeElement).toBe(button("polyline"));
    press("End");
    expect(document.activeElement).toBe(button("polygon"));
    press("Home");
    expect(document.activeElement).toBe(button("select"));
    expect(toolButtons().filter((candidate) => candidate.tabIndex === 0)).toHaveLength(1);
  });

  it("retains one roving Tab stop even when that tool is contextually unavailable", () => {
    renderRail({ select: { enabled: false, disabledReason: "Unavailable" } });

    expect(button("select").disabled).toBe(false);
    expect(button("select").getAttribute("aria-disabled")).toBe("true");
    expect(button("select").tabIndex).toBe(0);
    expect(button("hand").tabIndex).toBe(-1);
    expect(toolButtons().filter((candidate) => candidate.tabIndex === 0)).toEqual([button("select")]);
  });

  it("uses one Narrow launcher and exposes the same five tools on demand", () => {
    renderRail({}, { narrow: true });
    const launcher = container?.querySelector<HTMLButtonElement>('button[aria-label="Tools"]');
    expect(launcher).not.toBeNull();
    expect(launcher?.getAttribute("aria-expanded")).toBe("false");
    expect(toolButtons()).toHaveLength(0);

    act(() => launcher?.click());
    expect(launcher?.getAttribute("aria-expanded")).toBe("true");
    expect(toolButtons().map((candidate) => candidate.dataset.toolId)).toEqual([
      "select",
      "hand",
      "line",
      "polyline",
      "polygon",
    ]);
    expect(container?.querySelector('[role="toolbar"]')?.getAttribute("aria-orientation")).toBe(
      "vertical",
    );
    expect(document.activeElement).toBe(button("select"));
  });

  it("keeps navigation tools available while precision tools expose the capability reason", () => {
    renderRail({}, { precisionAvailable: false });
    expect(button("select").disabled).toBe(false);
    expect(button("hand").disabled).toBe(false);
    for (const tool of ["line", "polyline", "polygon"]) {
      expect(button(tool).disabled).toBe(false);
      expect(button(tool).getAttribute("aria-disabled")).toBe("true");
      const reasonId = button(tool).getAttribute("aria-describedby");
      expect(reasonId).not.toBeNull();
      expect(document.getElementById(reasonId!)?.textContent).toContain("fine pointer");
      expect(button(tool).title).toContain("fine pointer");
    }
  });

  it("does not activate an aria-disabled tool by click or keyboard-generated click", () => {
    renderRail({ line: { enabled: false, disabledReason: "Unavailable" } });
    const line = button("line");
    act(() => line.click());
    expect(button("select").getAttribute("aria-pressed")).toBe("true");

    act(() => {
      line.focus();
      line.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(button("select").getAttribute("aria-pressed")).toBe("true");
    expect(line.getAttribute("aria-pressed")).toBe("false");
  });

  it("returns focus to the Narrow launcher after choosing a tool", () => {
    renderRail({}, { narrow: true });
    const launcher = container?.querySelector<HTMLButtonElement>('button[aria-label="Tools"]');
    if (!launcher) throw new Error("Tools launcher was not rendered.");
    act(() => launcher.click());
    const polygon = button("polygon");
    act(() => {
      polygon.focus();
      polygon.click();
    });

    expect(toolButtons()).toHaveLength(0);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(launcher);
  });

  it("closes the Narrow palette with Escape and returns focus to its launcher", () => {
    renderRail({}, { narrow: true });
    const launcher = container?.querySelector<HTMLButtonElement>('button[aria-label="Tools"]');
    if (!launcher) throw new Error("Tools launcher was not rendered.");
    act(() => launcher.click());
    expect(document.activeElement).toBe(button("select"));

    press("Escape");

    expect(toolButtons()).toHaveLength(0);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(launcher);
  });

  it("preserves roving focus across Wide/Narrow transitions without hidden tabbables", () => {
    renderRail();
    act(() => button("hand").focus());
    expect(document.activeElement).toBe(button("hand"));
    expect(button("select").getAttribute("aria-pressed")).toBe("true");
    expect(button("hand").getAttribute("aria-pressed")).toBe("false");

    renderRail({}, { narrow: true, narrowVersion: 1 });
    const launcher = container?.querySelector<HTMLButtonElement>('button[aria-label="Tools"]');
    if (!launcher) throw new Error("Tools launcher was not rendered.");
    expect(toolButtons()).toHaveLength(0);
    expect(document.activeElement).toBe(launcher);

    renderRail({}, { narrow: false, narrowVersion: 1 });
    expect(document.activeElement).toBe(button("hand"));
    expect(toolButtons().filter((candidate) => candidate.tabIndex === 0)).toEqual([button("hand")]);

    renderRail({}, { narrow: true, narrowVersion: 2 });
    expect(toolButtons()).toHaveLength(0);
    expect(document.activeElement).toBe(
      container?.querySelector<HTMLButtonElement>('button[aria-label="Tools"]'),
    );
  });

  it("does not reopen a stale tool palette after leaving and re-entering Narrow", () => {
    renderRail({}, { narrow: true, narrowVersion: 1 });
    const firstLauncher = container?.querySelector<HTMLButtonElement>('button[aria-label="Tools"]');
    if (!firstLauncher) throw new Error("Tools launcher was not rendered.");
    act(() => firstLauncher.click());
    expect(toolButtons()).toHaveLength(5);

    act(() => {
      root!.render(
        <WorkspaceProvider>
          <RailHarness narrow={false} narrowVersion={1} />
        </WorkspaceProvider>,
      );
    });
    act(() => {
      root!.render(
        <WorkspaceProvider>
          <RailHarness narrow narrowVersion={2} />
        </WorkspaceProvider>,
      );
    });

    expect(container?.querySelector<HTMLButtonElement>('button[aria-label="Tools"]')?.getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(toolButtons()).toHaveLength(0);
  });
});
