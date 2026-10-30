import { describe, expect, it } from "vitest";
import {
  ACTION_IDS,
  DEFAULT_BINDINGS,
  DEFAULT_CHANGES_LEGACY,
  EMPTY_SHORTCUT_BINDINGS,
  PRESET_IDS,
  RESERVED,
  eventToCombo,
  isAssignableBinding,
  isShortcutBindings,
  parseBinding,
  sanitizeShortcutBindings,
  serializeBinding,
  type ComboEvent,
} from "./bindings";

function press(key: string, overrides: Partial<ComboEvent> = {}): ComboEvent {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("action and preset ids", () => {
  it("lists the 41 stable action ids once each", () => {
    expect(ACTION_IDS).toHaveLength(41);
    expect(new Set(ACTION_IDS).size).toBe(41);
    for (const id of ACTION_IDS) expect(id).toMatch(/^[a-z]+\.[A-Za-z]+$/);
  });

  it("lists the six presets, Default first", () => {
    expect(PRESET_IDS).toEqual([
      "default",
      "legacy",
      "keyboard-first",
      "left-hand",
      "essentials",
      "right-hand",
    ]);
  });
});

describe("binding grammar", () => {
  it.each([
    "L",
    "0",
    "+",
    "=",
    "Mod+Z",
    "Mod+Shift+Z",
    "Mod++",
    "Mod+,",
    "Alt+L",
    "Alt+Shift+PageDown",
    "Shift+L",
    "Delete",
    "Backspace",
    "PageUp",
    "Insert",
    "F2",
    "F12",
    "Shift+F5",
  ])("round-trips %s through parse and serialize", (text) => {
    const parsed = parseBinding(text);
    expect(parsed).not.toBeNull();
    expect(serializeBinding(parsed!)).toBe(text);
  });

  it("describes the parts of a binding", () => {
    expect(parseBinding("Mod+Shift+Z")).toEqual({ mod: true, alt: false, shift: true, key: "Z" });
    expect(parseBinding("Alt+4")).toEqual({ mod: false, alt: true, shift: false, key: "4" });
    expect(parseBinding("Mod++")).toEqual({ mod: true, alt: false, shift: false, key: "+" });
  });

  it.each([
    "",
    "l",
    "mod+z",
    "Ctrl+Z",
    "Shift+Mod+Z",
    "Mod+Mod+Z",
    "Mod+Alt+L",
    "Mod+",
    "Shift+",
    "++",
    "Shift+1",
    "Shift++",
    "Shift+,",
    "Space",
    "Enter",
    "Escape",
    "Tab",
    "ArrowLeft",
    "F0",
    "F13",
    "AA",
    "ñ",
    "/",
    "Mod + Z",
  ])("rejects %j as a binding", (text) => {
    expect(parseBinding(text)).toBeNull();
  });
});

describe("eventToCombo", () => {
  it.each([
    ["a bare letter", press("l"), "L"],
    ["an uppercase letter without Shift, as with Caps Lock", press("L"), "L"],
    ["Shift on a letter", press("L", { shiftKey: true }), "Shift+L"],
    ["a digit", press("1"), "1"],
    ["a digit typed with Shift, as on AZERTY", press("1", { shiftKey: true }), "1"],
    ["Shift+= typing a plus", press("+", { shiftKey: true }), "+"],
    ["a comma", press(","), ","],
    ["Delete", press("Delete"), "Delete"],
    ["Shift on a named key", press("PageDown", { shiftKey: true }), "Shift+PageDown"],
    ["a function key", press("F2"), "F2"],
    ["Ctrl+letter", press("z", { ctrlKey: true }), "Mod+Z"],
    ["Command+letter", press("z", { metaKey: true }), "Mod+Z"],
    ["Ctrl+Shift+letter", press("Z", { ctrlKey: true, shiftKey: true }), "Mod+Shift+Z"],
    ["Command+comma", press(",", { metaKey: true }), "Mod+,"],
    ["Command plus", press("+", { metaKey: true, shiftKey: true }), "Mod++"],
    ["Space", press(" "), "Space"],
    ["Shift+Space", press(" ", { shiftKey: true }), "Shift+Space"],
    ["Enter", press("Enter"), "Enter"],
    ["Alt on a named key", press("PageDown", { altKey: true }), "Alt+PageDown"],
  ])("normalizes %s", (_name, event, combo) => {
    expect(eventToCombo(event)).toBe(combo);
  });

  it("keeps characters that only fold to a letter by locale, such as the Turkish dotless i", () => {
    expect(eventToCombo(press("\u0131"))).toBe("\u0131");
    expect(eventToCombo(press("\u0131", { ctrlKey: true }))).toBe("Mod+\u0131");
  });

  it("lets Ctrl+Z follow the layout, so it works on AZERTY where Z sits on the W key", () => {
    expect(eventToCombo(press("z", { ctrlKey: true, code: "KeyW" }))).toBe("Mod+Z");
    expect(eventToCombo(press("w", { ctrlKey: true, code: "KeyZ" }))).toBe("Mod+W");
  });

  it("reads Option+L from the physical key on macOS, where the character is rewritten", () => {
    expect(eventToCombo(press("¬", { altKey: true, code: "KeyL" }))).toBe("Alt+L");
    expect(eventToCombo(press("Ò", { altKey: true, shiftKey: true, code: "KeyL" }))).toBe(
      "Alt+Shift+L",
    );
    expect(eventToCombo(press("¡", { altKey: true, code: "Digit1" }))).toBe("Alt+1");
  });

  it("falls back to the character for Alt when the event has no code", () => {
    expect(eventToCombo(press("l", { altKey: true }))).toBe("Alt+L");
  });

  it("rejects AltGr, reported as Ctrl+Alt or as the AltGraph modifier", () => {
    expect(eventToCombo(press("@", { ctrlKey: true, altKey: true, code: "KeyQ" }))).toBeNull();
    expect(eventToCombo(press("z", { metaKey: true, altKey: true, code: "KeyZ" }))).toBeNull();
    expect(
      eventToCombo(press("€", { getModifierState: (modifier) => modifier === "AltGraph" })),
    ).toBeNull();
  });

  it("rejects Ctrl and Command pressed together", () => {
    expect(eventToCombo(press("z", { ctrlKey: true, metaKey: true }))).toBeNull();
  });

  it.each(["Dead", "Process", "Unidentified"])("rejects the %s key", (key) => {
    expect(eventToCombo(press(key))).toBeNull();
    expect(eventToCombo(press(key, { altKey: true, code: "KeyE" }))).toBeNull();
  });

  it.each(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "ContextMenu"])(
    "rejects a press of only %s",
    (key) => {
      expect(eventToCombo(press(key))).toBeNull();
      expect(eventToCombo(press(key, { shiftKey: true, ctrlKey: key === "Control" }))).toBeNull();
    },
  );
});

