/* @vitest-environment jsdom */

import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Popover } from "./Popover";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderPopover() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <div>
        <button type="button">Before action</button>
        <Popover
          trigger="Open disclosure"
          initialFocus="first"
          dismissOnFocusLeave
          role="dialog"
          aria-label="Example disclosure"
        >
          <button type="button">Inside action</button>
        </Popover>
        <button type="button">Outside action</button>
      </div>,
    );
  });
}

function trigger(): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll("button") ?? []).find(
    (candidate) => candidate.textContent === "Open disclosure",
  );
  if (!button) throw new Error("Popover trigger was not rendered.");
  return button;
}

function openPopover() {
  act(() => trigger().click());
}

function findButton(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text,
  );
  if (!button) throw new Error(`Button ${text} was not rendered.`);
  return button;
}

function dialog(label: string): HTMLElement | null {
  return document.querySelector(`[role="dialog"][aria-label="${label}"]`);
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  renderPopover();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll('[role="dialog"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("Popover", () => {
  it("does not invent dialog semantics for an unlabeled generic popover", () => {
    const genericContainer = document.createElement("div");
    document.body.append(genericContainer);
    const genericRoot = createRoot(genericContainer);
    act(() => {
      genericRoot.render(
        <Popover trigger="Open generic">
          <button type="button">Generic action</button>
        </Popover>,
      );
    });
    const genericTrigger = Array.from(genericContainer.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Open generic",
    );
    if (!genericTrigger) throw new Error("Generic trigger was not rendered.");

    act(() => genericTrigger.click());

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe("Generic action");
    const genericAction = Array.from(document.body.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Generic action",
    );
    expect(genericAction?.parentElement?.getAttribute("role")).toBeNull();

    act(() => genericRoot.unmount());
    genericContainer.remove();
  });

  it("exposes an accessible open relationship and focuses interactive content", () => {
    openPopover();

    const disclosure = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(disclosure?.getAttribute("aria-label")).toBe("Example disclosure");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBe(disclosure?.id);
    expect(document.activeElement?.textContent).toBe("Inside action");
  });

  it("dismisses on Escape and restores focus to the trigger", () => {
    openPopover();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
  });

  it("dismisses on an outside pointer interaction", () => {
    openPopover();
    const outside = Array.from(container?.querySelectorAll("button") ?? []).find(
      (candidate) => candidate.textContent === "Outside action",
    );
    if (!outside) throw new Error("Outside action was not rendered.");

    act(() => {
      outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("dismisses when focus leaves the popover without stealing the new focus", () => {
    openPopover();
    const outside = findButton("Outside action");

    act(() => outside.focus());

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outside);
  });

  it("treats its trigger as part of the disclosure so pointer focus does not close then reopen it", () => {
    openPopover();
    const disclosureTrigger = trigger();

    act(() => disclosureTrigger.focus());

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(disclosureTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(disclosureTrigger);

    act(() => disclosureTrigger.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(disclosureTrigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes at the backward Tab boundary and moves to the previous document stop", () => {
    openPopover();
    const inside = findButton("Inside action");
    expect(document.activeElement).toBe(inside);

    act(() => {
      inside.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(findButton("Before action"));
  });

  it("closes deterministically at the forward Tab boundary and moves to the next document stop", () => {
    openPopover();
    const inside = findButton("Inside action");
    const outside = findButton("Outside action");
    expect(document.activeElement).toBe(inside);

    act(() => {
      inside.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("lets only the topmost of two open popovers process Escape", () => {
    act(() => {
      root!.render(
        <>
          <Popover trigger="First trigger" defaultOpen role="dialog" aria-label="First popover">
            <button type="button">First action</button>
          </Popover>
          <Popover trigger="Second trigger" defaultOpen role="dialog" aria-label="Second popover">
            <button type="button">Second action</button>
          </Popover>
        </>,
      );
    });

    expect(dialog("First popover")).not.toBeNull();
    expect(dialog("Second popover")).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(dialog("First popover")).not.toBeNull();
    expect(dialog("Second popover")).toBeNull();
    expect(document.activeElement).toBe(findButton("Second trigger"));
  });

  it("mounts a defaultOpen popover inside its dialog, positioned and focused", () => {
    act(() => {
      root!.render(
        <dialog open>
          <Popover trigger="Inner trigger" defaultOpen initialFocus="first" role="menu" aria-label="Inner">
            <button type="button">Inner action</button>
          </Popover>
        </dialog>,
      );
    });
    const menu = document.querySelector<HTMLElement>('[aria-label="Inner"]')!;
    expect(menu.closest("dialog")).not.toBeNull();
    expect(menu.style.left).not.toBe("");
    expect(document.activeElement?.textContent).toBe("Inner action");
  });

  it("closes an open popover when its trigger is pressed again", () => {
    act(() => {
      root!.render(
        <Popover trigger="Toggle" role="dialog" aria-label="Toggled" initialFocus="first" dismissOnFocusLeave>
          <button type="button">Toggled action</button>
        </Popover>,
      );
    });
    const toggle = findButton("Toggle")!;
    const press = () => {
      act(() => {
        toggle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        toggle.focus();
        toggle.click();
      });
    };
    press();
    expect(dialog("Toggled")).not.toBeNull();
    press();
    expect(dialog("Toggled")).toBeNull();
  });

  it("closes, without reopening, when the label of its trigger is pressed", () => {
    act(() => {
      root!.render(
        <div>
          <label htmlFor="labelled-trigger">Field label</label>
          <Popover
            trigger="Toggle"
            triggerProps={{ id: "labelled-trigger" }}
            role="dialog"
            aria-label="Toggled"
            initialFocus="first"
            dismissOnFocusLeave
          >
            <button type="button">Toggled action</button>
          </Popover>
        </div>,
      );
    });
    const label = document.querySelector("label")!;
    act(() => findButton("Toggle")!.click());
    expect(dialog("Toggled")).not.toBeNull();

    act(() => {
      label.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      label.click();
    });
    expect(dialog("Toggled")).toBeNull();
  });

  it("keeps the popover closed when it closed between pointerdown and click on the trigger", () => {
    act(() => {
      root!.render(
        <Popover trigger="Toggle" role="dialog" aria-label="Toggled" initialFocus="first" dismissOnFocusLeave>
          <button type="button">Toggled action</button>
        </Popover>,
      );
    });
    const toggle = findButton("Toggle")!;
    act(() => toggle.click());
    expect(dialog("Toggled")).not.toBeNull();

    act(() => {
      toggle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    });
    // Intermediate close (focus moved away) before the click arrives.
    act(() => {
      document.body.appendChild(Object.assign(document.createElement("button"), { id: "elsewhere" }));
      document.getElementById("elsewhere")!.focus();
    });
    expect(dialog("Toggled")).toBeNull();
    act(() => toggle.click());
    expect(dialog("Toggled")).toBeNull();

    // A keyboard click (no pointerdown) still toggles open.
    act(() => toggle.click());
    expect(dialog("Toggled")).not.toBeNull();
    document.getElementById("elsewhere")?.remove();
  });

  it("keeps a nested child above its parent when both open in the same commit", () => {
    act(() => {
      root!.render(
        <Popover
          trigger="Parent trigger"
          defaultOpen
          role="dialog"
          aria-label="Parent popover"
        >
          <Popover
            trigger="Child trigger"
            defaultOpen
            role="dialog"
            aria-label="Child popover"
          >
            <button type="button">Child action</button>
          </Popover>
        </Popover>,
      );
    });

    expect(dialog("Parent popover")).not.toBeNull();
    expect(dialog("Child popover")).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(dialog("Parent popover")).not.toBeNull();
    expect(dialog("Child popover")).toBeNull();
    expect(document.activeElement).toBe(findButton("Child trigger"));
  });

  it("keeps a parent open for pointer interaction inside its portaled child", () => {
    act(() => {
      root!.render(
        <>
          <Popover trigger="Parent trigger" role="dialog" aria-label="Parent popover">
            <Popover trigger="Child trigger" role="dialog" aria-label="Child popover">
              <button type="button">Child action</button>
            </Popover>
          </Popover>
          <button type="button">Outside hierarchy</button>
        </>,
      );
    });
    act(() => findButton("Parent trigger").click());
    act(() => findButton("Child trigger").click());

    act(() => {
      findButton("Child action").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(dialog("Parent popover")).not.toBeNull();
    expect(dialog("Child popover")).not.toBeNull();
  });

  it("restores focus to a nested child trigger when the child closes", () => {
    act(() => {
      root!.render(
        <Popover trigger="Parent trigger" role="dialog" aria-label="Parent popover">
          <Popover trigger="Child trigger" role="dialog" aria-label="Child popover">
            <button type="button">Child action</button>
          </Popover>
        </Popover>,
      );
    });
    act(() => findButton("Parent trigger").click());
    act(() => findButton("Child trigger").click());

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(dialog("Parent popover")).not.toBeNull();
    expect(dialog("Child popover")).toBeNull();
    expect(document.activeElement).toBe(findButton("Child trigger"));
  });

  it("keeps nested focus transitions within the hierarchy deterministic", () => {
    act(() => {
      root!.render(
        <Popover
          trigger="Parent trigger"
          dismissOnFocusLeave
          role="dialog"
          aria-label="Parent popover"
        >
          <button type="button">Parent action</button>
          <Popover
            trigger="Child trigger"
            dismissOnFocusLeave
            role="dialog"
            aria-label="Child popover"
          >
            <button type="button">Child action</button>
          </Popover>
        </Popover>,
      );
    });
    act(() => findButton("Parent trigger").click());
    act(() => findButton("Child trigger").click());

    expect(dialog("Parent popover")).not.toBeNull();
    expect(dialog("Child popover")).not.toBeNull();
    expect(document.activeElement).toBe(findButton("Child action"));

    act(() => findButton("Parent action").focus());

    expect(dialog("Parent popover")).not.toBeNull();
    expect(dialog("Child popover")).toBeNull();
    expect(document.activeElement).toBe(findButton("Parent action"));
  });

  it("lets only the nested child own a handled Tab boundary and preserves the parent's next stop", () => {
    act(() => {
      root!.render(
        <Popover
          trigger="Parent trigger"
          dismissOnFocusLeave
          role="dialog"
          aria-label="Parent popover"
        >
          <button type="button">Before child</button>
          <Popover
            trigger="Child trigger"
            dismissOnFocusLeave
            role="dialog"
            aria-label="Child popover"
          >
            <button type="button">Child action</button>
          </Popover>
          <button type="button">After child</button>
        </Popover>,
      );
    });
    act(() => findButton("Parent trigger").click());
    act(() => findButton("Child trigger").click());
    const childAction = findButton("Child action");
    expect(document.activeElement).toBe(childAction);

    act(() => {
      childAction.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
    });

    expect(dialog("Child popover")).toBeNull();
    expect(dialog("Parent popover")).not.toBeNull();
    expect(document.activeElement).toBe(findButton("After child"));
  });

  it("dismisses a nested stack deterministically for pointer interaction outside the hierarchy", () => {
    act(() => {
      root!.render(
        <>
          <Popover trigger="Parent trigger" role="dialog" aria-label="Parent popover">
            <Popover trigger="Child trigger" role="dialog" aria-label="Child popover">
              <button type="button">Child action</button>
            </Popover>
          </Popover>
          <button type="button">Outside hierarchy</button>
        </>,
      );
    });
    act(() => findButton("Parent trigger").click());
    act(() => findButton("Child trigger").click());
    const outside = findButton("Outside hierarchy");

    act(() => outside.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(dialog("Child popover")).toBeNull();
    expect(dialog("Parent popover")).not.toBeNull();

    act(() => outside.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(dialog("Parent popover")).toBeNull();
  });

  it("does not leave duplicate or stale layer registrations under StrictMode", () => {
    const onOpenChange = vi.fn();
    act(() => {
      root!.render(
        <StrictMode>
          <Popover
            trigger="Strict trigger"
            defaultOpen
            onOpenChange={onOpenChange}
            role="dialog"
            aria-label="Strict popover"
          >
            <button type="button">Strict action</button>
          </Popover>
        </StrictMode>,
      );
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(dialog("Strict popover")).toBeNull();

    act(() => root!.unmount());
    root = null;
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("sets the minimum width to the trigger width when matchTriggerWidth is set", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <Popover trigger="Wide trigger" matchTriggerWidth role="dialog" aria-label="Sized">
          <button type="button">Inside action</button>
        </Popover>,
      );
    });
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () =>
      ({ width: 180, height: 32, top: 0, left: 0, right: 180, bottom: 32, x: 0, y: 0, toJSON: () => ({}) });
    act(() => button.click());
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    const content = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(content.style.minWidth).toBe("180px");
  });
  it("opens above and end-aligned to the trigger with the top-end placement", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <Popover trigger="Corner trigger" placement="top-end" role="dialog" aria-label="Above">
          <button type="button">Inside action</button>
        </Popover>,
      );
    });
    const button = container.querySelector("button")!;
    button.getBoundingClientRect = () =>
      ({ width: 80, height: 20, top: 700, left: 900, right: 980, bottom: 720, x: 900, y: 700, toJSON: () => ({}) });
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      return this.getAttribute("role") === "dialog"
        ? ({ width: 300, height: 200, top: 0, left: 0, right: 300, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
        : original.call(this);
    };
    try {
      act(() => button.click());
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
    const content = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(parseFloat(content.style.top)).toBeLessThan(700);
    expect(parseFloat(content.style.left) + 300).toBeCloseTo(980, 0);
  });
});
