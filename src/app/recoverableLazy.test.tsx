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

it("keeps surrounding state after a failed import and retries with a fresh loader", async () => {
  const load = vi.fn()
    .mockRejectedValueOnce(new Error("Network unavailable"))
    .mockRejectedValueOnce(new Error("Still unavailable"))
    .mockResolvedValue({ default: ({ text }: { text: string }) => <p>{text}</p> });
  const Module = recoverableLazy(load, "pages");
  function Shell({ moduleKey = 0 }: { moduleKey?: number }) {
    const [draft, setDraft] = useState("Unsaved project");
    return <>
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Suspense fallback={<p>Loading</p>}><Module key={moduleKey} text="Pages ready" /></Suspense>
    </>;
  }
  await act(async () => root.render(<Shell />));
  const input = container.querySelector("input")!;
  expect(input.value).toBe("Unsaved project");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not open pages");
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(load).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(load).toHaveBeenCalledTimes(3);
  expect(container.textContent).toContain("Pages ready");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("Unsaved project");
  await act(async () => root.render(<Shell moduleKey={1} />));
  expect(container.textContent).toContain("Pages ready");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(load).toHaveBeenCalledTimes(3);
});
