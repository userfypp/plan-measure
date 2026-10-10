/* @vitest-environment jsdom */

import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "./state";
import { createEmptySession, SessionProvider, useSessionState } from "./sessionState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let historyProbe: ReturnType<typeof useSessionState>;

function HistoryHarness() {
  const state = useSessionState();
  useEffect(() => { historyProbe = state; }, [state]);
  return (
    <div>
      <output data-testid="history-state">
        {`${state.canUndo}:${state.canRedo}:${state.session?.classificationCatalog.dimensions.length ?? 0}`}
      </output>
      <button onClick={() => state.addClassificationDimension("trade", "Trade")}>Add</button>
      <button onClick={() => state.applyClassificationTemplate([
        { name: "Trade", values: ["Electrical", "Plumbing"] },
        { name: "Floor", values: ["Ground"] },
      ])}>Apply template</button>
      <button onClick={() => {
        const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1);
        session.classificationCatalog.dimensions = [{ id: "trade", name: "Trade", archived: true,
          values: [{ id: "electrical", name: "Electrical", archived: true }] }];
        session.pages[1]!.measurements = [{ id: "line", name: "Line", type: "line", calibrationId: "scale",
          points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], visible: false, classificationValueIds: ["electrical"] }];
        state.loadSession(session);
      }}>Load assigned session</button>
      <button onClick={() => state.deleteClassificationDimension("trade")}>Delete dimension</button>
      <button onClick={() => state.deleteClassificationValue("trade", "electrical")}>Delete value</button>
      <output data-testid="session">{JSON.stringify(state.session)}</output>
      <button onClick={() => {
        const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
        for (const page of Object.values(session.pages)) page.measurements = [{ id: `line-${page.pageNumber}`, name: "Line", type: "line", calibrationId: "scale", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], visible: true, classificationValueIds: [] }];
        state.loadSession(session);
      }}>Load bulk session</button>
      <button onClick={() => state.editMeasurements({ measurementIds: ["line-1", "line-2"], operation: { type: "visibility", visible: false } })}>Hide selected</button>
      <button onClick={() => state.editMeasurements({ measurementIds: ["line-1", "line-2"], operation: { type: "delete" } })}>Delete selected</button>
      <button onClick={() => {
        const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1);
        session.pages[1]!.calibrations = [{ id: "scale", name: "Scale", mode: "uniform", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, referenceDistanceMm: 1000 }];
        session.pages[1]!.activeCalibrationId = "scale";
        session.pages[1]!.measurements = ["a", "b"].map((id) => ({ id, name: id, type: "line", calibrationId: "scale", points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], visible: true, classificationValueIds: [] }));
        state.loadSession(session);
      }}>Load geometry batch</button>
      <button onClick={() => state.pasteMeasurements(state.session!.pages[1]!.measurements.map((measurement) => ({ pageNumber: 1, sourcePageNumber: 1, id: `copy-${measurement.id}`, measurement })))}>Paste batch</button>
      <button onClick={() => state.updateMeasurements(state.session!.pages[1]!.measurements.map((measurement) => ({ pageNumber: 1, id: measurement.id, points: measurement.points.map((point) => ({ x: point.x + 10, y: point.y + 10 })) })))}>Move batch</button>
      <button onClick={state.undo}>Undo</button>
      <button onClick={state.redo}>Redo</button>
      <button onClick={() => state.addClassificationDimension("status", "Status")}>Branch</button>
    </div>
  );
}

function click(label: string) {
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!button) throw new Error(`Missing ${label} button.`);
  act(() => button.click());
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider>
        <SessionProvider>
          <HistoryHarnessWithSession />
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

