import type {
  ClassificationValueDerivation,
  ClassificationValuePrice,
  ClassificationValueRates,
  LinearUnit,
  PriceBasis,
  PriceUnit,
} from "../types/domain";

const LINEAR_UNITS: readonly LinearUnit[] = ["mm", "cm", "m", "in", "ft"];
const SOURCES: readonly unknown[] = ["length", "perimeter", "area"];
const BASES: readonly unknown[] = ["length", "perimeter", "area", "count", "derived"];

const ratesByIdCache = new WeakMap<
  readonly ClassificationValueRates[],
  ReadonlyMap<string, ClassificationValueRates>
>();

/** Rates indexed by value ID, built once per array identity. */
export function ratesByValueId(
  rates: readonly ClassificationValueRates[],
): ReadonlyMap<string, ClassificationValueRates> {
  let byId = ratesByIdCache.get(rates);
  if (!byId) {
    byId = new Map(rates.map((entry) => [entry.valueId, entry]));
    ratesByIdCache.set(rates, byId);
  }
  return byId;
}

/** An ISO 4217 style currency code: three uppercase letters. Whether it is known is up to the UI. */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidDerivation(value: unknown): value is ClassificationValueDerivation {
  return (
    isRecord(value) &&
    SOURCES.includes(value.source) &&
    typeof value.factorMm === "number" &&
    Number.isFinite(value.factorMm) &&
    value.factorMm > 0
  );
}

/** Units a price of this basis can be quoted in; derived prices follow the derivation's source. */
export function priceUnitsFor(
  basis: PriceBasis,
  derivation: ClassificationValueDerivation | null,
): readonly PriceUnit[] {
  if (basis === "count") return ["each"];
  if (basis === "length" || basis === "perimeter") return LINEAR_UNITS;
  if (basis === "derived" && !derivation) return [];
  const power = basis === "derived" && derivation?.source === "area" ? "³" : "²";
  const units = LINEAR_UNITS.map((unit) => `${unit}${power}` as PriceUnit);
  return basis === "area" ? [...units, "ac"] : units;
}

export function isValidPrice(
  value: unknown,
  derivation: ClassificationValueDerivation | null,
): value is ClassificationValuePrice {
  return (
    isRecord(value) &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    BASES.includes(value.basis) &&
    priceUnitsFor(value.basis as PriceBasis, derivation).includes(value.unit as PriceUnit)
  );
}

/** A rates entry needs a valid derivation, a valid price, or both; never neither. */
export function hasValidRates(derivation: unknown, price: unknown): boolean {
  return (
    (derivation === null || isValidDerivation(derivation)) &&
    (price === null || isValidPrice(price, derivation as ClassificationValueDerivation | null)) &&
    (derivation !== null || price !== null)
  );
}

/** The entry as stored: fixed key order and no extra keys, with -0 turned into 0. */
export function canonicalRates(
  valueId: string,
  derivation: ClassificationValueDerivation | null,
  price: ClassificationValuePrice | null,
): ClassificationValueRates {
  return {
    valueId,
    derivation: derivation && { source: derivation.source, factorMm: derivation.factorMm },
    price: price && { amount: price.amount || 0, basis: price.basis, unit: price.unit },
  };
}
