import { describe, expect, it } from "vitest";
import {
  ACTION_IDS,
  DEFAULT_BINDINGS,
  EMPTY_SHORTCUT_BINDINGS,
  PRESET_IDS,
  RESERVED,
  sanitizeShortcutBindings,
  type ActionId,
  type ShortcutBindings,
} from "../../utils/shortcuts/bindings";
import { resolveBindings } from "../../utils/shortcuts/store";
import {
  BLOCKED,
  WARN,
  WARN_REASON,
  assignBinding,
  classifyCombo,
  clearBinding,
  findConflict,
  resetAction,
  resetAll,
} from "./conflicts";
import { detectPreset, diffFromDefault, effectiveBindings, presetBindings } from "./presets";

const effective = (stored: ShortcutBindings) => effectiveBindings(stored);

/** Every transition must hand back something the main bundle accepts and resolves without clashes. */
function expectConsistent(stored: ShortcutBindings): void {
  expect(sanitizeShortcutBindings(stored)).toEqual(stored);
  const resolved = effective(stored);
  const combos = ACTION_IDS.flatMap((id) => resolved[id]);
  expect(new Set(combos).size).toBe(combos.length);
  for (const id of ACTION_IDS) expect(resolved[id].length).toBeLessThanOrEqual(2);
  // Nothing the user stored may be dropped by the resolution.
  for (const id of ACTION_IDS) {
    if (stored[id]) expect(resolved[id]).toEqual(stored[id]);
  }
}

describe("classifyCombo", () => {
  it("calls an ordinary combo free", () => {
    for (const combo of [
      "Q",
      "Mod+Z",
      "Mod+Shift+Z",
      "Mod+C",
      "Mod+V",
      "F2",
      "PageUp",
      "Alt+PageDown",
    ]) {
      expect(classifyCombo(combo), combo).toEqual({ kind: "free" });
    }
  });

  it("reports the keys the viewer owns as reserved", () => {
    for (const combo of RESERVED) {
      const result = classifyCombo(combo);
      expect(result.kind, combo).toBe("reserved");
      expect("reason" in result && result.reason, combo).toBeTruthy();
    }
    expect(classifyCombo("E")).toEqual({
      kind: "reserved",
      reason: "Fixed key, used for edit selection",
    });
  });

  it("reports the combos a page cannot intercept as blocked", () => {
    for (const combo of [
      "Mod+W",
      "Mod+Shift+W",
      "Mod+T",
      "Mod+Shift+T",
      "Mod+N",
      "Mod+Shift+N",
      "Mod+Q",
      "Mod+R",
      "Mod+L",
      "Mod+Tab",
      "Mod+Shift+Tab",
      "Mod+1",
      "Mod+9",
      "Mod+0",
      "Mod++",
      "Mod+-",
      "Mod+=",
      "F5",
      "F11",
      "F12",
      "Alt+ArrowLeft",
      "Alt+ArrowRight",
      "Mod+PageUp",
      "Mod+PageDown",
      "Mod+Shift+PageUp",
      "Mod+Shift+PageDown",
    ]) {
      const result = classifyCombo(combo);
      expect(result.kind, combo).toBe("blocked");
      expect("reason" in result && result.reason, combo).toBeTruthy();
    }
  });

  it("warns about combos that may also trigger a browser shortcut", () => {
    for (const combo of [
      "Mod+S",
      "Mod+P",
      "Mod+O",
      "Mod+D",
      "Mod+E",
      "Mod+F",
      "Mod+G",
      "Mod+H",
      "Mod+J",
      "Mod+K",
      "Mod+U",
      "Mod+Y",
      "Mod+A",
      "Mod+B",
      "Mod+I",
      "Mod+,",
      "Mod+Shift+H",
      "Mod+Shift+L",
      "Mod+Shift+A",
      "Alt+L",
      "Alt+Shift+L",
      "Alt+Z",
      "F1",
      "F3",
      "F6",
      "F7",
      "F10",
    ]) {
      expect(classifyCombo(combo), combo).toEqual({ kind: "warn", reason: WARN_REASON });
    }
  });

  it("lets blocked win over warn and keeps Redo free", () => {
    expect(classifyCombo("Mod+Shift+T").kind).toBe("blocked");
    expect(classifyCombo("Mod+Shift+N").kind).toBe("blocked");
    expect(classifyCombo("Mod+Shift+Z").kind).toBe("free");
    expect(classifyCombo("Mod+Z").kind).toBe("free");
  });

  it("refuses combos outside the binding grammar", () => {
    for (const combo of ["", "Mod+Alt+X", "Mod+Alt+Shift+X", "/", "Shift+1", "Space"]) {
      const result = classifyCombo(combo);
      expect(result.kind === "blocked" || result.kind === "reserved", combo).toBe(true);
    }
  });

  it("keeps the blocked and warn data disjoint from each other and from reserved keys", () => {
    for (const combo of BLOCKED.keys()) {
      expect(WARN.has(combo) && !BLOCKED.has(combo), combo).toBe(false);
      expect(RESERVED.has(combo), combo).toBe(false);
    }
    for (const combo of WARN) expect(RESERVED.has(combo), combo).toBe(false);
  });

  it("never lists Mod+Alt", () => {
    for (const combo of [...BLOCKED.keys(), ...WARN]) expect(combo).not.toMatch(/Mod\+Alt/);
  });

  it("does not block or reserve any default key", () => {
    for (const id of PRESET_IDS) {
      for (const action of ACTION_IDS) {
        for (const combo of presetBindings(id)[action]) {
          expect(["free", "warn"], `${id} ${combo}`).toContain(classifyCombo(combo).kind);
        }
      }
    }
  });
});

