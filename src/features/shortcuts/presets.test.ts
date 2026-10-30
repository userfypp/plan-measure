import { describe, expect, it } from "vitest";
import {
  ACTION_IDS,
  DEFAULT_BINDINGS,
  DEFAULT_CHANGES_LEGACY,
  EMPTY_SHORTCUT_BINDINGS,
  MAX_BINDINGS_PER_ACTION,
  PRESET_IDS,
  RESERVED,
  eventToCombo,
  parseBinding,
  sanitizeShortcutBindings,
  serializeBinding,
  type ActionId,
  type ComboEvent,
  type PresetId,
} from "../../utils/shortcuts/bindings";
import { classifyCombo } from "./conflicts";
import {
  PRESETS,
  bindingsDiffBetween,
  detectPreset,
  diffFromDefault,
  effectiveBindings,
  presetBindings,
  sameBindings,
} from "./presets";

const combosOf = (id: PresetId) => ACTION_IDS.flatMap((action) => presetBindings(id)[action]);

function press(key: string, overrides: Partial<ComboEvent> = {}): ComboEvent {
  return { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...overrides };
}

describe.each(PRESET_IDS)("preset %s", (id) => {
  const bindings = presetBindings(id);

  it("has a label, a one-sentence description and a full map", () => {
    const preset = PRESETS[id];
    expect(preset.id).toBe(id);
    expect(preset.label).not.toBe("");
    expect(preset.description).not.toBe("");
    expect(preset.description).not.toMatch(/\.$/);
    expect(Object.keys(bindings)).toEqual([...ACTION_IDS]);
  });

  it("uses only canonical combos that parse", () => {
    for (const combo of combosOf(id)) {
      const parsed = parseBinding(combo);
      expect(parsed, combo).not.toBeNull();
      expect(serializeBinding(parsed!), combo).toBe(combo);
    }
  });

  it("gives an action at most two keys", () => {
    for (const action of ACTION_IDS) {
      expect(bindings[action].length, action).toBeLessThanOrEqual(MAX_BINDINGS_PER_ACTION);
    }
  });

  it("never gives the same combo to two actions or twice to one", () => {
    const combos = combosOf(id);
    expect(combos.filter((combo, index) => combos.indexOf(combo) !== index)).toEqual([]);
  });

  it("avoids reserved and blocked combos and Mod+Alt", () => {
    for (const combo of combosOf(id)) {
      expect(RESERVED.has(combo), combo).toBe(false);
      expect(classifyCombo(combo).kind, combo).not.toMatch(/reserved|blocked/);
      const parsed = parseBinding(combo)!;
      expect(parsed.mod && parsed.alt, combo).toBe(false);
    }
  });

  it("has no Shift+letter whose bare letter belongs to another action", () => {
    const owners = new Map<string, ActionId>();
    for (const action of ACTION_IDS) {
      for (const combo of bindings[action]) owners.set(combo, action);
    }
    for (const action of ACTION_IDS) {
      for (const combo of bindings[action]) {
        const parsed = parseBinding(combo)!;
        if (!parsed.shift || parsed.mod || parsed.alt || !/^[A-Z]$/.test(parsed.key)) continue;
        const owner = owners.get(parsed.key);
        expect(owner === undefined || owner === action, combo).toBe(true);
      }
    }
  });

  it("round-trips through the stored diff", () => {
    const stored = diffFromDefault(bindings);
    expect(sanitizeShortcutBindings(stored)).toEqual(stored);
    expect(sameBindings(effectiveBindings(stored), bindings)).toBe(true);
    expect(detectPreset(stored, id)).toBe(id);
    expect(detectPreset(stored)).toBe(id);
  });
});

