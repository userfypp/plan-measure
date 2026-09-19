/* @vitest-environment jsdom */

import { act, useState, type ComponentProps } from "react";
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

function setSelectValue(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function saveButton(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === "Save scale",
  );
  if (!button) throw new Error("Save scale button was not rendered.");
  return button;
}

function cancelButton(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === "Cancel",
  );
  if (!button) throw new Error("Cancel button was not rendered.");
  return button;
}

function submitFormDirectly() {
  const form = document.querySelector<HTMLFormElement>('form');
  if (!form) throw new Error("Calibration form was not rendered.");
  act(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

type DialogProps = ComponentProps<typeof CalibrationDialog>;

function renderDialog(overrides: Partial<Omit<DialogProps, "onConfirm" | "onCancel">> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  act(() =>
    root!.render(
      <CalibrationDialog
        points={[
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]}
        initialName="Scale 1"
        title="Add scale"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...overrides}
      />,
    ),
  );
  return { onConfirm, onCancel };
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

  it("offers all six calibration input modes", () => {
    act(() =>
      root!.render(
        <CalibrationDialog
          points={[
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ]}
          initialName="Scale 1"
          title="Add scale"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      ),
    );

    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Calibration unit"]');
    expect(Array.from(select?.options ?? []).map((option) => [option.value, option.textContent])).toEqual([
      ["mm", "Millimetres"],
      ["cm", "Centimetres"],
      ["m", "Metres"],
      ["in", "Inches"],
      ["ft", "Feet"],
      ["ft-in", "Feet & inches"],
    ]);
  });

  it.each([
    ["in", "148.5", 3771.9],
    ["ft", "12.375", 3771.9],
  ] as const)("converts decimal %s calibration input to millimetres", (unit, input, expectedMm) => {
    const onConfirm = vi.fn();
    act(() =>
      root!.render(
        <CalibrationDialog
          points={[
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ]}
          initialName="Imperial scale"
          title="Add scale"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      ),
    );
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Calibration unit"]')!;
    const distance = document.getElementById("calibration-distance") as HTMLInputElement;
    setSelectValue(select, unit);
    setInputValue(distance, input);
    act(() => saveButton().click());

    expect(onConfirm).toHaveBeenCalledWith({
      name: "Imperial scale",
      referenceDistanceMm: expectedMm,
    });
  });

  it("uses structured Feet, Inches, and Fractional inches controls instead of architectural text", () => {
    renderDialog({ initialName: "Architectural scale" });
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Calibration unit"]')!;
    setSelectValue(select, "ft-in");

    expect(document.getElementById("calibration-distance")).toBeNull();
    expect(document.querySelector<HTMLInputElement>('#calibration-feet')?.type).toBe("number");
    expect(document.querySelector<HTMLInputElement>('#calibration-feet')?.min).toBe("0");
    expect(document.querySelector<HTMLInputElement>('#calibration-feet')?.step).toBe("1");
    expect(document.querySelector<HTMLInputElement>('#calibration-inches')?.min).toBe("0");
    expect(document.querySelector<HTMLInputElement>('#calibration-inches')?.max).toBe("11");
    expect(document.querySelector<HTMLInputElement>('#calibration-inches')?.step).toBe("1");
    const fraction = document.querySelector<HTMLSelectElement>('#calibration-fraction')!;
    expect(fraction.getAttribute("aria-label")).toBe("Fractional inches");
    expect(Array.from(fraction.options).map((option) => [option.value, option.textContent])).toEqual([
      ["0", "0"],
      ["1", "1/16"],
      ["2", "1/8"],
      ["3", "3/16"],
      ["4", "1/4"],
      ["5", "5/16"],
      ["6", "3/8"],
      ["7", "7/16"],
      ["8", "1/2"],
      ["9", "9/16"],
      ["10", "5/8"],
      ["11", "11/16"],
      ["12", "3/4"],
      ["13", "13/16"],
      ["14", "7/8"],
      ["15", "15/16"],
    ]);
  });

  it("converts 12 ft 4 in 1/2 exactly through integer sixteenths", () => {
    const { onConfirm } = renderDialog({ initialName: "Architectural scale" });
    const unit = document.querySelector<HTMLSelectElement>('select[aria-label="Calibration unit"]')!;
    setSelectValue(unit, "ft-in");
    setInputValue(document.getElementById("calibration-feet") as HTMLInputElement, "12");
    setInputValue(document.getElementById("calibration-inches") as HTMLInputElement, "4");
    setSelectValue(document.getElementById("calibration-fraction") as HTMLSelectElement, "8");
    act(() => saveButton().click());

    expect(onConfirm).toHaveBeenCalledWith({
      name: "Architectural scale",
      referenceDistanceMm: (2376 * 127) / 80,
    });
    expect((2376 * 127) / 80).toBe(3771.9);
  });

  it.each([undefined, "horizontal X", "vertical Y"] as const)(
    "uses the structured conversion for %s calibration",
    (referenceLabel) => {
    const { onConfirm } = renderDialog({
      initialName: "X/Y scale",
      referenceLabel,
      includeName: false,
    });
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Calibration unit"]')!;
    setSelectValue(select, "ft-in");
    setInputValue(document.getElementById("calibration-feet") as HTMLInputElement, "12");
    setInputValue(document.getElementById("calibration-inches") as HTMLInputElement, "4");
    setSelectValue(document.getElementById("calibration-fraction") as HTMLSelectElement, "8");
    act(() => saveButton().click());

    expect(onConfirm).toHaveBeenCalledWith({
      name: "X/Y scale",
      referenceDistanceMm: 3771.9,
    });
    },
  );

  it.each([
    ["0", "0", "1", 127 / 80],
    ["0", "11", "0", (176 * 127) / 80],
    ["0", "0", "8", (8 * 127) / 80],
    ["0", "0", "15", (15 * 127) / 80],
    ["250", "0", "0", (250 * 192 * 127) / 80],
  ] as const)(
    "accepts canonical structured input %s ft %s in fraction-sixteenths %s",
    (feet, inches, fraction, expectedMm) => {
      const { onConfirm } = renderDialog();
      setSelectValue(
        document.querySelector<HTMLSelectElement>('select[aria-label="Calibration unit"]')!,
        "ft-in",
      );
      setInputValue(document.getElementById("calibration-feet") as HTMLInputElement, feet);
      setInputValue(document.getElementById("calibration-inches") as HTMLInputElement, inches);
      setSelectValue(document.getElementById("calibration-fraction") as HTMLSelectElement, fraction);
      act(() => saveButton().click());

      expect(onConfirm).toHaveBeenCalledWith({
        name: "Scale 1",
        referenceDistanceMm: expectedMm,
      });
    },
  );

  it("rejects zero, inches 12, fractional feet, and exponential feet input at runtime", () => {
    const { onConfirm } = renderDialog();
    const unit = document.querySelector<HTMLSelectElement>('select[aria-label="Calibration unit"]')!;
    setSelectValue(unit, "ft-in");
    const feet = document.getElementById("calibration-feet") as HTMLInputElement;
    const inches = document.getElementById("calibration-inches") as HTMLInputElement;

    act(() => saveButton().click());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Enter a distance greater than zero.",
    );

    setInputValue(inches, "12");
    expect(inches.validity.rangeOverflow).toBe(true);
    submitFormDirectly();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("whole inches from 0 to 11");

    setInputValue(inches, "0");
    setInputValue(feet, "1.5");
    submitFormDirectly();
    expect(onConfirm).not.toHaveBeenCalled();

    setInputValue(feet, "1e2");
    submitFormDirectly();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("resets hidden distance state and validation when changing input representation", () => {
    renderDialog();
    const unit = document.querySelector<HTMLSelectElement>('select[aria-label="Calibration unit"]')!;
    setInputValue(document.getElementById("calibration-distance") as HTMLInputElement, "5.2");
    setSelectValue(unit, "ft-in");
    act(() => saveButton().click());
    expect(document.querySelector('[role="alert"]')).not.toBeNull();

    setSelectValue(unit, "m");
    expect((document.getElementById("calibration-distance") as HTMLInputElement).value).toBe("");
    expect(document.querySelector('[role="alert"]')).toBeNull();

    setSelectValue(unit, "ft-in");
    expect((document.getElementById("calibration-feet") as HTMLInputElement).value).toBe("0");
    expect((document.getElementById("calibration-inches") as HTMLInputElement).value).toBe("0");
    expect((document.getElementById("calibration-fraction") as HTMLSelectElement).value).toBe("0");
  });

  it("keeps scoped dialog semantics without claiming document-wide aria modality", () => {
    renderDialog();

    const dialog = document.querySelector<HTMLDialogElement>('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(dialog.open).toBe(true);
  });

  it("confines Tab and Shift+Tab to the calibration dialog", () => {
    renderDialog();
    const dialog = document.querySelector<HTMLDialogElement>('[role="dialog"]')!;
    const first = document.getElementById("calibration-name") as HTMLInputElement;
    const last = saveButton();

    act(() => last.focus());
    act(() =>
      last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })),
    );
    expect(document.activeElement).toBe(first);

    act(() => first.focus());
    act(() =>
      first.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(last);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("recovers focus when focus is moved outside programmatically", () => {
    renderDialog();
    const first = document.getElementById("calibration-name") as HTMLInputElement;
    const outside = document.createElement("button");
    outside.textContent = "Viewer control";
    document.body.append(outside);

    expect(document.activeElement).toBe(first);
    act(() => outside.focus());

    expect(document.activeElement).toBe(first);
    outside.remove();
  });

  it("cancels once on Escape and restores focus to the control that opened calibration", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button id="calibration-trigger" type="button" onClick={() => setOpen(true)}>
            Calibrate
          </button>
          {open && (
            <CalibrationDialog
              points={[
                { x: 0, y: 0 },
                { x: 10, y: 0 },
              ]}
              initialName="Keyboard scale"
              title="Add scale"
              onConfirm={onConfirm}
              onCancel={() => {
                onCancel();
                setOpen(false);
              }}
            />
          )}
        </>
      );
    }

    act(() => root!.render(<Harness />));
    const trigger = document.getElementById("calibration-trigger") as HTMLButtonElement;
    act(() => {
      trigger.focus();
      trigger.click();
    });
    expect((document.activeElement as HTMLElement | null)?.id).toBe("calibration-name");

    const focusedInput = document.getElementById("calibration-name") as HTMLInputElement;
    act(() => {
      focusedInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps initial focus and the explicit Cancel button behavior intact", () => {
    const { onCancel } = renderDialog({ initialName: "Keyboard scale" });
    expect((document.activeElement as HTMLElement | null)?.id).toBe("calibration-name");

    act(() => cancelButton().click());
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