describe("findConflict", () => {
  const resolved = effective(EMPTY_SHORTCUT_BINDINGS);

  it("returns the action that owns the combo", () => {
    expect(findConflict(resolved, "V")).toBe("tool.select");
    expect(findConflict(resolved, "Backspace")).toBe("edit.delete");
    expect(findConflict(resolved, "Mod+Y")).toBe("edit.redo");
  });

  it("returns null for a free combo", () => {
    expect(findConflict(resolved, "Q")).toBeNull();
  });

  it("ignores the action being edited", () => {
    expect(findConflict(resolved, "V", "tool.select")).toBeNull();
    expect(findConflict(resolved, "V", "tool.hand")).toBe("tool.select");
  });
});

describe("assignBinding", () => {
  it("puts a free combo in the first slot", () => {
    const stored = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 0, "Q");
    expect(stored).toEqual({ "tool.line": ["Q"] });
    expect(effective(stored)["tool.line"]).toEqual(["Q"]);
    expectConsistent(stored);
  });

  it("fills the second slot and appends when the first is empty", () => {
    const second = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 1, "Q");
    expect(second).toEqual({ "tool.line": ["L", "Q"] });
    const appended = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.calibrate", 1, "Q");
    expect(appended).toEqual({ "tool.calibrate": ["Q"] });
    expectConsistent(second);
    expectConsistent(appended);
  });

  it("replaces the key in a slot", () => {
    const stored = assignBinding(EMPTY_SHORTCUT_BINDINGS, "edit.delete", 1, "X");
    expect(stored).toEqual({ "edit.delete": ["Delete", "X"] });
    expectConsistent(stored);
  });

  it("never grows past two keys", () => {
    let stored = EMPTY_SHORTCUT_BINDINGS;
    for (const combo of ["Q", "W", "A", "Mod+J"]) {
      stored = assignBinding(stored, "edit.delete", 1, combo);
    }
    expect(effective(stored)["edit.delete"]).toEqual(["Delete", "Mod+J"]);
    expectConsistent(stored);
  });

  it("leaves everything alone when another action owns the combo", () => {
    const stored = { "tool.line": ["Q"] };
    expect(assignBinding(stored, "tool.hand", 0, "V")).toBe(stored);
    expect(assignBinding(stored, "tool.hand", 0, "Q", { reassign: false })).toBe(stored);
  });

  it("takes the combo from its previous owner when reassigning", () => {
    const stored = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.hand", 0, "V", { reassign: true });
    const resolved = effective(stored);
    expect(resolved["tool.hand"]).toEqual(["V"]);
    expect(resolved["tool.select"]).toEqual([]);
    expect(stored).toEqual({ "tool.hand": ["V"], "tool.select": [] });
    expect(findConflict(resolved, "V")).toBe("tool.hand");
    expectConsistent(stored);
  });

  it("removes only the taken combo from a two-key owner", () => {
    const stored = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 0, "Backspace", {
      reassign: true,
    });
    expect(effective(stored)["edit.delete"]).toEqual(["Delete"]);
    expect(effective(stored)["tool.line"]).toEqual(["Backspace"]);
    expectConsistent(stored);
  });

  it("does not change anything when the combo is already in that slot", () => {
    const stored = { "tool.line": ["Q"] };
    expect(assignBinding(stored, "tool.line", 0, "Q")).toBe(stored);
    expect(assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 0, "L")).toBe(
      EMPTY_SHORTCUT_BINDINGS,
    );
    expect(assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 1, "L")).toBe(
      EMPTY_SHORTCUT_BINDINGS,
    );
  });

  it("swaps the two slots of one action", () => {
    const stored = assignBinding(EMPTY_SHORTCUT_BINDINGS, "edit.delete", 0, "Backspace");
    expect(stored).toEqual({ "edit.delete": ["Backspace", "Delete"] });
    expectConsistent(stored);
  });

  it("refuses reserved, blocked and malformed combos even when reassigning", () => {
    for (const combo of ["E", "Space", "Mod+W", "F5", "Mod+Alt+X", "", "nope"]) {
      expect(
        assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 0, combo, { reassign: true }),
        combo,
      ).toBe(EMPTY_SHORTCUT_BINDINGS);
    }
  });

  it("allows a combo that only warns", () => {
    const stored = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 0, "Mod+S");
    expect(stored).toEqual({ "tool.line": ["Mod+S"] });
    expectConsistent(stored);
  });

  it("refuses a slot other than 0 or 1", () => {
    expect(assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 2 as 0, "Q")).toBe(
      EMPTY_SHORTCUT_BINDINGS,
    );
  });

  it("drops the entry once the action matches Default again", () => {
    const changed = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 0, "Q");
    expect(assignBinding(changed, "tool.line", 0, "L")).toEqual({});
  });

  it("is a pure transition", () => {
    const stored = Object.freeze({ "tool.line": Object.freeze(["Q"]) });
    const copy = JSON.parse(JSON.stringify(stored));
    assignBinding(stored, "tool.hand", 0, "Q", { reassign: true });
    expect(stored).toEqual(copy);
  });

  it("keeps working on top of a non-default preset", () => {
    const left = diffFromDefault(presetBindings("left-hand"));
    const stored = assignBinding(left, "tool.line", 1, "L");
    expect(effective(stored)["tool.line"]).toEqual(["S", "L"]);
    expect(detectPreset(stored, "left-hand")).toBe("custom");
    expectConsistent(stored);
  });
});