describe("default preset", () => {
  it("is the main bundle's default map", () => {
    expect(presetBindings("default")).toEqual(DEFAULT_BINDINGS);
    expect(diffFromDefault(presetBindings("default"))).toBe(EMPTY_SHORTCUT_BINDINGS);
  });

  it("keeps every legacy key where it was", () => {
    const legacy = presetBindings("legacy");
    for (const action of ACTION_IDS) {
      for (const combo of legacy[action]) {
        expect(presetBindings("default")[action], action).toContain(combo);
      }
    }
  });

  it("changes legacy exactly when DEFAULT_CHANGES_LEGACY says so", () => {
    expect(DEFAULT_CHANGES_LEGACY).toBe(
      !sameBindings(presetBindings("default"), presetBindings("legacy")),
    );
    expect(DEFAULT_CHANGES_LEGACY).toBe(true);
  });

  it("only adds keys on top of legacy", () => {
    const changes = bindingsDiffBetween(presetBindings("legacy"), presetBindings("default"));
    expect(changes.length).toBeGreaterThan(0);
    for (const { before, after } of changes)
      expect(after).toEqual(expect.arrayContaining([...before]));
  });

  it("adds the documented keys", () => {
    const keys = presetBindings("default");
    expect(keys["edit.redo"]).toEqual(["Mod+Shift+Z", "Mod+Y"]);
    expect(keys["edit.duplicate"]).toEqual(["Mod+D"]);
    expect(keys["edit.rename"]).toEqual(["F2"]);
    expect(keys["view.fitPage"]).toEqual(["F"]);
    expect(keys["page.panel"]).toEqual(["T"]);
    expect(keys["workspace.scales"]).toEqual(["4"]);
    expect(keys["app.settings"]).toEqual(["Mod+,"]);
    expect(keys["tool.calibrate"]).toEqual([]);
  });
});

describe("legacy preset", () => {
  it("is exactly the behaviour from before customizable shortcuts", () => {
    const expected: Partial<Record<ActionId, string[]>> = {
      "tool.select": ["V"],
      "tool.hand": ["H"],
      "tool.line": ["L"],
      "tool.polyline": ["M"],
      "tool.polygon": ["P"],
      "tool.rectangle": ["R"],
      "tool.ellipse": ["I"],
      "tool.cloud": ["K"],
      "tool.count": ["C"],
      "mode.orthogonal": ["O"],
      "mode.snap": ["S"],
      "view.zoomIn": ["+", "="],
      "view.zoomOut": ["-"],
      "edit.undo": ["Mod+Z"],
      "edit.redo": ["Mod+Shift+Z"],
      "edit.copy": ["Mod+C"],
      "edit.paste": ["Mod+V"],
      "edit.delete": ["Delete", "Backspace"],
    };
    const legacy = presetBindings("legacy");
    for (const action of ACTION_IDS) expect(legacy[action], action).toEqual(expected[action] ?? []);
  });

  it("resolves today's key presses to the same actions", () => {
    const owners = new Map<string, ActionId>();
    for (const action of ACTION_IDS) {
      for (const combo of presetBindings("legacy")[action]) owners.set(combo, action);
    }
    const actionFor = (event: ComboEvent) => owners.get(eventToCombo(event) ?? "");
    expect(actionFor(press("v"))).toBe("tool.select");
    expect(actionFor(press("M"))).toBe("tool.polyline");
    expect(actionFor(press("o"))).toBe("mode.orthogonal");
    expect(actionFor(press("s"))).toBe("mode.snap");
    expect(actionFor(press("+", { shiftKey: true }))).toBe("view.zoomIn");
    expect(actionFor(press("="))).toBe("view.zoomIn");
    expect(actionFor(press("-"))).toBe("view.zoomOut");
    expect(actionFor(press("z", { ctrlKey: true }))).toBe("edit.undo");
    expect(actionFor(press("Z", { metaKey: true, shiftKey: true }))).toBe("edit.redo");
    expect(actionFor(press("c", { ctrlKey: true }))).toBe("edit.copy");
    expect(actionFor(press("v", { metaKey: true }))).toBe("edit.paste");
    expect(actionFor(press("Delete"))).toBe("edit.delete");
    expect(actionFor(press("Backspace"))).toBe("edit.delete");
    expect(actionFor(press("y", { ctrlKey: true }))).toBeUndefined();
    expect(actionFor(press("f"))).toBeUndefined();
  });
});

