/* @vitest-environment jsdom */

import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginCalibrationFlow } from "./calibrationFlow";
import { ContextToolbar, type ContextToolbarProps } from "./ContextToolbar";
import {
  useViewerInteractionCommandRegistration,
  ViewerInteractionCommandsProvider,
} from "../features/viewer/ViewerInteractionCommands";
import { useWorkspaceState, WorkspaceProvider } from "./workspaceState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let workspace: ReturnType<typeof useWorkspaceState> | null = null;

function WorkspaceProbe() {
  const current = useWorkspaceState();
  useLayoutEffect(() => {
    workspace = current;
    return () => {
      if (workspace === current) workspace = null;
    };
  }, [current]);
  return null;
}

function CommandRegistration({ onFinish }: { onFinish: () => void }) {
  const register = useViewerInteractionCommandRegistration();
  useLayoutEffect(() => register?.({ completeCurrentDraft: onFinish }), [onFinish, register]);
  return null;
}

function props(overrides: Partial<ContextToolbarProps> = {}): ContextToolbarProps {
  return {
    selectedMeasurementName: null,
    duplicateDisabled: false,
    referenceEditValid: true,
    measurementEditActive: false,
    onDuplicateSelectedMeasurement: vi.fn(),
    onOpenMeasurementDetails: () => workspace?.openMeasurementDetails(),
    onExitDrawingTool: () => workspace?.chooseTool("select"),
    onCancelCalibration: vi.fn(),
    onCancelReferenceEdit: vi.fn(),
    onSaveReferenceEdit: vi.fn(),
    ...overrides,
  };
}

function renderToolbar(
  toolbarProps: ContextToolbarProps = props(),
  onFinish: () => void = vi.fn(),
) {
  act(() => {
    root!.render(
      <WorkspaceProvider>
        <ViewerInteractionCommandsProvider>
          <WorkspaceProbe />
          <CommandRegistration onFinish={onFinish} />
          <ContextToolbar {...toolbarProps} />
        </ViewerInteractionCommandsProvider>
      </WorkspaceProvider>,
    );
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const match = Array.from(container?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!match) throw new Error(`Button ${text} was not rendered.`);
  return match;
}

function buttonByLabel(label: string): HTMLButtonElement {
  const match = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!match) throw new Error(`Button ${label} was not rendered.`);
  return match;
}

function contextKind(): string | null {
  return container?.querySelector<HTMLElement>("[data-context-kind]")?.dataset.contextKind ?? null;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  workspace = null;
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  workspace = null;
  root = null;
  container = null;
});

