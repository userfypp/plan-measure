/* @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  reloadAppPreferencesFromStorage,
  resetAppPreferences,
  setAppPreference,
} from "../appPreferences";
import { DEFAULT_BINDINGS, type ActionId, type ShortcutBindings } from "./bindings";
import { useShortcutHandlers } from "./dispatcher";

/** The `legacy` preset's undo/redo and copy/paste/delete keys: what the app did before keys were configurable. */
const LEGACY_EDIT_BINDINGS: ShortcutBindings = {
  "edit.undo": ["Mod+Z"],
  "edit.redo": ["Mod+Shift+Z"],
  "edit.copy": ["Mod+C"],
  "edit.paste": ["Mod+V"],
  "edit.delete": ["Delete", "Backspace"],
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let fired: ActionId[] = [];

function Host() {
  useShortcutHandlers((action) => {
    fired.push(action);
    return true;
  });
  return null;
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

/** The edit action one real keydown resolves to, or null when none fires. */
function edit(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = element("canvas"),
): ActionId | null {
  const before = fired.length;
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
  return fired.slice(before).find((action) => action.startsWith("edit.")) ?? null;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  reloadAppPreferencesFromStorage();
  setAppPreference("shortcutBindings", LEGACY_EDIT_BINDINGS);
  fired = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(createElement(Host)));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  resetAppPreferences();
});

describe("legacy edit keys", () => {
  it("are all kept by the default map", () => {
    for (const [id, combos] of Object.entries(LEGACY_EDIT_BINDINGS)) {
      expect(DEFAULT_BINDINGS[id as ActionId], id).toEqual(expect.arrayContaining([...combos!]));
    }
  });
});

describe("copy and paste", () => {
  it.each([
    ["metaKey", "c", "edit.copy"],
    ["ctrlKey", "C", "edit.copy"],
    ["metaKey", "v", "edit.paste"],
    ["ctrlKey", "V", "edit.paste"],
  ] as const)("maps %s+%s to %s", (modifier, key, action) => {
    expect(edit(key, { [modifier]: true })).toBe(action);
  });

  it.each([
    ["an input", () => element("input", { type: "text" })],
    ["a search input", () => element("input", { type: "search" })],
    ["a textarea", () => element("textarea")],
    ["a select", () => element("select")],
    ["a contenteditable region", () => element("div", { contenteditable: "true" })],
    [
      "a nested contenteditable region",
      () => element("span", {}, element("div", { contenteditable: "" })),
    ],
  ])("leaves native copy and paste untouched in %s", (_name, build) => {
    const target = build();
    expect(edit("c", { metaKey: true }, target)).toBeNull();
    expect(edit("v", { ctrlKey: true }, target)).toBeNull();
  });

  it.each([
    ["a dialog", () => element("span", {}, element("dialog"))],
    ["a role=dialog region", () => element("button", {}, element("div", { role: "dialog" }))],
  ])("does not claim shortcuts inside %s", (_name, build) => {
    const target = build();
    expect(edit("c", { metaKey: true }, target)).toBeNull();
    expect(edit("v", { ctrlKey: true }, target)).toBeNull();
  });

  it.each<[string, () => HTMLElement]>([
    ["a button", () => element("button")],
    ["a link", () => element("a", { href: "#" })],
    ["the body", () => document.body],
    ...["checkbox", "radio", "range", "button", "submit"].map(
      (type): [string, () => HTMLElement] => [`a ${type} input`, () => element("input", { type })],
    ),
  ])("keeps them available after focus moves to %s", (_name, build) => {
    const target = build();
    expect(edit("c", { metaKey: true }, target)).toBe("edit.copy");
    expect(edit("v", { ctrlKey: true }, target)).toBe("edit.paste");
  });

  it("does not claim modified variants, repeats, both modifiers or unmodified C and V", () => {
    expect(edit("v", { metaKey: true, shiftKey: true })).toBeNull();
    expect(edit("v", { ctrlKey: true, altKey: true })).toBeNull();
    expect(edit("c", { metaKey: true, repeat: true })).toBeNull();
    expect(edit("c", { metaKey: true, ctrlKey: true })).toBeNull();
    expect(edit("c")).toBeNull();
    expect(edit("v")).toBeNull();
  });

  it("does not claim an event another listener already handled", () => {
    const child = element("div");
    child.addEventListener("keydown", (event) => event.preventDefault());
    expect(edit("c", { metaKey: true }, child)).toBeNull();
  });

  it("matches the letter whatever the keyboard layout produces", () => {
    expect(edit("c", { ctrlKey: true, code: "KeyC" })).toBe("edit.copy");
    expect(edit("v", { ctrlKey: true, code: "KeyM" })).toBe("edit.paste");
  });
});