describe("other presets", () => {
  it("make keyboard-first the default plus a key for every action", () => {
    const keys = presetBindings("keyboard-first");
    for (const action of ACTION_IDS) {
      expect(keys[action].length, action).toBeGreaterThan(0);
      for (const combo of DEFAULT_BINDINGS[action]) expect(keys[action], action).toContain(combo);
    }
    expect(keys["tool.calibrate"]).toEqual(["B"]);
    expect(keys["measurement.toggleDetails"]).toEqual(["D"]);
    expect(keys["measurement.toggleVisibility"]).toEqual(["Mod+Shift+H"]);
    expect(keys["workspace.next"]).toEqual(["Alt+PageDown"]);
    expect(keys["workspace.previous"]).toEqual(["Alt+PageUp"]);
    expect(keys["app.toggleTheme"]).toEqual(["Mod+Shift+L"]);
    expect(keys["page.previous"]).toEqual(["PageUp", ","]);
    expect(keys["page.next"]).toEqual(["PageDown", "."]);
  });

  it("keeps the left-hand tools on the left of the keyboard", () => {
    const keys = presetBindings("left-hand");
    expect(ACTION_IDS.filter((id) => id.startsWith("tool.")).map((id) => keys[id])).toEqual([
      ["A"],
      ["V"],
      ["S"],
      ["D"],
      ["F"],
      ["G"],
      ["X"],
      ["C"],
      ["Z"],
      ["B"],
    ]);
    expect(keys["mode.orthogonal"]).toEqual(["R"]);
    expect(keys["mode.snap"]).toEqual(["T"]);
    expect([keys["page.previous"], keys["page.next"]]).toEqual([["Q"], ["W"]]);
    expect(keys["view.fitPage"]).toEqual(["5"]);
    expect(keys["workspace.measurements"]).toEqual(["1"]);
    expect(keys["edit.redo"]).toEqual(["Mod+Shift+Z"]);
  });

  it("keeps the right-hand tools on the right of the keyboard", () => {
    const keys = presetBindings("right-hand");
    expect(ACTION_IDS.filter((id) => id.startsWith("tool.")).map((id) => keys[id])).toEqual([
      ["J"],
      ["H"],
      ["K"],
      ["L"],
      ["U"],
      ["I"],
      ["O"],
      ["P"],
      ["M"],
      [],
    ]);
    expect(keys["mode.orthogonal"]).toEqual(["Y"]);
    expect(keys["mode.snap"]).toEqual([","]);
    expect(keys["page.panel"]).toEqual(["."]);
    expect(keys["workspace.scales"]).toEqual(["0"]);
  });

  it("gives essentials no single-letter shortcut", () => {
    for (const combo of combosOf("essentials")) {
      expect(combo, combo).not.toMatch(/^[A-Z]$/);
      expect(combo, combo).not.toMatch(/^Shift\+[A-Z]$/);
    }
    const keys = presetBindings("essentials");
    expect(keys["edit.redo"]).toEqual(["Mod+Shift+Z", "Mod+Y"]);
    expect(keys["workspace.next"]).toEqual(["Alt+PageDown"]);
    expect(keys["tool.line"]).toEqual([]);
  });

  it("gives every preset but legacy the duplicate, rename and app dialog keys", () => {
    for (const id of PRESET_IDS) {
      if (id === "legacy") continue;
      const keys = presetBindings(id);
      expect(keys["edit.duplicate"], id).toEqual(["Mod+D"]);
      expect(keys["edit.rename"], id).toEqual(["F2"]);
      expect([keys["app.projects"], keys["app.export"], keys["app.settings"]], id).toEqual([
        ["Mod+O"],
        ["Mod+E"],
        ["Mod+,"],
      ]);
    }
  });

  it("makes every preset different from every other", () => {
    for (const a of PRESET_IDS) {
      for (const b of PRESET_IDS) {
        if (a !== b)
          expect(sameBindings(presetBindings(a), presetBindings(b)), `${a}/${b}`).toBe(false);
      }
    }
  });
});

