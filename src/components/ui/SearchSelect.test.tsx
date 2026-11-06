/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";

const options: SearchSelectOption<string>[] = [
  { value: "", label: "None" },
  { value: "EUR", label: "Euro (EUR)", shortLabel: "EUR" },
  { value: "GBP", label: "Pound Sterling (GBP)", shortLabel: "GBP" },
  { value: "JPY", label: "Japanese Yen (JPY)", shortLabel: "JPY" },
  { value: "SEK", label: "Swedish Krona (SEK)", shortLabel: "SEK" },
  { value: "COP", label: "Colombian Peso (COP)", shortLabel: "COP" },
  { value: "CUP", label: "Cuban Peso (CUP)", shortLabel: "CUP" },
  { value: "CUC", label: "Peso Convertible (CUC)", shortLabel: "CUC" },
  { value: "STD", label: "São Tomé Dobra (STD)", shortLabel: "STD" },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const onChange = vi.fn();

interface HarnessProps {
  initial?: string;
  disabled?: boolean;
  choices?: SearchSelectOption<string>[];
}

function Harness({ initial = "EUR", disabled = false, choices = options }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <span id="currency-label">Currency</span>
      <button type="button" id="before">
        Before
      </button>
      <SearchSelect
        id="currency"
        label="Currency"
        labelledBy="currency-label"
        value={value}
        options={choices}
        placeholder="Choose a currency"
        searchLabel="Search currencies"
        emptyLabel="No currency matches"
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
      <button type="button" id="after">
        After
      </button>
    </div>
  );
}

function render(props: HarnessProps = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<Harness {...props} />));
}

const trigger = () => container!.querySelector<HTMLButtonElement>("#currency")!;
const search = () => document.body.querySelector<HTMLInputElement>('input[type="search"]');
const optionElements = () =>
  Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'));
const labels = () => optionElements().map((option) => option.textContent);
const activeOption = () =>
  optionElements().find((option) => option.hasAttribute("data-active")) ?? null;

function open() {
  act(() => trigger().click());
}

function type(text: string) {
  const input = search()!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function key(name: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    document.activeElement!.dispatchEvent(event);
  });
  return event;
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

