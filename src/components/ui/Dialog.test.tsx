/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubDialogMethods } from "../../test/domTestUtils";
import { Dialog } from "./Dialog";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

let restoreDialogMethods: () => void = () => undefined;

beforeEach(() => {
  restoreDialogMethods = stubDialogMethods();
});

afterEach(() => {
  act(() => root?.unmount());
  restoreDialogMethods();
  container?.remove();
  root = null;
  container = null;
});

function renderDialog(onClose: () => void) {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Dialog open title="Example" onClose={onClose}>
        <input aria-label="Name" />
      </Dialog>,
    );
  });
  return container.querySelector<HTMLInputElement>("input")!;
}

describe("Dialog", () => {
  it("ignores Escape while an IME composition is in progress", () => {
    const onClose = vi.fn();
    const input = renderDialog(onClose);
    const escape = (isComposing: boolean) =>
      act(() => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            isComposing,
            bubbles: true,
            cancelable: true,
          }),
        );
      });

    escape(true);
    expect(onClose).not.toHaveBeenCalled();
    escape(false);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
