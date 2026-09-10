/* @vitest-environment jsdom */

import { act, useLayoutEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginCalibrationFlow, selectCalibrationReference } from "./calibrationFlow";
import { beginCalibrationReferenceEdit } from "./calibrationReferenceEdit";
import { WorkspaceShell } from "./WorkspaceShell";
import { useWorkspaceDrawerPresentation } from "./WorkspaceDrawerContext";
import { useWorkspaceState, WorkspaceProvider } from "./workspaceState";

const noop = () => undefined;

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

class ControlledResizeObserver implements ResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ControlledResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    if (!this.target) this.target = target;
  }
  unobserve(): void {}
  disconnect(): void {}

  emit(width: number, height: number): void {
    if (!this.target) throw new Error("ResizeObserver has no target.");
    this.callback(
      [{ target: this.target, contentRect: rect(width, height) } as ResizeObserverEntry],
      this,
    );
  }
}

function StatefulPanel() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button type="button" aria-label="Workspace module: Measurements">
        Measurements
      </button>
      <button type="button" aria-label="Increment local workspace state" onClick={() => setCount((n) => n + 1)}>
        Count {count}
      </button>
    </div>
  );
}

function AuthoringPanel({ onStart }: { onStart: () => void }) {
  const presentation = useWorkspaceDrawerPresentation();
  return (
    <div>
      <button type="button" aria-label="Workspace module: Scales">
        Scales
      </button>
      <button
        type="button"
        data-testid="authoring-entry"
        disabled={!presentation.precisionActionAvailable}
        onClick={() => presentation.requestPrecisionAuthoring(onStart)}
      >
        Start spatial workflow
      </button>
      <output data-testid="current-capability">
        {presentation.currentCapability?.available ? "available" : "gated"}
      </output>
      <output data-testid="closed-capability">
        {presentation.capabilityWithoutDrawer?.available ? "available" : "gated"}
      </output>
      <output data-testid="recoverable">
        {presentation.canRecoverAuthoringByClosingWorkspace ? "true" : "false"}
      </output>
    </div>
  );
}

function createFinePointerController(initial: boolean) {
  let matches = initial;
  const listeners = new Set<EventListener>();
  const media = {
    get matches() {
      return matches;
    },
    media: "(any-pointer: fine)",
    onchange: null,
    addEventListener: (_type: string, listener: EventListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: EventListener) => listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  } as MediaQueryList;
  return {
    media,
    set(value: boolean) {
      matches = value;
      const event = new Event("change");
      listeners.forEach((listener) => listener(event));
    },
  };
}

let workspaceProbe: ReturnType<typeof useWorkspaceState> | null = null;

function WorkspaceProbe() {
  const workspace = useWorkspaceState();
  useLayoutEffect(() => {
    workspaceProbe = workspace;
    return () => {
      if (workspaceProbe === workspace) workspaceProbe = null;
    };
  }, [workspace]);
  return null;
}