describe("ContextToolbar V2", () => {
  it("is absent in idle Select without a selection", () => {
    renderToolbar();
    expect(contextKind()).toBeNull();
  });

  it("shows armed Line aids and a real Cancel action without inventing Finish", () => {
    renderToolbar();
    act(() => workspace!.chooseTool("line"));

    expect(contextKind()).toBe("drawing");
    expect(container?.textContent).toContain("Line");
    expect(buttonByLabel("Snap").getAttribute("aria-pressed")).toBe("false");
    expect(buttonByLabel("Ortho").getAttribute("aria-pressed")).toBe("false");
    expect(container?.textContent).not.toContain("Finish");
    expect(buttonByText("Cancel")).toBeTruthy();

    act(() =>
      workspace!.startDraft({
        type: "path",
        measurementType: "line",
        points: [{ x: 1, y: 1 }],
      }),
    );
    expect(container?.textContent).not.toContain("Finish");
    expect(buttonByText("Cancel")).toBeTruthy();
  });

  it("keeps Snap and Ortho independent and finishes/cancels Polyline through canonical commands", () => {
    const finish = vi.fn();
    renderToolbar(props(), finish);
    act(() => workspace!.chooseTool("polyline"));
    expect(buttonByText("Cancel")).toBeTruthy();
    act(() => buttonByText("Cancel").click());
    expect(workspace?.activeTool).toBe("select");
    act(() => workspace!.chooseTool("polyline"));
    act(() =>
      workspace!.startDraft({
        type: "path",
        measurementType: "polyline",
        points: [{ x: 1, y: 1 }],
      }),
    );

    expect(buttonByText("Finish").disabled).toBe(true);
    expect(buttonByText("Finish").getAttribute("aria-describedby")).not.toBeNull();
    act(() => buttonByLabel("Snap").click());
    act(() => buttonByLabel("Ortho").click());
    expect(buttonByLabel("Snap").getAttribute("aria-pressed")).toBe("true");
    expect(buttonByLabel("Ortho").getAttribute("aria-pressed")).toBe("true");
    expect(buttonByLabel("Snap").textContent).toContain("✓");
    expect(buttonByLabel("Ortho").textContent).toContain("✓");

    act(() =>
      workspace!.updateDraft({
        type: "path",
        measurementType: "polyline",
        points: [
          { x: 1, y: 1 },
          { x: 10, y: 1 },
        ],
      }),
    );
    expect(buttonByText("Finish").disabled).toBe(false);
    expect(buttonByText("Finish").getAttribute("aria-describedby")).toBeNull();
    act(() => buttonByText("Finish").click());
    expect(finish).toHaveBeenCalledOnce();

    act(() => buttonByText("Cancel").click());
    expect(workspace?.draft).toBeNull();
    expect(workspace?.activeTool).toBe("polyline");
    expect(buttonByText("Cancel")).toBeTruthy();
    act(() => buttonByText("Cancel").click());
    expect(workspace?.activeTool).toBe("select");
  });

  it("shows Polygon Finish only after a real draft and enables it at the canonical minimum", () => {
    renderToolbar();
    act(() => workspace!.chooseTool("polygon"));
    expect(container?.textContent).not.toContain("Finish");

    act(() =>
      workspace!.startDraft({
        type: "path",
        measurementType: "polygon",
        points: [
          { x: 1, y: 1 },
          { x: 10, y: 1 },
          { x: 10, y: 10 },
        ],
      }),
    );
    expect(buttonByText("Finish").disabled).toBe(false);
    expect(container?.querySelector('[data-drawing-tool="polygon"]')).not.toBeNull();
  });

  it("shows selection actions only in Select and suppresses redundant Details while Details is open", () => {
    const duplicate = vi.fn();
    renderToolbar(props({ selectedMeasurementName: "Line 1", onDuplicateSelectedMeasurement: duplicate }));
    act(() => workspace!.selectMeasurement("line-1"));

    expect(contextKind()).toBe("selection");
    act(() => buttonByText("Duplicate").click());
    expect(duplicate).toHaveBeenCalledOnce();
    expect(buttonByText("Details")).toBeTruthy();
    act(() => buttonByText("Details").click());
    expect(workspace?.measurementDetailsOpen).toBe(true);
    expect(container?.textContent).not.toContain("Details");
    expect(buttonByText("Duplicate")).toBeTruthy();

    act(() => workspace!.chooseTool("hand"));
    expect(contextKind()).toBeNull();
  });

  it("gives direct manipulation priority over ordinary selection actions", () => {
    renderToolbar(
      props({
        selectedMeasurementName: "Line 1",
        measurementEditActive: true,
      }),
    );
    act(() => workspace!.selectMeasurement("line-1"));

    expect(contextKind()).toBe("direct-manipulation");
    expect(container?.textContent).toContain("Editing geometry");
    expect(container?.textContent).not.toContain("Duplicate");
    expect(container?.textContent).not.toContain("Details");
  });

  it("distinguishes Uniform, X, and Y calibration contexts and routes only calibration Cancel", () => {
    const cancel = vi.fn();
    renderToolbar(props({ onCancelCalibration: cancel }));
    act(() => workspace!.startCalibration(beginCalibrationFlow(1, null, "uniform")));
    expect(contextKind()).toBe("calibration");
    expect(container?.textContent).toContain("Calibrating scale · Select two points");
    act(() => buttonByText("Cancel").click());
    expect(cancel).toHaveBeenCalledOnce();

    act(() => workspace!.cancelCalibration());
    act(() => workspace!.startCalibration(beginCalibrationFlow(1, null, "xy")));
    expect(container?.textContent).toContain("Calibrating X reference");
    act(() =>
      workspace!.advanceCalibrationStep({
        ...beginCalibrationFlow(1, null, "xy"),
        phase: "y",
      }),
    );
    expect(container?.textContent).toContain("Calibrating Y reference");
  });

  it("distinguishes reference-edit ownership and exposes Save/Cancel without collapsing X/Y", () => {
    const save = vi.fn();
    const cancel = vi.fn();
    renderToolbar(props({ referenceEditValid: false, onSaveReferenceEdit: save, onCancelReferenceEdit: cancel }));
    act(() =>
      workspace!.startReferenceEdit({
        pageNumber: 1,
        calibrationId: "scale-1",
        reference: "x",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      }),
    );

    expect(contextKind()).toBe("reference-edit");
    expect(container?.textContent).toContain("Editing X reference");
    expect(buttonByText("Save").disabled).toBe(true);
    act(() => buttonByText("Cancel").click());
    expect(cancel).toHaveBeenCalledOnce();

    act(() => workspace!.cancelReferenceEdit());
    act(() =>
      workspace!.startReferenceEdit({
        pageNumber: 1,
        calibrationId: "scale-1",
        reference: "y",
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ],
      }),
    );
    expect(container?.textContent).toContain("Editing Y reference");
  });
});
