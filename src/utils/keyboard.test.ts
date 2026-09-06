import { describe, expect, it, beforeEach } from "vitest";
import {
  getDrawingKeyboardAction,
  getGlobalViewerKeyboardAction,
  getMeasurementKeyboardAction,
  getShortcutLabel,
  getToolShortcut,
  getToolShortcutLabel,
  getViewerKeyboardAction,
  shouldIgnoreKeyboardShortcut,
  shouldIgnoreGlobalKeyboardShortcut,
  shouldIgnoreGlobalViewerShortcutTarget,
  shouldIgnoreMeasurementClipboardShortcutTarget,
  viewerShortcuts,
  type KeyboardShortcutEvent,
} from "./keyboard";

class FakeHTMLElement {
  constructor(
    private readonly kind: string,
    private readonly insideDialog = false,
    private readonly inputType: string | null = null,
    private readonly insideEditable = false,
    private readonly viewerShortcutsEnabled = false,
  ) {}

  get isContentEditable(): boolean {
    return this.kind.includes("contenteditable");
  }

  getAttribute(name: string): string | null {
    return name === "type" ? this.inputType : null;
  }

  matches(selector: string): boolean {
    if (selector === "[data-viewer-shortcuts]") return this.viewerShortcutsEnabled;
    return selector.split(", ").includes(this.kind);
  }

  closest(selector: string): FakeHTMLElement | null {
    if (selector.includes("dialog") && this.insideDialog) return this;
    if (selector.includes("contenteditable") && this.insideEditable) return this;
    return null;
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeHTMLElement,
  });
});