describe("WorkspaceShell responsive layout", () => {
  let container: HTMLDivElement;
  let root: Root;
  let shellWidth: number;
  let viewerWidth: number;
  let viewerHeight: number;
  let pointer: ReturnType<typeof createFinePointerController>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    shellWidth = 1200;
    viewerWidth = 912;
    viewerHeight = 700;
    pointer = createFinePointerController(true);
    ControlledResizeObserver.instances = [];
    workspaceProbe = null;
    vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
    vi.stubGlobal("matchMedia", vi.fn(() => pointer.media));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.tagName === "MAIN") return rect(shellWidth, viewerHeight);
      if (this.parentElement?.getAttribute("data-layout-slot") === "viewer") {
        return rect(viewerWidth, viewerHeight);
      }
      return rect(0, 0);
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    workspaceProbe = null;
  });

  function renderShell({
    panel = <StatefulPanel />,
    onAuthoringCapabilityChange,
    authoringIntentScopeKey,
  }: {
    panel?: ReactNode;
    onAuthoringCapabilityChange?: Parameters<typeof WorkspaceShell>[0]["onAuthoringCapabilityChange"];
    authoringIntentScopeKey?: string | number;
  } = {}) {
    act(() => {
      root.render(
        <WorkspaceProvider>
          <WorkspaceProbe />
          <WorkspaceShell
            dragActive={false}
            onDragEnter={noop}
            onDragOver={noop}
            onDragLeave={noop}
            onDrop={noop}
            workspacePanel={panel}
            toolRail={<div data-testid="tools">Tools</div>}
            viewer={<div data-testid="pdf">PDF</div>}
            onAuthoringCapabilityChange={onAuthoringCapabilityChange}
            authoringIntentScopeKey={authoringIntentScopeKey}
          />
        </WorkspaceProvider>,
      );
    });
  }

  function workspaceObserver(): ControlledResizeObserver {
    const observer = ControlledResizeObserver.instances.find((candidate) => candidate.target?.tagName === "MAIN");
    if (!observer) throw new Error("Workspace ResizeObserver was not installed.");
    return observer;
  }

  function viewerObserver(): ControlledResizeObserver {
    const observer = ControlledResizeObserver.instances.find(
      (candidate) => candidate.target?.getAttribute("data-authoring-capability") !== null,
    );
    if (!observer) throw new Error("Viewer ResizeObserver was not installed.");
    return observer;
  }

  function panelHost(): HTMLDivElement {
    const host = container.querySelector<HTMLDivElement>('[data-layout-slot="workspace-panel-host"]');
    if (!host) throw new Error("Workspace Panel host was not rendered.");
    return host;
  }

  function launcher(): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>('button[aria-controls="workspace-drawer"]');
    if (!button) throw new Error("Workspace launcher was not rendered.");
    return button;
  }

  it("keeps exactly one Workspace Panel subtree and the Tool Rail inside Viewer ownership", () => {
    renderShell();
    expect(container.querySelectorAll('[data-layout-slot="workspace-panel-host"]')).toHaveLength(1);
    expect(container.querySelector('[data-layout-slot="left-rail"]')).toBeNull();
    expect(container.querySelector('[data-testid="tools"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf"]')).not.toBeNull();
    expect(container.querySelector("main")?.dataset.responsiveMode).toBe("wide");
  });

  it("turns the same mounted panel into a hidden Narrow drawer without losing local module state", () => {
    renderShell();
    const increment = container.querySelector<HTMLButtonElement>('button[aria-label="Increment local workspace state"]')!;
    act(() => increment.click());
    expect(increment.textContent).toBe("Count 1");

    shellWidth = 768;
    viewerWidth = 768;
    act(() => workspaceObserver().emit(768, viewerHeight));

    expect(container.querySelector("main")?.dataset.responsiveMode).toBe("narrow");
    expect(panelHost().hidden).toBe(true);
    expect(container.querySelectorAll('[data-layout-slot="workspace-panel-host"]')).toHaveLength(1);
    expect(panelHost().querySelector('button[aria-label="Increment local workspace state"]')?.textContent).toBe(
      "Count 1",
    );

    act(() => launcher().click());
    expect(panelHost().hidden).toBe(false);
    expect(panelHost().dataset.presentation).toBe("drawer");
    expect(panelHost().querySelector('button[aria-label="Increment local workspace state"]')?.textContent).toBe(
      "Count 1",
    );
  });

  it("exposes the drawer relationship, focuses Workspace on open, and returns focus on Escape", () => {
    shellWidth = 768;
    viewerWidth = 768;
    renderShell();

    const trigger = launcher();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe("workspace-drawer");
    expect(panelHost().hidden).toBe(true);

    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.hidden).toBe(true);
    expect(panelHost().hidden).toBe(false);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Workspace module: Measurements");

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(panelHost().hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("dismisses on a true outside pointer but not on a portaled menu or dialog", () => {
    shellWidth = 768;
    viewerWidth = 768;
    renderShell();
    act(() => launcher().click());

    const portalMenu = document.createElement("div");
    portalMenu.setAttribute("role", "menu");
    document.body.append(portalMenu);
    act(() => portalMenu.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(panelHost().hidden).toBe(false);
    portalMenu.remove();

    const outside = container.querySelector<HTMLElement>('[data-testid="pdf"]')!;
    act(() => outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(panelHost().hidden).toBe(true);
  });

  it("does not change the Viewer physical geometry when the Narrow drawer opens", () => {
    shellWidth = 768;
    viewerWidth = 768;
    renderShell();
    const viewer = container.querySelector<HTMLElement>('[data-layout-slot="viewer"]')!;
    const before = viewer.getBoundingClientRect();

    act(() => launcher().click());
    const after = viewer.getBoundingClientRect();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(container.querySelector("main")?.dataset.workspaceDrawerOpen).toBe("true");
  });

  it("repairs focus when a docked Workspace control becomes hidden on entry to Narrow", () => {
    renderShell();
    const workspaceControl = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increment local workspace state"]',
    )!;
    act(() => workspaceControl.focus());

    shellWidth = 768;
    viewerWidth = 768;
    act(() => workspaceObserver().emit(768, viewerHeight));

    expect(panelHost().hidden).toBe(true);
    expect(document.activeElement).toBe(launcher());
  });

  it("returns focus from the Narrow launcher to the docked Workspace when leaving Narrow", () => {
    shellWidth = 768;
    viewerWidth = 768;
    renderShell();
    const trigger = launcher();
    act(() => trigger.focus());
    expect(document.activeElement).toBe(trigger);

    shellWidth = 1024;
    viewerWidth = 736;
    act(() => workspaceObserver().emit(1024, viewerHeight));

    expect(container.querySelector("main")?.dataset.responsiveMode).toBe("compact");
    expect(panelHost().hidden).toBe(false);
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Workspace module: Measurements",
    );
  });

  it("does not reopen a stale Workspace drawer after leaving and re-entering Narrow", () => {
    shellWidth = 768;
    viewerWidth = 768;
    renderShell();
    act(() => launcher().click());
    expect(panelHost().hidden).toBe(false);

    shellWidth = 1024;
    viewerWidth = 736;
    act(() => workspaceObserver().emit(1024, viewerHeight));
    expect(container.querySelector("main")?.dataset.responsiveMode).toBe("compact");
    expect(panelHost().hidden).toBe(false);

    shellWidth = 768;
    viewerWidth = 768;
    act(() => workspaceObserver().emit(768, viewerHeight));
    expect(container.querySelector("main")?.dataset.responsiveMode).toBe("narrow");
    expect(panelHost().hidden).toBe(true);
    expect(container.querySelector("main")?.dataset.workspaceDrawerOpen).toBe("false");
  });

  it("preserves drawing, calibration, reference-edit, and selection state across responsive presentation changes", () => {
    renderShell();
    if (!workspaceProbe) throw new Error("Workspace state probe was not mounted.");

    act(() => {
      workspaceProbe!.chooseTool("polyline");
      workspaceProbe!.selectMeasurement("measurement-1");
      workspaceProbe!.startDraft({
        type: "path",
        measurementType: "polyline",
        points: [
          { x: 2, y: 3 },
          { x: 8, y: 3 },
        ],
      });
    });

    shellWidth = 768;
    viewerWidth = 768;
    act(() => workspaceObserver().emit(768, viewerHeight));
    act(() => launcher().click());
    expect(workspaceProbe?.activeTool).toBe("polyline");
    expect(workspaceProbe?.selectedMeasurementId).toBe("measurement-1");
    expect(workspaceProbe?.draft).toMatchObject({
      measurementType: "polyline",
      points: [
        { x: 2, y: 3 },
        { x: 8, y: 3 },
      ],
    });

    act(() => workspaceProbe!.clearDraft());
    const flow = beginCalibrationFlow(1, null, "uniform");
    act(() => {
      workspaceProbe!.startCalibration(flow);
      workspaceProbe!.updateCalibrationCandidate(
        selectCalibrationReference(flow, [
          { x: 10, y: 20 },
          { x: 110, y: 20 },
        ]),
      );
    });
    act(() => workspaceProbe!.cancelCalibration());

    const edit = beginCalibrationReferenceEdit(
      1,
      {
        id: "scale-1",
        name: "Scale 1",
        mode: "uniform",
        start: { x: 10, y: 20 },
        end: { x: 110, y: 20 },
        referenceDistanceMm: 1000,
      },
      "uniform",
    );
    if (!edit) throw new Error("Reference edit fixture could not be created.");
    act(() => workspaceProbe!.startReferenceEdit(edit));

    shellWidth = 1024;
    viewerWidth = 736;
    act(() => workspaceObserver().emit(1024, viewerHeight));
    shellWidth = 768;
    viewerWidth = 768;
    act(() => workspaceObserver().emit(768, viewerHeight));

    expect(workspaceProbe?.calibrationReferenceEdit).toEqual(edit);
    expect(workspaceProbe?.selectedMeasurementId).toBe("measurement-1");
  });

  it("closes a recoverable Narrow drawer and starts only after the real capability recovers", () => {
    shellWidth = 768;
    viewerWidth = 768;
    viewerHeight = 600;
    const order: string[] = [];
    const onStart = vi.fn(() => order.push("start"));
    renderShell({
      panel: <AuthoringPanel onStart={onStart} />,
      onAuthoringCapabilityChange: (capability) =>
        order.push(`cap:${capability.available}:${capability.rightObstruction}`),
    });
    act(() => launcher().click());

    expect(container.querySelector('[data-testid="current-capability"]')?.textContent).toBe("gated");
    expect(container.querySelector('[data-testid="closed-capability"]')?.textContent).toBe("available");
    expect(container.querySelector('[data-testid="recoverable"]')?.textContent).toBe("true");
    const entry = container.querySelector<HTMLButtonElement>('[data-testid="authoring-entry"]')!;
    expect(entry.disabled).toBe(false);

    act(() => entry.click());

    expect(panelHost().hidden).toBe(true);
    expect(onStart).toHaveBeenCalledOnce();
    const recoveredIndex = order.lastIndexOf("cap:true:0");
    const startIndex = order.lastIndexOf("start");
    expect(recoveredIndex).toBeGreaterThanOrEqual(0);
    expect(startIndex).toBeGreaterThan(recoveredIndex);
    expect(document.activeElement).toBe(launcher());
  });

  it.each([
    ["width", 479, 600, true],
    ["height", 768, 359, true],
    ["coarse", 768, 600, false],
  ] as const)(
    "keeps a non-recoverable %s case gated without closing the drawer",
    (_case, width, height, fine) => {
      shellWidth = width;
      viewerWidth = width;
      viewerHeight = height;
      pointer.set(fine);
      const onStart = vi.fn();
      renderShell({ panel: <AuthoringPanel onStart={onStart} /> });
      act(() => launcher().click());

      const entry = container.querySelector<HTMLButtonElement>('[data-testid="authoring-entry"]')!;
      expect(container.querySelector('[data-testid="recoverable"]')?.textContent).toBe("false");
      expect(entry.disabled).toBe(true);
      expect(panelHost().hidden).toBe(false);
      entry.click();
      expect(onStart).not.toHaveBeenCalled();
      expect(panelHost().hidden).toBe(false);
    },
  );

  it("drops a pending intent if capability fails to recover and never revives it on a later resize", () => {
    shellWidth = 768;
    viewerWidth = 768;
    viewerHeight = 600;
    const onStart = vi.fn();
    renderShell({ panel: <AuthoringPanel onStart={onStart} /> });
    act(() => launcher().click());
    const entry = container.querySelector<HTMLButtonElement>('[data-testid="authoring-entry"]')!;

    act(() => {
      entry.click();
      pointer.set(false);
    });
    expect(panelHost().hidden).toBe(true);
    expect(onStart).not.toHaveBeenCalled();

    act(() => pointer.set(true));
    viewerWidth = 900;
    act(() => viewerObserver().emit(900, 600));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("coalesces repeated activation into one pending authoring start", () => {
    shellWidth = 768;
    viewerWidth = 768;
    viewerHeight = 600;
    const onStart = vi.fn();
    renderShell({ panel: <AuthoringPanel onStart={onStart} /> });
    act(() => launcher().click());
    const entry = container.querySelector<HTMLButtonElement>('[data-testid="authoring-entry"]')!;

    act(() => {
      entry.click();
      entry.click();
    });

    expect(onStart).toHaveBeenCalledOnce();
  });
});
