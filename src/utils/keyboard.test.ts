import { describe, expect, it, beforeEach } from "vitest";
import {
  getDrawingKeyboardAction,
  getFixedViewerKeyboardAction,
  shouldIgnoreGlobalKeyboardShortcut,
  shouldIgnoreMeasurementClipboardShortcutTarget,
  shouldIgnoreViewerKeyboardShortcut,
  type KeyboardShortcutEvent,
} from "./keyboard";
import { eventToCombo, type ActionId } from "./shortcuts/bindings";
import { getShortcutLabel, getShortcutSnapshot } from "./shortcuts/store";

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

/** What the app runs for a keydown: the focus policy, then the fixed keys, then the bound key. */
function resolveViewerKey(
  event: KeyboardShortcutEvent,
  tool: Parameters<typeof getFixedViewerKeyboardAction>[1],
  draft: Parameters<typeof getFixedViewerKeyboardAction>[2],
) {
  const fixed = getFixedViewerKeyboardAction(event, tool, draft);
  if (fixed || shouldIgnoreViewerKeyboardShortcut(event)) return fixed;
  const combo = eventToCombo(event);
  return (combo && getShortcutSnapshot().byCombo.get(combo)) || null;
}

describe("measurement clipboard shortcut targets", () => {
  it.each([
    ["measurement search", new FakeHTMLElement("input", false, "search")],
    ["measurement filter", new FakeHTMLElement("select")],
  ])("preserves native keyboard behavior in the %s control", (_name, target) => {
    for (const key of ["v", "h", "l", "m", "p", "o", "s", " ", "+", "-"]) {
      expect(
        resolveViewerKey(keyboardEvent(key, target as unknown as EventTarget), "select", null),
      ).toBeNull();
    }
  });

  it("does not claim shortcuts inside dialogs", () => {
    const dialogTarget = new FakeHTMLElement("span", true) as unknown as EventTarget;
    expect(shouldIgnoreMeasurementClipboardShortcutTarget(dialogTarget)).toBe(true);
  });

  it("allows clipboard shortcuts after focus moves to non-editing application controls", () => {
    for (const kind of ["button", "a", "body"]) {
      const target = new FakeHTMLElement(kind) as unknown as EventTarget;
      expect(shouldIgnoreMeasurementClipboardShortcutTarget(target)).toBe(false);
    }
  });

  it.each(["checkbox", "radio", "range", "button", "submit"])(
    "allows clipboard shortcuts from non-editing input type %s",
    (type) => {
      const target = new FakeHTMLElement("input", false, type) as unknown as EventTarget;
      expect(shouldIgnoreMeasurementClipboardShortcutTarget(target)).toBe(false);
    },
  );
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

describe("viewer-local keyboard policy", () => {
  it.each([
    ["V", "tool.select"],
    ["H", "tool.hand"],
    ["L", "tool.line"],
    ["M", "tool.polyline"],
    ["P", "tool.polygon"],
    ["O", "mode.orthogonal"],
    ["S", "mode.snap"],
  ] as const)("maps %s from the focused viewer surface", (key, action) => {
    const viewerSurface = new FakeHTMLElement("canvas") as unknown as EventTarget;
    expect(resolveViewerKey(keyboardEvent(key, viewerSurface), "select", null)).toEqual(action);
  });

  it.each(["input", "textarea", "select"])(
    "does not consume viewer shortcuts while %s has focus",
    (kind) => {
      const target = new FakeHTMLElement(kind) as unknown as EventTarget;
      for (const key of ["l", "s", " ", "+", "-"]) {
        expect(resolveViewerKey(keyboardEvent(key, target), "select", null)).toBeNull();
      }
    },
  );

  it.each(["button", "a", "[role='button']", "[role='link']"])(
    "allows tools and zoom from %s while preserving activation keys",
    (kind) => {
      const target = new FakeHTMLElement(kind) as unknown as EventTarget;
      expect(resolveViewerKey(keyboardEvent("l", target), "select", null)).toBe("tool.line");
      expect(resolveViewerKey(keyboardEvent("s", target), "select", null)).toBe("mode.snap");
      expect(resolveViewerKey(keyboardEvent("+", target), "select", null)).toBe("view.zoomIn");
      expect(resolveViewerKey(keyboardEvent(" ", target), "select", null)).toBeNull();
      expect(resolveViewerKey(keyboardEvent("Enter", target), "line", null)).toBeNull();
    },
  );

  it("ignores composition and editable descendants", () => {
    const nested = new FakeHTMLElement("span", false, null, true) as unknown as EventTarget;
    expect(resolveViewerKey(keyboardEvent("l", nested), "select", null)).toBeNull();
    expect(
      resolveViewerKey(keyboardEvent("l", null, { isComposing: true }), "select", null),
    ).toBeNull();
  });

  it.each(["checkbox", "radio", "range"])(
    "preserves native Space for a focused %s",
    (inputType) => {
      const target = new FakeHTMLElement("input", false, inputType) as unknown as EventTarget;
      expect(resolveViewerKey(keyboardEvent(" ", target), "select", null)).toBeNull();
    },
  );

  it("does not consume an event that a viewer child already handled", () => {
    const target = new FakeHTMLElement("canvas") as unknown as EventTarget;
    expect(
      resolveViewerKey(keyboardEvent("l", target, { defaultPrevented: true }), "select", null),
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
    ["P", "tool.polygon"],
    ["m", "tool.polyline"],
    ["l", "tool.line"],
    ["H", "tool.hand"],
    ["v", "tool.select"],
  ] as const)("maps %s to %s", (key, action) => {
    const canvas = new FakeHTMLElement("canvas") as unknown as EventTarget;
    expect(resolveViewerKey(keyboardEvent(key, canvas), "select", null)).toBe(action);
  });

  it("labels the default tool and drawing-aid keys from the shortcut store", () => {
    const ids: ActionId[] = [
      "tool.select",
      "tool.hand",
      "tool.line",
      "tool.polyline",
      "tool.polygon",
      "tool.rectangle",
      "tool.ellipse",
      "tool.cloud",
      "tool.count",
      "mode.orthogonal",
      "mode.snap",
    ];
    expect(ids.map(getShortcutLabel)).toEqual([
      "V",
      "H",
      "L",
      "M",
      "P",
      "R",
      "I",
      "K",
      "C",
      "O",
      "S",
    ]);
  });

  it("does not claim drawing completion or cancellation keys", () => {
    const canvas = new FakeHTMLElement("canvas") as unknown as EventTarget;
    expect(resolveViewerKey(keyboardEvent("Enter", canvas), "select", null)).toBeNull();
    expect(resolveViewerKey(keyboardEvent("Escape", canvas), "select", null)).toBeNull();
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

  it("allows shortcuts immediately after toolbar interaction", () => {
    const toolbarButton = new FakeHTMLElement("button") as unknown as EventTarget;
    const canvas = new FakeHTMLElement("canvas") as unknown as EventTarget;

    expect(resolveViewerKey(keyboardEvent("l", toolbarButton), "select", null)).toBe("tool.line");
    expect(resolveViewerKey(keyboardEvent("m", canvas), "select", null)).toBe("tool.polyline");
    expect(resolveViewerKey(keyboardEvent("o", canvas), "polyline", null)).toBe("mode.orthogonal");
    expect(resolveViewerKey(keyboardEvent("Escape", canvas), "line", lineDraft)).toBe(
      "cancel-draft",
    );
    expect(resolveViewerKey(keyboardEvent("Enter", canvas), "polygon", polygonDraft)).toBe(
      "complete-path",
    );
  });

  it("starts temporary pan when the viewer already has focus", () => {
    const canvas = new FakeHTMLElement("canvas") as unknown as EventTarget;
    expect(resolveViewerKey(keyboardEvent(" ", canvas), "select", null)).toBe("start-pan");
  });

  it("toggles Ortho from the viewer surface", () => {
    const canvas = new FakeHTMLElement("canvas") as unknown as EventTarget;
    expect(resolveViewerKey(keyboardEvent("o", canvas), "line", null)).toBe("mode.orthogonal");
  });

  it("toggles Snap from the viewer surface", () => {
    const canvas = new FakeHTMLElement("canvas") as unknown as EventTarget;
    expect(resolveViewerKey(keyboardEvent("s", canvas), "line", null)).toBe("mode.snap");
  });

  it.each([
    ["v", "tool.select"],
    ["H", "tool.hand"],
    ["l", "tool.line"],
    ["P", "tool.polygon"],
  ] as const)("maps %s from the viewer surface to %s", (key, action) => {
    expect(
      resolveViewerKey(
        keyboardEvent(key, new FakeHTMLElement("canvas") as unknown as EventTarget),
        "select",
        null,
      ),
    ).toBe(action);
  });

  it.each(["metaKey", "ctrlKey", "altKey"] as const)(
    "does not claim %s combinations reserved for the browser or operating system",
    (modifier) => {
      for (const key of ["v", "h", "l", "m", "o", "p", "s", "+", "-"]) {
        const event = keyboardEvent(key, new FakeHTMLElement("canvas") as unknown as EventTarget, {
          [modifier]: true,
        });
        expect(shouldIgnoreViewerKeyboardShortcut(event)).toBe(true);
        expect(resolveViewerKey(event, "select", null)).toBeNull();
      }
    },
  );

  it("does not claim input editing keys", () => {
    const input = new FakeHTMLElement("input") as unknown as EventTarget;
    expect(resolveViewerKey(keyboardEvent("p", input), "select", null)).toBeNull();
    expect(resolveViewerKey(keyboardEvent("Escape", input), "line", lineDraft)).toBeNull();
  });
});
