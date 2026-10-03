/* @vitest-environment jsdom */

import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "./state";
import { createEmptySession, SessionProvider, useSessionState } from "./sessionState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function HistoryHarness() {
  const state = useSessionState();
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