describe("clearBinding", () => {
  it("leaves the action without a key", () => {
    const stored = clearBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 0);
    expect(stored).toEqual({ "tool.line": [] });
    expect(effective(stored)["tool.line"]).toEqual([]);
    expectConsistent(stored);
  });

  it("removes one of two keys and moves the other up", () => {
    expect(clearBinding(EMPTY_SHORTCUT_BINDINGS, "edit.delete", 1)).toEqual({
      "edit.delete": ["Delete"],
    });
    expect(clearBinding(EMPTY_SHORTCUT_BINDINGS, "edit.delete", 0)).toEqual({
      "edit.delete": ["Backspace"],
    });
  });

  it("does nothing for an empty slot", () => {
    expect(clearBinding(EMPTY_SHORTCUT_BINDINGS, "tool.calibrate", 0)).toBe(
      EMPTY_SHORTCUT_BINDINGS,
    );
    expect(clearBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 1)).toBe(EMPTY_SHORTCUT_BINDINGS);
  });

  it("frees the combo for other actions", () => {
    const stored = clearBinding(EMPTY_SHORTCUT_BINDINGS, "tool.select", 0);
    expect(findConflict(effective(stored), "V")).toBeNull();
    const reused = assignBinding(stored, "tool.hand", 0, "V");
    expect(effective(reused)["tool.hand"]).toEqual(["V"]);
    expectConsistent(reused);
  });

  it("drops the entry when an action returns to Default", () => {
    const cleared = clearBinding(EMPTY_SHORTCUT_BINDINGS, "tool.calibrate", 0);
    expect(cleared).toBe(EMPTY_SHORTCUT_BINDINGS);
    const added = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.calibrate", 0, "B");
    expect(clearBinding(added, "tool.calibrate", 0)).toBe(EMPTY_SHORTCUT_BINDINGS);
  });
});

