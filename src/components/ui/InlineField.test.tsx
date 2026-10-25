/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";
import { PlusIcon } from "./icons";
import { InlineField } from "./InlineField";

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

describe("InlineField", () => {
  it("submits through its icon action and keeps the error under the field row", () => {
    const onSubmit = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    act(() =>
      root?.render(
        <InlineField
          label="New dimension"
          error="Names must be unique."
          value=""
          onChange={() => undefined}
          onSubmit={onSubmit}
          actions={
            <IconButton
              type="submit"
              icon={<PlusIcon />}
              aria-label="Add dimension"
              tooltip="Add"
            />
          }
        />,
      ),
    );
    const form = container!.querySelector("form")!;
    const input = form.querySelector("input")!;
    const button = form.querySelector<HTMLButtonElement>('button[aria-label="Add dimension"]')!;
    expect(input.labels?.[0]?.textContent).toBe("New dimension");
    const row = input.parentElement!;
    expect(row.contains(button)).toBe(true);
    expect(row.nextElementSibling).toBe(form.querySelector("[role='alert']"));
    act(() => button.click());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
