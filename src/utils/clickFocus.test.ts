/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installClickFocus } from "./clickFocus";

let cleanup: () => void;

beforeEach(() => {
  cleanup = installClickFocus();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function add(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

/** A press as WebKit handles it: the events fire and nothing moves focus. */
function press(target: Element, options: { up?: Element; button?: number; cancel?: boolean } = {}) {
  const down = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
  });
  if (options.cancel) down.preventDefault();
  target.dispatchEvent(down);
  (options.up ?? target).dispatchEvent(
    new MouseEvent("mouseup", { bubbles: true, button: options.button ?? 0 }),
  );
}

describe("installClickFocus", () => {
  it.each([
    ["a button", '<button id="c">Go</button>'],
    ["a link", '<a id="c" href="#x">Go</a>'],
    ["a checkbox", '<input id="c" type="checkbox">'],
    ["a radio", '<input id="c" type="radio" name="r">'],
    ["a summary", '<details><summary id="c">More</summary></details>'],
  ])("focuses %s that a press left unfocused", (_name, html) => {
    add(html);
    expect(document.activeElement).toBe(document.body);
    press(document.getElementById("c")!);
    expect(document.activeElement).toBe(document.getElementById("c"));
  });

  it("focuses the control when the press lands on something inside it", () => {
    add('<button id="c"><span id="inner">Go</span></button>');
    press(document.getElementById("inner")!);
    expect(document.activeElement).toBe(document.getElementById("c"));
  });

  it("takes focus from a field the way other browsers do", () => {
    add('<input id="f"><button id="c">Go</button>');
    document.getElementById("f")!.focus();
    press(document.getElementById("c")!);
    expect(document.activeElement).toBe(document.getElementById("c"));
  });

  it("leaves focus alone for a disabled control, an inert one and a text field", () => {
    add(
      '<button id="d" disabled>Go</button><div inert><button id="i">Go</button></div><input id="t">',
    );
    press(document.getElementById("d")!);
    press(document.getElementById("i")!);
    press(document.getElementById("t")!);
    expect(document.activeElement).toBe(document.body);
  });

  it("respects a mousedown that was cancelled to keep focus where it is", () => {
    add('<input id="f"><button id="c">Go</button>');
    document.getElementById("f")!.focus();
    press(document.getElementById("c")!, { cancel: true });
    expect(document.activeElement).toBe(document.getElementById("f"));
  });

  it("ignores other mouse buttons and a press released on another control", () => {
    add('<button id="a">A</button><button id="b">B</button>');
    press(document.getElementById("a")!, { button: 2 });
    expect(document.activeElement).toBe(document.body);
    press(document.getElementById("a")!, { up: document.getElementById("b")! });
    expect(document.activeElement).toBe(document.body);
  });

  it("runs before click handlers, so a handler that moves focus keeps the last word", () => {
    add('<button id="c">Open</button><input id="f">');
    const order: string[] = [];
    document.getElementById("c")!.addEventListener("click", () => {
      order.push(`click:${document.activeElement?.id}`);
      document.getElementById("f")!.focus();
    });
    const control = document.getElementById("c")!;
    press(control);
    control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(order).toEqual(["click:c"]);
    expect(document.activeElement).toBe(document.getElementById("f"));
  });

  it("stops listening after cleanup", () => {
    add('<button id="c">Go</button>');
    cleanup();
    press(document.getElementById("c")!);
    expect(document.activeElement).toBe(document.body);
    cleanup = installClickFocus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    press(document.getElementById("c")!);
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });
});
