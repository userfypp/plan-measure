/* @vitest-environment jsdom */

import { afterEach, expect, it } from "vitest";
import { publishScrollbarSize } from "./scrollbarSize";

afterEach(() => document.documentElement.style.removeProperty("--scrollbar-size"));

it("publishes the measured scrollbar size and removes the probe", () => {
  expect(publishScrollbarSize()).toBe(0);
  expect(document.documentElement.style.getPropertyValue("--scrollbar-size")).toBe("0px");
  expect(document.body.children).toHaveLength(0);
});
