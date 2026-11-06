import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAppPreferences, setAppPreference } from "./appPreferences";
import {
  CURRENCY_CODES,
  currencyFractionDigits,
  currencyOptions,
  formatCost,
  formatUnitPrice,
  isKnownCurrency,
} from "./currencies";

// Codes ICU knows that the registry leaves out on purpose (see the header of currencies.ts):
// currencies withdrawn from ISO 4217 and units of account. Any other code ICU adds must be
// either added to the registry or listed here after deciding it does not belong.
const EXCLUDED_ICU_CODES = ["ANG", "BGN", "CUC", "HRK", "SLL", "XDR", "XSU", "ZWL"];

afterEach(() => {
  resetAppPreferences();
});

describe("currency registry", () => {
  it("lists unique three-letter uppercase codes sorted by code", () => {
    expect(CURRENCY_CODES.every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
    expect(CURRENCY_CODES).toEqual([...CURRENCY_CODES].sort());
  });

  it("contains only codes Intl.NumberFormat accepts, with the decimals Intl reports", () => {
    for (const code of CURRENCY_CODES) {
      const { minimumFractionDigits, maximumFractionDigits } = new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
      }).resolvedOptions();
      expect([code, currencyFractionDigits(code)]).toEqual([code, maximumFractionDigits]);
      expect([code, currencyFractionDigits(code)]).toEqual([code, minimumFractionDigits]);
    }
  });

  it("covers every currency ICU supports unless it is explicitly excluded", () => {
    const missing = Intl.supportedValuesOf("currency").filter(
      (code) => !CURRENCY_CODES.includes(code) && !EXCLUDED_ICU_CODES.includes(code),
    );
    expect(
      missing,
      `ICU supports currencies missing from the registry: add them to src/utils/currencies.ts, or to EXCLUDED_ICU_CODES in this test if they do not belong: ${missing.join(", ")}`,
    ).toEqual([]);
    expect(EXCLUDED_ICU_CODES.filter((code) => CURRENCY_CODES.includes(code))).toEqual([]);
  });

  it("includes the common currencies and rejects funds, metals and made-up codes", () => {
    for (const code of ["EUR", "USD", "GBP", "JPY", "KWD", "CHF", "MXN", "VED", "XOF"]) {
      expect(isKnownCurrency(code)).toBe(true);
    }
    for (const code of ["CLF", "XAU", "XXX", "XTS", "ABC", "eur", ""]) {
      expect(isKnownCurrency(code)).toBe(false);
    }
  });

  it("gives whole units to JPY and KRW, three decimals to KWD and BHD, and two to the rest", () => {
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("KRW")).toBe(0);
    expect(currencyFractionDigits("KWD")).toBe(3);
    expect(currencyFractionDigits("BHD")).toBe(3);
    expect(currencyFractionDigits("EUR")).toBe(2);
    expect(currencyFractionDigits("USD")).toBe(2);
  });

  it("uses two decimals for a code that is not in the registry", () => {
    expect(currencyFractionDigits("ABC")).toBe(2);
  });
});

describe("currencyOptions", () => {
  it("offers every registry code once with its English name, sorted by name", () => {
    const options = currencyOptions();

    expect(options.map((option) => option.code).sort()).toEqual([...CURRENCY_CODES]);
    expect(options.find((option) => option.code === "EUR")).toEqual({
      code: "EUR",
      name: "Euro",
    });
    expect(options.find((option) => option.code === "JPY")?.name).toBe("Japanese Yen");
    const names = options.map((option) => option.name);
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right, "en")));
  });

  it("falls back to the code when Intl has no name for it", () => {
    vi.spyOn(Intl, "DisplayNames").mockImplementation(function () {
      return { of: () => undefined };
    } as never);

    const options = currencyOptions();

    expect(options.map((option) => option.name)).toEqual([...CURRENCY_CODES]);
  });
});

