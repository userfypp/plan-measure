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

describe("ClassificationWorkspace header", () => {
  it("keeps the keyboard focus on the header when switching between the catalog and the templates", () => {
    const button = (label: string) =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    act(() => button("Templates").click());
    expect(document.activeElement).toBe(button("Back to project"));
    act(() => button("Back to project").click());
    expect(document.activeElement).toBe(button("Templates"));
  });
});
