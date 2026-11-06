/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INPUT_MODALITY_ATTRIBUTE, installInputModality, isKeyboardFocus } from "./inputModality";

let host: HTMLButtonElement;
let uninstall: (() => void) | null = null;

const modality = () => document.documentElement.getAttribute(INPUT_MODALITY_ATTRIBUTE);

beforeEach(() => {
  host = document.createElement("button");
  document.body.append(host);
  uninstall = installInputModality();
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  host.remove();
  vi.restoreAllMocks();
});

function press() {
  host.dispatchEvent(new Event("pointerdown", { bubbles: true }));
}

function key(key: string, init: KeyboardEventInit = {}) {
  host.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

describe("installInputModality", () => {
  it("leaves the root unmarked until the first press or Tab, so the browser decides", () => {
    expect(modality()).toBeNull();
  });

  it("marks the root keyboard on Tab and Shift+Tab", () => {
    key("Tab");
    expect(modality()).toBe("keyboard");

    press();
    key("Tab", { shiftKey: true });
    expect(modality()).toBe("keyboard");
  });

  it("marks the root pointer on a press and keeps it there until Tab", () => {
    key("Tab");
    press();
    expect(modality()).toBe("pointer");

    // Escape closes a menu or panel and hands focus back; typing is not navigation.
    for (const other of ["Escape", "Shift", "Control", "a", "F2"]) key(other);
    expect(modality()).toBe("pointer");

    key("Tab");
    expect(modality()).toBe("keyboard");
  });

  it("marks the root keyboard when a key navigates or activates a control after a press", () => {
    const markup = [
      "<button></button>",
      "<button><span></span></button>",
      '<a href="#x"></a>',
      "<select></select>",
      '<input type="checkbox">',
      '<input type="radio">',
      '<input type="range">',
      ...["menuitem", "menuitemcheckbox", "menuitemradio", "option", "tab", "radio"].map(
        (role) => `<div role="${role}"></div>`,
      ),
      '<div role="checkbox"></div>',
      '<div role="switch"></div>',
    ];
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
    keys.push("PageUp", "PageDown", "Enter", " ");

    for (const html of markup) {
      const holder = document.createElement("div");
      holder.innerHTML = html;
      document.body.append(holder);
      // The nested case presses a key on the span inside the button.
      const target = holder.firstElementChild!.firstElementChild ?? holder.firstElementChild!;
      for (const name of keys) {
        press();
        target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
        expect(modality(), `${html} ${name}`).toBe("keyboard");
      }
      holder.remove();
    }
  });

  it("keeps the press when the key lands where it edits text or pans, not on a control", () => {
    const viewer = document.createElement("div");
    viewer.tabIndex = 0;
    const field = document.createElement("input");
    const area = document.createElement("textarea");
    document.body.append(viewer, field, area);

    for (const target of [viewer, field, area, document.body]) {
      press();
      for (const name of ["ArrowDown", "Home", "Enter", " "]) {
        target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
      }
      expect(modality(), target.tagName).toBe("pointer");
    }
    viewer.remove();
    field.remove();
    area.remove();
  });

  it("marks the root text on a press inside a text field, so only that field keeps a ring", () => {
    const field = document.createElement("input");
    const area = document.createElement("textarea");
    document.body.append(field, area);
    const pressOn = (element: Element) =>
      element.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    pressOn(field);
    expect(modality()).toBe("text");
    pressOn(host);
    expect(modality()).toBe("pointer");
    pressOn(area);
    expect(modality()).toBe("text");

    for (const type of ["text", "search", "number", "email", "password", "tel", "url"]) {
      pressOn(host);
      field.type = type;
      pressOn(field);
      expect(modality(), type).toBe("text");
    }
    for (const type of ["checkbox", "radio", "range", "button", "color", "file"]) {
      pressOn(field);
      field.type = type;
      pressOn(field);
      expect(modality(), type).toBe("pointer");
    }

    pressOn(area);
    key("Tab");
    expect(modality()).toBe("keyboard");
    field.remove();
    area.remove();
  });

  it("ignores the combinations that switch browser tabs or apps or are shortcuts", () => {
    press();
    for (const name of ["Tab", "ArrowDown", "Enter"]) {
      key(name, { ctrlKey: true });
      key(name, { metaKey: true });
      key(name, { altKey: true });
    }
    expect(modality()).toBe("pointer");
  });

  it("sees presses and keys that a handler on the target stops", () => {
    host.addEventListener("pointerdown", (event) => event.stopPropagation());
    host.addEventListener("keydown", (event) => event.stopPropagation());

    press();
    expect(modality()).toBe("pointer");
    key("Tab");
    expect(modality()).toBe("keyboard");
  });

  it("writes the attribute only when the modality changes", () => {
    const setAttribute = vi.spyOn(document.documentElement, "setAttribute");

    press();
    press();
    key("Tab");
    key("Tab");

    expect(setAttribute).toHaveBeenCalledTimes(2);
  });

  it("removes its listeners and the mark on cleanup", () => {
    press();
    uninstall?.();
    uninstall = null;
    expect(modality()).toBeNull();

    key("Tab");
    press();
    expect(modality()).toBeNull();
  });
});

describe("isKeyboardFocus", () => {
  it("is true before any press, so the browser's own focus-visible heuristic decides", () => {
    expect(isKeyboardFocus()).toBe(true);
  });

  it("is true after Tab and false after a press, even in a text field", () => {
    key("Tab");
    expect(isKeyboardFocus()).toBe(true);

    press();
    expect(isKeyboardFocus()).toBe(false);

    key("Tab");
    const field = document.createElement("input");
    document.body.append(field);
    field.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(modality()).toBe("text");
    expect(isKeyboardFocus()).toBe(false);
    field.remove();
  });

  it("reads the document it is given", () => {
    const other = document.implementation.createHTMLDocument();
    press();

    expect(isKeyboardFocus(other)).toBe(true);
    other.documentElement.setAttribute(INPUT_MODALITY_ATTRIBUTE, "pointer");
    expect(isKeyboardFocus(other)).toBe(false);
  });
});
