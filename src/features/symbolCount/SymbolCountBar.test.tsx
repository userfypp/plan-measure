/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SymbolCountBar } from "./SymbolCountBar";
import { createSymbolCountSession } from "./symbolCountSession";
import { stopSymbolCount } from "./symbolCountSession";
import { getSymbolCount, startSymbolCount } from "./symbolCountStore";
import type { CreateSymbolSearch, SymbolSearchCallbacks } from "./symbolSearch";

let root: Root;
let container: HTMLDivElement;
let callbacks: SymbolSearchCallbacks;
const search = vi.fn();
const create: CreateSymbolSearch = (_image, given) => {
  callbacks = given;
  return { search, terminate: vi.fn() };
};
let session = createSymbolCountSession(create);

function renderBar() {
  act(() => root.render(<SymbolCountBar session={session} />));
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.startsWith(name),
  );
  if (!found) throw new Error(`No button ${name}.`);
  return found;
}

function startReview(matches: { x: number; y: number; score: number }[]) {
  act(() => {
    session.startSearch({
      image: { data: new Uint8Array(1), width: 1, height: 1 },
      scale: 1,
      box: { x: 0, y: 0, width: 1, height: 1 },
      existing: [],
    });
    callbacks.onResult({ matches: matches.map((match) => ({ ...match, width: 10, height: 10 })) });
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  search.mockClear();
  session = createSymbolCountSession(create);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  stopSymbolCount();
});

describe("SymbolCountBar", () => {
  it("asks for a box and cancels", () => {
    startSymbolCount();
    renderBar();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Drag a box around one symbol",
    );
    act(() => button("Cancel").click());
    expect(getSymbolCount().active).toBe(false);
  });

  it("shows the progress while searching", () => {
    renderBar();
    act(() => {
      session.startSearch({
        image: { data: new Uint8Array(1), width: 1, height: 1 },
        scale: 1,
        box: { x: 0, y: 0, width: 1, height: 1 },
        existing: [],
      });
      callbacks.onProgress(0.42);
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Searching the page… 42%");
    expect(container.querySelector('[role="switch"]')).toBeNull();
  });

  it("reviews matches, filters them and adds the accepted ones", () => {
    const commit = vi.fn();
    session.setCommitHandler(commit);
    startSymbolCount();
    renderBar();
    startReview([
      { x: 5, y: 5, score: 1 },
      { x: 50, y: 5, score: 0.9 },
      { x: 90, y: 5, score: 0.65 },
    ]);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("2 matches");
    expect(button("Add 2 items").disabled).toBe(false);
    const orientation = container.querySelector<HTMLInputElement>(
      '[aria-label="Any orientation"]',
    )!;
    expect(orientation.checked).toBe(true);
    act(() => session.setSimilarity("loose"));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("3 matches");
    act(() => orientation.click());
    expect(search).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 1, height: 1 }, false);
    startReview([{ x: 5, y: 5, score: 1 }]);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("1 match");
    act(() => button("Add 1 item").click());
    expect(commit).toHaveBeenCalledWith([{ x: 5, y: 5 }]);
    expect(getSymbolCount().active).toBe(false);
  });

  it("disables Add when nothing is accepted", () => {
    renderBar();
    startReview([{ x: 5, y: 5, score: 0.55 }]);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("0 matches");
    expect(button("Add 0 items").disabled).toBe(true);
  });

  it("explains an empty box and goes back to picking", () => {
    renderBar();
    act(() => {
      session.startSearch({
        image: { data: new Uint8Array(1), width: 1, height: 1 },
        scale: 1,
        box: { x: 0, y: 0, width: 1, height: 1 },
        existing: [],
      });
      callbacks.onResult({ matches: [], failure: "empty" });
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "The box is empty. Drag a box around a symbol.",
    );
    expect(container.querySelector('[role="switch"]')).toBeNull();
  });
});
