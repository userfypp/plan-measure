/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentSession, Measurement } from "../types/domain";
import { createEmptySession } from "./sessionState";
import { useMeasurementShortcuts } from "./useMeasurementShortcuts";

type Deps = Parameters<typeof useMeasurementShortcuts>[0];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const line = (id: string, name: string, x = 0): Measurement => ({
  id,
  name,
  type: "line",
  calibrationId: "scale",
  points: [
    { x, y: 0 },
    { x: x + 10, y: 0 },
  ],
  visible: true,
  classificationValueIds: [],
});

function sessionFixture(): CurrentSession {
  const session = createEmptySession({ name: "plan.pdf", size: 1, lastModified: 1 }, 2);
  session.pages[1]!.measurements = [line("a", "Wall A"), line("b", "Wall B", 20)];
  session.pages[2]!.measurements = [line("c", "Wall C")];
  return session;
}

const page = { width: 200, height: 100, rotation: 0 as const };

function setup(overrides: Partial<Record<keyof Deps, unknown>> = {}) {
  const calls = {
    copyMeasurements: vi.fn(),
    pasteMeasurements: vi.fn((commands: readonly unknown[]) => commands.length > 0),
    requestMeasurementDelete: vi.fn(),
    requestSelectedMeasurementsDelete: vi.fn(),
    selectWorkspaceMeasurements: vi.fn(),
    setError: vi.fn(),
  };
  const deps = {
    ...calls,
    calibrationCandidate: null,
    calibrationFlow: null,
    calibrationReferenceEdit: null,
    draft: null,
    measurementClipboard: null,
    selectedMeasurementId: null,
    selectedMeasurementIds: [],
    session: sessionFixture(),
    viewerPageBounds: { pageNumber: 1, bounds: page },
    activeMeasurementEditIdRef: { current: null },
    viewerPageZoomRef: { current: { pageNumber: 1, zoom: 1 } },
    applicationCopyRef: { current: false },
    ...overrides,
  } as unknown as Deps;
  function Harness() {
    useMeasurementShortcuts(deps);
    useEffect(() => undefined);
    return null;
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<Harness />));
  return { calls, deps };
}

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

describe("deleting with the keyboard", () => {
  it("asks to delete the one selected measurement on the current page", () => {
    const { calls } = setup({ selectedMeasurementId: "a", selectedMeasurementIds: ["a"] });
    const event = press("Delete");
    expect(calls.requestMeasurementDelete).toHaveBeenCalledWith({
      pageNumber: 1,
      measurementId: "a",
      measurementName: "Wall A",
    });
    expect(event.defaultPrevented).toBe(true);
    press("Backspace");
    expect(calls.requestMeasurementDelete).toHaveBeenCalledTimes(2);
  });

  it("asks to delete a multi-selection, or a single selection that is on another page", () => {
    const several = setup({ selectedMeasurementId: "a", selectedMeasurementIds: ["a", "b"] });
    press("Delete");
    expect(several.calls.requestSelectedMeasurementsDelete).toHaveBeenCalledOnce();
    expect(several.calls.requestMeasurementDelete).not.toHaveBeenCalled();
    act(() => root!.unmount());
    container!.remove();

    const elsewhere = setup({ selectedMeasurementId: "c", selectedMeasurementIds: ["c"] });
    press("Delete");
    expect(elsewhere.calls.requestSelectedMeasurementsDelete).toHaveBeenCalledOnce();
  });

  it("does nothing, and leaves the key alone, when nothing is selected or the id is unknown", () => {
    const { calls } = setup({ selectedMeasurementId: "gone", selectedMeasurementIds: [] });
    expect(press("Delete").defaultPrevented).toBe(false);
    expect(calls.requestMeasurementDelete).not.toHaveBeenCalled();
    expect(calls.requestSelectedMeasurementsDelete).not.toHaveBeenCalled();
  });

  it("still deletes during a draft or an edit, unlike copy and paste", () => {
    const { calls } = setup({
      selectedMeasurementId: "a",
      selectedMeasurementIds: ["a"],
      draft: { points: [] },
      activeMeasurementEditIdRef: { current: "a" },
    });
    press("Delete");
    expect(calls.requestMeasurementDelete).toHaveBeenCalledOnce();
  });

  it("ignores Delete typed into a text field", () => {
    const { calls } = setup({ selectedMeasurementId: "a", selectedMeasurementIds: ["a"] });
    const input = document.createElement("input");
    document.body.append(input);
    press("Delete", {}, input);
    input.remove();
    expect(calls.requestMeasurementDelete).not.toHaveBeenCalled();
  });
});

