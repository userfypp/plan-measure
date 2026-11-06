import { describe, expect, it } from "vitest";
import type { ClassificationValueRates } from "../../types/domain";
import {
  ratesFullSummary,
  ratesShortSummary,
  type RatesSummaryContext,
} from "./classificationRatesSummary";

const metric: RatesSummaryContext = { unit: "m", decimalPlaces: 2, currency: "EUR" };

function rates(
  derivation: ClassificationValueRates["derivation"],
  price: ClassificationValueRates["price"],
): ClassificationValueRates {
  return { valueId: "value", derivation, price };
}

describe("classification rates summaries", () => {
  it("has nothing to say about a value without rules", () => {
    expect(ratesShortSummary(undefined, metric)).toBeUndefined();
    expect(ratesFullSummary(undefined, metric)).toBeUndefined();
    expect(ratesShortSummary(rates(null, null), metric)).toBeUndefined();
    expect(ratesFullSummary(rates(null, null), metric)).toBeUndefined();
  });

  it.each([
    ["length", "Area × 2.70 m", "Area from length × 2.70 m"],
    ["perimeter", "Area × 2.70 m", "Area from perimeter × 2.70 m"],
    ["area", "Volume × 2.70 m", "Volume from area × 2.70 m"],
  ] as const)("describes a derivation from %s", (source, short, full) => {
    const value = rates({ source, factorMm: 2700 }, null);
    expect(ratesShortSummary(value, metric)).toBe(short);
    expect(ratesFullSummary(value, metric)).toBe(full);
  });

  it.each([
    ["length", "m", "25.00 EUR/m", "25.00 EUR per m of length"],
    ["perimeter", "m", "25.00 EUR/m", "25.00 EUR per m of perimeter"],
    ["area", "m²", "25.00 EUR/m²", "25.00 EUR per m² of area"],
    ["count", "each", "25.00 EUR each", "25.00 EUR per counted item"],
  ] as const)("describes a price on the %s", (basis, unit, short, full) => {
    const value = rates(null, { amount: 25, basis, unit });
    expect(ratesShortSummary(value, metric)).toBe(short);
    expect(ratesFullSummary(value, metric)).toBe(full);
  });

  it("names the derived quantity a price multiplies", () => {
    const area = rates(
      { source: "perimeter", factorMm: 2700 },
      { amount: 25, basis: "derived", unit: "m²" },
    );
    expect(ratesShortSummary(area, metric)).toBe("Area × 2.70 m · 25.00 EUR/m²");
    expect(ratesFullSummary(area, metric)).toBe(
      "Area from perimeter × 2.70 m · 25.00 EUR per m² of derived area",
    );

    const volume = rates(
      { source: "area", factorMm: 200 },
      { amount: 140, basis: "derived", unit: "m³" },
    );
    expect(ratesShortSummary(volume, metric)).toBe("Volume × 0.20 m · 140.00 EUR/m³");
    expect(ratesFullSummary(volume, metric)).toBe(
      "Volume from area × 0.20 m · 140.00 EUR per m³ of derived volume",
    );
  });

  it("shows only the amount when the project has no currency", () => {
    const value = rates(null, { amount: 25, basis: "count", unit: "each" });
    const noCurrency = { ...metric, currency: null };
    expect(ratesShortSummary(value, noCurrency)).toBe("25.00 each");
    expect(ratesFullSummary(value, noCurrency)).toBe("25.00 per counted item");
  });

  it("uses the currency's own fraction digits", () => {
    const value = rates(null, { amount: 1500, basis: "area", unit: "m²" });
    expect(ratesShortSummary(value, { ...metric, currency: "JPY" })).toBe("1500 JPY/m²");
  });

  it("keeps the decimals of a unit price smaller than the currency's cent", () => {
    const value = rates(null, { amount: 0.004, basis: "length", unit: "mm" });
    expect(ratesShortSummary(value, metric)).toBe("0.004 EUR/mm");
    expect(ratesFullSummary(value, metric)).toBe("0.004 EUR per mm of length");
  });

  it("shows the factor in the project's unit with its decimal places", () => {
    const value = rates({ source: "length", factorMm: 2400 }, null);
    expect(ratesShortSummary(value, { ...metric, unit: "cm", decimalPlaces: 0 })).toBe(
      "Area × 240 cm",
    );
    expect(ratesShortSummary(value, { ...metric, unit: "mm", decimalPlaces: 1 })).toBe(
      "Area × 2400.0 mm",
    );
    expect(ratesShortSummary(value, { ...metric, decimalPlaces: 3 })).toBe("Area × 2.400 m");
  });

  it("converts the factor for feet and inches projects", () => {
    const value = rates(
      { source: "length", factorMm: 3048 },
      { amount: 10, basis: "derived", unit: "ft²" },
    );
    const feet: RatesSummaryContext = { unit: "ft", decimalPlaces: 2, currency: "USD" };
    expect(ratesShortSummary(value, feet)).toBe("Area × 10.00 ft · 10.00 USD/ft²");
    expect(ratesFullSummary(value, feet)).toBe(
      "Area from length × 10.00 ft · 10.00 USD per ft² of derived area",
    );
    expect(ratesShortSummary(value, { ...feet, unit: "in" })).toBe(
      "Area × 120.00 in · 10.00 USD/ft²",
    );
  });
});
