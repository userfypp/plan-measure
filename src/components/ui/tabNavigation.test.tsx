/* @vitest-environment jsdom */

import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dialog } from "./Dialog";
import { Popover } from "./Popover";
import { useRovingFocusGroup } from "./rovingFocus";
import { useManagedTabNavigation } from "./tabNavigation";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let showDescriptor: PropertyDescriptor | undefined;
let closeDescriptor: PropertyDescriptor | undefined;

function FocusHarness({ showTrap = false }: { showTrap?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarFocus = useRovingFocusGroup(toolbarRef, { orientation: "horizontal" });
  const [menuOpen, setMenuOpen] = useState(false);
  useManagedTabNavigation(rootRef);

  return (
    <div ref={rootRef} data-tab-navigation-root>
      <button type="button">Before</button>
      <div
        ref={toolbarRef}
        {...toolbarFocus}
        role="toolbar"
        aria-label="Drawing actions"
        aria-orientation="horizontal"
      >
        <button type="button">Tool one</button>
        <button type="button">Tool two</button>
      </div>
      <input aria-label="Search measurements" />
      <button type="button" aria-disabled="true">
        Unavailable action
      </button>
      <button type="button" disabled>
        Disabled action
      </button>
      <div hidden>
        <button type="button">Hidden action</button>
      </div>
      <Popover
        trigger="Open options"
        open={menuOpen}
        onOpenChange={setMenuOpen}
        dismissOnFocusLeave
        role="dialog"
        aria-label="Options"
      >
        <input aria-label="Option name" />
        <Popover
          trigger="Open nested options"
          dismissOnFocusLeave
          role="dialog"
          aria-label="Nested options"
        >
          <button type="button">Nested action</button>
        </Popover>
        <button type="button">Save option</button>
      </Popover>
      <button type="button">After</button>
      {showTrap && (
        <Dialog open title="Focus trap" modal={false} trapFocus onClose={() => undefined}>
          <button type="button">Trap first</button>
          <button type="button">Trap last</button>
        </Dialog>
      )}
    </div>
  );
}

function renderHarness(showTrap = false) {
  act(() => root!.render(<FocusHarness showTrap={showTrap} />));
}

function button(label: string): HTMLButtonElement {
  const result = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!result) throw new Error(`Button ${label} was not rendered.`);
  return result;
}

function pressTab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  act(() => document.activeElement?.dispatchEvent(event));
  return event;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  showDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "show");
  closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "show", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  renderHarness();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  if (showDescriptor) {
    Object.defineProperty(HTMLDialogElement.prototype, "show", showDescriptor);
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "show");
  }
  if (closeDescriptor) {
    Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  }
  showDescriptor = undefined;
  closeDescriptor = undefined;
});

describe("managed application Tab navigation", () => {
  it("starts forward navigation at the first app stop when Safari leaves focus on body", () => {
    expect(document.activeElement).toBe(document.body);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button("Before"));
  });

  it("moves through controls in document order and treats each toolbar as one stop", () => {
    const before = button("Before");
    const toolOne = button("Tool one");
    const toolTwo = button("Tool two");
    const search = document.querySelector<HTMLInputElement>('[aria-label="Search measurements"]')!;
    const unavailable = button("Unavailable action");

    expect(toolOne.tabIndex).toBe(0);
    expect(toolTwo.tabIndex).toBe(-1);

    act(() => before.focus());
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(toolOne);

    const arrow = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    act(() => toolOne.dispatchEvent(arrow));
    expect(arrow.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(toolTwo);
    expect(toolOne.tabIndex).toBe(-1);
    expect(toolTwo.tabIndex).toBe(0);

    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(search);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(unavailable);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button("Open options"));
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button("After"));
  });

  it("moves backward across toolbar groups and leaves the app boundary unwrapped", () => {
    const before = button("Before");
    const toolOne = button("Tool one");
    const after = button("After");

    act(() => toolOne.focus());
    expect(pressTab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(before);
    expect(pressTab(true).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(before);

    act(() => after.focus());
    expect(pressTab().defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(after);
  });

  it("keeps native radio groups to one Tab stop and targets the checked option", () => {
    const search = document.querySelector<HTMLInputElement>(
      '[aria-label="Search measurements"]',
    )!;
    const radioGroup = document.createElement("div");
    const firstRadio = document.createElement("input");
    firstRadio.type = "radio";
    firstRadio.name = "measurement-choice";
    const checkedRadio = document.createElement("input");
    checkedRadio.type = "radio";
    checkedRadio.name = "measurement-choice";
    checkedRadio.checked = true;
    radioGroup.append(firstRadio, checkedRadio);
    search.after(radioGroup);

    act(() => search.focus());
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(checkedRadio);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button("Unavailable action"));

    act(() => checkedRadio.focus());
    expect(pressTab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(search);
  });

  it("places portaled controls immediately after their trigger and dismisses on exit", () => {
    const trigger = button("Open options");
    const after = button("After");
    act(() => trigger.click());

    const optionName = document.querySelector<HTMLInputElement>('[aria-label="Option name"]')!;
    const nestedTrigger = button("Open nested options");
    const save = button("Save option");
    expect(document.activeElement).toBe(optionName);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(nestedTrigger);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(save);
    expect(document.querySelector('[role="dialog"][aria-label="Options"]')).not.toBeNull();

    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(after);
    expect(document.querySelector('[role="dialog"][aria-label="Options"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("routes Tab through nested portaled popovers in logical order", () => {
    const parentTrigger = button("Open options");
    act(() => parentTrigger.click());
    const nestedTrigger = button("Open nested options");
    act(() => nestedTrigger.click());

    const nestedAction = button("Nested action");
    expect(document.activeElement).toBe(nestedAction);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button("Save option"));
    expect(document.querySelector('[aria-label="Nested options"]')).toBeNull();
    expect(document.querySelector('[aria-label="Options"]')).not.toBeNull();
  });

  it("keeps focus inside the real Dialog trap without double-wrapping its own handler", () => {
    renderHarness(true);
    const first = button("Trap first");
    const last = button("Trap last");

    expect(document.activeElement).toBe(first);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(pressTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(pressTab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(pressTab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});
