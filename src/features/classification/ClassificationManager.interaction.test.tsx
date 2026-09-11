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
    onArchiveDimension: vi.fn(),
    onRestoreDimension: vi.fn(),
    onCreateValue: vi.fn(),
    onRenameValue: vi.fn(),
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

    act(() => buttonByLabel("Rename Trade").click());
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

    act(() => buttonByLabel("Rename Trade").click());
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

    act(() => buttonByLabel("Archive Trade; existing assignments are preserved").click());
    act(() => buttonByLabel("Archive Electrical; existing assignments are preserved").click());

    expect(props.onArchiveDimension).toHaveBeenCalledWith("trade");
    expect(props.onArchiveValue).toHaveBeenCalledWith("trade", "electrical");
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
    act(() => buttonIn(valueForm, "Add value").click());
    expect(props.onCreateValue).toHaveBeenCalledWith("trade", "Plumbing");
  });
});
