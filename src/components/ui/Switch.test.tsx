/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

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

function control(): HTMLInputElement {
  const input = container?.querySelector<HTMLInputElement>('input[role="switch"]');
  if (!input) throw new Error("Switch was not rendered.");
  return input;
}

function target(): HTMLLabelElement {
  const label = container?.querySelector<HTMLLabelElement>("[data-switch-target]");
  if (!label) throw new Error("Switch target was not rendered.");
  return label;
}

describe("Switch", () => {
  it("exposes switch semantics, checked state, and accessible naming", () => {
    act(() => {
      root!.render(<Switch aria-label="Example setting" checked onChange={() => undefined} />);
    });

    expect(control().type).toBe("checkbox");
    expect(control().getAttribute("role")).toBe("switch");
    expect(control().getAttribute("aria-label")).toBe("Example setting");
    expect(control().checked).toBe(true);
  });

  it("reports the next checked state", () => {
    const onChange = vi.fn();
    act(() => {
      root!.render(<Switch aria-label="Example setting" checked={false} onChange={onChange} />);
    });

    act(() => control().click());
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("keeps the label target activatable while separating the visual track from the input", () => {
    const onChange = vi.fn();
    act(() => {
      root!.render(<Switch aria-label="Example setting" checked={false} onChange={onChange} />);
    });

    expect(target().querySelector("[data-switch-track]")).not.toBeNull();
    act(() => target().click());
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("preserves native disabled behavior", () => {
    const onChange = vi.fn();
    act(() => {
      root!.render(
        <Switch aria-label="Example setting" checked={false} disabled onChange={onChange} />,
      );
    });

    expect(control().disabled).toBe(true);
    expect(target().getAttribute("data-disabled")).toBe("true");
    act(() => target().click());
    expect(onChange).not.toHaveBeenCalled();
  });
});
