/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalibrationDialog } from "./CalibrationDialog";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function saveButton(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === "Save scale",
  );
  if (!button) throw new Error("Save scale button was not rendered.");
  return button;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
  document.querySelectorAll('[role="dialog"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("CalibrationDialog", () => {
  it("hides scale-name editing for existing-scale recalibration while preserving the existing name", () => {
    const onConfirm = vi.fn();
    act(() =>
      root!.render(
        <CalibrationDialog
          points={[
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ]}
          initialName="Existing scale"
          title="Recalibrate scale"
          includeName={false}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      ),
    );

    expect(document.getElementById("calibration-name")).toBeNull();
    const distance = document.getElementById("calibration-distance") as HTMLInputElement | null;
    if (!distance) throw new Error("Reference distance input was not rendered.");
    setInputValue(distance, "2");
    act(() => saveButton().click());

    expect(onConfirm).toHaveBeenCalledWith({ name: "Existing scale", referenceDistanceMm: 2000 });
  });

  it("keeps scale naming available for new-scale creation", () => {
    const onConfirm = vi.fn();
    act(() =>
      root!.render(
        <CalibrationDialog
          points={[
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ]}
          initialName="Scale 3"
          title="Add scale"
          includeName
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      ),
    );

    const name = document.getElementById("calibration-name") as HTMLInputElement | null;
    const distance = document.getElementById("calibration-distance") as HTMLInputElement | null;
    if (!name || !distance) throw new Error("New-scale inputs were not rendered.");
    setInputValue(name, "  Named scale  ");
    setInputValue(distance, "1.5");
    act(() => saveButton().click());

    expect(onConfirm).toHaveBeenCalledWith({ name: "Named scale", referenceDistanceMm: 1500 });
  });
});
