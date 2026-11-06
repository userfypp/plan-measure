/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseSelectOption, selectOptionLabels } from "../../components/ui/selectTestUtils";
import {
  chooseSearchSelectOption,
  searchSelectOptionLabels,
} from "../../components/ui/searchSelectTestUtils";
import { stubDialogMethods } from "../../test/domTestUtils";
import type {
  ClassificationValuePrice,
  ClassificationValueRates,
  MeasurementDisplayUnit,
} from "../../types/domain";
import {
  ClassificationValueRatesDialog,
  type ClassificationValueRatesDialogProps,
} from "./ClassificationValueRatesDialog";

let root: Root;
let container: HTMLDivElement;
let restoreDialogMethods = () => {};

function renderDialog(overrides: Partial<ClassificationValueRatesDialogProps> = {}) {
  const props: ClassificationValueRatesDialogProps = {
    valueId: "value-1",
    dimensionName: "Element",
    valueName: "Wall",
    rates: undefined,
    displayUnit: "m",
    currency: "EUR",
    onSave: vi.fn(() => true),
    onClose: vi.fn(),
    ...overrides,
  };
  act(() => root.render(<ClassificationValueRatesDialog {...props} />));
  return props;
}

const sourceSelect = () => selectByLabel("Derived quantity");
const heightInput = () => inputByLabel("Height") ?? inputByLabel("Thickness");
const labelOf = (input: HTMLInputElement) =>
  document.querySelector<HTMLLabelElement>(`dialog label[for="${input.id}"]`)!.textContent;
const errorTexts = () =>
  Array.from(document.querySelectorAll("dialog [role='alert']"), (alert) => alert.textContent);
const errorText = () => errorTexts()[0] ?? null;

function selectByLabel(label: string): HTMLButtonElement {
  const labelElement = Array.from(document.querySelectorAll<HTMLElement>("dialog span[id]")).find(
    (candidate) => candidate.textContent === label,
  );
  const trigger = labelElement
    ? document.querySelector<HTMLButtonElement>(
        `dialog button[aria-labelledby~="${labelElement.id}"]`,
      )
    : null;
  if (!trigger) throw new Error(`Select ${label} was not rendered.`);
  return trigger;
}

function inputByLabel(label: string): HTMLInputElement | null {
  const labelElement = Array.from(document.querySelectorAll<HTMLLabelElement>("dialog label")).find(
    (candidate) =>
      candidate.textContent === label || candidate.textContent!.startsWith(`${label} (`),
  );
  return labelElement
    ? document.querySelector<HTMLInputElement>(`dialog input[id="${labelElement.htmlFor}"]`)
    : null;
}

const priceInput = () => inputByLabel("Unit price")!;
const hasSelect = (label: string) => {
  try {
    selectByLabel(label);
    return true;
  } catch {
    return false;
  }
};

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("dialog button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button ${text} was not rendered.`);
  return button;
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function save() {
  act(() => buttonByText("Save").click());
}

function rates(
  derivation: ClassificationValueRates["derivation"],
  price: ClassificationValuePrice | null = null,
): ClassificationValueRates {
  return { valueId: "wall", derivation, price };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  restoreDialogMethods = stubDialogMethods();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  restoreDialogMethods();
});

