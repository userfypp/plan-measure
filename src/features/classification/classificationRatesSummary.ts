import type {
  ClassificationValueDerivation,
  ClassificationValuePrice,
  ClassificationValueRates,
  LinearUnit,
  MeasurementDecimalPlaces,
} from "../../types/domain";
import { formatUnitPrice } from "../../utils/currencies";
import { formatDisplayNumber } from "../../utils/format";
import { fromMillimetres } from "../../utils/units";

export interface RatesSummaryContext {
  /** The project's linear unit (feet & inches resolve to feet). */
  unit: LinearUnit;
  decimalPlaces: MeasurementDecimalPlaces;
  /** The project's currency; without one only the amount is shown. */
  currency: string | null;
}

const DERIVATION_TEXT: Record<ClassificationValueDerivation["source"], string> = {
  length: "Area from length",
  perimeter: "Area from perimeter",
  area: "Volume from area",
};

function derivedKind(derivation: ClassificationValueDerivation | null): "area" | "volume" {
  return derivation?.source === "area" ? "volume" : "area";
}

function factorText(derivation: ClassificationValueDerivation, context: RatesSummaryContext) {
  const factor = formatDisplayNumber(
    fromMillimetres(derivation.factorMm, context.unit),
    context.decimalPlaces,
  );
  return `${factor} ${context.unit}`;
}

function amountText(price: ClassificationValuePrice, context: RatesSummaryContext) {
  return formatUnitPrice(price.amount, context.currency);
}

function join(parts: Array<string | false | null | undefined>): string | undefined {
  const present = parts.filter(Boolean);
  return present.length > 0 ? present.join(" · ") : undefined;
}

/** `Area × 2.70 m · 25.00 EUR/m²`, short enough for a row; undefined when the value has no rule. */
export function ratesShortSummary(
  rates: ClassificationValueRates | undefined,
  context: RatesSummaryContext,
): string | undefined {
  const { derivation, price } = rates ?? { derivation: null, price: null };
  return join([
    derivation &&
      `${derivedKind(derivation) === "area" ? "Area" : "Volume"} × ${factorText(derivation, context)}`,
    price &&
      (price.unit === "each"
        ? `${amountText(price, context)} each`
        : `${amountText(price, context)}/${price.unit}`),
  ]);
}

/** What the price multiplies, worded after "of". */
function basisText(
  price: ClassificationValuePrice,
  derivation: ClassificationValueDerivation | null,
): string {
  return price.basis === "derived" ? `derived ${derivedKind(derivation)}` : price.basis;
}

/** `Area from perimeter × 2.70 m · 25.00 EUR per m² of derived area`; undefined without a rule. */
export function ratesFullSummary(
  rates: ClassificationValueRates | undefined,
  context: RatesSummaryContext,
): string | undefined {
  const { derivation, price } = rates ?? { derivation: null, price: null };
  return join([
    derivation && `${DERIVATION_TEXT[derivation.source]} × ${factorText(derivation, context)}`,
    price &&
      (price.basis === "count"
        ? `${amountText(price, context)} per counted item`
        : `${amountText(price, context)} per ${price.unit} of ${basisText(price, derivation)}`),
  ]);
}
