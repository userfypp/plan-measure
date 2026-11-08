/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INPUT_MODALITY_ATTRIBUTE } from "../../utils/inputModality";
import { HelpTip } from "./HelpTip";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.removeAttribute(INPUT_MODALITY_ATTRIBUTE);
});

describe("HelpTip", () => {
  it("renders a labelled button wired to a hidden copy of the help text", () => {
    act(() =>
      root.render(<HelpTip label="Format" help="Pick a file type." helpId="format-help" />),
    );

    const button = container.querySelector("button")!;
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("About Format");
    expect(button.getAttribute("aria-describedby")).toBe("format-help");
    expect(container.querySelector("#format-help")?.textContent).toBe("Pick a file type.");
  });

  it("shows the explanation in a tooltip when the button is focused", () => {
    act(() =>
      root.render(<HelpTip label="Format" help="Pick a file type." helpId="format-help" />),
    );

    vi.useFakeTimers();
    document.documentElement.setAttribute(INPUT_MODALITY_ATTRIBUTE, "keyboard");
    act(() => container.querySelector("button")!.focus());
    act(() => vi.advanceTimersByTime(2000));
    vi.useRealTimers();

    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Pick a file type.");
  });
});
