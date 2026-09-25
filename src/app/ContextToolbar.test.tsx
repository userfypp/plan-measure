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
  const selectedMeasurementName = overrides.selectedMeasurementName ?? null;
  return {
    selectedMeasurementId: selectedMeasurementName ? "line-1" : null,
    selectedMeasurementName,
    duplicateDisabled: false,
    referenceEditValid: true,
    measurementEditActive: false,
    calibrationDialogOpen: false,
    onDeleteSelectedMeasurement: vi.fn(),
    onDuplicateSelectedMeasurement: vi.fn(),
    onRenameSelectedMeasurement: vi.fn(),
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

function toolbarButtons(): HTMLButtonElement[] {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button') ?? []);
}

function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => document.activeElement?.dispatchEvent(event));
  return event;
}

function renameTrigger(name: string): HTMLButtonElement {
  return buttonByLabel(`Rename selected measurement ${name}`);
}

function renameInput(name: string): HTMLInputElement {
  const input = container?.querySelector<HTMLInputElement>(`input[aria-label="Name for ${name}"]`);
  if (!input) throw new Error(`Rename input for ${name} was not rendered.`);
  return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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

    expect(buttonByText("Finish").disabled).toBe(false);
    expect(buttonByText("Finish").getAttribute("aria-disabled")).toBe("true");
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

  it("uses one horizontal roving Tab stop and keeps contextually disabled actions discoverable", () => {
    const finishCommand = vi.fn();
    renderToolbar(props(), finishCommand);
    act(() => workspace!.chooseTool("polyline"));
    act(() =>
      workspace!.startDraft({
        type: "path",
        measurementType: "polyline",
        points: [{ x: 1, y: 1 }],
      }),
    );

    const snap = buttonByLabel("Snap");
    const ortho = buttonByLabel("Ortho");
    const finish = buttonByText("Finish");
    const cancel = buttonByText("Cancel");
    expect(finish.disabled).toBe(false);
    expect(finish.getAttribute("aria-disabled")).toBe("true");
    act(() => finish.click());
    expect(finishCommand).not.toHaveBeenCalled();
    expect(toolbarButtons().filter((button) => button.tabIndex === 0)).toEqual([snap]);

    act(() => snap.focus());
    press("ArrowRight");
    expect(document.activeElement).toBe(ortho);
    press("ArrowRight");
    expect(document.activeElement).toBe(finish);
    expect(finish.getAttribute("aria-disabled")).toBe("true");
    press("ArrowRight");
    expect(document.activeElement).toBe(cancel);
    press("ArrowRight");
    expect(document.activeElement).toBe(snap);
    press("End");
    expect(document.activeElement).toBe(cancel);
    press("Home");
    expect(document.activeElement).toBe(snap);
    press("ArrowLeft");
    expect(document.activeElement).toBe(cancel);
    expect(toolbarButtons().filter((button) => button.tabIndex === 0)).toEqual([cancel]);

    expect(press("Enter").defaultPrevented).toBe(false);
    expect(press(" ").defaultPrevented).toBe(false);
  });

  it("hands focus to the Viewer owner after Finish tears down drawing context", () => {
    const finish = vi.fn();
    const viewer = document.createElement("div");
    viewer.tabIndex = 0;
    viewer.dataset.dialogFocusFallback = "true";
    document.body.append(viewer);
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    try {
      renderToolbar(props(), finish);
      act(() => workspace!.chooseTool("polyline"));
      act(() =>
        workspace!.startDraft({
          type: "path",
          measurementType: "polyline",
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        }),
      );
      const finishButton = buttonByText("Finish");
      act(() => {
        finishButton.focus();
        finishButton.click();
      });
      expect(finish).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(viewer);
    } finally {
      viewer.remove();
      Object.defineProperty(window, "requestAnimationFrame", {
        configurable: true,
        value: originalRequestAnimationFrame,
      });
    }
  });

  it("repairs the roving Tab stop when the first action is truly disabled", () => {
    renderToolbar(
      props({
        selectedMeasurementName: "Line 1",
        duplicateDisabled: true,
      }),
    );
    act(() => workspace!.selectMeasurement("line-1"));

    const duplicate = buttonByText("Duplicate");
    const details = buttonByText("Details");
    const rename = renameTrigger("Line 1");
    expect(duplicate.disabled).toBe(true);
    expect(duplicate.tabIndex).toBe(-1);
    expect(rename.tabIndex).toBe(0);
    expect(details.tabIndex).toBe(-1);
    expect(toolbarButtons().filter((button) => button.tabIndex === 0)).toEqual([rename]);
  });

  it.each([
    ["line", "Line 1"],
    ["polyline", "Polyline 1"],
    ["polygon", "Polygon 1"],
  ] as const)(
    "renames a newly completed %s inline without leaving the drawing tool",
    (tool, name) => {
      const rename = vi.fn();
      renderToolbar(
        props({
          selectedMeasurementId: `${tool}-1`,
          selectedMeasurementName: name,
          onRenameSelectedMeasurement: rename,
        }),
      );
      act(() => workspace!.chooseTool(tool));

      expect(contextKind()).toBe("drawing");
      act(() => renameTrigger(name).click());
      const input = renameInput(name);
      setInputValue(input, `${name} renamed`);
      act(() =>
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
      );

      expect(rename).toHaveBeenCalledWith(`${name} renamed`);
      expect(workspace?.activeTool).toBe(tool);
    },
  );

  it("renames an existing selected measurement with Enter, trims it, and returns focus", () => {
    const rename = vi.fn();
    renderToolbar(
      props({ selectedMeasurementName: "Line 1", onRenameSelectedMeasurement: rename }),
    );
    act(() => workspace!.selectMeasurement("line-1"));

    const trigger = renameTrigger("Line 1");
    act(() => trigger.focus());
    act(() => trigger.click());
    const input = renameInput("Line 1");
    expect(document.activeElement).toBe(input);
    expect(input.tabIndex).toBe(0);
    expect(toolbarButtons().every((button) => button.tabIndex === -1)).toBe(true);
    setInputValue(input, "  Main hallway  ");
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => input.dispatchEvent(enter));

    expect(rename).toHaveBeenCalledWith("Main hallway");
    expect(container?.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(renameTrigger("Line 1"));
  });

  it("supports pointer confirmation through the inline Save action", () => {
    const rename = vi.fn();
    renderToolbar(
      props({ selectedMeasurementName: "Line 1", onRenameSelectedMeasurement: rename }),
    );
    act(() => workspace!.selectMeasurement("line-1"));

    act(() => renameTrigger("Line 1").click());
    setInputValue(renameInput("Line 1"), "Pointer name");
    act(() => buttonByText("Save").click());

    expect(rename).toHaveBeenCalledWith("Pointer name");
    expect(container?.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(renameTrigger("Line 1"));
  });

  it("cancels inline rename with Escape and restores focus without renaming", () => {
    const rename = vi.fn();
    renderToolbar(
      props({ selectedMeasurementName: "Line 1", onRenameSelectedMeasurement: rename }),
    );
    act(() => workspace!.selectMeasurement("line-1"));

    act(() => renameTrigger("Line 1").click());
    const input = renameInput("Line 1");
    setInputValue(input, "Temporary name");
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => input.dispatchEvent(escape));

    expect(escape.defaultPrevented).toBe(true);
    expect(rename).not.toHaveBeenCalled();
    expect(container?.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(renameTrigger("Line 1"));
  });

  it("keeps blank names in edit mode under the canonical validation rule", () => {
    const rename = vi.fn();
    renderToolbar(
      props({ selectedMeasurementName: "Line 1", onRenameSelectedMeasurement: rename }),
    );
    act(() => workspace!.selectMeasurement("line-1"));

    act(() => renameTrigger("Line 1").click());
    const input = renameInput("Line 1");
    setInputValue(input, "   ");
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(rename).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Measurement name cannot be empty.",
    );
    expect(document.activeElement).toBe(input);
  });

  it("leaves tool shortcut letters and Space native while the measurement name field is active", () => {
    renderToolbar(props({ selectedMeasurementName: "Line 1" }));
    act(() => workspace!.selectMeasurement("line-1"));
    act(() => renameTrigger("Line 1").click());
    const input = renameInput("Line 1");

    for (const key of ["l", "p", "s", " "]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      act(() => input.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
    }
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
    const remove = vi.fn();
    const duplicate = vi.fn();
    renderToolbar(
      props({
        selectedMeasurementName: "Line 1",
        onDeleteSelectedMeasurement: remove,
        onDuplicateSelectedMeasurement: duplicate,
      }),
    );
    act(() => workspace!.selectMeasurement("line-1"));

    expect(contextKind()).toBe("selection");
    expect(container?.textContent).not.toContain("Edit");
    act(() => buttonByText("Duplicate").click());
    expect(duplicate).toHaveBeenCalledOnce();
    expect(buttonByText("Details")).toBeTruthy();
    act(() => buttonByText("Delete").click());
    expect(remove).toHaveBeenCalledOnce();
    act(() => buttonByText("Details").click());
    expect(workspace?.measurementDetailsOpen).toBe(true);
    expect(container?.textContent).not.toContain("Details");
    expect(container?.textContent).not.toContain("Edit");
    expect(buttonByText("Duplicate")).toBeTruthy();
    expect(buttonByText("Delete")).toBeTruthy();

    act(() => workspace!.chooseTool("hand"));
    expect(contextKind()).toBeNull();
  });

  it("keeps the remaining selected-measurement actions in roving keyboard order", () => {
    renderToolbar(props({ selectedMeasurementName: "Line 1" }));
    act(() => workspace!.selectMeasurement("line-1"));

    const rename = renameTrigger("Line 1");
    const duplicate = buttonByText("Duplicate");
    const details = buttonByText("Details");
    const remove = buttonByText("Delete");
    act(() => rename.focus());

    press("ArrowRight");
    expect(document.activeElement).toBe(duplicate);
    press("ArrowRight");
    expect(document.activeElement).toBe(details);
    press("ArrowRight");
    expect(document.activeElement).toBe(remove);
    press("ArrowRight");
    expect(document.activeElement).toBe(rename);
    expect(toolbarButtons().filter((button) => button.tabIndex === 0)).toEqual([rename]);
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
    expect(container?.textContent).not.toContain("Delete");
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

  it("hides stale point-selection guidance while the calibration dialog owns the next step", () => {
    renderToolbar(props({ calibrationDialogOpen: true }));
    act(() => workspace!.startCalibration(beginCalibrationFlow(1, null, "uniform")));

    expect(contextKind()).toBeNull();
    expect(container?.textContent).not.toContain("Select two points");

    renderToolbar(props({ calibrationDialogOpen: false }));
    expect(contextKind()).toBe("calibration");
    expect(container?.textContent).toContain("Calibrating scale · Select two points");
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
    expect(buttonByText("Save").disabled).toBe(false);
    expect(buttonByText("Save").getAttribute("aria-disabled")).toBe("true");
    expect(buttonByText("Save").getAttribute("aria-describedby")).not.toBeNull();
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
