/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageCalibrationFromRatio } from "../features/calibration/ratioCalibration";
import { OverlayHost } from "./OverlayHost";
import { OverlayProvider, useOverlayState } from "./overlayState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const deletePayload = {
  pageNumber: 1,
  measurementId: "line-1",
  measurementName: "Hallway",
};

const setRatioPayload = {
  pageNumber: 1,
  calibrationId: "scale-1",
  calibrationName: "Ground floor",
  measurementCount: 2,
  calibration: createPageCalibrationFromRatio({ mode: "uniform" as const, denominator: 60 }),
};

function DeleteRequest() {
  const { requestDeleteMeasurement } = useOverlayState();
  return (
    <button type="button" onClick={() => requestDeleteMeasurement(deletePayload)}>
      Request delete
    </button>
  );
}

function ClassificationDeleteRequest({ target }: { target: "dimension" | "value" }) {
  const { requestDeleteClassification } = useOverlayState();
  return <button onClick={() => requestDeleteClassification(target === "dimension"
    ? { target, dimensionId: "trade", name: "Trade" }
    : { target, dimensionId: "trade", valueId: "electrical", name: "Electrical" })}>Request classification delete</button>;
}

function SetRatioRequest() {
  const { requestSetScaleRatio } = useOverlayState();
  return (
    <button type="button" onClick={() => requestSetScaleRatio(setRatioPayload)}>
      Request ratio change
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

describe("OverlayHost Set ratio confirmation", () => {
  it("explains measurement impact and forwards the exact pending ratio payload on confirm", () => {
    const confirm = vi.fn();
    act(() => {
      root!.render(
        <OverlayProvider>
          <SetRatioRequest />
          <OverlayHost onConfirmationConfirm={confirm} />
        </OverlayProvider>,
      );
    });

    act(() => buttonByText("Request ratio change").click());

    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    expect(dialog?.textContent).toContain("Set ratio for “Ground floor”?");
    expect(dialog?.textContent).toContain(
      "2 measurements use this scale. Their values will be recalculated using the new ratio.",
    );
    act(() => buttonByText("Set ratio").click());

    expect(confirm).toHaveBeenCalledWith({ type: "setScaleRatio", payload: setRatioPayload });
    expect(document.querySelector("dialog")).toBeNull();
  });
});


describe("OverlayHost classification deletion", () => {
  it.each(["dimension", "value"] as const)("confirms or cancels deleting a %s", (target) => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    act(() => root!.render(<OverlayProvider>
      <ClassificationDeleteRequest target={target} />
      <OverlayHost onConfirmationConfirm={confirm} onConfirmationCancel={cancel} />
    </OverlayProvider>));
    act(() => buttonByText("Request classification delete").click());
    const dialog = document.querySelector("dialog")!;
    expect(dialog.textContent).toContain(`Delete ${target}`);
    expect(dialog.textContent).toContain("assignments will be removed from the entire project");
    expect(dialog.textContent).toContain("Measurements will be kept. You can undo this change.");
    if (target === "dimension") expect(dialog.textContent).toContain("all its values");
    const checkbox = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    expect(document.activeElement).toBe(checkbox);
    expect(dialog.textContent).toContain("Don’t ask again");
    act(() => checkbox.click());
    act(() => buttonByText("Cancel").click());
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(document.querySelector("dialog")).toBeNull();
    act(() => buttonByText("Request classification delete").click());
    const reopenedCheckbox = document.querySelector<HTMLInputElement>('dialog input[type="checkbox"]')!;
    expect(reopenedCheckbox.checked).toBe(false);
    act(() => reopenedCheckbox.click());
    act(() => buttonByText("Delete").click());
    expect(confirm).toHaveBeenCalledWith({ type: "deleteClassification", payload: target === "dimension"
      ? { target, dimensionId: "trade", name: "Trade" }
      : { target, dimensionId: "trade", valueId: "electrical", name: "Electrical" } }, { dontAskAgain: true });
    expect(document.querySelector("dialog")).toBeNull();
  });
});
