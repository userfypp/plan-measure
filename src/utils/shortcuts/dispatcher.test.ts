/* @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reloadAppPreferencesFromStorage,
  resetAppPreferences,
  setAppPreference,
} from "../appPreferences";
import type { ActionId } from "./bindings";
import { isBlockingOverlayOpen, useShortcutHandlers, type ShortcutHandler } from "./dispatcher";

interface Mounted {
  rerender(handler: ShortcutHandler): void;
  unmount(): void;
}

const mounted = new Set<Mounted>();

function mount(handler: ShortcutHandler): Mounted {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  function Host({ onShortcut }: { onShortcut: ShortcutHandler }) {
    useShortcutHandlers(onShortcut);
    return null;
  }
  const render = (next: ShortcutHandler) =>
    act(() => root.render(createElement(Host, { onShortcut: next })));
  render(handler);
  const entry: Mounted = {
    rerender: render,
    unmount() {
      act(() => root.unmount());
      container.remove();
      mounted.delete(entry);
    },
  };
  mounted.add(entry);
  return entry;
}

/** A handler that records what it is asked and claims every action. */
function recorder(result = true) {
  const calls: Array<{ action: ActionId; event: KeyboardEvent }> = [];
  const handler: ShortcutHandler = (action, event) => {
    calls.push({ action, event });
    return result;
  };
  return { calls, handler, actions: () => calls.map((call) => call.action) };
}

function press(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document.body,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  parent: HTMLElement = document.body,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) created.setAttribute(name, value);
  parent.append(created);
  return created;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  reloadAppPreferencesFromStorage();
});

afterEach(() => {
  for (const entry of [...mounted]) entry.unmount();
  document.body.replaceChildren();
  resetAppPreferences();
});

describe("matching", () => {
  it("hands the matched action and the event to the handler", () => {
    const { calls, handler } = recorder();
    mount(handler);
    const event = press("l");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.action).toBe("tool.line");
    expect(calls[0]!.event).toBe(event);
  });

  it("leaves preventDefault to the handler", () => {
    const claiming = recorder(true);
    mount(claiming.handler);
    expect(press("l").defaultPrevented).toBe(false);
    const preventing = recorder();
    mount((action, event) => {
      event.preventDefault();
      return preventing.handler(action, event);
    });
    expect(press("v").defaultPrevented).toBe(true);
  });

  it("matches letters in either case and with Shift through the second pass", () => {
    const { actions, handler } = recorder();
    mount(handler);
    press("l");
    press("L");
    press("L", { shiftKey: true });
    expect(actions()).toEqual(["tool.line", "tool.line", "tool.line"]);
  });

  it("prefers an exact Shift binding over the bare key", () => {
    setAppPreference("shortcutBindings", { "tool.hand": ["Shift+L"] });
    const { actions, handler } = recorder();
    mount(handler);
    press("L", { shiftKey: true });
    press("l");
    expect(actions()).toEqual(["tool.hand", "tool.line"]);
  });

  it("applies the second pass to named keys but never to Mod or Alt combos", () => {
    setAppPreference("shortcutBindings", { "tool.line": ["Alt+L"] });
    const { actions, handler } = recorder();
    mount(handler);
    press("Delete", { shiftKey: true });
    press("Z", { ctrlKey: true, shiftKey: true });
    press("C", { ctrlKey: true, shiftKey: true });
    press("l", { altKey: true, code: "KeyL" });
    press("L", { altKey: true, shiftKey: true, code: "KeyL" });
    expect(actions()).toEqual(["edit.delete", "edit.redo", "tool.line"]);
  });

  it("matches Mod combos with Ctrl or Command, and Ctrl+Z on an AZERTY layout", () => {
    const { actions, handler } = recorder();
    mount(handler);
    press("z", { ctrlKey: true });
    press("z", { metaKey: true });
    press("z", { ctrlKey: true, code: "KeyW" });
    press("Z", { metaKey: true, shiftKey: true });
    press("y", { ctrlKey: true });
    expect(actions()).toEqual(["edit.undo", "edit.undo", "edit.undo", "edit.redo", "edit.redo"]);
  });

  it("matches Option+letter by physical key and Alt+PageDown as typed", () => {
    setAppPreference("shortcutBindings", { "tool.line": ["Alt+L"], "page.next": ["Alt+PageDown"] });
    const { actions, handler } = recorder();
    mount(handler);
    press("¬", { altKey: true, code: "KeyL" });
    press("PageDown", { altKey: true, code: "PageDown" });
    expect(actions()).toEqual(["tool.line", "page.next"]);
  });

  it("follows rebinding at once, with no remount", () => {
    const { actions, handler } = recorder();
    mount(handler);
    act(() => setAppPreference("shortcutBindings", { "tool.line": ["Q"] }));
    press("l");
    press("q");
    expect(actions()).toEqual(["tool.line"]);
  });

  it("ignores unbound and fixed keys, dead keys, AltGr and bare modifiers", () => {
    const { calls, handler } = recorder();
    mount(handler);
    for (const key of [" ", "Enter", "Escape", "ArrowLeft", "e", "n", "[", "]", "x"]) press(key);
    press("Dead");
    press("Process");
    press("Unidentified");
    press("Shift", { shiftKey: true });
    press("Control", { ctrlKey: true });
    press("z", { ctrlKey: true, altKey: true });
    press("z", { ctrlKey: true, metaKey: true });
    expect(calls).toEqual([]);
  });
});

