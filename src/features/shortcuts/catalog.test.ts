import { describe, expect, it } from "vitest";
import { WORKSPACE_MODULES } from "../../app/workspaceModules";
import { ACTION_IDS, RESERVED } from "../../utils/shortcuts/bindings";
import { toolRegistry } from "../viewer/toolRegistry";
import {
  CATALOG,
  CATALOG_BY_ID,
  FIXED_KEYS,
  FIXED_KEYS_GROUP,
  SHORTCUT_GROUPS,
  buildSearchText,
} from "./catalog";

describe("action catalog", () => {
  it("covers every action id exactly once", () => {
    expect(CATALOG.map((entry) => entry.id).sort()).toEqual([...ACTION_IDS].sort());
    expect(Object.keys(CATALOG_BY_ID).sort()).toEqual([...ACTION_IDS].sort());
    for (const entry of CATALOG) expect(CATALOG_BY_ID[entry.id]).toBe(entry);
  });

  it("lists the entries by group order and keeps the stable action order inside a group", () => {
    const groupOrder = CATALOG.map((entry) => SHORTCUT_GROUPS.indexOf(entry.group));
    expect(groupOrder.every((index) => index >= 0)).toBe(true);
    expect(groupOrder).toEqual([...groupOrder].sort((a, b) => a - b));
    expect([...new Set(CATALOG.map((entry) => entry.group))]).toEqual([...SHORTCUT_GROUPS]);
    expect(CATALOG.map((entry) => entry.id)).toEqual([...ACTION_IDS]);
  });

  it("gives every label a unique name inside its group", () => {
    for (const group of SHORTCUT_GROUPS) {
      const labels = CATALOG.filter((entry) => entry.group === group).map((entry) => entry.label);
      expect(labels.length).toBeGreaterThan(0);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("writes plain one-line descriptions without a trailing period", () => {
    for (const { label, description } of CATALOG) {
      expect(label.trim()).toBe(label);
      expect(label).not.toBe("");
      expect(description).toMatch(/^[A-Z]/);
      expect(description).not.toMatch(/[.\n]$/);
      expect(description).not.toContain("\n");
    }
  });

  it("uses the tool names of the tool registry", () => {
    for (const tool of toolRegistry) {
      if (!tool.actionId) continue;
      expect(CATALOG_BY_ID[tool.actionId].label).toBe(tool.label);
    }
    expect(CATALOG_BY_ID["tool.calibrate"].label).toBe("Calibrate");
  });

  it("uses the workspace names of the workspace switcher", () => {
    for (const module of WORKSPACE_MODULES) {
      expect(CATALOG_BY_ID[`workspace.${module.id}`].label).toBe(module.label);
    }
  });

  it("matches the labels already on screen", () => {
    expect(CATALOG_BY_ID["edit.undo"].label).toBe("Undo");
    expect(CATALOG_BY_ID["edit.redo"].label).toBe("Redo");
    expect(CATALOG_BY_ID["page.panel"].label).toBe("Pages");
    expect(CATALOG_BY_ID["measurement.toggleDetails"].label).toBe("Details");
    expect(CATALOG_BY_ID["view.fitPage"].label).toBe("Fit page");
    expect(CATALOG_BY_ID["mode.orthogonal"].group).toBe("Drawing aids");
    expect(CATALOG_BY_ID["app.settings"].group).toBe("App");
  });
});

describe("fixed keys", () => {
  it("lists rows with unique ids and labels", () => {
    expect(new Set(FIXED_KEYS.map((row) => row.id)).size).toBe(FIXED_KEYS.length);
    expect(new Set(FIXED_KEYS.map((row) => row.label)).size).toBe(FIXED_KEYS.length);
    expect(FIXED_KEYS_GROUP).toBe("Fixed keys");
    for (const row of FIXED_KEYS) {
      expect(row.keys.length).toBeGreaterThan(0);
      expect(row.description).not.toMatch(/\.$/);
    }
  });

  it("only names reserved combos", () => {
    for (const row of FIXED_KEYS) {
      expect(row.combos.length).toBeGreaterThan(0);
      for (const combo of row.combos) expect(RESERVED.has(combo)).toBe(true);
    }
  });

  it("describes every reserved combo", () => {
    const described = new Set(FIXED_KEYS.flatMap((row) => row.combos));
    expect([...RESERVED].filter((combo) => !described.has(combo))).toEqual([]);
  });

  it("names the fixed keys the viewer documents", () => {
    const keys = FIXED_KEYS.flatMap((row) => row.keys);
    for (const key of [
      "Space",
      "Shift+Space",
      "Enter",
      "Esc",
      "Arrow keys",
      "Shift+Arrow keys",
      "E",
      "N",
      "Shift+N",
      "[",
      "]",
      "Tab",
    ]) {
      expect(keys).toContain(key);
    }
  });
});

describe("buildSearchText", () => {
  it("joins label, group and keys in lowercase", () => {
    expect(buildSearchText("Undo", "Edit", ["Ctrl+Z"])).toBe("undo edit ctrl+z");
  });

  it("finds a row by label, group or key", () => {
    const text = buildSearchText("Fit page", "View", ["F"]);
    expect(text).toContain("fit page");
    expect(text).toContain("view");
    expect(text).toContain(" f");
  });

  it("handles an action without keys", () => {
    expect(buildSearchText("Calibrate", "Tools", [])).toBe("calibrate tools");
  });
});
