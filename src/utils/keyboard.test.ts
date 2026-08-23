import { describe, expect, it, beforeEach } from "vitest";
import {
  getDrawingKeyboardAction,
  getToolShortcut,
  shouldIgnoreGlobalKeyboardShortcut,
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

describe("global keyboard shortcut targets", () => {
  it("ignores buttons and other interactive controls", () => {
    expect(shouldIgnoreGlobalKeyboardShortcut(new FakeHTMLElement("button") as unknown as EventTarget))
      .toBe(true);
    expect(shouldIgnoreGlobalKeyboardShortcut(new FakeHTMLElement("a") as unknown as EventTarget)).toBe(
      true,
    );
  });

  it("ignores editable controls and dialog content", () => {
    expect(shouldIgnoreGlobalKeyboardShortcut(new FakeHTMLElement("input") as unknown as EventTarget))
      .toBe(true);
    expect(
      shouldIgnoreGlobalKeyboardShortcut(
        new FakeHTMLElement("canvas", true) as unknown as EventTarget,
      ),
    ).toBe(true);
  });

  it("allows shortcuts from the viewer canvas", () => {
    expect(shouldIgnoreGlobalKeyboardShortcut(new FakeHTMLElement("canvas") as unknown as EventTarget))
      .toBe(false);
  });
});

describe("drawing keyboard actions", () => {
  const lineDraft = { type: "line" as const, points: [{ x: 1, y: 1 }], pointer: null };
  const polygonDraft = {
    type: "polygon" as const,
    points: [
      { x: 1, y: 1 },
      { x: 10, y: 1 },
      { x: 10, y: 10 },
    ],
    pointer: null,
  };

  it("completes a polygon with Enter and exits it with the next Enter", () => {
    expect(getDrawingKeyboardAction("Enter", "polygon", polygonDraft)).toBe("complete-polygon");
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

  it("routes calibration Escape to the existing calibration cancellation flow", () => {
    expect(getDrawingKeyboardAction("Escape", "calibrate", lineDraft)).toBe("cancel-calibration");
    expect(getDrawingKeyboardAction("Escape", "calibrate", null)).toBe("cancel-calibration");
  });
});

describe("tool keyboard shortcuts", () => {
  it.each([
    ["P", "polygon"],
    ["l", "line"],
    ["H", "hand"],
    ["v", "select"],
  ] as const)("maps %s to %s", (key, tool) => {
    expect(getToolShortcut(key)).toBe(tool);
  });

  it("does not claim drawing completion or cancellation keys", () => {
    expect(getToolShortcut("Enter")).toBeNull();
    expect(getToolShortcut("Escape")).toBeNull();
  });
});