describe("ClassificationValueRatesDialog", () => {
  it("opens empty for a value without rates, names the value and focuses the quantity select", () => {
    renderDialog();

    const title = document.querySelector("dialog h2")!;
    expect(title.firstChild!.textContent).toBe("Quantity and price");
    expect(title.querySelector("span")!.textContent).toBe("Element · Wall");
    expect(sourceSelect().textContent).toBe("None");
    expect(heightInput()).toBeNull();
    expect(priceInput().value).toBe("");
    expect(selectByLabel("Applied to").textContent).toBe("Area");
    expect(selectByLabel("Unit").textContent).toBe("m²");
    expect(document.activeElement).toBe(sourceSelect());
  });

  describe("derived quantity", () => {
    it.each([
      ["Area from length", "length", "Height"],
      ["Area from perimeter", "perimeter", "Height"],
      ["Volume from area", "area", "Thickness"],
    ] as const)("saves %s with its own field label", (option, source, label) => {
      const props = renderDialog();
      chooseSelectOption(sourceSelect(), option);

      expect(labelOf(heightInput()!)).toBe(`${label} (m)`);
      type(heightInput()!, "2.7");
      save();

      expect(props.onSave).toHaveBeenCalledTimes(1);
      expect(props.onSave).toHaveBeenCalledWith({ source, factorMm: 2700 }, null, null);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["mm", "150", "mm", 150],
      ["cm", "15", "cm", 150],
      ["m", "2.7", "m", 2700],
      ["in", "12", "in", 304.8],
      ["ft", "8", "ft", 2438.4],
      ["ft-in", "2.5", "ft", 762],
    ] as const)(
      "converts a value typed in %s to millimetres",
      (displayUnit, text, suffix, expected) => {
        const props = renderDialog({ displayUnit: displayUnit as MeasurementDisplayUnit });
        chooseSelectOption(sourceSelect(), "Area from length");

        expect(labelOf(heightInput()!)).toBe(`Height (${suffix})`);
        type(heightInput()!, text);
        save();

        expect(props.onSave).toHaveBeenCalledWith(
          { source: "length", factorMm: expected },
          null,
          null,
        );
      },
    );

    it.each([
      ["", "Enter a height."],
      ["   ", "Enter a height."],
      ["0", "Height must be a number greater than zero."],
      ["-3", "Height must be a number greater than zero."],
    ])("rejects %j without saving", (text, message) => {
      const props = renderDialog();
      chooseSelectOption(sourceSelect(), "Area from length");
      type(heightInput()!, text);
      save();

      expect(errorText()).toBe(message);
      expect(heightInput()!.getAttribute("aria-invalid")).toBe("true");
      expect(props.onSave).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();

      type(heightInput()!, "2");
      expect(errorText()).toBeNull();
    });

    it("names the thickness in its messages and ignores text a number field cannot hold", () => {
      const props = renderDialog();
      chooseSelectOption(sourceSelect(), "Volume from area");
      type(heightInput()!, "abc");
      save();

      expect(errorText()).toBe("Enter a thickness.");
      type(heightInput()!, "0");
      save();
      expect(errorText()).toBe("Thickness must be a number greater than zero.");
      expect(props.onSave).not.toHaveBeenCalled();
    });

    it("rejects a value that overflows when converted to millimetres", () => {
      const props = renderDialog({ displayUnit: "ft" });
      chooseSelectOption(sourceSelect(), "Area from length");
      type(heightInput()!, "1e308");
      save();

      expect(errorText()).toBe("Height must be a number greater than zero.");
      expect(props.onSave).not.toHaveBeenCalled();
    });

    it("preloads an existing derivation in the project's unit and focuses its field", () => {
      renderDialog({ rates: rates({ source: "area", factorMm: 150 }), displayUnit: "cm" });

      expect(sourceSelect().textContent).toBe("Volume from area");
      expect(labelOf(heightInput()!)).toBe("Thickness (cm)");
      expect(heightInput()!.value).toBe("15");
      expect(document.activeElement).toBe(heightInput());
    });

    it("keeps the stored millimetres when the text is left as shown", () => {
      // 333.3 mm shown in cm is 33.33, which converts back to 333.29999999999995 mm.
      const props = renderDialog({
        rates: rates({ source: "length", factorMm: 333.3 }),
        displayUnit: "cm",
      });
      expect(heightInput()!.value).toBe("33.33");
      save();

      expect(props.onSave).toHaveBeenCalledWith({ source: "length", factorMm: 333.3 }, null, null);
    });

    it("stores an edited value converted afresh and a changed source with the same text", () => {
      const props = renderDialog({
        rates: rates({ source: "length", factorMm: 2700 }),
        displayUnit: "m",
      });
      type(heightInput()!, "3");
      save();
      expect(props.onSave).toHaveBeenLastCalledWith(
        { source: "length", factorMm: 3000 },
        null,
        null,
      );

      chooseSelectOption(sourceSelect(), "Area from perimeter");
      save();
      expect(props.onSave).toHaveBeenLastCalledWith(
        { source: "perimeter", factorMm: 3000 },
        null,
        null,
      );
    });
  });

  describe("saving and closing", () => {
    it("saves from the form, as Enter in the field does", () => {
      const props = renderDialog();
      chooseSelectOption(sourceSelect(), "Area from length");
      type(heightInput()!, "3");
      act(() => {
        document
          .querySelector("dialog form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(props.onSave).toHaveBeenCalledWith({ source: "length", factorMm: 3000 }, null, null);
    });

    it("closes on Cancel and on Escape without saving", () => {
      const props = renderDialog();
      chooseSelectOption(sourceSelect(), "Area from length");
      type(heightInput()!, "3");
      type(priceInput(), "25");

      act(() => buttonByText("Cancel").click());
      expect(props.onClose).toHaveBeenCalledTimes(1);

      act(() => {
        document
          .querySelector("dialog")!
          .dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          );
      });
      expect(props.onClose).toHaveBeenCalledTimes(2);
      expect(props.onSave).not.toHaveBeenCalled();
    });

    it("removes the entry with None and an empty price", () => {
      const props = renderDialog({
        rates: rates(
          { source: "length", factorMm: 2700 },
          { amount: 4, basis: "area", unit: "m²" },
        ),
      });
      chooseSelectOption(sourceSelect(), "None");
      type(priceInput(), "");

      expect(heightInput()).toBeNull();
      save();

      expect(props.onSave).toHaveBeenCalledWith(null, null, null);
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("saves nothing at all when nothing was entered", () => {
      const props = renderDialog();
      save();

      expect(props.onSave).toHaveBeenCalledWith(null, null, null);
    });

    it("stays open and says so when the session rejects the rates", () => {
      const props = renderDialog({ onSave: vi.fn(() => false) });
      chooseSelectOption(sourceSelect(), "Area from length");
      type(heightInput()!, "3");
      save();

      expect(errorText()).toBe("The quantity could not be saved.");
      expect(props.onClose).not.toHaveBeenCalled();
    });
  });

  describe("unit price", () => {
    it("saves a new price per area in the project's unit, with the project's currency in the label", () => {
      const props = renderDialog();

      expect(labelOf(priceInput())).toBe("Unit price (EUR)");
      type(priceInput(), "25.5");
      save();

      expect(props.onSave).toHaveBeenCalledWith(
        null,
        { amount: 25.5, basis: "area", unit: "m²" },
        null,
      );
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("accepts a price of zero and a very large one", () => {
      const props = renderDialog();
      type(priceInput(), "0");
      save();
      expect(props.onSave).toHaveBeenLastCalledWith(
        null,
        { amount: 0, basis: "area", unit: "m²" },
        null,
      );

      type(priceInput(), "1e308");
      save();
      expect(props.onSave).toHaveBeenLastCalledWith(
        null,
        { amount: 1e308, basis: "area", unit: "m²" },
        null,
      );
    });

    it.each(["-1", "-0.01"])("rejects %j inline without saving", (text) => {
      const props = renderDialog();
      type(priceInput(), text);
      save();

      expect(errorTexts()).toEqual(["Unit price must be a number, zero or more."]);
      expect(priceInput().getAttribute("aria-invalid")).toBe("true");
      expect(props.onSave).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();

      type(priceInput(), "2");
      expect(errorText()).toBeNull();
    });

    it("treats text a number field cannot hold as no price", () => {
      const props = renderDialog();
      type(priceInput(), "abc");
      save();

      expect(errorText()).toBeNull();
      expect(props.onSave).toHaveBeenCalledWith(null, null, null);
    });

    it("reports a bad factor and a bad price together", () => {
      const props = renderDialog();
      chooseSelectOption(sourceSelect(), "Area from length");
      type(priceInput(), "-5");
      save();

      expect(errorTexts()).toEqual([
        "Enter a height.",
        "Unit price must be a number, zero or more.",
      ]);
      expect(props.onSave).not.toHaveBeenCalled();
    });

    it("preloads an existing price exactly as stored, whatever the project's unit", () => {
      const price: ClassificationValuePrice = { amount: 12.375, basis: "derived", unit: "ft²" };
      const props = renderDialog({
        rates: rates({ source: "length", factorMm: 2700 }, price),
        displayUnit: "m",
      });

      expect(priceInput().value).toBe("12.375");
      expect(selectByLabel("Applied to").textContent).toBe("Derived area");
      expect(selectByLabel("Unit").textContent).toBe("ft²");
      save();
      expect(props.onSave).toHaveBeenCalledWith({ source: "length", factorMm: 2700 }, price, null);
    });

    it("preloads a price of zero and a price per count", () => {
      const props = renderDialog({
        rates: rates(null, { amount: 0, basis: "count", unit: "each" }),
      });

      expect(priceInput().value).toBe("0");
      expect(selectByLabel("Applied to").textContent).toBe("Count");
      expect(selectByLabel("Unit").textContent).toBe("each");
      save();
      expect(props.onSave).toHaveBeenCalledWith(
        null,
        { amount: 0, basis: "count", unit: "each" },
        null,
      );
    });

    it("edits an existing price and clears it with an empty field", () => {
      const price: ClassificationValuePrice = { amount: 4, basis: "area", unit: "m²" };
      const derivation = { source: "length" as const, factorMm: 2700 };
      const props = renderDialog({ rates: rates(derivation, price) });

      type(priceInput(), "5");
      save();
      expect(props.onSave).toHaveBeenLastCalledWith(
        derivation,
        { amount: 5, basis: "area", unit: "m²" },
        null,
      );

      type(priceInput(), "");
      save();
      expect(props.onSave).toHaveBeenLastCalledWith(derivation, null, null);
    });

    it("shows the unit and per fields without a derivation as plain area by default", () => {
      renderDialog({ displayUnit: "ft-in" });

      expect(selectByLabel("Applied to").textContent).toBe("Area");
      expect(selectByLabel("Unit").textContent).toBe("ft²");
    });
  });

  describe("explanations", () => {
    const hint = (select: HTMLElement) =>
      document.getElementById(select.getAttribute("aria-describedby")!)!.textContent;

    it("describes the chosen derived quantity under its select", () => {
      renderDialog();
      expect(hint(sourceSelect())).toBe("No derived quantity: only the measured totals are used.");

      chooseSelectOption(sourceSelect(), "Area from length");
      expect(hint(sourceSelect())).toContain("lines and polylines");
      expect(hint(sourceSelect())).toContain("times a height, gives an area");

      chooseSelectOption(sourceSelect(), "Area from perimeter");
      expect(hint(sourceSelect())).toContain("perimeter of the closed shapes");
      expect(hint(sourceSelect())).toContain("Measure clouds");

      chooseSelectOption(sourceSelect(), "Volume from area");
      expect(hint(sourceSelect())).toContain("times a thickness, gives a volume");
    });

    it("describes what the price applies to, including the derived quantity", () => {
      renderDialog();
      const appliedTo = () => selectByLabel("Applied to");
      expect(hint(appliedTo())).toContain("area of the closed shapes");

      chooseSelectOption(appliedTo(), "Count");
      expect(hint(appliedTo())).toContain("count markers");
      expect(hint(appliedTo())).toContain("per item");

      chooseSelectOption(sourceSelect(), "Volume from area");
      chooseSelectOption(appliedTo(), "Derived volume");
      expect(hint(appliedTo())).toBe("The derived volume above: area times the thickness.");
    });

    it("explains every option in a tooltip while the list is open", () => {
      vi.useFakeTimers();
      try {
        renderDialog();
        act(() => sourceSelect().click());
        const options = Array.from(
          document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
        );
        const texts = options.map((option) => {
          act(() => {
            option.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          });
          act(() => vi.runAllTimers());
          const text = document.querySelector('[role="tooltip"]')?.textContent;
          act(() => {
            option.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
          });
          return text;
        });

        expect(texts).toHaveLength(4);
        expect(texts.every((text) => Boolean(text))).toBe(true);
        expect(new Set(texts).size).toBe(4);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("price basis and unit", () => {
    it("offers a derived area or volume only while a derivation is chosen", () => {
      renderDialog();
      expect(selectOptionLabels(selectByLabel("Applied to"))).toEqual([
        "Length",
        "Perimeter",
        "Area",
        "Count",
      ]);

      chooseSelectOption(sourceSelect(), "Area from length");
      expect(selectOptionLabels(selectByLabel("Applied to"))).toEqual([
        "Length",
        "Perimeter",
        "Area",
        "Count",
        "Derived area",
      ]);

      chooseSelectOption(sourceSelect(), "None");
      expect(selectOptionLabels(selectByLabel("Applied to"))).not.toContain("Derived area");
    });

    it("prices a derived quantity by default, in square or cubic units of the project", () => {
      const props = renderDialog({ displayUnit: "ft-in" });
      chooseSelectOption(sourceSelect(), "Area from perimeter");
      expect(selectByLabel("Applied to").textContent).toBe("Derived area");
      expect(selectByLabel("Unit").textContent).toBe("ft²");

      chooseSelectOption(sourceSelect(), "Volume from area");
      expect(selectByLabel("Applied to").textContent).toBe("Derived volume");
      expect(selectByLabel("Unit").textContent).toBe("ft³");

      type(heightInput()!, "0.5");
      type(priceInput(), "110");
      save();
      expect(props.onSave).toHaveBeenCalledWith(
        { source: "area", factorMm: 152.4 },
        { amount: 110, basis: "derived", unit: "ft³" },
        null,
      );
    });

    it.each([
      ["Length", ["mm", "cm", "m", "in", "ft"], "m"],
      ["Perimeter", ["mm", "cm", "m", "in", "ft"], "m"],
      ["Area", ["mm²", "cm²", "m²", "in²", "ft²", "ac"], "m²"],
    ])("lists the units of a price per %s", (basis, units, selected) => {
      renderDialog();
      chooseSelectOption(selectByLabel("Applied to"), basis);

      expect(selectOptionLabels(selectByLabel("Unit"))).toEqual(units);
      expect(selectByLabel("Unit").textContent).toBe(selected);
    });

    it.each([
      ["Area from length", ["mm²", "cm²", "m²", "in²", "ft²"]],
      ["Area from perimeter", ["mm²", "cm²", "m²", "in²", "ft²"]],
      ["Volume from area", ["mm³", "cm³", "m³", "in³", "ft³"]],
    ])("lists only the units that fit %s for a derived price", (option, units) => {
      renderDialog();
      chooseSelectOption(sourceSelect(), option);

      expect(selectByLabel("Applied to").textContent).toBe(
        option === "Volume from area" ? "Derived volume" : "Derived area",
      );
      expect(selectOptionLabels(selectByLabel("Unit"))).toEqual(units);
    });

    it("has a single, disabled unit for a price per count", () => {
      const props = renderDialog();
      type(priceInput(), "12.5");
      chooseSelectOption(selectByLabel("Applied to"), "Count");

      expect(selectByLabel("Unit").textContent).toBe("each");
      expect(selectByLabel("Unit").hasAttribute("disabled")).toBe(true);
      expect(selectByLabel("Applied to").hasAttribute("disabled")).toBe(false);
      save();
      expect(props.onSave).toHaveBeenCalledWith(
        null,
        { amount: 12.5, basis: "count", unit: "each" },
        null,
      );
    });

    it("saves the chosen unit, not the default", () => {
      const props = renderDialog();
      type(priceInput(), "3");
      chooseSelectOption(selectByLabel("Unit"), "ft²");
      save();

      expect(props.onSave).toHaveBeenCalledWith(
        null,
        { amount: 3, basis: "area", unit: "ft²" },
        null,
      );
    });

    it("keeps the chosen linear unit when the basis changes and falls back when it cannot", () => {
      renderDialog();
      chooseSelectOption(selectByLabel("Unit"), "ft²");

      chooseSelectOption(selectByLabel("Applied to"), "Length");
      expect(selectByLabel("Unit").textContent).toBe("ft");
      chooseSelectOption(selectByLabel("Applied to"), "Count");
      expect(selectByLabel("Unit").textContent).toBe("each");
      chooseSelectOption(selectByLabel("Applied to"), "Perimeter");
      expect(selectByLabel("Unit").textContent).toBe("ft");
      chooseSelectOption(selectByLabel("Applied to"), "Area");
      expect(selectByLabel("Unit").textContent).toBe("ft²");

      chooseSelectOption(selectByLabel("Unit"), "ac");
      chooseSelectOption(selectByLabel("Applied to"), "Length");
      expect(selectByLabel("Unit").textContent).toBe("m");
    });

    it("keeps the chosen linear unit when the derivation changes", () => {
      renderDialog();
      chooseSelectOption(sourceSelect(), "Area from length");
      chooseSelectOption(selectByLabel("Unit"), "cm²");

      chooseSelectOption(sourceSelect(), "Volume from area");
      expect(selectByLabel("Applied to").textContent).toBe("Derived volume");
      expect(selectByLabel("Unit").textContent).toBe("cm³");

      chooseSelectOption(sourceSelect(), "Area from perimeter");
      expect(selectByLabel("Unit").textContent).toBe("cm²");
    });

    it("asks for a new basis when the derivation a price depended on is removed", () => {
      const derived: ClassificationValuePrice = { amount: 25, basis: "derived", unit: "ft²" };
      const props = renderDialog({
        rates: rates({ source: "length", factorMm: 2700 }, derived),
      });

      chooseSelectOption(sourceSelect(), "None");
      expect(selectByLabel("Applied to").textContent).toBe("Choose one");
      save();
      expect(errorTexts()).toEqual(["Choose what the price applies to."]);
      expect(props.onSave).not.toHaveBeenCalled();

      chooseSelectOption(selectByLabel("Applied to"), "Area");
      expect(errorTexts()).toEqual([]);
      expect(selectByLabel("Unit").textContent).toBe("ft²");
      save();

      expect(props.onSave).toHaveBeenCalledWith(
        null,
        { amount: 25, basis: "area", unit: "ft²" },
        null,
      );
    });

    it("restores the derived basis when a derivation comes back, and needs none without a price", () => {
      const derived: ClassificationValuePrice = { amount: 25, basis: "derived", unit: "ft²" };
      const props = renderDialog({
        rates: rates({ source: "length", factorMm: 2700 }, derived),
      });

      chooseSelectOption(sourceSelect(), "None");
      chooseSelectOption(sourceSelect(), "Area from perimeter");
      expect(selectByLabel("Applied to").textContent).toBe("Derived area");

      chooseSelectOption(sourceSelect(), "None");
      type(priceInput(), "");
      expect(selectByLabel("Applied to").textContent).not.toBe("Choose one");
      save();
      expect(props.onSave).toHaveBeenCalledWith(null, null, null);
    });

    it("keeps a price that does not depend on the derivation when the derivation changes", () => {
      const price: ClassificationValuePrice = { amount: 4, basis: "perimeter", unit: "cm" };
      const props = renderDialog({ rates: rates({ source: "length", factorMm: 2700 }, price) });
      chooseSelectOption(sourceSelect(), "Volume from area");
      type(heightInput()!, "150");
      save();

      expect(props.onSave).toHaveBeenCalledWith({ source: "area", factorMm: 150000 }, price, null);
    });
  });

  describe("currency", () => {
    it("asks for a currency once a price is typed in a project without one", () => {
      renderDialog({ currency: null });
      expect(hasSelect("Currency")).toBe(false);
      expect(labelOf(priceInput())).toBe("Unit price");

      type(priceInput(), "5");
      expect(hasSelect("Currency")).toBe(true);
      expect(selectByLabel("Currency").textContent).toBe("Choose a currency");

      type(priceInput(), "");
      expect(hasSelect("Currency")).toBe(false);
    });

    it("keeps the price field mounted while the currency appears", () => {
      renderDialog({ currency: null });
      const input = priceInput();
      type(input, "5");
      expect(priceInput()).toBe(input);

      chooseSearchSelectOption(selectByLabel("Currency"), "Euro (EUR)");
      expect(priceInput()).toBe(input);
    });

    it("lists the registry without None and shows the chosen code in the price label", () => {
      renderDialog({ currency: null });
      type(priceInput(), "5");

      const labels = searchSelectOptionLabels(selectByLabel("Currency"));
      expect(labels).not.toContain("None");
      expect(labels).not.toContain("Choose a currency");
      expect(labels).toContain("Euro (EUR)");
      expect(labels).toContain("US Dollar (USD)");

      chooseSearchSelectOption(selectByLabel("Currency"), "US Dollar (USD)");
      expect(labelOf(priceInput())).toBe("Unit price (USD)");
    });

    it("refuses to save a price until a currency is chosen", () => {
      const props = renderDialog({ currency: null });
      type(priceInput(), "5");
      save();

      expect(errorTexts()).toEqual(["Choose a currency for the price."]);
      expect(props.onSave).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();

      chooseSearchSelectOption(selectByLabel("Currency"), "Euro (EUR)");
      expect(errorText()).toBeNull();
    });

    it("hands the chosen currency to onSave together with the price", () => {
      const props = renderDialog({ currency: null });
      type(priceInput(), "5");
      chooseSearchSelectOption(selectByLabel("Currency"), "Euro (EUR)");
      save();

      expect(props.onSave).toHaveBeenCalledTimes(1);
      expect(props.onSave).toHaveBeenCalledWith(
        null,
        { amount: 5, basis: "area", unit: "m²" },
        "EUR",
      );
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("needs no currency to save a derivation alone or to clear a price", () => {
      const props = renderDialog({ currency: null });
      chooseSelectOption(sourceSelect(), "Area from length");
      type(heightInput()!, "2.7");
      save();

      expect(props.onSave).toHaveBeenCalledWith({ source: "length", factorMm: 2700 }, null, null);
    });

    it("does not offer a currency when the project has one, and never passes one on", () => {
      const props = renderDialog({ currency: "GBP" });
      type(priceInput(), "5");

      expect(hasSelect("Currency")).toBe(false);
      expect(labelOf(priceInput())).toBe("Unit price (GBP)");
      save();
      expect(props.onSave).toHaveBeenCalledWith(
        null,
        { amount: 5, basis: "area", unit: "m²" },
        null,
      );
    });

    it("drops a currency chosen for a price that was then cleared", () => {
      const props = renderDialog({ currency: null });
      type(priceInput(), "5");
      chooseSearchSelectOption(selectByLabel("Currency"), "Euro (EUR)");
      type(priceInput(), "");
      chooseSelectOption(sourceSelect(), "Area from length");
      type(heightInput()!, "3");
      save();

      expect(props.onSave).toHaveBeenCalledWith({ source: "length", factorMm: 3000 }, null, null);
    });
  });

  describe("Save and next", () => {
    const WALL_RATES = rates({ source: "length", factorMm: 2700 });
    const SLAB_RATES: ClassificationValueRates = {
      valueId: "slab",
      derivation: { source: "area", factorMm: 200 },
      price: null,
    };
    const entries = [
      { valueId: "wall", dimensionName: "Element", valueName: "Wall", rates: WALL_RATES },
      { valueId: "slab", dimensionName: "Structure", valueName: "Slab", rates: SLAB_RATES },
      { valueId: "roof", dimensionName: "Structure", valueName: "Roof", rates: undefined },
    ];

    // Stands in for the manager: it passes the following value on every advance.
    function Harness({
      onSave,
      onClose,
    }: Pick<ClassificationValueRatesDialogProps, "onSave" | "onClose">) {
      const [index, setIndex] = useState(0);
      const entry = entries[index]!;
      const following = entries[index + 1];
      return (
        <ClassificationValueRatesDialog
          valueId={entry.valueId}
          dimensionName={entry.dimensionName}
          valueName={entry.valueName}
          rates={entry.rates}
          displayUnit="m"
          currency="EUR"
          onSave={onSave}
          onClose={onClose}
          next={following && { label: `${following.dimensionName} · ${following.valueName}` }}
          onNext={following && (() => setIndex(index + 1))}
        />
      );
    }

    function renderHarness() {
      const onSave = vi.fn(() => true);
      const onClose = vi.fn();
      act(() => root.render(<Harness onSave={onSave} onClose={onClose} />));
      return { onSave, onClose };
    }

    it("saves, loads the next value's rates in the same dialog and focuses the first select", () => {
      const { onSave, onClose } = renderHarness();
      const dialog = document.querySelector("dialog");
      type(heightInput()!, "3");

      act(() => buttonByText("Save and next").click());

      expect(onSave).toHaveBeenCalledWith({ source: "length", factorMm: 3000 }, null, null);
      expect(onClose).not.toHaveBeenCalled();
      expect(document.querySelector("dialog")).toBe(dialog);
      expect(document.querySelector("dialog h2")!.textContent).toContain("Structure · Slab");
      expect(sourceSelect().textContent).toContain("Volume from area");
      expect(heightInput()!.value).toBe("0.2");
      expect(document.activeElement).toBe(sourceSelect());
      expect(document.querySelector("dialog [role='status']")!.textContent).toBe(
        "Structure · Slab",
      );
    });

    it("names the destination in the button's tooltip", () => {
      renderHarness();

      const button = buttonByText("Save and next");
      expect(button.getAttribute("aria-disabled")).toBeNull();
      vi.useFakeTimers();
      try {
        act(() => {
          button.focus();
          vi.advanceTimersByTime(2000);
        });
        expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
          "Opens Structure · Slab",
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("crosses into the next dimension and keeps saving with plain Save", () => {
      const { onSave, onClose } = renderHarness();
      act(() => buttonByText("Save and next").click());
      act(() => buttonByText("Save and next").click());

      expect(document.querySelector("dialog h2")!.textContent).toContain("Structure · Roof");
      expect(sourceSelect().textContent).toContain("None");
      save();
      expect(onSave).toHaveBeenCalledTimes(3);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not advance when the value is invalid", () => {
      const { onSave } = renderHarness();
      type(heightInput()!, "");

      act(() => buttonByText("Save and next").click());

      expect(onSave).not.toHaveBeenCalled();
      expect(errorText()).toBe("Enter a height.");
      expect(document.querySelector("dialog h2")!.textContent).toContain("Element · Wall");
    });

    it("closes after an invalid Save and next is corrected and saved with Save", () => {
      const { onSave, onClose } = renderHarness();
      type(heightInput()!, "");
      act(() => buttonByText("Save and next").click());
      type(heightInput()!, "3");

      save();

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(document.querySelector("dialog h2")!.textContent).toContain("Element · Wall");
    });

    it("stays on the value when the session rejects the rates", () => {
      const onSave = vi.fn(() => false);
      act(() => root.render(<Harness onSave={onSave} onClose={vi.fn()} />));

      act(() => buttonByText("Save and next").click());

      expect(errorText()).toBe("The quantity could not be saved.");
      expect(document.querySelector("dialog h2")!.textContent).toContain("Element · Wall");
    });

    it("is disabled with a reason on the last value and Save closes", () => {
      const { onClose } = renderHarness();
      act(() => buttonByText("Save and next").click());
      act(() => buttonByText("Save and next").click());

      const button = buttonByText("Save and next");
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toBe(
        "No more values",
      );
      act(() => button.click());
      expect(document.querySelector("dialog h2")!.textContent).toContain("Structure · Roof");
      expect(onClose).not.toHaveBeenCalled();
      save();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("is disabled when the dialog has no next value", () => {
      renderDialog();

      expect(buttonByText("Save and next").getAttribute("aria-disabled")).toBe("true");
    });

    it("cancels without saving", () => {
      const { onSave, onClose } = renderHarness();
      act(() => buttonByText("Save and next").click());

      act(() => buttonByText("Cancel").click());

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
