/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageCalibrationFromRatio } from "./ratioCalibration";
import { CustomRatioDialog } from "./CustomRatioDialog";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(text: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!match) throw new Error(`Button ${text} was not rendered.`);
  return match;
}

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  act(() =>
    root!.render(
      <CustomRatioDialog
        purpose="create"
        initialName="Scale 2"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    ),
  );
  return { onConfirm, onCancel };
}

function renderSetDialog(
  initialRatio:
    | { mode: "uniform"; denominator: number }
    | { mode: "xy"; xDenominator: number; yDenominator: number },
) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  act(() =>
    root!.render(
      <CustomRatioDialog
        purpose="set"
        initialRatio={initialRatio}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    ),
  );
  return { onConfirm, onCancel };
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
  root = null;
  container = null;
});

describe("CustomRatioDialog", () => {
  it("starts in Uniform mode with a fixed numerator and focuses the denominator", () => {
    renderDialog();
    const ratio = document.querySelector<HTMLInputElement>("#custom-ratio-uniform");
    const name = document.querySelector<HTMLInputElement>("#custom-ratio-name");

    expect(name?.value).toBe("Scale 2");
    expect(document.body.textContent).toContain("Scale ratio");
    expect(document.body.textContent).toContain("1 :");
    expect(ratio?.type).toBe("number");
    expect(ratio?.step).toBe("any");
    expect(ratio?.inputMode).toBe("decimal");
    expect(document.activeElement).toBe(ratio);
  });

  it("creates a decimal Uniform ratio with the default or edited name", () => {
    const { onConfirm } = renderDialog();
    const ratio = document.querySelector<HTMLInputElement>("#custom-ratio-uniform")!;
    setInputValue(ratio, "62.5125");
    act(() => button("Save scale").click());
    expect(onConfirm).toHaveBeenLastCalledWith({
      name: "Scale 2",
      calibration: createPageCalibrationFromRatio({ mode: "uniform", denominator: 62.5125 }),
    });

    onConfirm.mockClear();
    setInputValue(document.querySelector<HTMLInputElement>("#custom-ratio-name")!, " Detail ratio ");
    setInputValue(ratio, "60");
    act(() => button("Save scale").click());
    expect(onConfirm).toHaveBeenCalledWith({
      name: "Detail ratio",
      calibration: createPageCalibrationFromRatio({ mode: "uniform", denominator: 60 }),
    });
  });

  it("toggles to X/Y and creates independent X 1:70 and Y 1:30 calibration", () => {
    const { onConfirm } = renderDialog();
    const xy = document.querySelector<HTMLInputElement>('input[value="xy"]')!;
    act(() => xy.click());

    expect(document.querySelector("#custom-ratio-uniform")).toBeNull();
    const x = document.querySelector<HTMLInputElement>("#custom-ratio-x")!;
    const y = document.querySelector<HTMLInputElement>("#custom-ratio-y")!;
    setInputValue(x, "70");
    setInputValue(y, "30");
    act(() => button("Save scale").click());

    expect(onConfirm).toHaveBeenCalledWith({
      name: "Scale 2",
      calibration: createPageCalibrationFromRatio({ mode: "xy", xDenominator: 70, yDenominator: 30 }),
    });
  });

  it("sets an existing Uniform ratio with fixed mode, prefill, shared validation, and focused denominator", () => {
    const { onConfirm } = renderSetDialog({ mode: "uniform", denominator: 62.5125 });
    const ratio = document.querySelector<HTMLInputElement>("#custom-ratio-uniform")!;

    expect(document.querySelector("dialog")?.textContent).toContain("Set ratio");
    expect(document.querySelector("#custom-ratio-name")).toBeNull();
    expect(document.querySelector('input[name="custom-ratio-mode"]')).toBeNull();
    expect(document.body.textContent).not.toContain("Mode");
    expect(ratio.value).toBe("62.5125");
    expect(document.activeElement).toBe(ratio);

    setInputValue(ratio, "0");
    act(() => button("Save").click());
    expect(ratio.getAttribute("aria-invalid")).toBe("true");
    expect(onConfirm).not.toHaveBeenCalled();

    setInputValue(ratio, "60");
    act(() => button("Save").click());
    expect(onConfirm).toHaveBeenCalledWith(
      createPageCalibrationFromRatio({ mode: "uniform", denominator: 60 }),
    );
  });

  it("sets existing X/Y ratios independently without exposing name or mode controls", () => {
    const { onConfirm } = renderSetDialog({ mode: "xy", xDenominator: 70, yDenominator: 30 });
    const x = document.querySelector<HTMLInputElement>("#custom-ratio-x")!;
    const y = document.querySelector<HTMLInputElement>("#custom-ratio-y")!;

    expect(document.querySelector("#custom-ratio-uniform")).toBeNull();
    expect(document.querySelector("#custom-ratio-name")).toBeNull();
    expect(document.querySelector('input[name="custom-ratio-mode"]')).toBeNull();
    expect(x.value).toBe("70");
    expect(y.value).toBe("30");
    expect(document.activeElement).toBe(x);

    setInputValue(x, "80");
    setInputValue(y, "40");
    act(() => button("Save").click());
    expect(onConfirm).toHaveBeenCalledWith(
      createPageCalibrationFromRatio({ mode: "xy", xDenominator: 80, yDenominator: 40 }),
    );
  });

  it("reports empty, non-positive, and independent X/Y validation errors accessibly", () => {
    const { onConfirm } = renderDialog();
    act(() => button("Save scale").click());
    const uniform = document.querySelector<HTMLInputElement>("#custom-ratio-uniform")!;
    expect(uniform.getAttribute("aria-invalid")).toBe("true");
    expect(uniform.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(uniform.getAttribute("aria-describedby")!)?.textContent).toContain(
      "Enter a ratio denominator.",
    );

    setInputValue(uniform, "0");
    act(() => button("Save scale").click());
    expect(document.body.textContent).toContain("greater than zero");
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => document.querySelector<HTMLInputElement>('input[value="xy"]')!.click());
    const x = document.querySelector<HTMLInputElement>("#custom-ratio-x")!;
    const y = document.querySelector<HTMLInputElement>("#custom-ratio-y")!;
    setInputValue(x, "-1");
    act(() => button("Save scale").click());
    expect(x.getAttribute("aria-invalid")).toBe("true");
    expect(y.getAttribute("aria-invalid")).toBe("true");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancels from the button or Escape without creating a scale", () => {
    const { onConfirm, onCancel } = renderDialog();
    act(() => button("Cancel").click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    act(() =>
      document
        .querySelector("dialog")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
