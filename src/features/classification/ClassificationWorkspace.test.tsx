/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClassificationWorkspace } from "./ClassificationWorkspace";

let root: Root;
let container: HTMLDivElement;
const noop = () => undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <ClassificationWorkspace
        catalog={{ dimensions: [] }}
        onCreateDimension={noop}
        onRenameDimension={noop}
        onDeleteDimension={noop}
        onArchiveDimension={noop}
        onRestoreDimension={noop}
        onCreateValue={noop}
        onRenameValue={noop}
        onDeleteValue={noop}
        onArchiveValue={noop}
        onRestoreValue={noop}
        onApplyTemplate={() => true}
      />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const searchInput = () =>
  container.querySelector<HTMLInputElement>('input[aria-label="Search classifications"]')!;
function typeSearch(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      searchInput(),
      value,
    );
    searchInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ClassificationWorkspace header", () => {
  it("offers the same search in both views, beside a view button that swaps Templates and Back", () => {
    const button = (label: string) =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    const search = searchInput();
    expect(search.placeholder).toBe("Search classifications");
    expect(container.querySelector("h2")).toBeNull();
    expect(button("Templates")).not.toBeNull();
    expect(button("Back to project")).toBeNull();

    act(() => button("Templates")!.click());
    expect(searchInput().getAttribute("aria-label")).toBe("Search classifications");
    expect(button("Templates")).toBeNull();
    expect(button("Back to project")).not.toBeNull();
    // The field is the same element in the same place, so it never jumps between views.
    expect(searchInput()).toBe(search);
  });

  it("starts the query over when the view changes", () => {
    typeSearch("abc");
    expect(searchInput().value).toBe("abc");

    act(() =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Templates"]')!.click(),
    );
    expect(searchInput().value).toBe("");

    typeSearch("xyz");
    act(() =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Back to project"]')!.click(),
    );
    expect(searchInput().value).toBe("");
  });

  it("keeps the focus on the view button, not on the search's clear button", () => {
    typeSearch("abc");
    act(() =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Templates"]')!.click(),
    );
    expect(document.activeElement).toBe(
      container.querySelector('button[aria-label="Back to project"]'),
    );
  });

  it("keeps the keyboard focus on the header when switching between the catalog and the templates", () => {
    const button = (label: string) =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    act(() => button("Templates").click());
    expect(document.activeElement).toBe(button("Back to project"));
    act(() => button("Back to project").click());
    expect(document.activeElement).toBe(button("Templates"));
  });
});
