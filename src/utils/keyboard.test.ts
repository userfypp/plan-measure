import { describe, expect, it, beforeEach } from "vitest";
import {
  getDrawingKeyboardAction,
  getShortcutLabel,
  getToolShortcut,
  getToolShortcutLabel,
  getViewerKeyboardAction,
  shouldIgnoreKeyboardShortcut,
  shouldIgnoreGlobalKeyboardShortcut,
  viewerShortcuts,
  type KeyboardShortcutEvent,
} from "./keyboard";

class FakeHTMLElement {
  constructor(
    private readonly kind: string,
    private readonly insideDialog = false,
  ) {}

  matches(selector: string): boolean {
    return selector.split(", ").includes(this.kind);
  }

  closest(selector: string): FakeHTMLElement | null {
    return selector === "dialog" && this.insideDialog ? this : null;
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
    ...overrides,
  };
}

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

describe("drawing keyboard actions", () => {
  const lineDraft = {
    type: "path" as const,
    measurementType: "line" as const,
    points: [{ x: 1, y: 1 }],
    pointer: null,
  };
  const polygonDraft = {
    type: "path" as const,
    measurementType: "polygon" as const,
    points: [
      { x: 1, y: 1 },
      { x: 10, y: 1 },
      { x: 10, y: 10 },
    ],
    pointer: null,
  };
  const polylineDraft = {
    type: "path" as const,
    measurementType: "polyline" as const,
    points: [
      { x: 1, y: 1 },
      { x: 10, y: 1 },
    ],
    pointer: null,
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
    pointer: null,
  };
  const polygonDraft = {
    type: "path" as const,
    measurementType: "polygon" as const,
    points: [
      { x: 1, y: 1 },
      { x: 10, y: 1 },
      { x: 10, y: 10 },
    ],
    pointer: null,
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
