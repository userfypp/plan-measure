import { localizeNumberString } from "./format";

const words = (list: string) => list.split(/\s+/).filter(Boolean);

/**
 * Active ISO 4217 currencies in circulation, sorted by code. To add one, insert its code here
 * and, if it does not use two decimals, in `FRACTION_DIGITS_EXCEPTIONS`.
 *
 * Left out on purpose: precious metals (XAU, XAG, XPT, XPD), funds and accounting units with no
 * circulating notes or coins (CLF, UYW, UYI, USN, BOV, CHE, CHW, COU, MXV, XDR, XSU, XUA, XBA-XBD),
 * the test code XTS, the "no currency" code XXX and currencies withdrawn from ISO 4217 (ANG, BGN,
 * CUC, HRK, SLL, ZWL). Saved projects are only checked for the code format (`isCurrencyCode`),
 * so projects with a code missing here still open.
 */
export const CURRENCY_CODES: readonly string[] = words(`
  AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF
  BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY
  COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD
  FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR
  ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW
  KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK
  MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR
  NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF
  SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP
  SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU
  UZS VED VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW
  ZWG
`);

/**
 * Currencies with a number of decimals other than two. They follow CLDR (what `Intl` reports),
 * which rounds some currencies to whole units where ISO 4217 lists minor units nobody uses
 * (e.g. HUF, IDR, IQD). No active currency outside the excluded funds uses four decimals.
 */
const FRACTION_DIGITS_EXCEPTIONS: readonly (readonly [number, readonly string[]])[] = [
  [
    0,
    words(`
    AFN ALL BIF CLP COP DJF GNF HUF IDR IQD IRR ISK JPY KMF
    KPW KRW LAK LBP MGA MMK PKR PYG RWF SOS SYP UGX VND VUV
    XAF XOF XPF YER
  `),
  ],
  [3, words("BHD JOD KWD LYD OMR TND")],
];

/** Decimals of a currency; codes that are not in the registry use two. */
export function currencyFractionDigits(code: string): number {
  return FRACTION_DIGITS_EXCEPTIONS.find(([, codes]) => codes.includes(code))?.[0] ?? 2;
}

export function isKnownCurrency(code: string): boolean {
  return CURRENCY_CODES.includes(code);
}

/** The registry for a currency picker: English names, sorted by name. */
export function currencyOptions(): { code: string; name: string }[] {
  const names = new Intl.DisplayNames("en", { type: "currency", fallback: "code" });
  return CURRENCY_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort(
    (left, right) => left.name.localeCompare(right.name, "en"),
  );
}

function formatAmount(value: number, digits: number, code: string | null): string {
  const fixed = value.toFixed(digits);
  // A negative value that rounds to zero must not read as "-0.00".
  const amount = localizeNumberString(Number(fixed) === 0 ? fixed.replace("-", "") : fixed);
  return code === null ? amount : `${amount} ${code}`;
}

/**
 * A cost with the decimals of its currency and the app's separators, e.g. `1,234.50 EUR`.
 * Rounding happens only here, with `toFixed` like every other displayed number. Without a
 * currency there is no suffix and two decimals.
 */
export function formatCost(value: number, code: string | null): string {
  return formatAmount(value, code === null ? 2 : currencyFractionDigits(code), code);
}

/** `toFixed` takes up to 100 digits; a unit price never needs that many. */
const MAX_UNIT_PRICE_DECIMALS = 20;

/**
 * A unit price as the user typed it: the decimals of its currency at least, more when the amount
 * has them, so `0.004 EUR` per mm does not read as `0.00 EUR`.
 */
export function formatUnitPrice(amount: number, code: string | null): string {
  const [mantissa = "", exponent = "0"] = String(amount).split("e");
  const typed = (mantissa.split(".")[1]?.length ?? 0) - Number(exponent);
  const minimum = code === null ? 2 : currencyFractionDigits(code);
  return formatAmount(amount, Math.min(Math.max(minimum, typed), MAX_UNIT_PRICE_DECIMALS), code);
}
