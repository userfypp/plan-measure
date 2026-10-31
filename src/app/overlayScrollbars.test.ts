/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installOverlayScrollbars,
  OVERLAY_SCROLL_CLASS,
  OVERLAY_THUMB_CLASS,
} from "./overlayScrollbars";

let host: HTMLDivElement;
let uninstall: (() => void) | null = null;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  host.remove();
});

function addScroller(overflow: { x?: string; y?: string }): HTMLDivElement {
  const scroller = document.createElement("div");
  scroller.className = OVERLAY_SCROLL_CLASS;
  scroller.style.overflowX = overflow.x ?? "visible";
  scroller.style.overflowY = overflow.y ?? "auto";
  host.append(scroller);
  return scroller;
}

function setMetrics(element: HTMLElement, metrics: Record<string, number>) {
  for (const [name, value] of Object.entries(metrics)) {
    Object.defineProperty(element, name, { configurable: true, writable: true, value });
  }
}

async function frames(count = 2) {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  }
}

function thumbs(axis?: string): HTMLElement[] {
  return Array.from(
    host.querySelectorAll<HTMLElement>(
      `.${OVERLAY_THUMB_CLASS}${axis ? `[data-axis="${axis}"]` : ""}`,
    ),
  );
}

describe("installOverlayScrollbars", () => {
  it("stacks the thumb above a scroller that has its own z-index", async () => {
    const scroller = addScroller({});
    scroller.style.position = "fixed";
    scroller.style.zIndex = "250";
    setMetrics(scroller, { clientHeight: 100, scrollHeight: 400, clientWidth: 100 });
    uninstall = installOverlayScrollbars(host);
    await frames();

    expect(thumbs("y")[0]?.style.zIndex).toBe("251");
  });

  it("shows the thumb once rows added to a scroller make it overflow", async () => {
    const scroller = addScroller({});
    setMetrics(scroller, { clientHeight: 100, scrollHeight: 100, clientWidth: 100 });
    uninstall = installOverlayScrollbars(host);
    await frames();
    expect(thumbs("y")[0]?.style.display).toBe("none");

    setMetrics(scroller, { scrollHeight: 400 });
    scroller.append(document.createElement("div"));
    await frames();

    expect(thumbs("y")[0]?.style.display).toBe("");
  });

  it("draws a proportional thumb after an overflowing scroller and follows its scroll", async () => {
    const scroller = addScroller({});
    setMetrics(scroller, {
      clientHeight: 200,
      scrollHeight: 800,
      clientWidth: 300,
      offsetLeft: 10,
      offsetTop: 20,
      scrollTop: 0,
    });
    uninstall = installOverlayScrollbars(host);
    await frames();

    const [thumb] = thumbs("y");
    expect(thumb?.previousElementSibling).toBe(scroller);
    expect(thumb?.style.display).toBe("");
    expect(thumb?.style.height).toBe("50px");
    expect(thumb?.style.top).toBe("20px");
    expect(thumb?.style.left).toBe("calc(310px - var(--space-8))");
    expect(thumb?.style.transform).toBe("translateY(0px)");

    scroller.scrollTop = 600;
    scroller.dispatchEvent(new Event("scroll"));
    await frames();
    expect(thumb?.style.transform).toBe("translateY(150px)");
  });

  it("keeps the thumb on its track while elastic overscroll reports out-of-range positions", async () => {
    const scroller = addScroller({});
    setMetrics(scroller, { clientHeight: 200, scrollHeight: 800, clientWidth: 300, scrollTop: 0 });
    uninstall = installOverlayScrollbars(host);
    await frames();
    const [thumb] = thumbs("y");

    for (const [position, offset] of [
      [-80, "0px"],
      [900, "150px"],
    ] as const) {
      scroller.scrollTop = position;
      scroller.dispatchEvent(new Event("scroll"));
      await frames();
      expect(thumb?.style.transform).toBe(`translateY(${offset})`);
    }
  });

  it("hides the thumb while the scroller does not overflow", async () => {
    const scroller = addScroller({});
    setMetrics(scroller, { clientHeight: 200, scrollHeight: 200, scrollTop: 0 });
    uninstall = installOverlayScrollbars(host);
    await frames();

    expect(thumbs("y")[0]?.style.display).toBe("none");
  });

  it("draws a horizontal thumb for a horizontal scroller only", async () => {
    const scroller = addScroller({ x: "auto", y: "hidden" });
    setMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 400,
      clientHeight: 32,
      scrollLeft: 150,
    });
    uninstall = installOverlayScrollbars(host);
    await frames();

    expect(thumbs("y")).toHaveLength(0);
    const [thumb] = thumbs("x");
    expect(thumb?.style.width).toBe("25px");
    expect(thumb?.style.top).toBe("calc(32px - var(--space-8))");
    expect(thumb?.style.transform).toBe("translateX(37.5px)");
  });

  it("keeps both thumbs of a two-axis scroller in place without touching the DOM again", async () => {
    const scroller = addScroller({ x: "auto", y: "auto" });
    setMetrics(scroller, {
      clientHeight: 100,
      scrollHeight: 300,
      clientWidth: 100,
      scrollWidth: 300,
    });
    uninstall = installOverlayScrollbars(host);
    await frames();
    expect(Array.from(host.children)).toEqual([scroller, ...thumbs("y"), ...thumbs("x")]);

    let mutations = 0;
    const observer = new MutationObserver((records) => (mutations += records.length));
    observer.observe(host, { childList: true, subtree: true });
    await frames(4);
    expect(observer.takeRecords()).toHaveLength(0);
    expect(mutations).toBe(0);
    observer.disconnect();
  });

  it("picks up scrollers added later and drops the thumb of a removed one", async () => {
    uninstall = installOverlayScrollbars(host);
    await frames();
    expect(thumbs()).toHaveLength(0);

    const scroller = addScroller({});
    setMetrics(scroller, { clientHeight: 100, scrollHeight: 300, scrollTop: 0 });
    await frames(3);
    expect(thumbs("y")).toHaveLength(1);

    scroller.remove();
    await frames(3);
    expect(thumbs()).toHaveLength(0);
  });

  it("scrolls the content when the thumb is dragged", async () => {
    const scroller = addScroller({});
    setMetrics(scroller, { clientHeight: 200, scrollHeight: 800, scrollTop: 0 });
    uninstall = installOverlayScrollbars(host);
    await frames();

    const [thumb] = thumbs("y");
    setMetrics(thumb!, { offsetHeight: 50 });
    thumb!.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientY: 10 }),
    );
    expect(thumb!.hasAttribute("data-dragging")).toBe(true);
    thumb!.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientY: 40 }));
    // 30 px of a 150 px track covers 30 / 150 of the 600 px overflow.
    expect(scroller.scrollTop).toBe(120);
    thumb!.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(thumb!.hasAttribute("data-dragging")).toBe(false);
  });

  it("removes its thumbs on cleanup", async () => {
    addScroller({});
    uninstall = installOverlayScrollbars(host);
    await frames();
    expect(thumbs("y")).toHaveLength(1);

    uninstall();
    uninstall = null;
    expect(thumbs()).toHaveLength(0);
  });
});