describe("copying with the keyboard", () => {
  const copyKey = { ctrlKey: true };

  it("copies the selected measurements and marks the copy as the application's own", async () => {
    const applicationCopyRef = { current: false };
    const { calls } = setup({ selectedMeasurementIds: ["a", "b"], applicationCopyRef });
    let flagDuringCopy: boolean | null = null;
    calls.copyMeasurements.mockImplementation(() => {
      flagDuringCopy = applicationCopyRef.current;
    });
    const event = press("c", copyKey);
    expect(calls.copyMeasurements).toHaveBeenCalledWith(1, [
      expect.objectContaining({ id: "a" }),
      expect.objectContaining({ id: "b" }),
    ]);
    expect(event.defaultPrevented).toBe(true);
    expect(flagDuringCopy).toBe(true);
    await Promise.resolve();
    expect(applicationCopyRef.current).toBe(false);
  });

  it("works with Cmd as well as Ctrl, and not with both or neither", () => {
    const { calls } = setup({ selectedMeasurementIds: ["a"] });
    press("c", { metaKey: true });
    expect(calls.copyMeasurements).toHaveBeenCalledTimes(1);
    press("c", { metaKey: true, ctrlKey: true });
    press("c");
    expect(calls.copyMeasurements).toHaveBeenCalledTimes(1);
  });

  it("leaves the browser's own copy alone when text is selected or nothing is selected", () => {
    const withText = setup({ selectedMeasurementIds: ["a"] });
    const paragraph = document.createElement("p");
    paragraph.textContent = "some text";
    document.body.append(paragraph);
    window.getSelection()!.selectAllChildren(paragraph);
    expect(press("c", copyKey).defaultPrevented).toBe(false);
    paragraph.remove();
    expect(withText.calls.copyMeasurements).not.toHaveBeenCalled();
    act(() => root!.unmount());
    container!.remove();

    const empty = setup({ selectedMeasurementIds: [] });
    expect(press("c", copyKey).defaultPrevented).toBe(false);
    expect(empty.calls.copyMeasurements).not.toHaveBeenCalled();
  });

  it("refuses to copy a selection that includes another page", () => {
    const { calls } = setup({ selectedMeasurementIds: ["a", "c"] });
    const event = press("c", copyKey);
    expect(event.defaultPrevented).toBe(true);
    expect(calls.setError).toHaveBeenCalledWith(
      "Select measurements from a single page to copy them together.",
    );
    expect(calls.copyMeasurements).not.toHaveBeenCalled();
  });

  it("does not copy while a measurement is being edited", () => {
    const { calls } = setup({
      selectedMeasurementIds: ["a"],
      activeMeasurementEditIdRef: { current: "a" },
    });
    press("c", copyKey);
    expect(calls.copyMeasurements).not.toHaveBeenCalled();
  });

  it.each([
    ["Shift is held", { ctrlKey: true, shiftKey: true }],
    ["Alt is held", { ctrlKey: true, altKey: true }],
    ["the key repeats", { ctrlKey: true, repeat: true }],
  ])("ignores the shortcut when %s", (_label, init) => {
    const { calls } = setup({ selectedMeasurementIds: ["a"] });
    press("c", init);
    expect(calls.copyMeasurements).not.toHaveBeenCalled();
  });

  it("ignores the shortcut inside a text field or a dialog", () => {
    const { calls } = setup({ selectedMeasurementIds: ["a"] });
    const input = document.createElement("input");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(input, dialog);
    press("c", copyKey, input);
    press("c", copyKey, button);
    input.remove();
    dialog.remove();
    expect(calls.copyMeasurements).not.toHaveBeenCalled();
  });
});

