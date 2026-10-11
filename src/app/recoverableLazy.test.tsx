// @vitest-environment jsdom
import { act, Suspense, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recoverableLazy } from "./recoverableLazy";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

it("shows a centered alert without a retry button and keeps surrounding state after a failed import", async () => {
  const load = vi.fn().mockRejectedValue(new Error("Network unavailable"));
  const Module = recoverableLazy(load, "pages");
  function Shell() {
    const [draft, setDraft] = useState("Unsaved project");
    return <>
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Suspense fallback={<p>Loading</p>}><Module /></Suspense>
    </>;
  }
  await act(async () => root.render(<Shell />));
  const input = container.querySelector("input")!;
  expect(input.value).toBe("Unsaved project");
  const alert = container.querySelector('[role="alert"]')!;
  expect(alert.textContent).toContain("Could not open pages");
  expect(alert.textContent).toContain("Reload the page to try again.");
  expect(container.querySelector("button")).toBeNull();
  expect(container.querySelector("input")).toBe(input);
  expect(load).toHaveBeenCalledTimes(1);
});

it("renders the loaded module when the import succeeds", async () => {
  const Module = recoverableLazy(
    () => Promise.resolve({ default: ({ text }: { text: string }) => <p>{text}</p> }),
    "pages",
  );
  await act(async () => root.render(<Suspense fallback={null}><Module text="Pages ready" /></Suspense>));
  expect(container.textContent).toContain("Pages ready");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
