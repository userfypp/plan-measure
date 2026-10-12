/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import type { DrawingDraft } from "../types/domain";
import {
  getHistoryKeyboardAction,
  getMeasurementKeyboardAction,
  getViewerKeyboardAction,
  viewerShortcuts,
  type KeyboardShortcutEvent,
} from "./keyboard";
import { SHORTCUT_GROUPS } from "./shortcutReference";

function key(name: string, modifiers: Partial<KeyboardShortcutEvent> = {}): KeyboardShortcutEvent {
  return {
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    repeat: false,
    target: null,
    ...modifiers,
  };
}

const polylineDraft: DrawingDraft = {
  type: "path",
  measurementType: "polyline",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
};

/** One real keyboard event per static entry, with the action the app must resolve. */
const STATIC_CHECKS: Record<string, () => unknown> = {
  "Pan (hold)": () => getViewerKeyboardAction(key(" "), "select", null) === "start-pan",
  "Zoom in": () => getViewerKeyboardAction(key("+"), "select", null) === "zoom-in",
  "Zoom out": () => getViewerKeyboardAction(key("-"), "select", null) === "zoom-out",
  "Finish measurement": () =>
    getViewerKeyboardAction(key("Enter"), "polyline", polylineDraft) === "complete-path",
  "Cancel or leave tool": () =>
    getViewerKeyboardAction(key("Escape"), "polyline", polylineDraft) === "cancel-draft",
  "Delete selected": () => getMeasurementKeyboardAction(key("Delete")) === "delete-measurement",
  Copy: () =>
    getMeasurementKeyboardAction(key("c", { ctrlKey: true })) === "copy-measurement" &&
    getMeasurementKeyboardAction(key("c", { metaKey: true })) === "copy-measurement",
  Paste: () =>
    getMeasurementKeyboardAction(key("v", { ctrlKey: true })) === "paste-measurement" &&
    getMeasurementKeyboardAction(key("v", { metaKey: true })) === "paste-measurement",
  Undo: () =>
    getHistoryKeyboardAction(key("z", { ctrlKey: true })) === "undo" &&
    getHistoryKeyboardAction(key("z", { metaKey: true })) === "undo",
  Redo: () =>
    getHistoryKeyboardAction(key("z", { ctrlKey: true, shiftKey: true })) === "redo" &&
    getHistoryKeyboardAction(key("z", { metaKey: true, shiftKey: true })) === "redo",
};

describe("shortcut reference", () => {
  const [tools, other] = SHORTCUT_GROUPS;

  it("lists the tool shortcuts 1:1 with the viewer registry", () => {
    expect(tools?.title).toBe("Tools");
    expect(tools?.entries).toEqual(
      viewerShortcuts.map((shortcut) => ({
        label: shortcut.label,
        keys: shortcut.key.toUpperCase(),
      })),
    );
  });

  it("resolves every tool key to its registered action", () => {
    for (const shortcut of viewerShortcuts) {
      expect(getViewerKeyboardAction(key(shortcut.key), "select", null)).toEqual(shortcut.action);
    }
  });

  it("keeps the static entries in sync with the real keyboard actions", () => {
    expect(other?.entries.map((entry) => entry.label).sort()).toEqual(
      Object.keys(STATIC_CHECKS).sort(),
    );
    for (const entry of other?.entries ?? []) {
      expect(STATIC_CHECKS[entry.label]?.(), entry.label).toBe(true);
    }
  });
});