describe("RESERVED keys", () => {
  it("covers the keys the fixed viewer handlers consume", () => {
    // useKeyboardGeometry.handleKeyDown and the fixed handler in PdfViewer.tsx.
    const consumed: Array<[string, boolean[]]> = [
      ["ArrowLeft", [false, true]],
      ["ArrowRight", [false, true]],
      ["ArrowUp", [false, true]],
      ["ArrowDown", [false, true]],
      ["Enter", [false]],
      ["Escape", [false]],
      [" ", [false, true]],
      ["e", [false, true]],
      ["E", [false, true]],
      ["n", [false, true]],
      ["N", [false, true]],
      ["[", [false]],
      ["]", [false]],
      ["Tab", [false, true]],
    ];
    for (const [key, shifts] of consumed) {
      for (const shiftKey of shifts) {
        const combo = eventToCombo(press(key, { shiftKey }));
        expect(RESERVED.has(combo!), `${key} (shift ${shiftKey}) -> ${combo}`).toBe(true);
      }
    }
  });

  it("is never assignable", () => {
    for (const combo of RESERVED) expect(isAssignableBinding(combo)).toBe(false);
    expect(isAssignableBinding("Mod+E")).toBe(true);
    expect(isAssignableBinding("Mod+Z")).toBe(true);
  });
});

