/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverlayHost } from "./OverlayHost";
import { OverlayProvider, useOverlayState } from "./overlayState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const deletePayload = {
  pageNumber: 1,
  measurementId: "line-1",
  measurementName: "Hallway",
};

function DeleteRequest() {
  const { requestDeleteMeasurement } = useOverlayState();
  return (
    <button type="button" onClick={() => requestDeleteMeasurement(deletePayload)}>
      Request delete
    </button>
  );
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button ${text} was not rendered.`);
  return button;
}

function openDeleteConfirmation() {
  const request = buttonByText("Request delete");
  act(() => {
    request.focus();
    request.click();
  });
  return request;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
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
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
  root = null;
  container = null;
});

describe("OverlayHost measurement deletion", () => {
  it("uses the destructive confirmation and forwards Don’t ask again only on Delete", () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    act(() => {
      root!.render(
        <OverlayProvider>
          <DeleteRequest />
          <OverlayHost onConfirmationConfirm={confirm} onConfirmationCancel={cancel} />
        </OverlayProvider>,
      );
    });
    openDeleteConfirmation();

    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    const checkbox = dialog?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(dialog?.textContent).toContain("Delete “Hallway”?");
    expect(buttonByText("Delete")).toBeTruthy();
    expect(buttonByText("Cancel")).toBeTruthy();
    expect(checkbox?.checked).toBe(false);
    expect(document.activeElement).toBe(checkbox);

    act(() => checkbox?.click());
    expect(checkbox?.checked).toBe(true);
    act(() => buttonByText("Delete").click());

    expect(confirm).toHaveBeenCalledWith(
      { type: "deleteMeasurement", payload: deletePayload },
      { dontAskAgain: true },
    );
    expect(cancel).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("cancels with Escape without forwarding the opt-out and restores focus", () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    act(() => {
      root!.render(
        <OverlayProvider>
          <DeleteRequest />
          <OverlayHost onConfirmationConfirm={confirm} onConfirmationCancel={cancel} />
        </OverlayProvider>,
      );
    });
    const request = openDeleteConfirmation();
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    const checkbox = dialog?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    act(() => checkbox?.click());
    act(() =>
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );

    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith({ type: "deleteMeasurement", payload: deletePayload });
    expect(document.activeElement).toBe(request);
  });
});
