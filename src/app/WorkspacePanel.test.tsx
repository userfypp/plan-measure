/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceState, WorkspaceProvider } from "./workspaceState";
import { WorkspacePanel } from "./WorkspacePanel";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderPanel() {
  act(() => {
    root!.render(
      <WorkspaceProvider>
        <WorkspacePanel
          measurements={<div data-testid="measurements-pane">Measurements pane</div>}
          classifications={<div data-testid="classifications-pane">Classifications pane</div>}
          scales={<div data-testid="scales-pane">Scales pane</div>}
          details={<div data-testid="details-pane">Details pane</div>}
        />
      </WorkspaceProvider>,
    );
  });
}

function StatefulMeasurements() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" data-testid="local-state" onClick={() => setCount((value) => value + 1)}>
      Local {count}
    </button>
  );
}

function DetailsLifecycleHarness() {
  const {
    selectedMeasurementId,
    measurementDetailsOpen,
    selectMeasurement,
    clearSelection,
    openMeasurementDetails,
    closeMeasurementDetails,
  } = useWorkspaceState();
  return (
    <>
      <button type="button" data-testid="select" onClick={() => selectMeasurement("line-1")}>Select</button>
      <button type="button" data-testid="open-details" onClick={openMeasurementDetails}>Open details</button>
      <button type="button" data-testid="close-details" onClick={closeMeasurementDetails}>Close details</button>
      <button type="button" data-testid="clear" onClick={clearSelection}>Clear</button>
      <output data-testid="lifecycle-state">
        {selectedMeasurementId ?? "none"}:{measurementDetailsOpen ? "open" : "closed"}
      </output>
      <WorkspacePanel
        measurements={<StatefulMeasurements />}
        classifications={<div>Classifications</div>}
        scales={<div>Scales</div>}
        details={<div data-testid="details-pane">Details pane</div>}
      />
    </>
  );
}

function trigger(): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (candidate) => candidate.getAttribute("aria-label")?.startsWith("Workspace module:"),
  );
  if (!button) throw new Error("Workspace module trigger was not rendered.");
  return button;
}

function menuItems(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
}

function press(key: string) {
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  renderPanel();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll('[role="menu"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("WorkspacePanel", () => {
  it("starts in Measurements and exposes exactly the three V2 modules as radio menu items", () => {
    expect(trigger().getAttribute("aria-label")).toBe("Workspace module: Measurements");
    expect(container?.querySelector('[data-testid="measurements-pane"]')?.closest("[hidden]")).toBeNull();
    expect(container?.querySelector('[data-testid="classifications-pane"]')?.closest("[hidden]")).not.toBeNull();
    expect(container?.querySelector('[data-testid="scales-pane"]')?.closest("[hidden]")).not.toBeNull();

    act(() => trigger().click());
    const items = menuItems();
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      "Measurements",
      "Classifications",
      "Scales",
    ]);
    expect(items[0]?.querySelector("svg")).not.toBeNull();
    expect(items[1]?.querySelector("svg")).toBeNull();
    expect(items[2]?.querySelector("svg")).toBeNull();
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(document.body.textContent).not.toContain("Future module");
  });

  it("switches modules with composite keyboard navigation and restores focus to the trigger", () => {
    const workspaceTrigger = trigger();
    act(() => workspaceTrigger.click());
    expect(document.activeElement).toBe(menuItems()[0]);

    press("End");
    expect(document.activeElement).toBe(menuItems()[2]);
    press("Enter");

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(workspaceTrigger);
    expect(trigger().getAttribute("aria-label")).toBe("Workspace module: Scales");
    expect(container?.querySelector('[data-testid="scales-pane"]')?.closest("[hidden]")).toBeNull();
    expect(container?.querySelector('[data-testid="measurements-pane"]')?.closest("[hidden]")).not.toBeNull();
  });

  it("supports Arrow navigation, Home, and Escape without changing the active module", () => {
    const workspaceTrigger = trigger();
    act(() => workspaceTrigger.click());

    press("ArrowDown");
    expect(document.activeElement).toBe(menuItems()[1]);
    press("Home");
    expect(document.activeElement).toBe(menuItems()[0]);
    press("Escape");

    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(workspaceTrigger);
    expect(trigger().getAttribute("aria-label")).toBe("Workspace module: Measurements");
  });

  it("keeps module-local UI state mounted through explicit Details lifecycle and closes safely on selection invalidation", () => {
    act(() => {
      root!.render(
        <WorkspaceProvider>
          <DetailsLifecycleHarness />
        </WorkspaceProvider>,
      );
    });
    const byTestId = (id: string) => container?.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const local = byTestId("local-state") as HTMLButtonElement | undefined;
    if (!local) throw new Error("Stateful Measurements pane did not render.");
    act(() => local.click());
    expect(local.textContent).toBe("Local 1");

    act(() => (byTestId("select") as HTMLButtonElement).click());
    act(() => (byTestId("open-details") as HTMLButtonElement).click());
    expect(byTestId("lifecycle-state")?.textContent).toBe("line-1:open");
    expect(byTestId("details-pane")?.closest("[hidden]")).toBeNull();
    expect(local.closest("[hidden]")).not.toBeNull();

    act(() => (byTestId("close-details") as HTMLButtonElement).click());
    expect(byTestId("lifecycle-state")?.textContent).toBe("line-1:closed");
    expect(byTestId("local-state")?.textContent).toBe("Local 1");

    act(() => (byTestId("open-details") as HTMLButtonElement).click());
    act(() => (byTestId("clear") as HTMLButtonElement).click());
    expect(byTestId("lifecycle-state")?.textContent).toBe("none:closed");
  });
});