describe("session undo and redo history", () => {
  it("undoes and redoes each item transfer together, including removal of an empty source count", () => {
    const session = createEmptySession({ name: "Count.pdf", size: 1, lastModified: 1 }, 1);
    session.pages[1]!.measurements = [
      { id: "source", name: "Plug", type: "count", calibrationId: null, points: [{ x: 20, y: 30 }, { x: 60, y: 70 }], visible: true, note: "Source note", classificationValueIds: [] },
      { id: "target", name: "Light", type: "count", calibrationId: null, points: [{ x: 100, y: 110 }], visible: false, note: "Target note", classificationValueIds: [] },
    ];
    act(() => historyProbe.loadSession(session));
    const command = { pageNumber: 1, sourceId: "source", targetId: "target", itemIndex: 0 };
    act(() => { expect(historyProbe.moveCountItem(command)).toBe(true); });
    const firstMove = structuredClone(historyProbe.session!);
    act(() => { expect(historyProbe.moveCountItem(command)).toBe(true); });
    const lastMove = structuredClone(historyProbe.session!);
    expect(lastMove.pages[1]!.measurements).toHaveLength(1);
    act(() => historyProbe.undo());
    expect(historyProbe.session).toEqual(firstMove);
    act(() => historyProbe.undo());
    expect(historyProbe.session).toEqual(session);
    act(() => historyProbe.redo());
    expect(historyProbe.session).toEqual(firstMove);
    act(() => historyProbe.redo());
    expect(historyProbe.session).toEqual(lastMove);
    act(() => { expect(historyProbe.moveCountItem(command)).toBe(false); });
    expect(historyProbe.session).toEqual(lastMove);
  });

  it("undoes and redoes count creation, properties, classification, movement, and deletion without a scale", () => {
    const session = createEmptySession({ name: "Count.pdf", size: 1, lastModified: 1 }, 1);
    session.classificationCatalog.dimensions = [{ id: "trade", name: "Trade", archived: false, values: [{ id: "electrical", name: "Electrical", archived: false }] }];
    act(() => historyProbe.loadSession(session));
    const snapshots = [structuredClone(historyProbe.session!)];
    for (const operation of [
      () => historyProbe.addMeasurement({ pageNumber: 1, id: "count", measurementType: "count", points: [{ x: 20, y: 30 }] }),
      () => historyProbe.updateMeasurement({ pageNumber: 1, id: "count", points: [{ x: 20, y: 30 }, { x: 60, y: 70 }, { x: 100, y: 110 }] }),
      () => historyProbe.updateMeasurement({ pageNumber: 1, id: "count", points: [{ x: 20, y: 30 }, { x: 100, y: 110 }] }),
      () => historyProbe.renameMeasurement(1, "count", "Socket"),
      () => historyProbe.setMeasurementNote(1, "count", "Check on site"),
      () => historyProbe.assignClassificationValue({ pageNumber: 1, measurementId: "count", dimensionId: "trade", valueId: "electrical" }),
      () => historyProbe.updateMeasurement({ pageNumber: 1, id: "count", points: [{ x: 40, y: 50 }] }),
      () => historyProbe.deleteMeasurement(1, "count"),
    ]) {
      act(() => { operation(); });
      snapshots.push(structuredClone(historyProbe.session!));
    }
    for (const snapshot of snapshots.slice(0, -1).reverse()) {
      act(() => historyProbe.undo());
      expect(historyProbe.session).toEqual(snapshot);
    }
    for (const snapshot of snapshots.slice(1)) {
      act(() => historyProbe.redo());
      expect(historyProbe.session).toEqual(snapshot);
    }
  });

  const unchangedOperations: [string, (state: ReturnType<typeof useSessionState>) => unknown][] = [
    ["equal geometry with new point objects", (state) => state.updateMeasurement({ pageNumber: 1, id: "a", points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] })],
    ["invalid geometry", (state) => state.updateMeasurement({ pageNumber: 1, id: "a", points: [{ x: 10, y: 10 }, { x: 10, y: 10 }] })],
    ["missing measurement geometry", (state) => state.updateMeasurement({ pageNumber: 1, id: "missing", points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] })],
    ["normalized equal name", (state) => state.renameMeasurement(1, "a", "  a  ")],
    ["invalid name", (state) => state.renameMeasurement(1, "a", "  ")],
    ["missing measurement name", (state) => state.renameMeasurement(1, "missing", "New")],
    ["normalized equal note", (state) => state.setMeasurementNote(1, "a", "  Existing note  ")],
    ["already absent note", (state) => state.setMeasurementNote(1, "b", "  ")],
    ["missing measurement note", (state) => state.setMeasurementNote(1, "missing", "New")],
    ["missing page geometry", (state) => state.updateMeasurement({ pageNumber: 2, id: "a", points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] })],
    ["missing page name", (state) => state.renameMeasurement(2, "a", "New")],
    ["missing page note", (state) => state.setMeasurementNote(2, "a", "New")],
  ];

  it.each(unchangedOperations)("preserves Undo and Redo after %s", (_, operation) => {
    click("Load geometry batch");
    const session = structuredClone(historyProbe.session!);
    session.pages[1]!.measurements[0]!.note = "Existing note";
    act(() => historyProbe.loadSession(session));
    const initial = historyProbe.session;
    act(() => { operation(historyProbe); });
    expect(historyProbe.session).toBe(initial);
    expect(historyProbe.canUndo).toBe(false);
    expect(historyProbe.canRedo).toBe(false);
    act(() => { historyProbe.renameMeasurement(1, "a", "Changed"); });
    const changed = historyProbe.session;
    act(() => historyProbe.undo());
    const undone = historyProbe.session;
    act(() => { operation(historyProbe); });
    expect(historyProbe.session).toBe(undone);
    expect(historyProbe.canUndo).toBe(false);
    expect(historyProbe.canRedo).toBe(true);
    act(() => historyProbe.redo());
    expect(historyProbe.session).toEqual(changed);
    act(() => historyProbe.undo());
    expect(historyProbe.session).toEqual(initial);
    expect(historyProbe.canUndo).toBe(false);
  });

  it.each([
    ["geometry", (state: ReturnType<typeof useSessionState>) => state.updateMeasurement({ pageNumber: 1, id: "a", points: [{ x: 10, y: 10 }, { x: 30, y: 10 }] })],
    ["name", (state: ReturnType<typeof useSessionState>) => state.renameMeasurement(1, "a", "New name")],
    ["note", (state: ReturnType<typeof useSessionState>) => state.setMeasurementNote(1, "a", "New note")],
  ] as const)("creates one Undo step and replaces Redo for a real %s edit", (_, operation) => {
    click("Load geometry batch");
    const initial = historyProbe.session;
    act(() => { historyProbe.renameMeasurement(1, "a", "Discarded branch"); });
    act(() => historyProbe.undo());
    act(() => { operation(historyProbe); });
    const changed = historyProbe.session;
    expect(changed).not.toEqual(initial);
    expect(historyProbe.canRedo).toBe(false);
    act(() => historyProbe.undo());
    expect(historyProbe.session).toEqual(initial);
    expect(historyProbe.canUndo).toBe(false);
    act(() => historyProbe.redo());
    expect(historyProbe.session).toEqual(changed);
  });

  it.each(["Paste batch", "Move batch"])("undoes and redoes %s in a single step", (operation) => {
    click("Load geometry batch");
    const before = document.querySelector('[data-testid="session"]')!.textContent;
    click(operation);
    const after = document.querySelector('[data-testid="session"]')!.textContent;
    expect(after).not.toBe(before);
    click("Undo");
    expect(document.querySelector('[data-testid="session"]')!.textContent).toBe(before);
    expect(document.querySelector('[data-testid="history-state"]')!.textContent).toBe("false:true:0");
    click("Redo");
    expect(document.querySelector('[data-testid="session"]')!.textContent).toBe(after);
  });

  it.each(["dimension", "value"])("undoes and redoes %s deletion together with assignments", (target) => {
    click("Load assigned session");
    const before = document.querySelector('[data-testid="session"]')!.textContent;
    click(`Delete ${target}`);
    const deleted = document.querySelector('[data-testid="session"]')!.textContent;
    expect(JSON.parse(deleted!).pages[1].measurements[0].classificationValueIds).toEqual([]);
    click("Undo");
    expect(document.querySelector('[data-testid="session"]')!.textContent).toBe(before);
    expect(document.querySelector('[data-testid="history-state"]')!.textContent).toBe("false:true:1");
    click("Redo");
    expect(document.querySelector('[data-testid="session"]')!.textContent).toBe(deleted);
  });

  it("undoes a complete template application in one step and ignores repeated applications", () => {
    const state = () => document.querySelector("[data-testid='history-state']")?.textContent;
    click("Apply template");
    expect(state()).toBe("true:false:2");
    click("Apply template");
    click("Undo");
    expect(state()).toBe("false:true:0");
    click("Redo");
    expect(state()).toBe("true:false:2");
  });
  it("undoes and redoes edits, and drops the redo branch after a new edit", () => {
    const state = () => document.querySelector("[data-testid='history-state']")?.textContent;
    // Loading starts a fresh history for a document.
    expect(state()).toBe("false:false:0");
    click("Add");
    expect(state()).toBe("true:false:1");
    click("Undo");
    expect(state()).toBe("false:true:0");
    click("Redo");
    expect(state()).toBe("true:false:1");
    click("Undo");
    click("Branch");
    expect(state()).toBe("true:false:1");
  });
});

function HistoryHarnessWithSession() {
  const state = useSessionState();
  const initialized = useRef(false);
  const loadSession = useRef(state.loadSession);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadSession.current(createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 1));
  }, [loadSession]);
  return <HistoryHarness />;
}


it.each(["Hide selected", "Delete selected"])("undoes and redoes %s across pages in a single step", (action) => {
  click("Load bulk session");
  const before = document.querySelector('[data-testid="session"]')!.textContent;
  click(action);
  const after = document.querySelector('[data-testid="session"]')!.textContent;
  expect(after).not.toBe(before);
  click("Undo");
  expect(document.querySelector('[data-testid="session"]')!.textContent).toBe(before);
  expect(document.querySelector('[data-testid="history-state"]')!.textContent).toBe("false:true:0");
  click("Redo");
  expect(document.querySelector('[data-testid="session"]')!.textContent).toBe(after);
});
