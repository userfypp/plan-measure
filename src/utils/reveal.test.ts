/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { REVEAL_DURATION_MS, revealElements } from "./reveal";
import { stubMatchMedia } from "../test/domTestUtils";

function animatable() {
  const animate = vi.fn();
  return { element: Object.assign(document.createElement("div"), { animate }), animate };
}

afterEach(() => {
  delete document.documentElement.dataset.motion;
  vi.unstubAllGlobals();
});

describe("revealElements", () => {
  it("matches the dialog enter duration", () => {
    expect(REVEAL_DURATION_MS).toBe(180);
  });

  it("fades each present element in with an opacity-only animation", () => {
    const canvas = animatable();
    const stage = animatable();
    revealElements([canvas.element, null, undefined, stage.element]);
    for (const { animate } of [canvas, stage]) {
      expect(animate).toHaveBeenCalledOnce();
      expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
        duration: 180,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      });
    }
  });

  it("does nothing when the app's reduce-motion preference is on", () => {
    document.documentElement.dataset.motion = "reduce";
    const { element, animate } = animatable();
    revealElements([element]);
    expect(animate).not.toHaveBeenCalled();
  });

  it("does nothing when the system asks for reduced motion", () => {
    stubMatchMedia((query) => query === "(prefers-reduced-motion: reduce)");
    const { element, animate } = animatable();
    revealElements([element]);
    expect(animate).not.toHaveBeenCalled();
  });

  it("tolerates environments without the Web Animations API", () => {
    expect(() => revealElements([document.createElement("div")])).not.toThrow();
  });
});