describe("delete", () => {
  it("keeps Delete and Backspace available without modifiers", () => {
    expect(edit("Delete")).toBe("edit.delete");
    expect(edit("Backspace")).toBe("edit.delete");
    expect(edit("Backspace", { metaKey: true })).toBeNull();
    expect(edit("Delete", { ctrlKey: true })).toBeNull();
    expect(edit("Delete", { altKey: true })).toBeNull();
  });

  it("still deletes with Shift held and while the key repeats", () => {
    expect(edit("Delete", { shiftKey: true })).toBe("edit.delete");
    expect(edit("Backspace", { repeat: true })).toBe("edit.delete");
  });

  it.each([
    ["a button", () => element("button")],
    ["a link", () => element("a", { href: "#" })],
    ["a role=button element", () => element("div", { role: "button" })],
    ["the body", () => document.body],
  ])("allows deleting a selected measurement after %s receives focus", (_name, build) => {
    const target = build();
    expect(edit("Delete", {}, target)).toBe("edit.delete");
    expect(edit("Backspace", {}, target)).toBe("edit.delete");
  });

  it.each([
    ["an input", () => element("input", { type: "text" })],
    ["a textarea", () => element("textarea")],
    ["a select", () => element("select")],
    ["a contenteditable region", () => element("div", { contenteditable: "true" })],
    ["a dialog", () => element("button", {}, element("dialog"))],
    ["a role=dialog region", () => element("button", {}, element("div", { role: "dialog" }))],
  ])("does not delete a measurement while %s has focus", (_name, build) => {
    const target = build();
    expect(edit("Delete", {}, target)).toBeNull();
    expect(edit("Backspace", {}, target)).toBeNull();
  });

  it("does not claim an event another listener already handled or one typed during composition", () => {
    const child = element("div");
    child.addEventListener("keydown", (event) => event.preventDefault());
    expect(edit("Delete", {}, child)).toBeNull();
    expect(edit("Backspace", { isComposing: true })).toBeNull();
  });
});

