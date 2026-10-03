/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassificationCatalog } from "../../types/domain";
import { ClassificationManager, type ClassificationManagerProps } from "./ClassificationManager";

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

function createProps(overrides: Partial<ClassificationManagerProps> = {}): ClassificationManagerProps {
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

function renderManager(props: ClassificationManagerProps) {
  act(() => root!.render(<ClassificationManager {...props} />));
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button ${label} was not rendered.`);
  return button;
}

function inputByLabel(label: string): HTMLInputElement {
  const labelElement = Array.from(container?.querySelectorAll<HTMLLabelElement>("label") ?? []).find(
    (candidate) => candidate.textContent === label,
  );
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

function buttonIn(element: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button ${text} was not rendered.`);
  return button;
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
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
    const firstRenameForm = container?.querySelector<HTMLFormElement>('form[aria-label="Rename classification"]');
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
    const renameForm = container?.querySelector<HTMLFormElement>('form[aria-label="Rename classification"]');
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
    const props = createProps({ catalog: {
      dimensions: [{ ...catalog.dimensions[0]!, archived,
        values: [{ ...catalog.dimensions[0]!.values[0]!, archived }] }],
    } });
    renderManager(props);
    selectMenuItem("Actions for dimension Trade", "Delete");
    selectMenuItem(`Actions for ${archived ? "archived " : ""}value Electrical`, "Delete");
    expect(props.onDeleteDimension).toHaveBeenCalledWith("trade");
    expect(props.onDeleteValue).toHaveBeenCalledWith("trade", "electrical");
    expect(props.onArchiveDimension).not.toHaveBeenCalled();
    expect(props.onArchiveValue).not.toHaveBeenCalled();
  });

  it("allows deleting an archived value without restoring it", () => {
    const props = createProps({ catalog: {
      dimensions: [{ ...catalog.dimensions[0]!,
        values: [{ ...catalog.dimensions[0]!.values[0]!, archived: true }] }],
    } });
    renderManager(props);
    selectMenuItem("Actions for archived value Electrical", "Delete");
    expect(props.onDeleteValue).toHaveBeenCalledWith("trade", "electrical");
    expect(props.onRestoreValue).not.toHaveBeenCalled();
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
    act(() => buttonIn(dimensionForm, "Add").click());
    expect(props.onCreateDimension).toHaveBeenCalledWith("Status");

    const valueInput = inputByLabel("New value for Trade");
    setInputValue(valueInput, "Plumbing");
    const valueForm = valueInput.closest("form");
    if (!valueForm) throw new Error("Create value form was not rendered.");
    act(() => buttonIn(valueForm, "Add").click());
    expect(props.onCreateValue).toHaveBeenCalledWith("trade", "Plumbing");
  });
});