describe("discarded events", () => {
  it("skips an event another listener already handled", () => {
    const { calls, handler } = recorder();
    mount(handler);
    const child = element("div");
    child.addEventListener("keydown", (event) => event.preventDefault());
    press("l", {}, child);
    expect(calls).toEqual([]);
  });

  it("skips keys typed during composition", () => {
    const { calls, handler } = recorder();
    mount(handler);
    press("l", { isComposing: true });
    expect(calls).toEqual([]);
  });

  it("acts once per press except for zoom, Delete and page keys, which repeat", () => {
    const { actions, handler } = recorder();
    mount(handler);
    for (const key of ["l", "o", "s", "F", "T"]) press(key, { repeat: true });
    press("z", { ctrlKey: true, repeat: true });
    press("c", { ctrlKey: true, repeat: true });
    expect(actions()).toEqual([]);
    for (const key of ["+", "=", "-", "Delete", "Backspace", "PageUp", "PageDown"]) {
      press(key, { repeat: true });
    }
    expect(actions()).toEqual([
      "view.zoomIn",
      "view.zoomIn",
      "view.zoomOut",
      "edit.delete",
      "edit.delete",
      "page.previous",
      "page.next",
    ]);
  });
});

describe("target policy", () => {
  it.each([
    ["an input", () => element("input", { type: "text" })],
    ["a search input", () => element("input", { type: "search" })],
    ["a textarea", () => element("textarea")],
    ["a select", () => element("select")],
    ["a contenteditable region", () => element("div", { contenteditable: "true" })],
    ["a dialog", () => element("button", {}, element("dialog"))],
    ["a role=dialog region", () => element("button", {}, element("div", { role: "dialog" }))],
    ["a menu", () => element("button", {}, element("div", { role: "menu" }))],
    ["a listbox", () => element("button", {}, element("div", { role: "listbox" }))],
  ])("does not take plain keys from %s", (_name, build) => {
    const { calls, handler } = recorder();
    mount(handler);
    const target = build();
    press("l", {}, target);
    press("Delete", {}, target);
    press("+", {}, target);
    expect(calls).toEqual([]);
  });

  it.each([
    ["a button", () => element("button")],
    ["a link", () => element("a", { href: "#" })],
    ["a role=button", () => element("div", { role: "button" })],
    ["the body", () => document.body],
  ])("takes plain keys from %s", (_name, build) => {
    const { actions, handler } = recorder();
    mount(handler);
    const target = build();
    press("l", {}, target);
    press("Delete", {}, target);
    expect(actions()).toEqual(["tool.line", "edit.delete"]);
  });

  it.each([
    ["an input", () => element("input", { type: "text" })],
    ["a textarea", () => element("textarea")],
    ["a select", () => element("select")],
    ["a contenteditable region", () => element("div", { contenteditable: "true" })],
    ["a dialog", () => element("button", {}, element("dialog"))],
    ["a role=dialog region", () => element("div", {}, element("div", { role: "dialog" }))],
  ])("leaves Mod combos to the browser in %s", (_name, build) => {
    const { calls, handler } = recorder();
    mount(handler);
    const target = build();
    press("z", { ctrlKey: true }, target);
    press("c", { metaKey: true }, target);
    expect(calls).toEqual([]);
  });

  it.each([
    ["a button", () => element("button")],
    ["a checkbox input", () => element("input", { type: "checkbox" })],
    ["a range input", () => element("input", { type: "range" })],
    ["the body", () => document.body],
  ])("takes Mod combos from %s", (_name, build) => {
    const { actions, handler } = recorder();
    mount(handler);
    const target = build();
    press("z", { ctrlKey: true }, target);
    press("c", { metaKey: true }, target);
    expect(actions()).toEqual(["edit.undo", "edit.copy"]);
  });

  it("applies the Mod policy to Alt bindings too", () => {
    setAppPreference("shortcutBindings", { "tool.line": ["Alt+L"] });
    const { actions, handler } = recorder();
    mount(handler);
    press("l", { altKey: true, code: "KeyL" }, element("input", { type: "text" }));
    press("l", { altKey: true, code: "KeyL" }, element("button"));
    expect(actions()).toEqual(["tool.line"]);
  });
});