describe("SearchSelect", () => {
  describe("trigger", () => {
    it("shows the short label of the chosen option and is named by its label", () => {
      render();
      expect(trigger().textContent).toBe("EUR");
      expect(trigger().getAttribute("aria-labelledby")).toBe("currency-label currency");
      expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
      expect(trigger().getAttribute("aria-expanded")).toBe("false");
      expect(trigger().hasAttribute("data-select-trigger")).toBe(true);
    });

    it("falls back to the label without a short one, and to the placeholder without a match", () => {
      render({ initial: "" });
      expect(trigger().textContent).toBe("None");
      act(() => root!.unmount());
      container!.remove();
      render({ initial: "missing" });
      expect(trigger().textContent).toBe("Choose a currency");
    });

    it("does not open when disabled", () => {
      render({ disabled: true });
      expect(trigger().disabled).toBe(true);
      open();
      expect(search()).toBeNull();
    });
  });

  describe("opening", () => {
    it("lists every option in order, focuses the search field and marks the chosen one", () => {
      render();
      open();
      expect(labels()).toEqual(options.map((option) => option.label));
      expect(document.activeElement).toBe(search());
      expect(trigger().getAttribute("aria-expanded")).toBe("true");
      expect(
        optionElements()
          .filter((option) => option.getAttribute("aria-selected") === "true")
          .map((option) => option.textContent),
      ).toEqual(["Euro (EUR)"]);
      expect(activeOption()?.textContent).toBe("Euro (EUR)");
    });

    it("gives the search field the app's search style and the combobox semantics", () => {
      render();
      open();
      const input = search()!;
      expect(input.getAttribute("role")).toBe("combobox");
      expect(input.getAttribute("aria-label")).toBe("Search currencies");
      expect(input.placeholder).toBe("Search currencies");
      expect(input.getAttribute("aria-autocomplete")).toBe("list");
      const list = document.body.querySelector('[role="listbox"]')!;
      expect(input.getAttribute("aria-controls")).toBe(list.id);
      expect(input.getAttribute("aria-activedescendant")).toBe(activeOption()!.id);
      // The shared Input draws the glyph; a clear button only exists while there is text.
      expect(input.closest("div")?.querySelector("svg")).not.toBeNull();
      expect(document.body.querySelector('button[aria-label="Clear search"]')).toBeNull();
    });

    it("scrolls the chosen option into view", () => {
      render({ initial: "SEK" });
      open();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
      expect(activeOption()?.textContent).toBe("Swedish Krona (SEK)");
    });

    it("starts every opening with an empty search", () => {
      render();
      open();
      type("yen");
      key("Escape");
      open();
      expect(search()!.value).toBe("");
      expect(labels()).toHaveLength(options.length);
    });
  });

  describe("search", () => {
    it("matches the name or the code, ignoring case and accents", () => {
      render();
      open();
      type("yen");
      expect(labels()).toEqual(["Japanese Yen (JPY)"]);
      type("SAO TOME");
      expect(labels()).toEqual(["São Tomé Dobra (STD)"]);
      type("sao tomé");
      expect(labels()).toEqual(["São Tomé Dobra (STD)"]);
      type("gbp");
      expect(labels()).toEqual(["Pound Sterling (GBP)"]);
    });

    it("needs every word and ignores extra spaces", () => {
      render();
      open();
      type("  peso   cub ");
      expect(labels()).toEqual(["Cuban Peso (CUP)"]);
      type("peso zzz");
      expect(labels()).toEqual([]);
    });

    it("matches the name and the code, in the order of the list", () => {
      render();
      open();
      type("cu");
      // Cuban and Convertible (CUC) match; Colombian does not.
      expect(labels()).toEqual(["Cuban Peso (CUP)", "Peso Convertible (CUC)"]);
      type("cup");
      expect(labels()).toEqual(["Cuban Peso (CUP)"]);
      type("peso");
      expect(labels()).toEqual([
        "Colombian Peso (COP)",
        "Cuban Peso (CUP)",
        "Peso Convertible (CUC)",
      ]);
    });

    it("ranks an exact short label, then a leading one, then the rest in list order", () => {
      render({
        choices: [
          { value: "a", label: "Alpha Peso (AAA)", shortLabel: "AAA" },
          { value: "e", label: "Epsilon Peso (EEE)", shortLabel: "EEE" },
          { value: "c", label: "Gamma Peso (PESOS)", shortLabel: "PESOS" },
          { value: "b", label: "Beta Peso (PESO)", shortLabel: "PESO" },
          { value: "n", label: "Peso without code" },
        ],
      });
      open();
      type("peso");
      expect(labels()).toEqual([
        "Beta Peso (PESO)",
        "Gamma Peso (PESOS)",
        "Alpha Peso (AAA)",
        "Epsilon Peso (EEE)",
        "Peso without code",
      ]);
    });

    it("shows a no-results message, no options and no active descendant", () => {
      render();
      open();
      type("zzz");
      expect(optionElements()).toHaveLength(0);
      expect(document.body.querySelector('[role="status"]')?.textContent).toBe(
        "No currency matches",
      );
      expect(search()!.hasAttribute("aria-activedescendant")).toBe(false);
      key("Enter");
      key("ArrowDown");
      expect(onChange).not.toHaveBeenCalled();
      expect(search()).not.toBeNull();
    });

    it("announces how many options match", () => {
      render();
      open();
      type("peso");
      expect(document.body.querySelector('[role="status"]')?.textContent).toBe("3 found");
    });

    it("clears with the single clear button and keeps the focus in the field", () => {
      render();
      open();
      type("yen");
      const clear = document.body.querySelectorAll('button[aria-label="Clear search"]');
      expect(clear).toHaveLength(1);
      act(() => (clear[0] as HTMLButtonElement).click());
      expect(search()!.value).toBe("");
      expect(labels()).toHaveLength(options.length);
      expect(document.activeElement).toBe(search());
      expect(document.body.querySelector('button[aria-label="Clear search"]')).toBeNull();
    });
  });

  describe("keyboard", () => {
    it("moves the highlight with the arrows, wrapping, while the focus stays in the field", () => {
      render({ initial: "" });
      open();
      expect(activeOption()?.textContent).toBe("None");
      key("ArrowDown");
      expect(activeOption()?.textContent).toBe("Euro (EUR)");
      expect(document.activeElement).toBe(search());
      expect(search()!.getAttribute("aria-activedescendant")).toBe(activeOption()!.id);
      key("ArrowUp");
      key("ArrowUp");
      expect(activeOption()?.textContent).toBe("São Tomé Dobra (STD)");
      key("ArrowDown");
      expect(activeOption()?.textContent).toBe("None");
    });

    it("prevents the arrows from moving the caret", () => {
      render();
      open();
      expect(key("ArrowDown").defaultPrevented).toBe(true);
      expect(key("ArrowUp").defaultPrevented).toBe(true);
    });

    it("highlights the first match as the search changes, and Enter picks it", () => {
      render();
      open();
      type("peso");
      expect(activeOption()?.textContent).toBe("Colombian Peso (COP)");
      key("ArrowDown");
      expect(activeOption()?.textContent).toBe("Cuban Peso (CUP)");
      key("Enter");
      expect(onChange).toHaveBeenCalledExactlyOnceWith("CUP");
      expect(search()).toBeNull();
      expect(trigger().textContent).toBe("CUP");
      expect(document.activeElement).toBe(trigger());
    });

    it("keeps the highlight on an option that stays listed while typing", () => {
      render();
      open();
      key("ArrowDown");
      key("ArrowDown");
      expect(activeOption()?.textContent).toBe("Japanese Yen (JPY)");
      type("j");
      expect(activeOption()?.textContent).toBe("Japanese Yen (JPY)");
    });

    it("ignores Enter while an input method is composing", () => {
      render();
      open();
      key("Enter", { isComposing: true });
      expect(onChange).not.toHaveBeenCalled();
      expect(search()).not.toBeNull();
    });

    it("closes with Escape, returns the focus to the trigger and changes nothing", () => {
      render();
      open();
      key("Escape");
      expect(search()).toBeNull();
      expect(document.activeElement).toBe(trigger());
      expect(onChange).not.toHaveBeenCalled();
    });

    it("closes when the focus leaves without stealing it", () => {
      render();
      open();
      act(() => document.querySelector<HTMLButtonElement>("#after")!.focus());
      expect(search()).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("pointer", () => {
    it("picks an option with a click and closes", () => {
      render();
      open();
      act(() => optionElements()[3]!.click());
      expect(onChange).toHaveBeenCalledExactlyOnceWith("JPY");
      expect(search()).toBeNull();
      expect(trigger().textContent).toBe("JPY");
    });

    it("keeps the focus in the field while the pointer is pressed on an option", () => {
      render();
      open();
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      act(() => {
        optionElements()[2]!.dispatchEvent(down);
      });
      expect(down.defaultPrevented).toBe(true);
    });

    it("moves the highlight with the pointer", () => {
      render();
      open();
      act(() => {
        optionElements()[4]!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
      });
      expect(activeOption()?.textContent).toBe("Swedish Krona (SEK)");
    });

    it("closes on a click outside without changing anything", () => {
      render();
      open();
      act(() => {
        document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      });
      expect(search()).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("toggles closed when the trigger is clicked again", () => {
      render();
      open();
      open();
      expect(search()).toBeNull();
    });
  });

  it("names the list and the popup after the control", () => {
    render();
    open();
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
      "Currency",
    );
    expect(document.body.querySelector('[role="listbox"]')?.getAttribute("aria-label")).toBe(
      "Currency",
    );
  });
});
