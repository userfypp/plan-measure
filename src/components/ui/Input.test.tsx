/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Input } from "./Input";

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

function SearchField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Input
      type="search"
      aria-label="Search labels"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClear={() => setValue("")}
    />
  );
}

const clearButton = () =>
  container!.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]');

describe("Input onClear", () => {
  it("shows one clear button only while the field has text and empties it", () => {
    act(() => root!.render(<SearchField initial="" />));
    expect(clearButton()).toBeNull();

    act(() => root!.render(<SearchField key="filled" initial="A-1" />));
    const input = container!.querySelector("input")!;
    expect(container!.querySelectorAll("button")).toHaveLength(1);

    act(() => clearButton()!.click());
    expect(input.value).toBe("");
    expect(clearButton()).toBeNull();
    expect(container!.querySelector("input")).toBe(input);
  });

  it("hides the button on a disabled field", () => {
    act(() =>
      root!.render(
        <Input
          aria-label="Search"
          value="x"
          disabled
          onChange={() => undefined}
          onClear={() => undefined}
        />,
      ),
    );
    expect(clearButton()).toBeNull();
  });
});

describe("Input leading", () => {
  it("renders the glyph before the field and keeps the field mounted while clearing", () => {
    function Field() {
      const [value, setValue] = useState("A-1");
      return (
        <Input
          type="search"
          aria-label="Search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onClear={() => setValue("")}
          leading={<svg data-testid="glyph" />}
        />
      );
    }
    act(() => root!.render(<Field />));
    const input = container!.querySelector("input")!;
    const glyph = container!.querySelector('[data-testid="glyph"]')!;

    expect(input.className).toMatch(/hasLeading/);
    expect(glyph.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    act(() => clearButton()!.click());
    expect(input.value).toBe("");
    expect(container!.querySelector("input")).toBe(input);
    expect(container!.querySelector('[data-testid="glyph"]')).toBe(glyph);
  });
});
