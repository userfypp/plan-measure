/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

type Unit = "m" | "cm" | "mm";

const options = [
  { value: "m" as const, label: "Metres" },
  { value: "cm" as const, label: "Centimetres" },
  { value: "mm" as const, label: "Millimetres" },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const onChange = vi.fn();

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<Unit>("m");
  return (
    <div>
      <span id="unit-label">Unit</span>
      <Select
        id="unit"
        label="Unit"
        labelledBy="unit-label"
        value={value}
        options={options}
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    </div>
  );
}

function render(disabled = false) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<Harness disabled={disabled} />));
}

function trigger(): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>("#unit")!;
}

function key(target: Element, name: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
}

beforeEach(() => {
  onChange.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
  root = null;
  container = null;
});

describe("Select", () => {
  it("announces label and current value through aria-labelledby", () => {
    render();
    expect(trigger().getAttribute("aria-labelledby")).toBe("unit-label unit");
    expect(trigger().textContent).toBe("Metres");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens with a click and with Enter", () => {
    render();
    act(() => trigger().click());
    expect(document.body.querySelector('[role="menu"]')?.getAttribute("aria-label")).toBe("Unit");
    expect(menuItems()).toHaveLength(3);
    expect(menuItems()[0]!.getAttribute("aria-checked")).toBe("true");
    key(document.activeElement!, "Escape");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    // A native button turns Enter into a click; emulate that activation.
    trigger().focus();
    act(() => trigger().click());
    expect(menuItems()).toHaveLength(3);
  });

  it("moves with arrows, selects, calls onChange and closes", () => {
    render();
    act(() => trigger().click());
    expect(document.activeElement).toBe(menuItems()[0]);
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(menuItems()[1]);
    key(document.activeElement!, "Enter");
    expect(onChange).toHaveBeenCalledWith("cm");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(trigger().textContent).toBe("Centimetres");
  });

  it("closes with Escape and returns focus to the trigger", () => {
    render();
    act(() => trigger().click());
    key(document.activeElement!, "Escape");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not open when disabled", () => {
    render(true);
    expect(trigger().disabled).toBe(true);
    act(() => trigger().click());
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
