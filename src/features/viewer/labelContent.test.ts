import { describe, expect, it } from "vitest";
import { composeLabelText } from "./labelContent";

describe("composeLabelText", () => {
  it("keeps the value alone by default and prefixes the name on request", () => {
    expect(composeLabelText("12.50 m", "Wall A", "value")).toBe("12.50 m");
    expect(composeLabelText("12.50 m", "Wall A", "name-value")).toBe("Wall A · 12.50 m");
  });

  it("ignores empty names", () => {
    expect(composeLabelText("3 items", "  ", "name-value")).toBe("3 items");
    expect(composeLabelText("3 items", undefined, "name-value")).toBe("3 items");
  });

  it("is identical without a classification", () => {
    expect(composeLabelText("12.50 m", "Wall A", "name-value", undefined)).toBe("Wall A · 12.50 m");
    expect(composeLabelText("12.50 m", "Wall A", "name-value", "")).toBe("Wall A · 12.50 m");
  });

  it("orders name, classification and value", () => {
    expect(composeLabelText("12.50 m", "Wall A", "name-value", "Electrical")).toBe(
      "Wall A · Electrical · 12.50 m",
    );
    expect(composeLabelText("12.50 m", "Wall A", "value", "Electrical")).toBe(
      "Electrical · 12.50 m",
    );
  });
});
