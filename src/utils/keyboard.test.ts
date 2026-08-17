import { describe, expect, it, beforeEach } from "vitest";
import { shouldIgnoreGlobalKeyboardShortcut } from "./keyboard";

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
