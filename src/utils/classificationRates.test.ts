import { describe, expect, it } from "vitest";
import type { ClassificationValueRates } from "../types/domain";
import {
  canonicalRates,
  hasValidRates,
  isCurrencyCode,
  isValidDerivation,
  isValidPrice,
  priceUnitsFor,
  ratesByValueId,
} from "./classificationRates";

const length = { source: "length", factorMm: 2700 } as const;
const area = { source: "area", factorMm: 150 } as const;

describe("ratesByValueId", () => {
  it("indexes the entries by value ID and reuses the index for the same array", () => {
    const rates: ClassificationValueRates[] = [
      { valueId: "wall", derivation: length, price: null },
      { valueId: "slab", derivation: area, price: null },
    ];

    const byId = ratesByValueId(rates);

    expect(byId.get("slab")).toBe(rates[1]);
    expect(byId.get("gone")).toBeUndefined();
    expect(ratesByValueId(rates)).toBe(byId);
    expect(ratesByValueId([...rates])).not.toBe(byId);
  });
});

describe("isCurrencyCode", () => {
  it.each(["EUR", "USD", "XYZ"])("accepts %j", (value) => {
    expect(isCurrencyCode(value)).toBe(true);
  });

  it.each(["eur", "Eur", "EURO", "EU", "", "€", " EUR", "EUR\n", "E1R", null, undefined, 978])(
    "rejects %j",
    (value) => {
      expect(isCurrencyCode(value)).toBe(false);
    },
  );
});

describe("isValidDerivation", () => {
  it.each([length, area, { source: "perimeter", factorMm: 0.001 }])("accepts %j", (value) => {
    expect(isValidDerivation(value)).toBe(true);
  });

  it.each([
    null,
    "length",
    [],
    { source: "length" },
    { factorMm: 2700 },
    { source: "count", factorMm: 2700 },
    { source: "volume", factorMm: 2700 },
    { source: "length", factorMm: 0 },
    { source: "length", factorMm: -1 },
    { source: "length", factorMm: "2700" },
    { source: "length", factorMm: Infinity },
    { source: "length", factorMm: NaN },
  ])("rejects %j", (value) => {
    expect(isValidDerivation(value)).toBe(false);
  });
});

describe("priceUnitsFor", () => {
  it("offers linear units for length and perimeter, square units and acres for area", () => {
    const linear = ["mm", "cm", "m", "in", "ft"];
    expect(priceUnitsFor("length", null)).toEqual(linear);
    expect(priceUnitsFor("perimeter", length)).toEqual(linear);
    expect(priceUnitsFor("area", null)).toEqual(["mm²", "cm²", "m²", "in²", "ft²", "ac"]);
  });

  it("offers each for counts", () => {
    expect(priceUnitsFor("count", null)).toEqual(["each"]);
  });

  it("follows the derivation for derived prices", () => {
    expect(priceUnitsFor("derived", length)).toEqual(["mm²", "cm²", "m²", "in²", "ft²"]);
    expect(priceUnitsFor("derived", { source: "perimeter", factorMm: 1 })).toEqual([
      "mm²",
      "cm²",
      "m²",
      "in²",
      "ft²",
    ]);
    expect(priceUnitsFor("derived", area)).toEqual(["mm³", "cm³", "m³", "in³", "ft³"]);
    expect(priceUnitsFor("derived", null)).toEqual([]);
  });
});

describe("isValidPrice", () => {
  it.each([
    [{ amount: 25, basis: "derived", unit: "m²" }, length],
    [{ amount: 110, basis: "derived", unit: "m³" }, area],
    [{ amount: 0, basis: "area", unit: "ac" }, null],
    [{ amount: 12.5, basis: "count", unit: "each" }, null],
    [{ amount: 3, basis: "perimeter", unit: "ft" }, length],
  ])("accepts %j", (price, derivation) => {
    expect(isValidPrice(price, derivation)).toBe(true);
  });

  it.each([
    [null, null],
    [{ amount: -0.01, basis: "length", unit: "m" }, null],
    [{ amount: "25", basis: "length", unit: "m" }, null],
    [{ amount: Infinity, basis: "length", unit: "m" }, null],
    [{ amount: 1, basis: "volume", unit: "m³" }, area],
    [{ amount: 1, basis: "area", unit: "m" }, null],
    [{ amount: 1, basis: "length", unit: "each" }, null],
    [{ amount: 1, basis: "length", unit: "ac" }, null],
    [{ amount: 1, basis: "derived", unit: "m³" }, length],
    [{ amount: 1, basis: "derived", unit: "m²" }, area],
    [{ amount: 1, basis: "derived", unit: "m²" }, null],
  ])("rejects %j", (price, derivation) => {
    expect(isValidPrice(price, derivation)).toBe(false);
  });
});

describe("hasValidRates", () => {
  const price = { amount: 25, basis: "derived", unit: "m²" };

  it("needs at least one valid part, and a price that fits the derivation", () => {
    expect(hasValidRates(length, null)).toBe(true);
    expect(hasValidRates(null, { amount: 1, basis: "count", unit: "each" })).toBe(true);
    expect(hasValidRates(length, price)).toBe(true);
    expect(hasValidRates(null, null)).toBe(false);
    expect(hasValidRates(undefined, price)).toBe(false);
    expect(hasValidRates(null, price)).toBe(false);
    expect(hasValidRates(area, price)).toBe(false);
    expect(hasValidRates({ source: "length", factorMm: 0 }, null)).toBe(false);
  });
});

describe("canonicalRates", () => {
  it("keeps only the known keys in a fixed order and turns -0 into 0", () => {
    const entry = canonicalRates("wall", { factorMm: 2700, source: "length", extra: 1 } as never, {
      unit: "m²",
      basis: "derived",
      amount: -0,
    });

    expect(JSON.stringify(entry)).toBe(
      '{"valueId":"wall","derivation":{"source":"length","factorMm":2700},"price":{"amount":0,"basis":"derived","unit":"m²"}}',
    );
    expect(Object.is(entry.price!.amount, 0)).toBe(true);
    expect(canonicalRates("wall", null, null)).toEqual({
      valueId: "wall",
      derivation: null,
      price: null,
    });
  });
});
