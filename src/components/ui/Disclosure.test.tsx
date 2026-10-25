/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Disclosure } from "./Disclosure";

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

function toggle(): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>("button[aria-expanded]");
  if (!button) throw new Error("Disclosure was not rendered.");
  return button;
}

describe("Disclosure", () => {
  it("keeps the body out of the page until the toggle opens it", () => {
    act(() =>
      root?.render(
        <Disclosure title="Residential" subtitle="2 dimensions">
          <p>Preview</p>
        </Disclosure>,
      ),
    );
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(container?.textContent).not.toContain("Preview");
    act(() => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(container?.textContent).toContain("Preview");
    expect(document.getElementById(toggle().getAttribute("aria-controls")!)).not.toBeNull();
    act(() => toggle().click());
    expect(container?.textContent).not.toContain("Preview");
  });

  it("names the toggle after the title and subtitle", () => {
    act(() =>
      root?.render(
        <Disclosure title="Residential" subtitle="2 dimensions">
          <p>Preview</p>
        </Disclosure>,
      ),
    );
    expect(toggle().textContent).toBe("Residential2 dimensions");
  });

  it("keeps actions beside the toggle so they never toggle the item", () => {
    const onAction = vi.fn();
    act(() =>
      root?.render(
        <Disclosure
          title="Residential"
          actions={
            <button type="button" aria-label="Apply" onClick={onAction}>
              A
            </button>
          }
        >
          <p>Preview</p>
        </Disclosure>,
      ),
    );
    const action = container!.querySelector<HTMLButtonElement>('button[aria-label="Apply"]')!;
    expect(toggle().contains(action)).toBe(false);
    act(() => action.click());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("marks the current choice as selected", () => {
    act(() =>
      root?.render(
        <Disclosure title="Scale 50" selected>
          <p>Details</p>
        </Disclosure>,
      ),
    );
    expect(container!.firstElementChild?.hasAttribute("data-selected")).toBe(true);
  });

  it("follows the open state its owner sets and reports every toggle", () => {
    const onOpenChange = vi.fn();
    function render(open: boolean) {
      act(() =>
        root?.render(
          <Disclosure title="Scale 50" open={open} onOpenChange={onOpenChange}>
            <p>Details</p>
          </Disclosure>,
        ),
      );
    }
    render(false);
    act(() => toggle().click());
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    render(true);
    expect(container?.textContent).toContain("Details");
    act(() => toggle().click());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });
});
