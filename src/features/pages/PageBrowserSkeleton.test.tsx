/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PageBrowserSkeleton } from "./PageBrowserSkeleton";

it("renders the panel structure with placeholders and no visible loading text", () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<PageBrowserSkeleton />));
  const panel = container.querySelector("aside")!;
  expect(panel.getAttribute("aria-busy")).toBe("true");
  expect(panel.querySelector("h2")?.textContent).toBe("Pages");
  expect(panel.textContent).not.toContain("…");
  act(() => root.unmount());
  container.remove();
});
