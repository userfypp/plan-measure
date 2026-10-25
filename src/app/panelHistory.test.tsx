/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chooseSelectOption } from "../components/ui/selectTestUtils";
import { ClassificationWorkspace } from "../features/classification/ClassificationWorkspace";
import { createPageCalibrationFromRatio } from "../features/calibration/ratioCalibration";
import { preloadCustomRatioDialog, ScalesWorkspace } from "../features/calibration/ScalesWorkspace";
import { MeasurementPanel, preloadMeasurementFilters } from "../features/measurements/MeasurementPanel";
import type { CurrentSession, PageState, PathMeasurement } from "../types/domain";
import { createEmptySession, SessionProvider, useSessionState } from "./sessionState";
import { AppProvider } from "./state";
import { WorkspaceProvider } from "./workspaceState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function line(id: string, name: string): PathMeasurement {
  return {
    id,
    name,
    type: "line",
    calibrationId: "scale-50",
    points: [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
    ],
    classificationValueIds: ["electrical"],
    visible: true,
  };
}

function projectSession(): CurrentSession {
  const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
  for (const pageNumber of [1, 2]) {
    const page: PageState = session.pages[pageNumber]!;
    page.calibrations = [
      { id: "scale-50", name: "Scale 50", ...createPageCalibrationFromRatio({ mode: "uniform", denominator: 50 }) },
    ];
    page.activeCalibrationId = "scale-50";
    page.measurements = [line(`line-${pageNumber}`, `Run ${pageNumber}`)];
  }
  session.classificationCatalog.dimensions = [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [{ id: "electrical", name: "Electrical", archived: false }],
    },
  ];
  return session;
}

/** The real panels, wired to the session commands the way App wires them. */
function Panels() {
  const state = useSessionState();
  const { session, loadSession } = state;
  useEffect(() => {
    if (!session) loadSession(projectSession());
  }, [loadSession, session]);
  if (!session) return null;
  const page = session.pages[1]!;
  return (
    <>
      <output data-testid="history">{`${state.canUndo}:${state.canRedo}`}</output>
      <output data-testid="visible">
        {[1, 2].map((pageNumber) => String(session.pages[pageNumber]!.measurements[0]!.visible)).join(",")}
      </output>
      <button type="button" onClick={() => state.addClassificationDimension("floor", "Floor")}>
        Make an edit
      </button>
      <button type="button" onClick={state.undo}>Undo</button>
      <MeasurementPanel
        page={page}
        pages={session.pages}
        pageLabelOverrides={session.pageLabelOverrides}
        sourcePageLabels={null}
        selectedMeasurementId={null}
        selectedMeasurementIds={[]}
        onSelectMeasurement={() => undefined}
        onSetMeasurementVisibility={() => undefined}
        onSetMeasurementsVisibility={(measurementIds, visible) =>
          state.editMeasurements({ measurementIds, operation: { type: "visibility", visible } })
        }
      />
      <ClassificationWorkspace
        catalog={session.classificationCatalog}
        onCreateDimension={() => undefined}
        onRenameDimension={state.renameClassificationDimension}
        onDeleteDimension={() => undefined}
        onArchiveDimension={() => undefined}
        onRestoreDimension={() => undefined}
        onCreateValue={() => undefined}
        onRenameValue={state.renameClassificationValue}
        onDeleteValue={() => undefined}
        onArchiveValue={() => undefined}
        onRestoreValue={() => undefined}
      />
      <ScalesWorkspace
        page={page}
        displayUnit={session.settings.displayUnit}
        onAddScale={() => undefined}
        onAddCustomRatioScale={() => undefined}
        onAddPresetScale={() => undefined}
        onSetRatio={(calibrationId, calibration) =>
          state.recalibrateCalibration({ pageNumber: 1, calibrationId, calibration })
        }
        onRenameScale={(calibrationId, name) =>
          state.renameCalibration({ pageNumber: 1, calibrationId, name })
        }
        onRecalibrate={() => undefined}
        onEditReference={() => undefined}
        onCopyScale={() => undefined}
      />
    </>
  );
}

function text(testId: string) {
  return document.querySelector(`[data-testid="${testId}"]`)?.textContent;
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button ${label} was not rendered.`);
  return button;
}

// The disclosure toggle is the button titled with the scale name.
function scaleToggle(name: string): HTMLButtonElement {
  const toggle = Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")).find(
    (candidate) => candidate.querySelector("span[title]")?.getAttribute("title") === name,
  );
  if (!toggle) throw new Error(`Scale toggle ${name} was not rendered.`);
  return toggle;
}

function buttonByText(scope: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button ${label} was not rendered.`);
  return button;
}

function click(button: HTMLElement) {
  act(() => button.click());
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function selectMenuItem(triggerLabel: string, itemLabel: string) {
  click(buttonByLabel(triggerLabel));
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.trim() === itemLabel,
  );
  if (!item) throw new Error(`Menu item ${itemLabel} was not rendered.`);
  click(item);
}

/** Leaves one edit to redo, as after Undo. */
function prepareRedo() {
  click(buttonByText(document, "Make an edit"));
  click(buttonByText(document, "Undo"));
  expect(text("history")).toBe("false:true");
}

function renameClassification(trigger: string, name: string) {
  selectMenuItem(trigger, "Rename");
  const form = document.querySelector<HTMLFormElement>('form[aria-label="Rename classification"]')!;
  setInputValue(form.querySelector("input")!, name);
  click(form.querySelector<HTMLButtonElement>('button[aria-label="Save"]')!);
}

beforeAll(async () => {
  await Promise.all([preloadMeasurementFilters(), preloadCustomRatioDialog()]);
});

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider>
        <SessionProvider>
          <WorkspaceProvider>
            <Panels />
          </WorkspaceProvider>
        </SessionProvider>
      </AppProvider>,
    );
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Undo and Redo through the real panels", () => {
  it("keeps Redo when a dimension or value is saved with its current name", () => {
    prepareRedo();
    renameClassification("Actions for dimension Trade", " Trade ");
    expect(text("history")).toBe("false:true");

    renameClassification("Actions for value Electrical", "Electrical");
    expect(text("history")).toBe("false:true");
  });

  it("keeps Redo when a scale is saved with its current name or ratio", async () => {
    prepareRedo();
    click(scaleToggle("Scale 50"));
    click(buttonByLabel("Rename scale Scale 50"));
    const nameInput = document.querySelector<HTMLInputElement>('input[aria-label="Scale name"]')!;
    setInputValue(nameInput, " Scale 50 ");
    click(buttonByLabel("Save"));
    expect(text("history")).toBe("false:true");

    click(buttonByLabel("Set ratio for scale Scale 50"));
    const ratio = document.querySelector<HTMLInputElement>("#custom-ratio-uniform")!;
    expect(ratio.value).toBe("50");
    click(buttonByText(document.querySelector("dialog")!, "Save scale"));
    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
    expect(text("history")).toBe("false:true");
  });

  it("hides a group spanning two pages in one Undo step", () => {
    click(buttonByLabel("Group measurements"));
    chooseSelectOption(
      document.querySelector<HTMLButtonElement>(
        '[role="dialog"][aria-label="Measurement grouping"] button[aria-haspopup="menu"]',
      )!,
      "Trade",
    );
    click(
      document.querySelector<HTMLButtonElement>(
        'button[aria-label^="Hide all measurements in Trade · Electrical"]',
      )!,
    );
    expect(text("visible")).toBe("false,false");
    expect(text("history")).toBe("true:false");

    click(buttonByText(document, "Undo"));
    expect(text("visible")).toBe("true,true");
    expect(text("history")).toBe("false:true");
  });
});
