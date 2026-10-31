/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OVERLAY_THUMB_CLASS } from "./overlayScrollbars";
import { HOVER_ACTIVE_ATTRIBUTE, HOVER_ROW_ATTRIBUTE, installScrollHover } from "./scrollHover";

let host: HTMLDivElement;
let uninstall: (() => void) | null = null;
let under: Element | null = null;
let queued: FrameRequestCallback | null = null;

function flush() {
  const callback = queued;
  queued = null;
  callback?.(0);
}

beforeEach(() => {
  queued = null;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queued = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    queued = null;
  });
  document.elementFromPoint = () => under;
  host = document.createElement("div");
  document.body.append(host);
  uninstall = installScrollHover();
});

afterEach(() => {
  uninstall?.();
  host.remove();
  under = null;
  vi.unstubAllGlobals();
});

function addRow(): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute(HOVER_ROW_ATTRIBUTE, "");
  const child = document.createElement("span");
  row.append(child);
  host.append(row);
  return row;
}

function movePointer(pointerType = "mouse") {
  const event = new Event("pointermove", { bubbles: true });
  Object.assign(event, { pointerType, clientX: 10, clientY: 10 });
  host.dispatchEvent(event);
  flush();
}

describe("installScrollHover", () => {
  it("lights the row under the pointer and follows it when a scroll moves another row under it", () => {
    const first = addRow();
    const second = addRow();
    under = first.firstElementChild;
    movePointer();
    expect(first.hasAttribute(HOVER_ACTIVE_ATTRIBUTE)).toBe(true);

    under = second;
    first.dispatchEvent(new Event("scroll"));
    expect(queued).not.toBeNull();
    flush();
    expect(first.hasAttribute(HOVER_ACTIVE_ATTRIBUTE)).toBe(false);
    expect(second.hasAttribute(HOVER_ACTIVE_ATTRIBUTE)).toBe(true);
  });

  it("clears the light when the pointer leaves the page or rests outside any row", () => {
    const row = addRow();
    under = row;
    movePointer();
    expect(row.hasAttribute(HOVER_ACTIVE_ATTRIBUTE)).toBe(true);

    under = host;
    movePointer();
    expect(row.hasAttribute(HOVER_ACTIVE_ATTRIBUTE)).toBe(false);

    under = row;
    movePointer();
    document.documentElement.dispatchEvent(new Event("pointerleave"));
    flush();
    expect(row.hasAttribute(HOVER_ACTIVE_ATTRIBUTE)).toBe(false);
  });

  it("keeps the light while the overlay scrollbar thumb is under the pointer and ignores touch", () => {
    const row = addRow();
    under = row;
    movePointer();
    const thumb = document.createElement("div");
    thumb.className = OVERLAY_THUMB_CLASS;
    under = thumb;
    movePointer();
    expect(row.hasAttribute(HOVER_ACTIVE_ATTRIBUTE)).toBe(true);

    under = host;
    movePointer("touch");
    expect(row.hasAttribute(HOVER_ACTIVE_ATTRIBUTE)).toBe(true);
  });
});