describe("paging keys", () => {
  const keys = ["PageUp", "PageDown", "Home", "End"];

  it("pages from the page, a button or the viewer", () => {
    const { actions, handler } = recorder();
    mount(handler);
    for (const key of keys) press(key);
    for (const key of keys) press(key, {}, element("button"));
    expect(actions()).toEqual([
      "page.previous",
      "page.next",
      "page.first",
      "page.last",
      "page.previous",
      "page.next",
      "page.first",
      "page.last",
    ]);
  });

  it.each([
    [
      "the workspace panel host",
      () => element("div", { "data-layout-slot": "workspace-panel-host" }),
    ],
    ["a tablist", () => element("div", { role: "tablist" })],
    ["a toolbar", () => element("div", { role: "toolbar" })],
    ["a grid", () => element("div", { role: "grid" })],
    ["a tree", () => element("div", { role: "tree" })],
  ])("leaves them to widgets inside %s", (_name, build) => {
    const { calls, handler } = recorder();
    mount(handler);
    const inner = element("button", {}, build());
    for (const key of keys) press(key, {}, inner);
    expect(calls).toEqual([]);
    press("l", {}, inner);
    expect(calls).toHaveLength(1);
  });

  it("leaves them to a scrollable ancestor but not to one that cannot scroll", () => {
    const { actions, handler } = recorder();
    mount(handler);
    const scroller = element("div", { style: "overflow-y: auto" });
    Object.defineProperty(scroller, "scrollHeight", { value: 500 });
    Object.defineProperty(scroller, "clientHeight", { value: 100 });
    const inner = element("button", {}, scroller);
    press("PageDown", {}, inner);
    expect(actions()).toEqual([]);

    const short = element("div", { style: "overflow-y: auto" });
    Object.defineProperty(short, "scrollHeight", { value: 100 });
    Object.defineProperty(short, "clientHeight", { value: 100 });
    press("PageDown", {}, element("button", {}, short));
    const hidden = element("div", { style: "overflow-y: hidden" });
    Object.defineProperty(hidden, "scrollHeight", { value: 500 });
    Object.defineProperty(hidden, "clientHeight", { value: 100 });
    press("PageUp", {}, element("button", {}, hidden));
    expect(actions()).toEqual(["page.next", "page.previous"]);
  });

  it("does not apply the guard to Alt bindings, which the browser does not scroll with", () => {
    setAppPreference("shortcutBindings", { "workspace.next": ["Alt+PageDown"] });
    const { actions, handler } = recorder();
    mount(handler);
    press("PageDown", { altKey: true }, element("button", {}, element("div", { role: "toolbar" })));
    expect(actions()).toEqual(["workspace.next"]);
  });
});

describe("handlers", () => {
  it("offers the most recently mounted handler first and stops at the first one that acts", () => {
    const order: string[] = [];
    mount(() => {
      order.push("first");
      return true;
    });
    mount(() => {
      order.push("second");
      return true;
    });
    press("l");
    expect(order).toEqual(["second"]);
  });

  it("falls through to older handlers while newer ones decline", () => {
    const order: string[] = [];
    mount(() => {
      order.push("first");
      return true;
    });
    mount(() => {
      order.push("second");
      return false;
    });
    mount(() => {
      order.push("third");
      return false;
    });
    press("l");
    expect(order).toEqual(["third", "second", "first"]);
  });

  it("stops offering the action to a handler once it unmounts", () => {
    const older = recorder();
    mount(older.handler);
    const newer = recorder();
    const second = mount(newer.handler);
    press("l");
    second.unmount();
    press("l");
    expect(newer.calls).toHaveLength(1);
    expect(older.calls).toHaveLength(1);
  });

  it("always calls the latest handler without re-registering", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const first = recorder();
    const entry = mount(first.handler);
    const second = recorder();
    entry.rerender(second.handler);
    press("l");
    expect(first.calls).toEqual([]);
    expect(second.calls).toHaveLength(1);
    expect(add.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    expect(remove.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(0);
  });

  it("shares one window listener across handlers and removes it with the last one", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === "keydown").length;
    const a = mount(recorder().handler);
    const b = mount(recorder().handler);
    expect(count(add)).toBe(1);
    a.unmount();
    expect(count(remove)).toBe(0);
    b.unmount();
    expect(count(remove)).toBe(1);
    const again = recorder();
    mount(again.handler);
    expect(count(add)).toBe(2);
    press("l");
    expect(again.calls).toHaveLength(1);
  });

  it("does not listen at all while nothing is mounted", () => {
    const { calls, handler } = recorder();
    mount(handler).unmount();
    press("l");
    expect(calls).toEqual([]);
  });
});

describe("isBlockingOverlayOpen", () => {
  it("is false for a plain page and a closed dialog", () => {
    expect(isBlockingOverlayOpen()).toBe(false);
    element("dialog");
    element("div", { role: "dialog" });
    expect(isBlockingOverlayOpen()).toBe(false);
  });

  it.each([
    ["an open dialog", { tag: "dialog", attributes: { open: "" } }],
    ["a modal role=dialog", { tag: "div", attributes: { role: "dialog", "aria-modal": "true" } }],
    [
      "the viewer interaction shield",
      { tag: "div", attributes: { "data-layout-slot": "viewer-interaction-shield" } },
    ],
  ] as const)("is true while %s is present", (_name, { tag, attributes }) => {
    const overlay = element(tag, attributes);
    expect(isBlockingOverlayOpen()).toBe(true);
    overlay.remove();
    expect(isBlockingOverlayOpen()).toBe(false);
  });
});