describe("diffFromDefault and effectiveBindings", () => {
  it("stores nothing when the map equals Default", () => {
    expect(diffFromDefault(effectiveBindings(EMPTY_SHORTCUT_BINDINGS))).toBe(
      EMPTY_SHORTCUT_BINDINGS,
    );
  });

  it("stores only the actions that differ, with [] for a removed key", () => {
    const effective = { ...presetBindings("default"), "tool.line": ["K"], "edit.rename": [] };
    expect(diffFromDefault(effective)).toEqual({ "tool.line": ["K"], "edit.rename": [] });
  });

  it("treats a different key order as a difference", () => {
    const effective = { ...presetBindings("default"), "edit.delete": ["Backspace", "Delete"] };
    expect(diffFromDefault(effective)).toEqual({ "edit.delete": ["Backspace", "Delete"] });
  });

  it("stores the legacy diff as removed Default additions", () => {
    const stored = diffFromDefault(presetBindings("legacy"));
    expect(stored["edit.redo"]).toEqual(["Mod+Shift+Z"]);
    expect(stored["edit.duplicate"]).toEqual([]);
    expect(stored["tool.line"]).toBeUndefined();
  });

  it("resolves a stored diff over Default", () => {
    const effective = effectiveBindings({ "tool.line": ["F"] });
    expect(effective["tool.line"]).toEqual(["F"]);
    expect(effective["view.fitPage"]).toEqual([]);
    expect(effective["tool.select"]).toEqual(["V"]);
  });
});

describe("detectPreset", () => {
  it("matches the stored preset", () => {
    expect(detectPreset(EMPTY_SHORTCUT_BINDINGS, "default")).toBe("default");
    expect(detectPreset(diffFromDefault(presetBindings("left-hand")), "left-hand")).toBe(
      "left-hand",
    );
  });

  it("is custom once the keys differ from the stored preset", () => {
    const edited = diffFromDefault({ ...presetBindings("left-hand"), "tool.line": ["K"] });
    expect(detectPreset(edited, "left-hand")).toBe("custom");
    expect(detectPreset(edited)).toBe("custom");
    expect(detectPreset({ "edit.rename": [] }, "default")).toBe("custom");
  });

  it("stays custom when the keys equal another preset than the stored one", () => {
    const legacyKeys = diffFromDefault(presetBindings("legacy"));
    expect(detectPreset(legacyKeys, "default")).toBe("custom");
    expect(detectPreset(legacyKeys, "legacy")).toBe("legacy");
  });

  it("finds the matching preset when none is stored", () => {
    expect(detectPreset(EMPTY_SHORTCUT_BINDINGS)).toBe("default");
    expect(detectPreset(diffFromDefault(presetBindings("essentials")))).toBe("essentials");
  });
});

describe("bindingsDiffBetween", () => {
  it("lists the actions whose keys differ, in action order", () => {
    const changes = bindingsDiffBetween(presetBindings("legacy"), presetBindings("default"));
    const positions = changes.map((change) => ACTION_IDS.indexOf(change.id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(changes.find((change) => change.id === "edit.redo")).toEqual({
      id: "edit.redo",
      before: ["Mod+Shift+Z"],
      after: ["Mod+Shift+Z", "Mod+Y"],
    });
    expect(changes.find((change) => change.id === "edit.rename")).toEqual({
      id: "edit.rename",
      before: [],
      after: ["F2"],
    });
    expect(changes.some((change) => change.id === "tool.line")).toBe(false);
  });

  it("is empty for equal maps and symmetric in what it reports", () => {
    expect(bindingsDiffBetween(presetBindings("essentials"), presetBindings("essentials"))).toEqual(
      [],
    );
    const forward = bindingsDiffBetween(presetBindings("left-hand"), presetBindings("right-hand"));
    const backward = bindingsDiffBetween(presetBindings("right-hand"), presetBindings("left-hand"));
    expect(backward.map((change) => change.id)).toEqual(forward.map((change) => change.id));
    expect(backward[0]).toEqual({
      id: forward[0]!.id,
      before: forward[0]!.after,
      after: forward[0]!.before,
    });
  });
});
