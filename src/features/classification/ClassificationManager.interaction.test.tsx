/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseSearchSelectOption } from "../../components/ui/searchSelectTestUtils";
import { chooseSelectOption } from "../../components/ui/selectTestUtils";
import { stubDialogMethods } from "../../test/domTestUtils";
import type { ClassificationCatalog, ClassificationValueRates } from "../../types/domain";
import { ClassificationManager, type ClassificationManagerProps } from "./ClassificationManager";
import { ClassificationWorkspace } from "./ClassificationWorkspace";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const catalog: ClassificationCatalog = {
  dimensions: [
    {
      id: "trade",
      name: "Trade",
      archived: false,
      values: [{ id: "electrical", name: "Electrical", archived: false }],
    },
  ],
};

function createProps(
  overrides: Partial<ClassificationManagerProps> = {},
): ClassificationManagerProps {
  return {
    catalog,
    onCreateDimension: vi.fn(),
    onRenameDimension: vi.fn(),
    onDeleteDimension: vi.fn(),
    onArchiveDimension: vi.fn(),
    onRestoreDimension: vi.fn(),
    onCreateValue: vi.fn(),
    onRenameValue: vi.fn(),
    onDeleteValue: vi.fn(),
    onArchiveValue: vi.fn(),
    onRestoreValue: vi.fn(),
    ...overrides,
  };
}

/** Renders the catalog as it opens: every dimension closed. */
function renderClosed(props: ClassificationManagerProps) {
  act(() => root!.render(<ClassificationManager {...props} />));
}

function dimensionToggles(): HTMLButtonElement[] {
  return Array.from(container!.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")).filter(
    (button) => button.querySelector("span[title]"),
  );
}

