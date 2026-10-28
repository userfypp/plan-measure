/* @vitest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DragEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFileDropZone } from "./useFileDropZone";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let zone: ReturnType<typeof useFileDropZone>;
const chooseFile = vi.fn();

function Harness() {
  const current = useFileDropZone(chooseFile);
  useEffect(() => {
    zone = current;
  });
  return null;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  chooseFile.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<Harness />));
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

const pdf = (name: string) => new File(["pdf"], name, { type: "application/pdf" });
function dragEvent(files: File[] = []) {
  const preventDefault = vi.fn();
  const event = { preventDefault, dataTransfer: { files } } as unknown as DragEvent<HTMLElement>;
  return { event, preventDefault };
}
const enter = () => act(() => zone.handleDragEnter(dragEvent().event));
const leave = () => act(() => zone.handleDragLeave(dragEvent().event));

describe("file drop zone", () => {
  it("is active from the first drag-enter until the pointer has left every nested element", () => {
    expect(zone.dragActive).toBe(false);
    enter();
    expect(zone.dragActive).toBe(true);
    enter();
    leave();
    expect(zone.dragActive).toBe(true);
    leave();
    expect(zone.dragActive).toBe(false);
  });

  it("does not count a stray drag-leave against the next drag", () => {
    leave();
    leave();
    enter();
    expect(zone.dragActive).toBe(true);
    leave();
    expect(zone.dragActive).toBe(false);
  });

  it("lets the browser drop by cancelling the default action on every drag event", () => {
    for (const handler of [zone.handleDragEnter, zone.handleDragOver, zone.handleDragLeave]) {
      const { event, preventDefault } = dragEvent();
      act(() => handler(event));
      expect(preventDefault).toHaveBeenCalledOnce();
    }
    const { event, preventDefault } = dragEvent([pdf("a.pdf")]);
    act(() => zone.handleDrop(event));
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("opens only the first dropped file and ends the drag", () => {
    enter();
    const first = pdf("first.pdf");
    act(() => zone.handleDrop(dragEvent([first, pdf("second.pdf")]).event));
    expect(chooseFile).toHaveBeenCalledOnce();
    expect(chooseFile).toHaveBeenCalledWith(first);
    expect(zone.dragActive).toBe(false);
  });

  it("opens nothing when the drop carries no file, and still ends the drag", () => {
    enter();
    act(() => zone.handleDrop(dragEvent([]).event));
    expect(chooseFile).not.toHaveBeenCalled();
    expect(zone.dragActive).toBe(false);
  });

  it("starts counting again after a drop", () => {
    enter();
    enter();
    act(() => zone.handleDrop(dragEvent([pdf("a.pdf")]).event));
    enter();
    leave();
    expect(zone.dragActive).toBe(false);
  });

  it.each([
    ["the window loses focus", () => window.dispatchEvent(new Event("blur"))],
    ["the drag ends elsewhere", () => window.dispatchEvent(new Event("dragend"))],
    ["a file is dropped outside the zone", () => window.dispatchEvent(new Event("drop"))],
    ["the tab is hidden", () => document.dispatchEvent(new Event("visibilitychange"))],
  ])("clears the overlay when %s", (_label, trigger) => {
    enter();
    enter();
    expect(zone.dragActive).toBe(true);
    act(() => {
      trigger();
    });
    expect(zone.dragActive).toBe(false);
    // The depth was reset too, so one enter and one leave end the next drag.
    enter();
    leave();
    expect(zone.dragActive).toBe(false);
  });

  it("stops listening to the window and document when it unmounts", () => {
    const removed = vi.spyOn(window, "removeEventListener");
    const removedFromDocument = vi.spyOn(document, "removeEventListener");
    act(() => root!.unmount());
    root = createRoot(container!);
    expect(removed.mock.calls.map(([type]) => type).sort()).toEqual(["blur", "dragend", "drop"]);
    expect(removedFromDocument.mock.calls.map(([type]) => type)).toEqual(["visibilitychange"]);
  });
});