describe("undo and redo", () => {
  it.each(["metaKey", "ctrlKey"] as const)("maps %s+Z to undo", (modifier) => {
    expect(edit("Z", { [modifier]: true })).toBe("edit.undo");
    expect(edit("z", { [modifier]: true })).toBe("edit.undo");
  });

  it.each(["metaKey", "ctrlKey"] as const)("maps %s+Shift+Z to redo", (modifier) => {
    expect(edit("z", { [modifier]: true, shiftKey: true })).toBe("edit.redo");
    expect(edit("Z", { [modifier]: true, shiftKey: true })).toBe("edit.redo");
  });

  it("leaves Mod+Y alone and keeps Shift as the only redo modifier", () => {
    expect(edit("y", { ctrlKey: true })).toBeNull();
    expect(edit("z", { ctrlKey: true, shiftKey: true, altKey: true })).toBeNull();
  });

  it("finds Z by the character it types, as on an AZERTY keyboard", () => {
    expect(edit("z", { ctrlKey: true, code: "KeyW" })).toBe("edit.undo");
    expect(edit("Z", { metaKey: true, shiftKey: true, code: "KeyW" })).toBe("edit.redo");
  });

  it("follows the typed letter when Caps Lock is on", () => {
    expect(edit("Z", { ctrlKey: true })).toBe("edit.undo");
  });

  it("leaves repeats, bare Z, unrelated modifiers and handled events untouched", () => {
    expect(edit("z")).toBeNull();
    expect(edit("z", { metaKey: true, repeat: true })).toBeNull();
    expect(edit("z", { ctrlKey: true, shiftKey: true, repeat: true })).toBeNull();
    expect(edit("z", { ctrlKey: true, altKey: true })).toBeNull();
    expect(edit("z", { altKey: true })).toBeNull();
    expect(edit("z", { ctrlKey: true, metaKey: true })).toBeNull();
    const child = element("div");
    child.addEventListener("keydown", (event) => event.preventDefault());
    expect(edit("z", { metaKey: true }, child)).toBeNull();
  });

  it.each([
    ["an input", () => element("input", { type: "text" })],
    ["a textarea", () => element("textarea")],
    ["a select", () => element("select")],
    ["a contenteditable region", () => element("div", { contenteditable: "true" })],
    ["a dialog", () => element("span", {}, element("dialog"))],
  ])("leaves the native undo to %s", (_name, build) => {
    const target = build();
    expect(edit("z", { metaKey: true }, target)).toBeNull();
    expect(edit("z", { ctrlKey: true, shiftKey: true }, target)).toBeNull();
  });

  it("works from a focused button", () => {
    expect(edit("z", { metaKey: true }, element("button"))).toBe("edit.undo");
  });
});

describe("rebinding", () => {
  it("makes the new key work and the old one stop", () => {
    setAppPreference("shortcutBindings", { ...LEGACY_EDIT_BINDINGS, "edit.undo": ["Mod+Shift+U"] });
    expect(edit("U", { ctrlKey: true, shiftKey: true })).toBe("edit.undo");
    expect(edit("U", { metaKey: true, shiftKey: true })).toBe("edit.undo");
    expect(edit("z", { ctrlKey: true })).toBeNull();
    expect(edit("z", { ctrlKey: true, shiftKey: true })).toBe("edit.redo");
  });

  it("applies without remounting and keeps the target and repeat policies", () => {
    expect(edit("z", { ctrlKey: true })).toBe("edit.undo");
    act(() =>
      setAppPreference("shortcutBindings", {
        ...LEGACY_EDIT_BINDINGS,
        "edit.undo": ["Mod+Shift+U"],
      }),
    );
    expect(
      edit("U", { ctrlKey: true, shiftKey: true }, element("input", { type: "text" })),
    ).toBeNull();
    expect(edit("U", { ctrlKey: true, shiftKey: true, repeat: true })).toBeNull();
    expect(edit("U", { ctrlKey: true, shiftKey: true })).toBe("edit.undo");
  });

  it("moves copy, paste and delete to their new keys too", () => {
    setAppPreference("shortcutBindings", {
      "edit.copy": ["Mod+Shift+K"],
      "edit.paste": ["Mod+Shift+J"],
      "edit.delete": ["Mod+Shift+Backspace"],
    });
    expect(edit("K", { ctrlKey: true, shiftKey: true })).toBe("edit.copy");
    expect(edit("J", { ctrlKey: true, shiftKey: true })).toBe("edit.paste");
    expect(edit("Backspace", { ctrlKey: true, shiftKey: true })).toBe("edit.delete");
    expect(edit("c", { ctrlKey: true })).toBeNull();
    expect(edit("v", { ctrlKey: true })).toBeNull();
    expect(edit("Delete")).toBeNull();
    expect(edit("Backspace")).toBeNull();
  });

  it("stops an action for good when its shortcut is cleared", () => {
    setAppPreference("shortcutBindings", { ...LEGACY_EDIT_BINDINGS, "edit.undo": [] });
    expect(edit("z", { ctrlKey: true })).toBeNull();
    expect(edit("z", { ctrlKey: true, shiftKey: true })).toBe("edit.redo");
  });
});