describe("resetAction", () => {
  it("goes back to the Default value", () => {
    const stored = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 0, "Q");
    expect(resetAction(stored, "tool.line")).toBe(EMPTY_SHORTCUT_BINDINGS);
  });

  it("goes back to the value of the current preset, not Default", () => {
    const left = diffFromDefault(presetBindings("left-hand"));
    const edited = assignBinding(left, "tool.line", 0, "Q");
    const reset = resetAction(edited, "tool.line", "left-hand");
    expect(effective(reset)["tool.line"]).toEqual(["S"]);
    expect(detectPreset(reset, "left-hand")).toBe("left-hand");
    expectConsistent(reset);
    expect(effective(resetAction(edited, "tool.line"))["tool.line"]).toEqual(["L"]);
  });

  it("restores a removed key", () => {
    const cleared = clearBinding(EMPTY_SHORTCUT_BINDINGS, "tool.select", 0);
    expect(resetAction(cleared, "tool.select")).toBe(EMPTY_SHORTCUT_BINDINGS);
  });

  it("leaves the other actions as they are", () => {
    const stored = assignBinding(
      assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.line", 0, "Q"),
      "tool.hand",
      0,
      "G",
    );
    expect(resetAction(stored, "tool.line")).toEqual({ "tool.hand": ["G"] });
  });

  it("takes a key back from the action that took it since", () => {
    const taken = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.polyline", 0, "L", {
      reassign: true,
    });
    expect(effective(taken)["tool.line"]).toEqual([]);
    const reset = resetAction(taken, "tool.line");
    expect(effective(reset)["tool.line"]).toEqual(["L"]);
    expect(effective(reset)["tool.polyline"]).toEqual([]);
    expectConsistent(reset);
  });

  it("clears an action that has no key in the preset", () => {
    const stored = assignBinding(EMPTY_SHORTCUT_BINDINGS, "tool.calibrate", 0, "Q");
    expect(resetAction(stored, "tool.calibrate")).toBe(EMPTY_SHORTCUT_BINDINGS);
  });
});

describe("resetAll", () => {
  it("stores nothing for Default", () => {
    expect(resetAll()).toBe(EMPTY_SHORTCUT_BINDINGS);
    expect(resetAll("default")).toBe(EMPTY_SHORTCUT_BINDINGS);
  });

  it("stores the preset's difference from Default", () => {
    for (const id of PRESET_IDS) {
      const stored = resetAll(id);
      expect(detectPreset(stored, id)).toBe(id);
      expectConsistent(stored);
    }
  });
});

describe("transitions over every preset", () => {
  it("keep the result valid, whatever the starting preset", () => {
    for (const id of PRESET_IDS) {
      const start = diffFromDefault(presetBindings(id));
      const owner = (combo: string): ActionId | null => findConflict(effective(start), combo);
      const steps: ShortcutBindings[] = [
        assignBinding(start, "tool.line", 0, "Q", { reassign: true }),
        assignBinding(start, "tool.line", 1, "F7", { reassign: true }),
        assignBinding(start, "edit.undo", 0, "V", { reassign: true }),
        clearBinding(start, "edit.delete", 0),
        resetAction(start, "tool.select", "default"),
        resetAll(id),
      ];
      for (const stored of steps) expectConsistent(stored);
      expect(owner("Q")).toBe(findConflict(presetBindings(id), "Q"));
    }
  });

  it("agrees with the main bundle about what Default resolves to", () => {
    expect(resolveBindings(resetAll())).toEqual(DEFAULT_BINDINGS);
  });
});