/** Renders the catalog and opens every dimension, so tests reach the values and forms in the bodies. */
function renderManager(props: ClassificationManagerProps) {
  renderClosed(props);
  for (const toggle of dimensionToggles()) {
    if (toggle.getAttribute("aria-expanded") === "false") act(() => toggle.click());
  }
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button ${label} was not rendered.`);
  return button;
}

function inputByLabel(label: string): HTMLInputElement {
  const named = container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (named) return named;
  const labelElement = Array.from(
    container?.querySelectorAll<HTMLLabelElement>("label") ?? [],
  ).find((candidate) => candidate.textContent === label);
  if (!labelElement) throw new Error(`Label ${label} was not rendered.`);
  const input = document.getElementById(labelElement.htmlFor);
  if (!(input instanceof HTMLInputElement)) throw new Error(`Input ${label} was not rendered.`);
  return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Native input value setter is unavailable.");
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function buttonIn(element: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
  if (!button) throw new Error(`Button ${label} was not rendered.`);
  return button;
}

function openRatesDialog(valueName: string) {
  act(() => buttonByLabel(`Quantity and price for value ${valueName}`).click());
}

function selectMenuItem(triggerLabel: string, itemLabel: string) {
  act(() => buttonByLabel(triggerLabel).click());
  const menuItem = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.trim() === itemLabel,
  );
  if (!menuItem) throw new Error(`Menu item ${itemLabel} was not rendered.`);
  act(() => menuItem.click());
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ClassificationManager interactions", () => {
  it("preserves rename autofocus, Escape cancellation, and Save semantics", () => {
    const props = createProps();
    renderManager(props);

    selectMenuItem("Actions for dimension Trade", "Rename");
    const firstRenameForm = container?.querySelector<HTMLFormElement>(
      'form[aria-label="Rename classification"]',
    );
    if (!firstRenameForm) throw new Error("Rename form was not rendered.");
    const firstInput = firstRenameForm.querySelector<HTMLInputElement>("input");
    if (!firstInput) throw new Error("Rename input was not rendered.");
    expect(document.activeElement).toBe(firstInput);

    act(() => {
      firstInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container?.querySelector('form[aria-label="Rename classification"]')).toBeNull();
    expect(props.onRenameDimension).not.toHaveBeenCalled();

    selectMenuItem("Actions for dimension Trade", "Rename");
    const renameForm = container?.querySelector<HTMLFormElement>(
      'form[aria-label="Rename classification"]',
    );
    if (!renameForm) throw new Error("Rename form was not rendered after reopening.");
    const renameInput = renameForm.querySelector<HTMLInputElement>("input");
    if (!renameInput) throw new Error("Rename input was not rendered after reopening.");
    setInputValue(renameInput, "Trade renamed");
    act(() => buttonIn(renameForm, "Save").click());
    expect(props.onRenameDimension).toHaveBeenCalledWith("trade", "Trade renamed");
  });

  it("preserves archive callbacks and assignment-preservation semantics", () => {
    const props = createProps();
    renderManager(props);

    selectMenuItem("Actions for dimension Trade", "Archive (assignments preserved)");
    selectMenuItem("Actions for value Electrical", "Archive (assignments preserved)");

    expect(props.onArchiveDimension).toHaveBeenCalledWith("trade");
    expect(props.onArchiveValue).toHaveBeenCalledWith("trade", "electrical");
  });

  it.each([false, true])("requests dimension and value deletion when archived=%s", (archived) => {
    const props = createProps({
      catalog: {
        dimensions: [
          {
            ...catalog.dimensions[0]!,
            archived,
            values: [{ ...catalog.dimensions[0]!.values[0]!, archived }],
          },
        ],
      },
    });
    renderManager(props);
    selectMenuItem("Actions for dimension Trade", "Delete");
    selectMenuItem(`Actions for ${archived ? "archived " : ""}value Electrical`, "Delete");
    expect(props.onDeleteDimension).toHaveBeenCalledWith("trade");
    expect(props.onDeleteValue).toHaveBeenCalledWith("trade", "electrical");
    expect(props.onArchiveDimension).not.toHaveBeenCalled();
    expect(props.onArchiveValue).not.toHaveBeenCalled();
  });

  it("restores or deletes an archived value from its menu, each without the other", () => {
    const props = createProps({
      catalog: {
        dimensions: [
          {
            ...catalog.dimensions[0]!,
            values: [{ ...catalog.dimensions[0]!.values[0]!, archived: true }],
          },
        ],
      },
    });
    renderManager(props);
    selectMenuItem("Actions for archived value Electrical", "Restore");
    expect(props.onRestoreValue).toHaveBeenCalledWith("trade", "electrical");
    expect(props.onDeleteValue).not.toHaveBeenCalled();

    selectMenuItem("Actions for archived value Electrical", "Delete");
    expect(props.onDeleteValue).toHaveBeenCalledWith("trade", "electrical");
    expect(props.onRestoreValue).toHaveBeenCalledTimes(1);
  });

  it("restores or deletes an archived dimension from its one menu", () => {
    const props = createProps({
      catalog: { dimensions: [{ ...catalog.dimensions[0]!, archived: true }] },
    });
    renderManager(props);
    expect(container!.querySelectorAll('button[aria-label^="Restore"]')).toHaveLength(0);
    selectMenuItem("Actions for dimension Trade", "Restore");
    expect(props.onRestoreDimension).toHaveBeenCalledWith("trade");
    selectMenuItem("Actions for dimension Trade", "Delete");
    expect(props.onDeleteDimension).toHaveBeenCalledWith("trade");
  });

  it("disables deletion menus along with the catalog", () => {
    renderManager(createProps({ disabled: true }));
    expect(buttonByLabel("Actions for dimension Trade").disabled).toBe(true);
    expect(buttonByLabel("Actions for value Electrical").disabled).toBe(true);
  });

  it("preserves inline create dimension and create value workflows", () => {
    const props = createProps();
    renderManager(props);

    const dimensionInput = inputByLabel("New dimension");
    setInputValue(dimensionInput, "Status");
    const dimensionForm = dimensionInput.closest("form");
    if (!dimensionForm) throw new Error("Create dimension form was not rendered.");
    act(() => buttonIn(dimensionForm, "Add dimension").click());
    expect(props.onCreateDimension).toHaveBeenCalledWith("Status");

    const valueInput = inputByLabel("New value for Trade");
    setInputValue(valueInput, "Plumbing");
    const valueForm = valueInput.closest("form");
    if (!valueForm) throw new Error("Create value form was not rendered.");
    act(() => buttonIn(valueForm, "Add value to Trade").click());
    expect(props.onCreateValue).toHaveBeenCalledWith("trade", "Plumbing");
  });

  it("starts with every dimension closed, values and forms in their bodies", () => {
    renderClosed(createProps());
    const [toggle] = dimensionToggles();
    expect(dimensionToggles()).toHaveLength(1);
    expect(toggle!.getAttribute("aria-expanded")).toBe("false");
    expect(
      container!.querySelector('button[aria-label="Actions for value Electrical"]'),
    ).toBeNull();
    expect(container!.querySelector('input[aria-label="New value for Trade"]')).toBeNull();
    // The dimension's own menu and the form that creates dimensions stay in reach.
    expect(buttonByLabel("Actions for dimension Trade")).toBeTruthy();
    expect(inputByLabel("New dimension")).toBeTruthy();
  });

  it("opens a dimension just created once it reaches the catalog, and no other", () => {
    const props = createProps();
    renderClosed(props);
    setInputValue(inputByLabel("New dimension"), "Status");
    act(() => buttonByLabel("Add dimension").click());
    expect(props.onCreateDimension).toHaveBeenCalledWith("Status");
    expect(dimensionToggles().map((toggle) => toggle.getAttribute("aria-expanded"))).toEqual([
      "false",
    ]);

    renderClosed({
      ...props,
      catalog: {
        dimensions: [
          ...catalog.dimensions,
          { id: "status", name: "Status", archived: false, values: [] },
        ],
      },
    });
    expect(dimensionToggles().map((toggle) => toggle.getAttribute("aria-expanded"))).toEqual([
      "false",
      "true",
    ]);
    expect(container!.querySelector('input[aria-label="New value for Status"]')).not.toBeNull();
    expect(container!.querySelector('input[aria-label="New value for Trade"]')).toBeNull();
  });

  it("explains an archived dimension in its body and offers no way to add to it", () => {
    renderManager(
      createProps({ catalog: { dimensions: [{ ...catalog.dimensions[0]!, archived: true }] } }),
    );
    expect(container!.textContent).toContain(
      "Assignments are preserved. Restore to edit or assign.",
    );
    expect(container!.querySelector('input[aria-label="New value for Trade"]')).toBeNull();
  });
});

describe("ClassificationManager derived quantity", () => {
  let restoreDialogMethods = () => {};
  beforeEach(() => {
    restoreDialogMethods = stubDialogMethods();
  });
  afterEach(() => restoreDialogMethods());

  const menuLabels = (trigger: string) => {
    act(() => buttonByLabel(trigger).click());
    const labels = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (item) => item.textContent?.trim(),
    );
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    return labels;
  };
  const dialog = () => document.querySelector("dialog");
  const dialogButton = (text: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("dialog button")).find(
      (candidate) => candidate.textContent?.trim() === text,
    )!;

  it("opens Quantity and price from the value row only when the session can store it", () => {
    const openers = () =>
      container!.querySelectorAll('button[aria-label^="Quantity and price for value"]').length;
    renderManager(createProps());
    expect(openers()).toBe(0);

    renderManager(createProps({ onSetValueRates: vi.fn(() => true) }));
    expect(openers()).toBe(1);
    expect(buttonByLabel("Quantity and price for value Electrical").dataset.valueId).toBe(
      "electrical",
    );

    const archived = {
      dimensions: [
        {
          ...catalog.dimensions[0]!,
          values: [{ ...catalog.dimensions[0]!.values[0]!, archived: true }],
        },
      ],
    };
    renderManager(createProps({ catalog: archived, onSetValueRates: vi.fn(() => true) }));
    expect(openers()).toBe(0);
    expect(container!.textContent).toContain("Archived");

    renderManager(
      createProps({
        catalog: { dimensions: [{ ...catalog.dimensions[0]!, archived: true }] },
        onSetValueRates: vi.fn(() => true),
      }),
    );
    expect(openers()).toBe(0);
    expect(buttonByLabel("Actions for value Electrical")).toBeTruthy();
  });

  it("no longer lists Quantity and price in the value menu", () => {
    renderManager(createProps({ onSetValueRates: vi.fn(() => true) }));
    expect(menuLabels("Actions for value Electrical")).toEqual([
      "Rename",
      "Archive (assignments preserved)",
      "Delete",
    ]);

    const archived = {
      dimensions: [
        {
          ...catalog.dimensions[0]!,
          values: [{ ...catalog.dimensions[0]!.values[0]!, archived: true }],
        },
      ],
    };
    renderManager(createProps({ catalog: archived, onSetValueRates: vi.fn(() => true) }));
    expect(menuLabels("Actions for archived value Electrical")).toEqual(["Restore", "Delete"]);

    renderManager(
      createProps({
        catalog: { dimensions: [{ ...catalog.dimensions[0]!, archived: true }] },
        onSetValueRates: vi.fn(() => true),
      }),
    );
    expect(menuLabels("Actions for value Electrical")).toEqual(["Delete"]);
  });

  it("returns the focus to the edited value's row when the dialog closes", () => {
    renderManager(createProps({ onSetValueRates: vi.fn(() => true) }));
    const row = buttonByLabel("Quantity and price for value Electrical");
    act(() => row.focus());
    act(() => row.click());
    expect(dialog()).not.toBeNull();
    act(() => dialogButton("Cancel").click());
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(container!.querySelector('[data-value-id="electrical"]'));
  });

  it("stores the derivation of the chosen value in the project's unit and closes", () => {
    const onSetValueRates = vi.fn(() => true);
    renderManager(createProps({ onSetValueRates, displayUnit: "cm" }));

    openRatesDialog("Electrical");
    expect(dialog()!.textContent).toContain("Trade · Electrical");
    chooseSelectOption(
      document.querySelector<HTMLElement>("dialog [data-select-trigger]")!,
      "Area from length",
    );
    setInputValue(document.querySelector<HTMLInputElement>("dialog input")!, "270");
    act(() => dialogButton("Save").click());

    expect(onSetValueRates).toHaveBeenCalledTimes(1);
    expect(onSetValueRates).toHaveBeenCalledWith(
      "electrical",
      { source: "length", factorMm: 2700 },
      null,
      null,
    );
    expect(dialog()).toBeNull();
  });

  it("passes the project's currency to the dialog and the one chosen there back", () => {
    const onSetValueRates = vi.fn(() => true);
    renderManager(createProps({ onSetValueRates, currency: "GBP" }));
    openRatesDialog("Electrical");
    expect(
      Array.from(document.querySelectorAll("dialog label"), (label) => label.textContent),
    ).toContain("Unit price (GBP)");
    act(() => dialogButton("Cancel").click());

    renderManager(createProps({ onSetValueRates, currency: null }));
    openRatesDialog("Electrical");
    setInputValue(document.querySelector<HTMLInputElement>("dialog input")!, "30");
    const currencyTrigger = Array.from(
      document.querySelectorAll<HTMLElement>("dialog [data-select-trigger]"),
    ).find((trigger) => trigger.textContent === "Choose a currency")!;
    chooseSearchSelectOption(currencyTrigger, "Euro (EUR)");
    act(() => dialogButton("Save").click());

    expect(onSetValueRates).toHaveBeenCalledWith(
      "electrical",
      null,
      { amount: 30, basis: "area", unit: "m²" },
      "EUR",
    );
  });

  it("opens with the value's saved rates and leaves them alone on Cancel", () => {
    const onSetValueRates = vi.fn(() => true);
    const rates: ClassificationValueRates[] = [
      { valueId: "other", derivation: { source: "length", factorMm: 1 }, price: null },
      { valueId: "electrical", derivation: { source: "area", factorMm: 150 }, price: null },
    ];
    renderManager(createProps({ onSetValueRates, rates }));

    openRatesDialog("Electrical");
    expect(document.querySelector("dialog [data-select-trigger]")!.textContent).toBe(
      "Volume from area",
    );
    expect(document.querySelector<HTMLInputElement>("dialog input")!.value).toBe("0.15");
    act(() => dialogButton("Cancel").click());

    expect(onSetValueRates).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  describe("rule summaries on value rows", () => {
    const opener = () => buttonByLabel("Quantity and price for value Electrical");
    const rowSummary = () => opener().querySelector("span:last-child > span:last-child");

    it("shows no summary for a value without rules", () => {
      renderManager(createProps({ rates: [], onSetValueRates: vi.fn(() => true) }));
      expect(opener().textContent).toBe("Electrical");
      expect(opener().hasAttribute("aria-describedby")).toBe(false);
    });

    it("writes the derivation and price in the row and the full rule in a tooltip", () => {
      vi.useFakeTimers();
      try {
        const rates: ClassificationValueRates[] = [
          {
            valueId: "electrical",
            derivation: { source: "perimeter", factorMm: 2400 },
            price: { amount: 12, basis: "derived", unit: "m²" },
          },
        ];
        renderManager(createProps({ rates, currency: "EUR", onSetValueRates: vi.fn(() => true) }));
        expect(opener().textContent).toBe("ElectricalArea × 2.40 m · 12.00 EUR/m²");
        expect(rowSummary()?.textContent).toBe("Area × 2.40 m · 12.00 EUR/m²");

        const full = "Area from perimeter × 2.40 m · 12.00 EUR per m² of derived area";
        const describedBy = opener().getAttribute("aria-describedby")!;
        expect(document.getElementById(describedBy)?.textContent).toBe(full);

        act(() => {
          opener().parentElement!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        });
        act(() => vi.runAllTimers());
        expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(full);
      } finally {
        vi.useRealTimers();
      }
    });

    it("writes only what the value has, in the project's unit and decimals", () => {
      renderManager(
        createProps({
          rates: [
            {
              valueId: "electrical",
              derivation: { source: "area", factorMm: 150 },
              price: null,
            },
          ],
          displayUnit: "cm",
          decimalPlaces: 1,
          onSetValueRates: vi.fn(() => true),
        }),
      );
      expect(rowSummary()?.textContent).toBe("Volume × 15.0 cm");

      renderManager(
        createProps({
          rates: [
            {
              valueId: "electrical",
              derivation: null,
              price: { amount: 3, basis: "count", unit: "each" },
            },
          ],
          onSetValueRates: vi.fn(() => true),
        }),
      );
      expect(rowSummary()?.textContent).toBe("3.00 each");
    });

    it("keeps the summary as plain text when the row cannot open the dialog", () => {
      renderManager(
        createProps({
          rates: [
            {
              valueId: "electrical",
              derivation: null,
              price: { amount: 3, basis: "count", unit: "each" },
            },
          ],
        }),
      );
      expect(container!.textContent).toContain("3.00 each");
      expect(container!.querySelector("[data-value-id]")).toBeNull();
    });
  });

  describe("Save and next", () => {
    const stepsCatalog: ClassificationCatalog = {
      dimensions: [
        {
          id: "structure",
          name: "Structure",
          archived: false,
          values: [
            { id: "slab", name: "Slab", archived: false },
            { id: "roof", name: "Roof", archived: true },
            { id: "beam", name: "Beam", archived: false },
          ],
        },
        {
          id: "old",
          name: "Old",
          archived: true,
          values: [{ id: "ghost", name: "Ghost", archived: false }],
        },
        { id: "empty", name: "Empty", archived: false, values: [] },
        {
          id: "finish",
          name: "Finish",
          archived: false,
          values: [{ id: "paint", name: "Paint", archived: false }],
        },
      ],
    };
    const title = () => document.querySelector("dialog h2")!.textContent;

    it("walks the active values in catalog order, skipping archived values and dimensions", () => {
      const onSetValueRates = vi.fn<(valueId: string) => boolean>(() => true);
      renderManager(createProps({ catalog: stepsCatalog, onSetValueRates }));
      openRatesDialog("Slab");
      const element = dialog();

      act(() => dialogButton("Save and next").click());
      expect(title()).toContain("Structure · Beam");
      act(() => dialogButton("Save and next").click());
      // Crosses into the next dimension; the archived and empty ones in between are skipped.
      expect(title()).toContain("Finish · Paint");
      expect(dialog()).toBe(element);
      expect(onSetValueRates.mock.calls.map((call) => call[0])).toEqual(["slab", "beam"]);
      expect(dialogButton("Save and next").getAttribute("aria-disabled")).toBe("true");
      act(() => dialogButton("Cancel").click());
    });

    it("offers the destination to the dialog and nothing after the last value", () => {
      renderManager(createProps({ catalog: stepsCatalog, onSetValueRates: vi.fn(() => true) }));
      openRatesDialog("Beam");
      expect(dialogButton("Save and next").getAttribute("aria-disabled")).toBeNull();
      expect(document.querySelector("dialog [role='status']")!.textContent).toBe("");
      act(() => dialogButton("Save and next").click());
      expect(document.querySelector("dialog [role='status']")!.textContent).toBe("Finish · Paint");
      act(() => dialogButton("Save").click());
      expect(dialog()).toBeNull();
    });

    it("loads the next value's saved rates", () => {
      renderManager(
        createProps({
          catalog: stepsCatalog,
          onSetValueRates: vi.fn(() => true),
          rates: [
            { valueId: "beam", derivation: { source: "length", factorMm: 400 }, price: null },
          ],
        }),
      );
      openRatesDialog("Slab");
      act(() => dialogButton("Save and next").click());

      expect(dialog()!.textContent).toContain("Area from length");
      expect(document.querySelector<HTMLInputElement>("dialog input")!.value).toBe("0.4");
      act(() => dialogButton("Cancel").click());
    });

    it("opens a folded destination dimension and returns the focus to the last edited row", async () => {
      renderClosed(createProps({ catalog: stepsCatalog, onSetValueRates: vi.fn(() => true) }));
      const structure = dimensionToggles().find(
        (button) => button.querySelector("span[title]")?.getAttribute("title") === "Structure",
      )!;
      act(() => structure.click());
      expect(container!.querySelector('[data-value-id="beam"]')).not.toBeNull();
      expect(container!.querySelector('[data-value-id="paint"]')).toBeNull();

      openRatesDialog("Beam");
      act(() => dialogButton("Save and next").click());
      expect(container!.querySelector('[data-value-id="paint"]')).not.toBeNull();
      act(() => dialogButton("Cancel").click());
      await act(async () => {
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
      });

      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(container!.querySelector('[data-value-id="paint"]'));
    });
  });
});

describe("ClassificationManager dimensions", () => {
  const richCatalog: ClassificationCatalog = {
    dimensions: [
      {
        id: "trade",
        name: "Trade",
        archived: false,
        values: [
          { id: "a", name: "Alpha", archived: false },
          { id: "b", name: "Beta", archived: false },
          { id: "c", name: "Gamma", archived: false },
          { id: "d", name: "Delta", archived: true },
        ],
      },
      { id: "empty", name: "Empty", archived: false, values: [] },
      {
        id: "old",
        name: "Old",
        archived: true,
        values: [{ id: "e", name: "Epsilon", archived: false }],
      },
    ],
  };
  const toggle = (name: string) =>
    Array.from(container!.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")).find(
      (button) => button.querySelector("span[title]")?.getAttribute("title") === name,
    )!;

  it("counts values, derived, priced and archived in each dimension's subtitle", () => {
    renderClosed(
      createProps({
        catalog: richCatalog,
        rates: [
          { valueId: "a", derivation: { source: "length", factorMm: 100 }, price: null },
          {
            valueId: "b",
            derivation: null,
            price: { amount: 1, basis: "area", unit: "m²" },
          },
          {
            valueId: "c",
            derivation: { source: "area", factorMm: 100 },
            price: { amount: 1, basis: "derived", unit: "m³" },
          },
        ],
      }),
    );
    expect(toggle("Trade").textContent).toBe("Trade4 values · 2 derived · 2 priced · 1 archived");
    expect(toggle("Empty").textContent).toBe("EmptyNo values");
    expect(toggle("Old").textContent).toBe("OldArchived · 1 value");
  });

  it("starts closed and keeps a dimension's values and new-value field in its body", () => {
    renderClosed(createProps({ catalog: richCatalog }));
    for (const name of ["Trade", "Empty", "Old"]) {
      expect(toggle(name).getAttribute("aria-expanded"), name).toBe("false");
    }
    expect(container!.querySelector('input[aria-label="New value for Trade"]')).toBeNull();
    expect(container!.querySelector('button[aria-label="Actions for value Alpha"]')).toBeNull();
    // A closed dimension keeps its own menu.
    expect(
      container!.querySelector('button[aria-label="Actions for dimension Trade"]'),
    ).not.toBeNull();

    act(() => toggle("Trade").click());
    expect(toggle("Trade").getAttribute("aria-expanded")).toBe("true");
    expect(container!.querySelector('input[aria-label="New value for Trade"]')).not.toBeNull();
    expect(container!.querySelector('button[aria-label="Actions for value Alpha"]')).not.toBeNull();
    expect(container!.querySelector('input[aria-label="New value for Empty"]')).toBeNull();

    act(() => toggle("Trade").click());
    expect(toggle("Trade").getAttribute("aria-expanded")).toBe("false");
    expect(container!.querySelector('button[aria-label="Actions for value Alpha"]')).toBeNull();
  });

  it("keeps the other dimensions' fold state across catalog changes", () => {
    const props = createProps({ catalog: richCatalog });
    renderClosed(props);
    act(() => toggle("Trade").click());
    renderClosed({ ...props, catalog: { dimensions: [...richCatalog.dimensions].reverse() } });
    expect(toggle("Trade").getAttribute("aria-expanded")).toBe("true");
    expect(toggle("Empty").getAttribute("aria-expanded")).toBe("false");
    expect(toggle("Old").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("ClassificationManager search", () => {
  const searchCatalog: ClassificationCatalog = {
    dimensions: [
      {
        id: "structure",
        name: "Estructura",
        archived: false,
        values: [
          { id: "slab", name: "Losa", archived: false },
          { id: "foundation", name: "Cimentación", archived: false },
        ],
      },
      {
        id: "finish",
        name: "Acabados",
        archived: false,
        values: [
          { id: "paint", name: "Pintura", archived: false },
          { id: "tile", name: "Azulejo", archived: false },
        ],
      },
    ],
  };
  // The search lives in the workspace header and filters what the manager shows.
  const renderWorkspace = (props: ClassificationManagerProps) =>
    act(() =>
      root!.render(<ClassificationWorkspace {...props} rates={props.rates && [...props.rates]} />),
    );
  const search = (query: string) => setInputValue(inputByLabel("Search classifications"), query);
  const toggles = () =>
    Array.from(container!.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"));
  const toggle = (name: string) =>
    toggles().find(
      (button) => button.querySelector("span[title]")?.getAttribute("title") === name,
    )!;
  const dimensionNames = () =>
    toggles()
      .map((button) => button.querySelector("span[title]")?.getAttribute("title"))
      .filter(Boolean);
  const shownValues = () =>
    Array.from(
      container!.querySelectorAll<HTMLButtonElement>('button[aria-label^="Actions for value "]'),
      (button) => button.getAttribute("aria-label")!.replace("Actions for value ", ""),
    );

  it("is always offered, and an empty catalog has nothing to filter", () => {
    renderWorkspace(createProps({ catalog: { dimensions: [] } }));
    expect(inputByLabel("Search classifications").type).toBe("search");
    search("zzz");
    expect(container!.querySelector('[role="status"]')).toBeNull();

    renderWorkspace(createProps({ catalog: searchCatalog }));
    expect(inputByLabel("Search classifications").placeholder).toBe("Search classifications");
  });

  it("shows only the values that match, under their dimension", () => {
    renderWorkspace(createProps({ catalog: searchCatalog }));
    search("pint");

    expect(dimensionNames()).toEqual(["Acabados"]);
    expect(shownValues()).toEqual(["Pintura"]);
  });

  it("shows every value of a dimension that matches by name", () => {
    renderWorkspace(createProps({ catalog: searchCatalog }));
    search("estruc");

    expect(dimensionNames()).toEqual(["Estructura"]);
    expect(shownValues()).toEqual(["Losa", "Cimentación"]);
  });

  it("ignores case and accents in both directions", () => {
    renderWorkspace(createProps({ catalog: searchCatalog }));
    search("CIMENTACION");
    expect(shownValues()).toEqual(["Cimentación"]);

    search("cimentación");
    expect(shownValues()).toEqual(["Cimentación"]);

    search("ACABADOS");
    expect(dimensionNames()).toEqual(["Acabados"]);
  });

  it("says when nothing matches and keeps the field to create from", () => {
    renderWorkspace(createProps({ catalog: searchCatalog }));
    search("zzz");

    expect(container!.querySelector('[role="status"]')!.textContent).toBe(
      "No classification matches",
    );
    expect(container!.querySelector("ul")).toBeNull();
    expect(container!.querySelector('input[placeholder="Dimension name"]')).not.toBeNull();
  });

  it("restores the full catalog when the search is cleared", () => {
    renderWorkspace(createProps({ catalog: searchCatalog }));
    search("zzz");
    expect(buttonByLabel("Clear search")).toBeTruthy();
    act(() => buttonByLabel("Clear search").click());

    expect(inputByLabel("Search classifications").value).toBe("");
    expect(dimensionNames()).toEqual(["Estructura", "Acabados"]);
    expect(container!.querySelector('[role="status"]')).toBeNull();
  });

  it("opens the closed dimensions that match and gives the fold state back when cleared", () => {
    renderWorkspace(createProps({ catalog: searchCatalog }));
    expect(toggle("Estructura").getAttribute("aria-expanded")).toBe("false");
    expect(toggle("Acabados").getAttribute("aria-expanded")).toBe("false");
    act(() => toggle("Estructura").click());

    search("azulejo");
    expect(toggle("Acabados").getAttribute("aria-expanded")).toBe("true");
    expect(shownValues()).toEqual(["Azulejo"]);

    // Folding while searching does not touch the user's own folds.
    act(() => toggle("Acabados").click());
    expect(toggle("Acabados").getAttribute("aria-expanded")).toBe("false");
    search("");
    expect(toggle("Acabados").getAttribute("aria-expanded")).toBe("false");
    expect(toggle("Estructura").getAttribute("aria-expanded")).toBe("true");

    search("azulejo");
    expect(toggle("Acabados").getAttribute("aria-expanded")).toBe("true");
  });

  it("clears a search that would hide the dimension or value just created", () => {
    const props = createProps({ catalog: searchCatalog });
    renderWorkspace(props);
    search("pint");

    setInputValue(inputByLabel("New dimension"), "Mobiliario");
    act(() => buttonByLabel("Add dimension").click());
    expect(props.onCreateDimension).toHaveBeenCalledWith("Mobiliario");
    expect(inputByLabel("Search classifications").value).toBe("");

    search("pint");
    setInputValue(inputByLabel("New value for Acabados"), "Pintura lisa");
    act(() => buttonByLabel("Add value to Acabados").click());
    expect(inputByLabel("Search classifications").value).toBe("pint");
  });
});