describe("formatCost", () => {
  it("shows the amount with the decimals of the currency followed by its code", () => {
    expect(formatCost(1234.5, "EUR")).toBe("1234.50 EUR");
    expect(formatCost(1234.5, "JPY")).toBe("1235 JPY");
    expect(formatCost(1234.5678, "KWD")).toBe("1234.568 KWD");
    expect(formatCost(7, "USD")).toBe("7.00 USD");
  });

  it("uses the thousands and decimal separators of the app", () => {
    setAppPreference("thousandsSeparator", "comma");
    expect(formatCost(1234.5, "EUR")).toBe("1,234.50 EUR");
    expect(formatCost(1173.75, "EUR")).toBe("1,173.75 EUR");
    expect(formatCost(1234567, "JPY")).toBe("1,234,567 JPY");
    expect(formatCost(999.5, "EUR")).toBe("999.50 EUR");
    setAppPreference("thousandsSeparator", "point");
    setAppPreference("decimalSeparator", "comma");
    expect(formatCost(1234567.891, "EUR")).toBe("1.234.567,89 EUR");
  });

  it("rounds half up at the last decimal like the other displayed numbers", () => {
    expect(formatCost(12.345, "EUR")).toBe("12.35 EUR");
    expect(formatCost(0.125, "EUR")).toBe("0.13 EUR");
    expect(formatCost(2.5, "JPY")).toBe("3 JPY");
    expect(formatCost(0.0005, "KWD")).toBe("0.001 KWD");
    // 1.005 is stored as 1.00499999999999989..., so it shows 1.00 like toFixed everywhere else.
    expect(formatCost(1.005, "EUR")).toBe("1.00 EUR");
    // 0.005 is stored as 0.00500000000000000010... and 0.015 as 0.01499999999999999944...
    expect(formatCost(0.005, "EUR")).toBe("0.01 EUR");
    expect(formatCost(0.015, "EUR")).toBe("0.01 EUR");
  });

  it("keeps the decimals of the currency for tiny values instead of revealing more", () => {
    expect(formatCost(0.004, "EUR")).toBe("0.00 EUR");
    expect(formatCost(0.4, "JPY")).toBe("0 JPY");
  });

  it("shows zero and negative values", () => {
    setAppPreference("thousandsSeparator", "comma");
    expect(formatCost(0, "EUR")).toBe("0.00 EUR");
    expect(formatCost(0, "JPY")).toBe("0 JPY");
    expect(formatCost(-1234.5, "EUR")).toBe("-1,234.50 EUR");
    expect(formatCost(-0.001, "EUR")).toBe("0.00 EUR");
    expect(formatCost(-0, "EUR")).toBe("0.00 EUR");
  });

  it("has no suffix and two decimals without a currency", () => {
    expect(formatCost(1234.5, null)).toBe("1234.50");
    setAppPreference("thousandsSeparator", "comma");
    expect(formatCost(1234.5, null)).toBe("1,234.50");
    expect(formatCost(0, null)).toBe("0.00");
  });

  it("uses two decimals for a currency that is not in the registry", () => {
    expect(formatCost(5, "ABC")).toBe("5.00 ABC");
  });
});

describe("formatUnitPrice", () => {
  it("shows at least the decimals of the currency, like a cost", () => {
    expect(formatUnitPrice(25, "EUR")).toBe("25.00 EUR");
    expect(formatUnitPrice(1500, "JPY")).toBe("1500 JPY");
    expect(formatUnitPrice(1.5, "KWD")).toBe("1.500 KWD");
    expect(formatUnitPrice(12.5, null)).toBe("12.50");
  });

  it("shows every decimal the amount has when the currency's are not enough", () => {
    expect(formatUnitPrice(0.004, "EUR")).toBe("0.004 EUR");
    expect(formatUnitPrice(0.5, "JPY")).toBe("0.5 JPY");
    expect(formatUnitPrice(12.3456, "EUR")).toBe("12.3456 EUR");
    expect(formatUnitPrice(0.00123, null)).toBe("0.00123");
    expect(formatUnitPrice(1234.56789012, "EUR")).toBe("1234.56789012 EUR");
    expect(formatUnitPrice(0.000001, "KWD")).toBe("0.000001 KWD");
  });

  it("reads exponent notation as the decimals it stands for", () => {
    expect(formatUnitPrice(1e-7, "EUR")).toBe("0.0000001 EUR");
    expect(formatUnitPrice(1.5e-7, "EUR")).toBe("0.00000015 EUR");
  });

  it("stops at a fixed number of decimals for an amount nobody types", () => {
    expect(formatUnitPrice(1e-300, "EUR")).toBe(`0.${"0".repeat(20)} EUR`);
  });

  it("uses the thousands and decimal separators of the app", () => {
    setAppPreference("thousandsSeparator", "comma");
    expect(formatUnitPrice(1234.5678, "EUR")).toBe("1,234.5678 EUR");
    setAppPreference("thousandsSeparator", "point");
    setAppPreference("decimalSeparator", "comma");
    expect(formatUnitPrice(0.004, "EUR")).toBe("0,004 EUR");
  });

  it("shows zero without a sign", () => {
    expect(formatUnitPrice(0, "EUR")).toBe("0.00 EUR");
    expect(formatUnitPrice(-0, "EUR")).toBe("0.00 EUR");
  });
});
