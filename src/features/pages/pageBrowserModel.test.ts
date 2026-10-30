import { describe, expect, it } from "vitest";
import { PAGE_OVERSCAN, PAGE_ROW_HEIGHT, pageWindow } from "./pageBrowserModel";

const ROW = PAGE_ROW_HEIGHT;

describe("pageWindow", () => {
  it("is empty for a document without pages", () => {
    expect(pageWindow(0, 0, 320)).toEqual({ start: 0, end: 0, first: 0, last: 0 });
    expect(pageWindow(0, 5 * ROW, 320)).toEqual({ start: 0, end: 0, first: 0, last: 0 });
  });

  it("shows the visible rows with overscan below the top of the list", () => {
    // 320 px shows rows 0 and 1; overscan adds two more below and none above.
    expect(pageWindow(100, 0, 2 * ROW)).toEqual({
      start: 0,
      end: 2 + PAGE_OVERSCAN,
      first: 0,
      last: 2,
    });
  });

  it("counts a partly visible row on both edges", () => {
    // Rows 10 (its lower half) to 12 (its upper half) are visible.
    expect(pageWindow(100, 10.5 * ROW, 2 * ROW)).toEqual({
      start: 10 - PAGE_OVERSCAN,
      end: 13 + PAGE_OVERSCAN,
      first: 10,
      last: 13,
    });
  });

  it("stays within the page count when scrolled beyond the end", () => {
    expect(pageWindow(5, 50 * ROW, 2 * ROW)).toEqual({
      start: 4 - PAGE_OVERSCAN,
      end: 5,
      first: 4,
      last: 5,
    });
  });

  it("treats a negative scroll position, as during elastic scrolling, as the top", () => {
    expect(pageWindow(100, -3 * ROW, 2 * ROW)).toEqual(pageWindow(100, 0, 2 * ROW));
    expect(pageWindow(100, -50 * ROW, 2 * ROW).last).toBe(2);
  });

  it("keeps 0 ≤ start ≤ first ≤ last ≤ end ≤ count for any position and size", () => {
    for (const count of [0, 1, 2, 3, 10, 500]) {
      for (const scrollTop of [-1000, -1, 0, 1, ROW - 1, ROW, 7.5 * ROW, count * ROW, 1e6]) {
        for (const height of [-10, 0, 1, ROW, 320, 5000]) {
          const { start, first, last, end } = pageWindow(count, scrollTop, height);
          const context = `count ${count}, scrollTop ${scrollTop}, height ${height}`;
          expect(0, context).toBeLessThanOrEqual(start);
          expect(start, context).toBeLessThanOrEqual(first);
          expect(first, context).toBeLessThanOrEqual(last);
          expect(last, context).toBeLessThanOrEqual(end);
          expect(end, context).toBeLessThanOrEqual(count);
        }
      }
    }
  });
});