function keyboardEvent(
  key: string,
  target: EventTarget | null,
  overrides: Partial<KeyboardShortcutEvent> = {},
): KeyboardShortcutEvent {
  return {
    key,
    target,
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("measurement keyboard shortcuts", () => {
  const canvas = () => new FakeHTMLElement("canvas") as unknown as EventTarget;

  it.each([
    ["metaKey", "c", "copy-measurement"],
    ["ctrlKey", "C", "copy-measurement"],
    ["metaKey", "v", "paste-measurement"],
    ["ctrlKey", "V", "paste-measurement"],
  ] as const)("maps %s+%s to %s", (modifier, key, action) => {
    expect(getMeasurementKeyboardAction(keyboardEvent(key, canvas(), { [modifier]: true }))).toBe(
      action,
    );
  });

  it("keeps Delete and Backspace on the existing unmodified shortcut policy", () => {
    expect(getMeasurementKeyboardAction(keyboardEvent("Delete", canvas()))).toBe(
      "delete-measurement",
    );
    expect(getMeasurementKeyboardAction(keyboardEvent("Backspace", canvas()))).toBe(
      "delete-measurement",
    );
    expect(
      getMeasurementKeyboardAction(keyboardEvent("Backspace", canvas(), { metaKey: true })),
    ).toBeNull();
  });

  it.each(["input", "textarea", "select", "[contenteditable='true']"])(
    "leaves native copy and paste untouched in %s",
    (kind) => {
      const target = new FakeHTMLElement(kind) as unknown as EventTarget;
      expect(
        getMeasurementKeyboardAction(keyboardEvent("c", target, { metaKey: true })),
      ).toBeNull();
      expect(
        getMeasurementKeyboardAction(keyboardEvent("v", target, { ctrlKey: true })),
      ).toBeNull();
    },
  );

  it("does not claim shortcuts inside dialogs", () => {
    const dialogTarget = new FakeHTMLElement("span", true) as unknown as EventTarget;
    expect(
      getMeasurementKeyboardAction(keyboardEvent("c", dialogTarget, { metaKey: true })),
    ).toBeNull();
    expect(shouldIgnoreMeasurementClipboardShortcutTarget(dialogTarget)).toBe(true);
  });

  it("allows clipboard shortcuts after focus moves to non-editing application controls", () => {
    for (const kind of ["button", "a", "body"]) {
      const target = new FakeHTMLElement(kind) as unknown as EventTarget;
      expect(shouldIgnoreMeasurementClipboardShortcutTarget(target)).toBe(false);
      expect(getMeasurementKeyboardAction(keyboardEvent("c", target, { metaKey: true }))).toBe(
        "copy-measurement",
      );
      expect(getMeasurementKeyboardAction(keyboardEvent("v", target, { ctrlKey: true }))).toBe(
        "paste-measurement",
      );
    }
  });

  it.each(["checkbox", "radio", "range", "button", "submit"])(
    "allows clipboard shortcuts from non-editing input type %s",
    (type) => {
      const target = new FakeHTMLElement("input", false, type) as unknown as EventTarget;
      expect(shouldIgnoreMeasurementClipboardShortcutTarget(target)).toBe(false);
      expect(getMeasurementKeyboardAction(keyboardEvent("c", target, { metaKey: true }))).toBe(
        "copy-measurement",
      );
      expect(getMeasurementKeyboardAction(keyboardEvent("v", target, { ctrlKey: true }))).toBe(
        "paste-measurement",
      );
    },
  );

  it("does not claim modified paste variants, repeats, or unmodified C/V", () => {
    expect(
      getMeasurementKeyboardAction(keyboardEvent("v", canvas(), { metaKey: true, shiftKey: true })),
    ).toBeNull();
    expect(
      getMeasurementKeyboardAction(keyboardEvent("v", canvas(), { ctrlKey: true, altKey: true })),
    ).toBeNull();
    expect(
      getMeasurementKeyboardAction(keyboardEvent("c", canvas(), { metaKey: true, repeat: true })),
    ).toBeNull();
    expect(
      getMeasurementKeyboardAction(keyboardEvent("c", canvas(), { metaKey: true, ctrlKey: true })),
    ).toBeNull();
    expect(
      getMeasurementKeyboardAction(
        keyboardEvent("c", canvas(), { metaKey: true, defaultPrevented: true }),
      ),
    ).toBeNull();
    expect(getMeasurementKeyboardAction(keyboardEvent("c", canvas()))).toBeNull();
    expect(getMeasurementKeyboardAction(keyboardEvent("v", canvas()))).toBeNull();
  });
});

describe("global keyboard shortcut targets", () => {
  it("ignores buttons and other interactive controls", () => {
    expect(
      shouldIgnoreGlobalKeyboardShortcut(new FakeHTMLElement("button") as unknown as EventTarget),
    ).toBe(true);
    expect(
      shouldIgnoreGlobalKeyboardShortcut(new FakeHTMLElement("a") as unknown as EventTarget),
    ).toBe(true);
  });

  it("ignores editable controls and dialog content", () => {
    expect(
      shouldIgnoreGlobalKeyboardShortcut(new FakeHTMLElement("input") as unknown as EventTarget),
    ).toBe(true);
    expect(
      shouldIgnoreGlobalKeyboardShortcut(
        new FakeHTMLElement("canvas", true) as unknown as EventTarget,
      ),
    ).toBe(true);
  });

  it("allows shortcuts from the viewer canvas", () => {
    expect(
      shouldIgnoreGlobalKeyboardShortcut(new FakeHTMLElement("canvas") as unknown as EventTarget),
    ).toBe(false);
  });
});

describe("global viewer keyboard policy", () => {
  it.each(["button", "a", "summary", "body"])(
    "allows tool shortcuts after focus moves to %s",
    (kind) => {
      const target = new FakeHTMLElement(kind) as unknown as EventTarget;
      expect(shouldIgnoreGlobalViewerShortcutTarget(target)).toBe(false);
      expect(getGlobalViewerKeyboardAction(keyboardEvent("L", target))).toEqual({
        type: "choose-tool",
        tool: "line",
      });
    },
  );

  it("keeps tool shortcuts available while a measurement action button has focus", () => {
    const measurementAction = new FakeHTMLElement("button") as unknown as EventTarget;

    expect(getGlobalViewerKeyboardAction(keyboardEvent("l", measurementAction))).toEqual({
      type: "choose-tool",
      tool: "line",
    });
  });

  it("keeps tool shortcuts available after a classification assignment", () => {
    const assignmentSelect = new FakeHTMLElement(
      "select",
      false,
      null,
      false,
      true,
    ) as unknown as EventTarget;

    expect(shouldIgnoreGlobalViewerShortcutTarget(assignmentSelect)).toBe(false);
    expect(getGlobalViewerKeyboardAction(keyboardEvent("l", assignmentSelect))).toEqual({
      type: "choose-tool",
      tool: "line",
    });
  });

  it.each(["input", "textarea", "select", "[contenteditable='true']"])(
    "preserves text editing in %s",
    (kind) => {
      const target = new FakeHTMLElement(kind) as unknown as EventTarget;
      expect(getGlobalViewerKeyboardAction(keyboardEvent("p", target))).toBeNull();
      expect(getGlobalViewerKeyboardAction(keyboardEvent("-", target))).toBeNull();
    },
  );

  it.each(["checkbox", "radio", "range"])(
    "allows tool shortcuts after a non-editing %s input",
    (inputType) => {
      const target = new FakeHTMLElement("input", false, inputType) as unknown as EventTarget;
      expect(getGlobalViewerKeyboardAction(keyboardEvent("l", target))).toEqual({
        type: "choose-tool",
        tool: "line",
      });
    },
  );

  it("protects descendants of every contenteditable form", () => {
    const target = new FakeHTMLElement("span", false, null, true) as unknown as EventTarget;
    expect(getGlobalViewerKeyboardAction(keyboardEvent("p", target))).toBeNull();
  });

  it("does not claim shortcuts inside a dialog", () => {
    const target = new FakeHTMLElement("button", true) as unknown as EventTarget;
    expect(getGlobalViewerKeyboardAction(keyboardEvent("l", target))).toBeNull();
  });

  it("ignores repeated tool and Ortho shortcuts without disabling held zoom", () => {
    const target = new FakeHTMLElement("button") as unknown as EventTarget;
    expect(getGlobalViewerKeyboardAction(keyboardEvent("l", target, { repeat: true }))).toBeNull();
    expect(getGlobalViewerKeyboardAction(keyboardEvent("o", target, { repeat: true }))).toBeNull();
    expect(getGlobalViewerKeyboardAction(keyboardEvent("+", target, { repeat: true }))).toBe(
      "zoom-in",
    );
  });

  it.each(["metaKey", "ctrlKey", "altKey"] as const)("preserves %s combinations", (modifier) => {
    expect(
      getGlobalViewerKeyboardAction(
        keyboardEvent("l", new FakeHTMLElement("button") as unknown as EventTarget, {
          [modifier]: true,
        }),
      ),
    ).toBeNull();
  });
});

describe("drawing keyboard actions", () => {
  const lineDraft = {
    type: "path" as const,
    measurementType: "line" as const,
    points: [{ x: 1, y: 1 }],
  };
  const polygonDraft = {
    type: "path" as const,
    measurementType: "polygon" as const,
    points: [
      { x: 1, y: 1 },
      { x: 10, y: 1 },
      { x: 10, y: 10 },
    ],
  };
  const polylineDraft = {
    type: "path" as const,
    measurementType: "polyline" as const,
    points: [
      { x: 1, y: 1 },
      { x: 10, y: 1 },
    ],
  };

  it("completes a polygon with Enter and exits it with the next Enter", () => {
    expect(getDrawingKeyboardAction("Enter", "polygon", polygonDraft)).toBe("complete-path");
    expect(getDrawingKeyboardAction("Enter", "polygon", null)).toBe("exit-tool");
  });

  it("cancels only the current Line or Polygon draft with Escape", () => {
    expect(getDrawingKeyboardAction("Escape", "line", lineDraft)).toBe("cancel-draft");
    expect(getDrawingKeyboardAction("Escape", "polygon", polygonDraft)).toBe("cancel-draft");
    expect(getDrawingKeyboardAction("Escape", "line", null)).toBe("exit-tool");
    expect(getDrawingKeyboardAction("Escape", "polygon", null)).toBe("exit-tool");
  });

  it("leaves an incomplete Line draft unchanged when Enter is pressed", () => {
    expect(getDrawingKeyboardAction("Enter", "line", lineDraft)).toBeNull();
  });

  it("finalizes Polyline with Enter and exits it when no draft exists", () => {
    expect(getDrawingKeyboardAction("Enter", "polyline", polylineDraft)).toBe("complete-path");
    expect(getDrawingKeyboardAction("Enter", "polyline", null)).toBe("exit-tool");
  });

  it("routes calibration Escape to the existing calibration cancellation flow", () => {
    expect(getDrawingKeyboardAction("Escape", "calibrate", lineDraft)).toBe("cancel-calibration");
    expect(getDrawingKeyboardAction("Escape", "calibrate", null)).toBe("cancel-calibration");
  });
});

describe("tool keyboard shortcuts", () => {
  it.each([
    ["P", "polygon"],
    ["m", "polyline"],
    ["l", "line"],
    ["H", "hand"],
    ["v", "select"],
  ] as const)("maps %s to %s", (key, tool) => {
    expect(getToolShortcut(key)).toBe(tool);
  });

  it("derives visible shortcut labels from the shared tool registry", () => {
    expect(getToolShortcutLabel("select")).toBe("V");
    expect(getToolShortcutLabel("hand")).toBe("H");
    expect(getToolShortcutLabel("line")).toBe("L");
    expect(getToolShortcutLabel("polyline")).toBe("M");
    expect(getToolShortcutLabel("polygon")).toBe("P");
    expect(getShortcutLabel("toggle-orthogonal")).toBe("O");
    expect(viewerShortcuts.map((shortcut) => shortcut.key.toUpperCase())).toEqual([
      "V",
      "H",
      "L",
      "M",
      "P",
      "O",
    ]);
  });

  it("does not claim drawing completion or cancellation keys", () => {
    expect(getToolShortcut("Enter")).toBeNull();
    expect(getToolShortcut("Escape")).toBeNull();
  });
});

describe("viewer keyboard policy", () => {
  const lineDraft = {
    type: "path" as const,
    measurementType: "line" as const,
    points: [{ x: 1, y: 1 }],
  };
  const polygonDraft = {
    type: "path" as const,
    measurementType: "polygon" as const,
    points: [
      { x: 1, y: 1 },
      { x: 10, y: 1 },
      { x: 10, y: 10 },
    ],
  };

  it("restores the toolbar → viewer focus → shortcut flow", () => {
    const toolbarButton = new FakeHTMLElement("button") as unknown as EventTarget;
    const canvas = new FakeHTMLElement("canvas") as unknown as EventTarget;

    expect(getViewerKeyboardAction(keyboardEvent("l", toolbarButton), "select", null)).toBeNull();
    expect(getViewerKeyboardAction(keyboardEvent("m", canvas), "select", null)).toEqual({
      type: "choose-tool",
      tool: "polyline",
    });
    expect(getViewerKeyboardAction(keyboardEvent("o", canvas), "polyline", null)).toBe(
      "toggle-orthogonal",
    );
    expect(getViewerKeyboardAction(keyboardEvent("Escape", canvas), "line", lineDraft)).toBe(
      "cancel-draft",
    );
    expect(getViewerKeyboardAction(keyboardEvent("Enter", canvas), "polygon", polygonDraft)).toBe(
      "complete-path",
    );
  });

  it("toggles Ortho from the viewer surface", () => {
    const canvas = new FakeHTMLElement("canvas") as unknown as EventTarget;
    expect(getViewerKeyboardAction(keyboardEvent("o", canvas), "line", null)).toBe(
      "toggle-orthogonal",
    );
  });

  it.each([
    ["v", "select"],
    ["H", "hand"],
    ["l", "line"],
    ["P", "polygon"],
  ] as const)("maps %s from the viewer surface to %s", (key, tool) => {
    expect(
      getViewerKeyboardAction(
        keyboardEvent(key, new FakeHTMLElement("canvas") as unknown as EventTarget),
        "select",
        null,
      ),
    ).toEqual({ type: "choose-tool", tool });
  });

  it.each(["metaKey", "ctrlKey", "altKey"] as const)(
    "does not claim %s combinations reserved for the browser or operating system",
    (modifier) => {
      for (const key of ["v", "h", "l", "m", "o", "p", "+", "-"]) {
        const event = keyboardEvent(key, new FakeHTMLElement("canvas") as unknown as EventTarget, {
          [modifier]: true,
        });
        expect(shouldIgnoreKeyboardShortcut(event)).toBe(true);
        expect(getViewerKeyboardAction(event, "select", null)).toBeNull();
      }
    },
  );

  it("does not claim input editing keys", () => {
    const input = new FakeHTMLElement("input") as unknown as EventTarget;
    expect(getViewerKeyboardAction(keyboardEvent("p", input), "select", null)).toBeNull();
    expect(getViewerKeyboardAction(keyboardEvent("Escape", input), "line", lineDraft)).toBeNull();
  });
});
