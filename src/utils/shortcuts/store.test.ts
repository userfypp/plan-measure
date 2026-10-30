/* @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reloadAppPreferencesFromStorage,
  resetAppPreferences,
  setAppPreference,
} from "../appPreferences";
import { ACTION_IDS, DEFAULT_BINDINGS, type ActionId } from "./bindings";
import {
  formatBinding,
  formatBindingAria,
  getShortcutLabel,
  getShortcutSnapshot,
  resolveBindings,
  useShortcutAria,
  useShortcutLabel,
  useShortcutLabels,
} from "./store";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function stubPlatform(navigatorLike: object): void {
  vi.stubGlobal("navigator", navigatorLike);
}

function mountProbe<T>(useValue: () => T): T[] {
  const seen: T[] = [];
  function Probe() {
    seen.push(useValue());
    return null;
  }
  act(() => root!.render(createElement(Probe)));
  return seen;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  reloadAppPreferencesFromStorage();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  resetAppPreferences();
});

describe("resolveBindings", () => {
  it("is Default when nothing is stored", () => {
    expect(resolveBindings({})).toEqual(DEFAULT_BINDINGS);
  });

  it("lets a stored list replace the default one, and [] remove it", () => {
    const resolved = resolveBindings({ "tool.line": ["Q"], "tool.hand": [] });
    expect(resolved["tool.line"]).toEqual(["Q"]);
    expect(resolved["tool.hand"]).toEqual([]);
    expect(resolved["tool.select"]).toEqual(DEFAULT_BINDINGS["tool.select"]);
  });

  it("drops an inherited default that a stored binding now owns", () => {
    const resolved = resolveBindings({ "tool.hand": ["L"] });
    expect(resolved["tool.hand"]).toEqual(["L"]);
    expect(resolved["tool.line"]).toEqual([]);
  });

  it("keeps the first action in catalog order when two stored lists collide", () => {
    const resolved = resolveBindings({ "tool.hand": ["Q"], "tool.select": ["Q", "W"] });
    expect(resolved["tool.select"]).toEqual(["Q", "W"]);
    expect(resolved["tool.hand"]).toEqual([]);
  });

  it("gives every combo to exactly one action", () => {
    const resolved = resolveBindings({
      "tool.hand": ["L", "Mod+Z"],
      "edit.copy": ["L"],
      "view.zoomIn": ["Delete"],
    });
    const combos = ACTION_IDS.flatMap((id) => resolved[id]);
    expect(new Set(combos).size).toBe(combos.length);
  });
});

describe("formatting", () => {
  it.each([
    ["L", "L", "L"],
    ["Mod+Z", "Ctrl+Z", "⌘Z"],
    ["Mod+Shift+Z", "Ctrl+Shift+Z", "⌘⇧Z"],
    ["Alt+L", "Alt+L", "⌥L"],
    ["Alt+Shift+PageDown", "Alt+Shift+PageDown", "⌥⇧PageDown"],
    ["Mod+,", "Ctrl+,", "⌘,"],
    ["Delete", "Delete", "Delete"],
    ["+", "+", "+"],
  ])("labels %s as %s and %s", (combo, other, apple) => {
    expect(formatBinding(combo, false)).toBe(other);
    expect(formatBinding(combo, true)).toBe(apple);
  });

  it.each([
    ["L", "L"],
    ["Shift+L", "Shift+L"],
    ["Mod+Z", "Control+Z Meta+Z"],
    ["Mod+Shift+Z", "Control+Shift+Z Meta+Shift+Z"],
    ["Alt+PageDown", "Alt+PageDown"],
    ["+", "+"],
  ])("writes %s as aria-keyshortcuts %s", (combo, aria) => {
    expect(formatBindingAria(combo)).toBe(aria);
  });
});

describe("shortcut snapshot", () => {
  it("indexes the resolved bindings by action and by combo", () => {
    const snapshot = getShortcutSnapshot();
    expect(snapshot.byAction).toEqual(DEFAULT_BINDINGS);
    expect(snapshot.byCombo.get("L")).toBe("tool.line");
    expect(snapshot.byCombo.get("Mod+Shift+Z")).toBe("edit.redo");
    expect(snapshot.byCombo.get("Mod+Y")).toBe("edit.redo");
    expect(snapshot.byCombo.get("Mod+Alt+L")).toBeUndefined();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.labels)).toBe(true);
    expect(Object.isFrozen(snapshot.byAction["edit.delete"])).toBe(true);
  });

  it("keeps its identity until the stored bindings change", () => {
    const first = getShortcutSnapshot();
    expect(getShortcutSnapshot()).toBe(first);
    setAppPreference("maxZoom", 16);
    setAppPreference("shortcutPreset", "legacy");
    expect(getShortcutSnapshot()).toBe(first);
    setAppPreference("shortcutBindings", { "tool.line": ["Q"] });
    const second = getShortcutSnapshot();
    expect(second).not.toBe(first);
    expect(second.byCombo.get("Q")).toBe("tool.line");
    expect(second.byCombo.get("L")).toBeUndefined();
    expect(getShortcutSnapshot()).toBe(second);
    resetAppPreferences();
    expect(getShortcutSnapshot().byAction).toEqual(DEFAULT_BINDINGS);
  });

  it("labels the first binding and lists every binding in aria, or nothing when unbound", () => {
    stubPlatform({ platform: "Win32" });
    const { labels, aria } = getShortcutSnapshot();
    expect(labels["edit.redo"]).toBe("Ctrl+Shift+Z");
    expect(aria["edit.redo"]).toBe("Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y");
    expect(labels["view.zoomIn"]).toBe("+");
    expect(aria["view.zoomIn"]).toBe("+ =");
    expect(labels["tool.calibrate"]).toBe("");
    expect(aria["tool.calibrate"]).toBe("");
  });

  it("labels with symbols on Apple platforms, preferring userAgentData over platform", () => {
    stubPlatform({ platform: "MacIntel" });
    expect(getShortcutLabel("edit.redo")).toBe("⌘⇧Z");
    expect(getShortcutLabel("tool.line")).toBe("L");
    stubPlatform({ platform: "iPhone" });
    expect(getShortcutLabel("edit.undo")).toBe("⌘Z");
    stubPlatform({ platform: "iPad" });
    expect(getShortcutLabel("edit.undo")).toBe("⌘Z");
    stubPlatform({ platform: "Win32", userAgentData: { platform: "macOS" } });
    expect(getShortcutLabel("edit.undo")).toBe("⌘Z");
    stubPlatform({ platform: "MacIntel", userAgentData: { platform: "Windows" } });
    expect(getShortcutLabel("edit.undo")).toBe("Ctrl+Z");
    stubPlatform({ platform: "Linux x86_64" });
    expect(getShortcutLabel("edit.undo")).toBe("Ctrl+Z");
  });

  it("rebuilds only when the platform really changes", () => {
    stubPlatform({ platform: "Win32" });
    const windows = getShortcutSnapshot();
    stubPlatform({ platform: "Win32" });
    expect(getShortcutSnapshot()).toBe(windows);
    stubPlatform({ platform: "MacIntel" });
    expect(getShortcutSnapshot()).not.toBe(windows);
  });

  it("resolves collisions the same way as resolveBindings", () => {
    setAppPreference("shortcutBindings", { "tool.hand": ["L"] });
    const { byCombo, labels } = getShortcutSnapshot();
    expect(byCombo.get("L")).toBe("tool.hand");
    expect(labels["tool.line"]).toBe("");
  });
});

describe("shortcut hooks", () => {
  it("return the label and aria strings of one action", () => {
    stubPlatform({ platform: "Win32" });
    const labels = mountProbe(() => useShortcutLabel("edit.undo"));
    const aria = mountProbe(() => useShortcutAria("edit.undo"));
    expect(labels.at(-1)).toBe("Ctrl+Z");
    expect(aria.at(-1)).toBe("Control+Z Meta+Z");
  });

  it("re-render only when the string they return changes", () => {
    stubPlatform({ platform: "Win32" });
    const seen = mountProbe(() => useShortcutLabel("tool.line"));
    expect(seen).toEqual(["L"]);
    act(() => setAppPreference("maxZoom", 16));
    act(() => setAppPreference("shortcutBindings", { "tool.hand": ["Q"] }));
    expect(seen).toEqual(["L"]);
    act(() => setAppPreference("shortcutBindings", { "tool.line": ["Alt+L"] }));
    expect(seen).toEqual(["L", "Alt+L"]);
    act(() => setAppPreference("shortcutBindings", { "tool.line": [] }));
    expect(seen).toEqual(["L", "Alt+L", ""]);
  });

  it("share one stable labels map until a binding changes", () => {
    const seen = mountProbe(() => useShortcutLabels());
    act(() => setAppPreference("maxZoom", 16));
    expect(seen).toHaveLength(1);
    act(() => setAppPreference("shortcutBindings", { "tool.line": ["Q"] }));
    expect(seen).toHaveLength(2);
    const labels: Readonly<Record<ActionId, string>> = seen[1]!;
    expect(labels["tool.line"]).toBe("Q");
    expect(labels).toBe(getShortcutSnapshot().labels);
  });
});
