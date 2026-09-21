import { describe, expect, it } from "vitest";
import {
  decidePageLabelOverride,
  effectivePageLabel,
  isValidCustomPageLabel,
  normalizeCustomPageLabel,
  sourcePageLabel,
} from "./pageLabels";

describe("page labels", () => {
  it("resolves override before source PDF label before empty", () => {
    expect(effectivePageLabel(1, { 1: "Custom" }, ["PDF"])).toBe("Custom");
    expect(effectivePageLabel(1, {}, ["PDF"])).toBe("PDF");
    expect(effectivePageLabel(1, {}, null)).toBe("");
  });

  it("trims custom labels while preserving Unicode and case", () => {
    expect(normalizeCustomPageLabel("  Étage Δ  ")).toEqual({
      kind: "valid",
      value: "Étage Δ",
    });
    expect(normalizeCustomPageLabel("  aBc  ")).toEqual({ kind: "valid", value: "aBc" });
  });

  it("treats an empty trimmed custom label as reset", () => {
    expect(normalizeCustomPageLabel("   ")).toEqual({ kind: "reset" });
  });

  it.each([
    ...Array.from({ length: 0x20 }, (_, codePoint) => `A${String.fromCodePoint(codePoint)}B`),
    "A\u007fB",
  ])("rejects C0 and DEL control characters in %j", (label) => {
    expect(normalizeCustomPageLabel(label)).toEqual({ kind: "invalid" });
    expect(isValidCustomPageLabel(label)).toBe(false);
  });

  it.each(["A\u0085B", "A\u2028B", "A\u2029B"])(
    "accepts permitted Unicode separator %j",
    (label) => {
      expect(normalizeCustomPageLabel(label)).toEqual({ kind: "valid", value: label });
      expect(isValidCustomPageLabel(label)).toBe(true);
    },
  );

  it("preserves an empty source label as an existing source value", () => {
    expect(sourcePageLabel(1, [""])).toBe("");
    expect(sourcePageLabel(2, [""])).toBeNull();
    expect(effectivePageLabel(1, {}, [""])).toBe("");
  });

  it("does not trim or otherwise normalize source PDF labels", () => {
    expect(sourcePageLabel(1, [" A "])).toBe(" A ");
    expect(effectivePageLabel(1, {}, [" A "])).toBe(" A ");
  });

  it("does not normalize Unicode composition", () => {
    const decomposed = "e\u0301";
    const composed = "é";
    expect(decomposed).not.toBe(composed);
    expect(normalizeCustomPageLabel(decomposed)).toEqual({ kind: "valid", value: decomposed });
    expect(normalizeCustomPageLabel(composed)).toEqual({ kind: "valid", value: composed });
  });

  it("removes an override when the normalized custom value equals the source exactly", () => {
    expect(
      decidePageLabelOverride({
        draft: "  A-101  ",
        originalEffectiveLabel: "Custom",
        customPageLabel: "Custom",
        sourcePageLabel: "A-101",
      }),
    ).toEqual({ kind: "remove" });
    expect(
      decidePageLabelOverride({
        draft: "A-101",
        originalEffectiveLabel: "A-100",
        customPageLabel: null,
        sourcePageLabel: "A-101",
      }),
    ).toEqual({ kind: "unchanged" });
  });

  it("keeps an unchanged source draft as a semantic no-op before trimming", () => {
    expect(
      decidePageLabelOverride({
        draft: " A ",
        originalEffectiveLabel: " A ",
        customPageLabel: null,
        sourcePageLabel: " A ",
      }),
    ).toEqual({ kind: "unchanged" });
  });

  it("removes an existing override when the draft exactly matches an untrimmed source label", () => {
    expect(
      decidePageLabelOverride({
        draft: " A ",
        originalEffectiveLabel: "B",
        customPageLabel: "B",
        sourcePageLabel: " A ",
      }),
    ).toEqual({ kind: "remove" });
  });
});
