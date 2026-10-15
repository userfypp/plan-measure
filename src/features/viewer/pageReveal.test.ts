/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { PAGE_REVEAL_DURATION_MS, revealPageContent } from "./pageReveal";

function animatable() {
  const animate = vi.fn();
  return { element: Object.assign(document.createElement("div"), { animate }), animate };
}

afterEach(() => {
  delete document.documentElement.dataset.motion;
  vi.unstubAllGlobals();
});

describe("revealPageContent", () => {
  it("fades each present element in with an opacity-only animation", () => {
    const canvas = animatable();
    const stage = animatable();
    revealPageContent([canvas.element, null, undefined, stage.element]);
    for (const { animate } of [canvas, stage]) {
      expect(animate).toHaveBeenCalledOnce();
      expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
        duration: PAGE_REVEAL_DURATION_MS,
        easing: expect.any(String),
      });
    }
  });

  it("does nothing when the app's reduce-motion preference is on", () => {
    document.documentElement.dataset.motion = "reduce";
    const { element, animate } = animatable();
    revealPageContent([element]);
    expect(animate).not.toHaveBeenCalled();
  });

  it("does nothing when the system asks for reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" })),
    );
    const { element, animate } = animatable();
    revealPageContent([element]);
    expect(animate).not.toHaveBeenCalled();
  });

  it("tolerates environments without the Web Animations API", () => {
    expect(() => revealPageContent([document.createElement("div")])).not.toThrow();
  });
});
