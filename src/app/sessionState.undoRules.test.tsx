/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CurrentSession } from "../types/domain";
import { resetAppPreferences, setAppPreference } from "../utils/appPreferences";
import { AppProvider, useAppState } from "./state";
import { createEmptySession, SessionProvider, useSessionState } from "./sessionState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let session: ReturnType<typeof useSessionState>;
let app: ReturnType<typeof useAppState>;

function Harness() {
  const sessionState = useSessionState();
  const appState = useAppState();
  useEffect(() => {
    session = sessionState;
    app = appState;
  });
  return null;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider>
        <SessionProvider>
          <Harness />
        </SessionProvider>
      </AppProvider>,
    );
  });
});

afterEach(() => {
  resetAppPreferences();
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Two pages; page 1 has one scale and one line named "a". */
function baseSession(): CurrentSession {
  const base = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
  const page = base.pages[1]!;
  page.calibrations = [
    {
      id: "scale-1",
      name: "Scale 1",
      mode: "uniform",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      referenceDistanceMm: 1000,
    },
  ];
  page.activeCalibrationId = "scale-1";
  page.nextCalibrationNumber = 2;
  page.measurements = [
    {
      id: "a",
      name: "a",
      type: "line",
      calibrationId: "scale-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      visible: true,
      classificationValueIds: [],
    },
  ];
  return base;
}

const load = (value: CurrentSession = baseSession()) => act(() => session.loadSession(value));
const rename = (name: string) => act(() => session.renameMeasurement(1, "a", name));
const snapshot = () => structuredClone(session.session!);

describe("what opening, clearing, page and settings changes do to history", () => {
  it("empties Undo and Redo when a project is opened or cleared, after several edits", () => {
    load();
    rename("one");
    rename("two");
    act(() => session.undo());
    expect(session.canUndo).toBe(true);
    expect(session.canRedo).toBe(true);

    load(baseSession());
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);

    rename("three");
    expect(session.canUndo).toBe(true);
    act(() => session.clearSession());
    expect(session.session).toBeNull();
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
  });

  it("adds no step for changing page or settings, and Undo and Redo keep them", () => {
    load();
    act(() => session.updatePage(2));
    act(() => session.updateSettings({ displayUnit: "ft", showLabels: false }));
    expect(session.canUndo).toBe(false);

    rename("edited");
    act(() => session.updatePage(1));
    act(() => session.updateSettings({ displayUnit: "cm" }));
    expect(session.canUndo).toBe(true);

    act(() => session.undo());
    expect(session.session!.pages[1]!.measurements[0]!.name).toBe("a");
    expect(session.session!.currentPage).toBe(1);
    expect(session.session!.settings).toMatchObject({ displayUnit: "cm", showLabels: false });

    act(() => session.updatePage(2));
    act(() => session.redo());
    expect(session.session!.pages[1]!.measurements[0]!.name).toBe("edited");
    expect(session.session!.currentPage).toBe(2);
    expect(session.canUndo).toBe(true);
  });

  it("keeps Redo available when only the page or settings change after an Undo", () => {
    load();
    rename("edited");
    act(() => session.undo());
    act(() => session.updateSettings({ displayUnit: "in" }));
    act(() => session.updatePage(2));
    expect(session.canRedo).toBe(true);
  });

  it("drops Redo as soon as a new edit follows an Undo", () => {
    load();
    rename("one");
    act(() => session.undo());
    rename("two");
    expect(session.canRedo).toBe(false);
    expect(session.session!.pages[1]!.measurements[0]!.name).toBe("two");
  });
});

describe("the Undo limit", () => {
  it.each([50, 100])("keeps exactly the last %i steps and drops the one before", (depth) => {
    setAppPreference("undoDepth", depth as 50 | 100);
    load();
    const states = [snapshot()];
    for (let step = 1; step <= depth + 1; step += 1) {
      rename(`name ${step}`);
      states.push(snapshot());
    }
    for (let step = 0; step < depth; step += 1) act(() => session.undo());
    // The oldest step (the original name) fell off, so Undo stops at the state after step 1.
    expect(session.canUndo).toBe(false);
    expect(session.session).toEqual(states[1]);
    act(() => session.undo());
    expect(session.session).toEqual(states[1]);

    for (let step = 0; step < depth; step += 1) act(() => session.redo());
    expect(session.canRedo).toBe(false);
    expect(session.session).toEqual(states.at(-1));
  });

  it("returns all the way to the start with exactly as many steps as the limit", () => {
    setAppPreference("undoDepth", 50);
    load();
    const start = snapshot();
    for (let step = 1; step <= 50; step += 1) rename(`name ${step}`);
    for (let step = 0; step < 50; step += 1) act(() => session.undo());
    expect(session.canUndo).toBe(false);
    expect(session.session).toEqual(start);
  });

  it("applies a lower limit to the history that already exists, keeping the newest steps", () => {
    setAppPreference("undoDepth", 100);
    load();
    for (let step = 1; step <= 80; step += 1) rename(`name ${step}`);
    act(() => setAppPreference("undoDepth", 50));
    for (let step = 0; step < 50; step += 1) act(() => session.undo());
    expect(session.canUndo).toBe(false);
    expect(session.session!.pages[1]!.measurements[0]!.name).toBe("name 30");
  });
});

describe("errors and an empty history", () => {
  it("clears the last command error on Undo and on Redo", () => {
    load();
    rename("edited");
    act(() => session.setMeasurementVisibility(1, "missing", false));
    expect(app.state.error).not.toBeNull();
    act(() => session.undo());
    expect(app.state.error).toBeNull();

    act(() => session.setMeasurementVisibility(1, "missing", false));
    expect(app.state.error).not.toBeNull();
    act(() => session.redo());
    expect(app.state.error).toBeNull();
  });

  it("does nothing when there is nothing to undo or redo, and keeps the error", () => {
    act(() => session.undo());
    act(() => session.redo());
    expect(session.session).toBeNull();

    load();
    const before = session.session;
    act(() => session.setMeasurementVisibility(1, "missing", false));
    const error = app.state.error;
    expect(error).not.toBeNull();
    act(() => session.undo());
    act(() => session.redo());
    expect(session.session).toBe(before);
    expect(app.state.error).toBe(error);
  });
});

describe("scale and page-label commands", () => {
  const newScale = {
    pageNumber: 1,
    id: "scale-2",
    name: "Scale 2",
    calibration: {
      mode: "uniform" as const,
      start: { x: 0, y: 0 },
      end: { x: 20, y: 0 },
      referenceDistanceMm: 1000,
    },
  };
  const commands: [string, () => void][] = [
    ["add a scale", () => session.addCalibration(newScale)],
    [
      "recalibrate a scale",
      () =>
        session.recalibrateCalibration({
          pageNumber: 1,
          calibrationId: "scale-1",
          calibration: { ...newScale.calibration },
        }),
    ],
    [
      "rename a scale",
      () =>
        session.renameCalibration({ pageNumber: 1, calibrationId: "scale-1", name: "Floor plan" }),
    ],
    [
      "move a scale reference",
      () =>
        session.updateCalibration({
          pageNumber: 1,
          calibrationId: "scale-1",
          reference: "uniform",
          points: [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
          ],
        }),
    ],
    ["set a page label", () => session.setPageLabelOverride(2, "A-101")],
    ["set a page label with spaces around it", () => session.setPageLabelOverride(2, "  A-102  ")],
  ];

  it.each(commands)("undoes and redoes: %s", (_label, command) => {
    load();
    const before = snapshot();
    act(command);
    const after = snapshot();
    expect(after).not.toEqual(before);
    expect(session.canUndo).toBe(true);

    act(() => session.undo());
    expect(session.session).toEqual(before);
    act(() => session.redo());
    expect(session.session).toEqual(after);
  });

  it("undoes and redoes removing a page label and deleting a scale", () => {
    const labelled = baseSession();
    labelled.pageLabelOverrides = { 2: "A-101" };
    load(labelled);
    const withLabel = snapshot();
    act(() => session.removePageLabelOverride(2));
    expect(session.session!.pageLabelOverrides).toEqual({});
    act(() => session.undo());
    expect(session.session).toEqual(withLabel);

    act(() => session.addCalibration(newScale));
    const withTwoScales = snapshot();
    act(() => session.deleteCalibration({ pageNumber: 1, calibrationId: "scale-2" }));
    const afterDelete = snapshot();
    expect(afterDelete).not.toEqual(withTwoScales);
    act(() => session.undo());
    expect(session.session).toEqual(withTwoScales);
    act(() => session.redo());
    expect(session.session).toEqual(afterDelete);
  });

  it("adds no step for a page label that is already set or for removing one that is not", () => {
    load();
    act(() => session.setPageLabelOverride(2, "A-101"));
    const stepsBefore = snapshot();
    act(() => session.setPageLabelOverride(2, " A-101 "));
    act(() => session.removePageLabelOverride(1));
    act(() => session.undo());
    expect(session.canUndo).toBe(false);
    expect(session.session!.pageLabelOverrides).toEqual({});
    act(() => session.redo());
    expect(session.session).toEqual(stepsBefore);
    expect(session.canRedo).toBe(false);
  });
});

describe("Undo and the label classification dimension", () => {
  it("does not bring the label dimension back when Undo restores a deleted dimension", () => {
    load();
    act(() => session.addClassificationDimension("trade", "Trade"));
    act(() => session.updateSettings({ labelClassificationDimensionId: "trade" }));
    act(() => session.deleteClassificationDimension("trade"));
    expect(session.session!.settings.labelClassificationDimensionId).toBeNull();

    act(() => session.undo());
    expect(session.session!.classificationCatalog.dimensions.map(({ id }) => id)).toEqual([
      "trade",
    ]);
    expect(session.session!.settings.labelClassificationDimensionId).toBeNull();
  });

  it("clears the label dimension when Undo removes the dimension it points at", () => {
    load();
    act(() => session.addClassificationDimension("trade", "Trade"));
    act(() => session.updateSettings({ labelClassificationDimensionId: "trade" }));
    act(() => session.undo());
    expect(session.session!.classificationCatalog.dimensions).toEqual([]);
    expect(session.session!.settings.labelClassificationDimensionId).toBeNull();

    act(() => session.redo());
    expect(session.session!.classificationCatalog.dimensions.map(({ id }) => id)).toEqual([
      "trade",
    ]);
    expect(session.session!.settings.labelClassificationDimensionId).toBeNull();
  });
});
