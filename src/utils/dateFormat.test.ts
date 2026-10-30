import { describe, expect, it } from "vitest";
import { formatSavedDate } from "./dateFormat";

describe("formatSavedDate", () => {
  const stamp = new Date(2026, 9, 12, 14, 30).getTime();

  it("uses the medium date style by default, as before", () => {
    expect(formatSavedDate(stamp, "medium")).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(stamp),
    );
  });

  it("offers a short style and one with the time", () => {
    expect(formatSavedDate(stamp, "short")).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: "short" }).format(stamp),
    );
    expect(formatSavedDate(stamp, "with-time").length).toBeGreaterThan(
      formatSavedDate(stamp, "medium").length,
    );
  });

  it.each(["short", "medium", "with-time"] as const)(
    "throws a RangeError for an invalid timestamp in the %s format",
    (format) => {
      expect(() => formatSavedDate(NaN, format)).toThrow(RangeError);
    },
  );

  it("falls back to the locale's default date for an unknown format", () => {
    const format = "unknown" as unknown as Parameters<typeof formatSavedDate>[1];
    expect(formatSavedDate(stamp, format)).toBe(new Intl.DateTimeFormat().format(stamp));
  });
});