describe("DEFAULT_BINDINGS", () => {
  const entries = ACTION_IDS.map((id) => [id, DEFAULT_BINDINGS[id]] as const);

  it("has an entry for every action and no others", () => {
    expect(Object.keys(DEFAULT_BINDINGS)).toEqual([...ACTION_IDS]);
  });

  it("only holds canonical, assignable combos, at most two per action", () => {
    for (const [id, combos] of entries) {
      expect(combos.length, id).toBeLessThanOrEqual(2);
      for (const combo of combos) expect(isAssignableBinding(combo), `${id}: ${combo}`).toBe(true);
    }
  });

  it("never gives one combo to two actions or two Shift variants of a letter", () => {
    const owner = new Map<string, string>();
    for (const [id, combos] of entries) {
      for (const combo of combos) {
        expect(owner.get(combo), `${combo} is used by ${owner.get(combo)} and ${id}`).toBe(
          undefined,
        );
        owner.set(combo, id);
      }
    }
    for (const combo of owner.keys()) {
      if (combo.startsWith("Shift+")) expect(owner.has(combo.slice(6))).toBe(false);
    }
  });

  it("keeps the keys of the previous release and adds to them", () => {
    expect(DEFAULT_BINDINGS).toMatchObject({
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
      "edit.copy": ["Mod+C"],
      "edit.paste": ["Mod+V"],
      "edit.delete": ["Delete", "Backspace"],
    });
    expect(DEFAULT_BINDINGS["edit.redo"][0]).toBe("Mod+Shift+Z");
    expect(DEFAULT_CHANGES_LEGACY).toBe(true);
  });
});

describe("sanitizeShortcutBindings", () => {
  it("keeps valid entries, including an explicit empty list for no shortcut", () => {
    const stored = { "tool.line": ["Q", "Alt+L"], "tool.hand": [], "edit.undo": ["Mod+Z"] };
    const result = sanitizeShortcutBindings(stored);
    expect(result).toEqual(stored);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result["tool.line"])).toBe(true);
    expect(isShortcutBindings(result)).toBe(true);
  });

  it("drops only the invalid entries", () => {
    const result = sanitizeShortcutBindings({
      "tool.line": ["Q"],
      "tool.nothing": ["Q"],
      "tool.hand": ["A", "B", "C"],
      "tool.cloud": ["l"],
      "tool.count": ["Mod+Alt+C"],
      "tool.ellipse": ["E"],
      "tool.polygon": ["Enter"],
      "tool.polyline": ["X", "X"],
      "tool.rectangle": "R",
      "tool.select": [1],
      "mode.snap": null,
      "edit.copy": ["Mod+C"],
    });
    expect(result).toEqual({ "tool.line": ["Q"], "edit.copy": ["Mod+C"] });
  });

  it("returns the shared empty map for anything that holds no valid entry", () => {
    for (const raw of [undefined, null, "x", 3, [], [["Q"]], {}, { "tool.line": "Q" }]) {
      expect(sanitizeShortcutBindings(raw)).toBe(EMPTY_SHORTCUT_BINDINGS);
    }
    expect(Object.isFrozen(EMPTY_SHORTCUT_BINDINGS)).toBe(true);
  });

  it("does not reject a combo that another action also holds", () => {
    const stored = { "tool.line": ["Q"], "tool.hand": ["Q"] };
    expect(sanitizeShortcutBindings(stored)).toEqual(stored);
  });

  it("ignores inherited and prototype keys", () => {
    const parsed = JSON.parse('{"__proto__": ["Q"], "tool.line": ["Q"]}') as unknown;
    expect(sanitizeShortcutBindings(parsed)).toEqual({ "tool.line": ["Q"] });
  });
});

describe("isShortcutBindings", () => {
  it("accepts a clean map and rejects any bad entry", () => {
    expect(isShortcutBindings({})).toBe(true);
    expect(isShortcutBindings({ "tool.line": ["Q"], "tool.hand": [] })).toBe(true);
    expect(isShortcutBindings({ "tool.line": ["q"] })).toBe(false);
    expect(isShortcutBindings({ "tool.nothing": ["Q"] })).toBe(false);
    expect(isShortcutBindings({ "tool.line": ["Q", "W", "A"] })).toBe(false);
    expect(isShortcutBindings({ "tool.line": ["Q", "Q"] })).toBe(false);
    expect(isShortcutBindings({ "tool.line": ["E"] })).toBe(false);
    expect(isShortcutBindings(null)).toBe(false);
    expect(isShortcutBindings([])).toBe(false);
    expect(isShortcutBindings("x")).toBe(false);
  });
});