describe("pasting with the keyboard", () => {
  const pasteKey = { ctrlKey: true };
  const clipboard = (sourcePageNumber: number, ...ids: string[]) => {
    const measurements = ids.map((id) => line(id, `Copy of ${id}`));
    return { sourcePageNumber, measurement: measurements[0], measurements };
  };

  it("does nothing without a copied measurement", () => {
    const { calls } = setup();
    expect(press("v", pasteKey).defaultPrevented).toBe(false);
    expect(calls.pasteMeasurements).not.toHaveBeenCalled();
  });

  it("pastes onto the current page and selects the new measurements", () => {
    const { calls } = setup({ measurementClipboard: clipboard(1, "a", "b") });
    const event = press("v", pasteKey);
    expect(event.defaultPrevented).toBe(true);
    expect(calls.pasteMeasurements).toHaveBeenCalledOnce();
    const commands = calls.pasteMeasurements.mock.calls[0]![0] as unknown as Array<{
      pageNumber: number;
      sourcePageNumber: number;
      id: string;
    }>;
    expect(commands).toHaveLength(2);
    expect(
      commands.every((command) => command.pageNumber === 1 && command.sourcePageNumber === 1),
    ).toBe(true);
    expect(calls.selectWorkspaceMeasurements).toHaveBeenCalledWith(commands.map(({ id }) => id));
  });

  it("offsets a same-page paste so the copy does not sit on the original", () => {
    const { calls } = setup({ measurementClipboard: clipboard(1, "a") });
    press("v", pasteKey);
    const [command] = calls.pasteMeasurements.mock.calls[0]![0] as unknown as Array<{
      measurement: Measurement;
    }>;
    expect(command!.measurement.points[0]).toEqual({ x: 12, y: 12 });
  });

  it("pastes from another page only when it fits the destination", () => {
    const fits = setup({ measurementClipboard: clipboard(2, "c") });
    press("v", pasteKey);
    expect(fits.calls.pasteMeasurements).toHaveBeenCalledOnce();
    expect(fits.calls.setError).not.toHaveBeenCalled();
    act(() => root!.unmount());
    container!.remove();

    const tooBig = setup({
      measurementClipboard: clipboard(2, "c"),
      viewerPageBounds: { pageNumber: 1, bounds: { width: 5, height: 5, rotation: 0 } },
    });
    press("v", pasteKey);
    expect(tooBig.calls.pasteMeasurements).not.toHaveBeenCalled();
    expect(tooBig.calls.setError).toHaveBeenCalledWith(
      "The copied measurements do not fit within this page without changing their geometry.",
    );
  });

  it("asks to wait when the destination page has not finished loading", () => {
    const { calls } = setup({
      measurementClipboard: clipboard(2, "c"),
      viewerPageBounds: { pageNumber: 2, bounds: page },
    });
    press("v", pasteKey);
    expect(calls.setError).toHaveBeenCalledWith(
      "Wait for this page to finish loading before pasting a measurement from another page.",
    );
    expect(calls.pasteMeasurements).not.toHaveBeenCalled();
  });

  it.each([
    ["a draft is open", { draft: { points: [] } }],
    [
      "a scale is being drawn",
      {
        calibrationFlow: { pageNumber: 1, calibrationId: null, mode: "uniform", phase: "uniform" },
      },
    ],
    ["a scale point is waiting", { calibrationCandidate: { pageNumber: 1, points: [] } }],
    [
      "a scale reference is being edited",
      {
        calibrationReferenceEdit: {
          pageNumber: 1,
          calibrationId: "s",
          reference: "uniform",
          points: [],
        },
      },
    ],
    ["a measurement is being edited", { activeMeasurementEditIdRef: { current: "a" } }],
  ])("does not paste while %s", (_label, overrides) => {
    const { calls } = setup({ measurementClipboard: clipboard(1, "a"), ...overrides });
    expect(press("v", pasteKey).defaultPrevented).toBe(false);
    expect(calls.pasteMeasurements).not.toHaveBeenCalled();
  });

  it("does nothing without a session and stops listening when it unmounts", () => {
    const noSession = setup({ session: null, measurementClipboard: clipboard(1, "a") });
    press("v", pasteKey);
    expect(noSession.calls.pasteMeasurements).not.toHaveBeenCalled();
    act(() => root!.unmount());
    container!.remove();

    const mounted = setup({ measurementClipboard: clipboard(1, "a") });
    act(() => root!.unmount());
    root = null;
    press("v", pasteKey);
    expect(mounted.calls.pasteMeasurements).not.toHaveBeenCalled();
  });
});
