/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.querySelectorAll('[role="tooltip"]').forEach((element) => element.remove());
  root = null;
  container = null;
});

describe("shared disabled control semantics", () => {
  it("keeps a contextually disabled Button focusable, described, and non-activating", () => {
    const onClick = vi.fn();
    act(() =>
      root!.render(
        <Button disabled disabledReason="Finish the current workflow first." onClick={onClick}>
          Recalculate
        </Button>,
      ),
    );
    const button = container!.querySelector<HTMLButtonElement>("button")!;

    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const descriptionId = button.getAttribute("aria-describedby");
    expect(descriptionId).not.toBeNull();
    expect(document.getElementById(descriptionId!)?.textContent).toBe(
      "Finish the current workflow first.",
    );

    act(() => button.focus());
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
      "Finish the current workflow first.",
    );
    act(() => button.click());
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps ordinary disabled Buttons natively disabled when no contextual reason is required", () => {
    act(() => root!.render(<Button disabled>Unavailable</Button>));
    const button = container!.querySelector<HTMLButtonElement>("button")!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBeNull();
  });

  it("applies the same discoverable non-activation contract to IconButton", () => {
    const onClick = vi.fn();
    act(() =>
      root!.render(
        <IconButton
          icon={<span>i</span>}
          aria-label="Precision action"
          disabled
          disabledReason="A fine pointer is required."
          onClick={onClick}
        />,
      ),
    );
    const button = container!.querySelector<HTMLButtonElement>("button")!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const descriptionId = button.getAttribute("aria-describedby");
    expect(document.getElementById(descriptionId!)?.textContent).toBe(
      "A fine pointer is required.",
    );
    act(() => {
      button.focus();
      button.click();
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a Button tooltip through the shared bubble", () => {
    act(() =>
      root!.render(
        <Button tooltip="Export (Ctrl+E)" tooltipPosition="bottom">
          Export
        </Button>,
      ),
    );
    const button = container!.querySelector<HTMLButtonElement>("button")!;
    act(() => button.focus());
    expect(button.hasAttribute("title")).toBe(false);
  });

  it("marks a quiet IconButton so it rests without a border", () => {
    act(() =>
      root!.render(
        <>
          <IconButton icon={<span>i</span>} aria-label="Plain" />
          <IconButton quiet icon={<span>i</span>} aria-label="Quiet" />
        </>,
      ),
    );
    const [plain, quiet] = Array.from(container!.querySelectorAll("button"));
    expect(plain!.className).not.toBe(quiet!.className);
    expect(quiet!.className).toMatch(/quiet/);
  });
});
