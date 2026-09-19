import type { LinearUnit } from "../types/domain";

interface UnitRatio {
  numeratorMm: number;
  denominator: number;
}

const UNIT_RATIOS: Record<LinearUnit, UnitRatio> = {
  mm: { numeratorMm: 1, denominator: 1 },
  cm: { numeratorMm: 10, denominator: 1 },
  m: { numeratorMm: 1000, denominator: 1 },
  in: { numeratorMm: 127, denominator: 5 },
  ft: { numeratorMm: 1524, denominator: 5 },
};

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

export function scaleByRatio(value: number, numerator: number, denominator: number): number {
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;

  if (reducedNumerator === reducedDenominator) return value;
  if (!Number.isFinite(value)) return (value * reducedNumerator) / reducedDenominator;
  if (value === 0) return value;

  if (Math.abs(value) <= Number.MAX_VALUE / reducedNumerator) {
    return (value * reducedNumerator) / reducedDenominator;
  }
  return (value / reducedDenominator) * reducedNumerator;
}

export function toMillimetres(value: number, unit: LinearUnit): number {
  const ratio = UNIT_RATIOS[unit];
  return scaleByRatio(value, ratio.numeratorMm, ratio.denominator);
}

export function fromMillimetres(value: number, unit: LinearUnit): number {
  const ratio = UNIT_RATIOS[unit];
  return scaleByRatio(value, ratio.denominator, ratio.numeratorMm);
}

export function convertLinear(value: number, from: LinearUnit, to: LinearUnit): number {
  const source = UNIT_RATIOS[from];
  const target = UNIT_RATIOS[to];
  return scaleByRatio(
    value,
    source.numeratorMm * target.denominator,
    source.denominator * target.numeratorMm,
  );
}

export function fromSquareMillimetres(value: number, unit: LinearUnit): number {
  const ratio = UNIT_RATIOS[unit];
  return scaleByRatio(
    value,
    ratio.denominator * ratio.denominator,
    ratio.numeratorMm * ratio.numeratorMm,
  );
}

export function convertArea(value: number, from: LinearUnit, to: LinearUnit): number {
  const source = UNIT_RATIOS[from];
  const target = UNIT_RATIOS[to];
  return scaleByRatio(
    value,
    source.numeratorMm *
      source.numeratorMm *
      target.denominator *
      target.denominator,
    source.denominator *
      source.denominator *
      target.numeratorMm *
      target.numeratorMm,
  );
}

export function fromSquareMillimetresToAcres(value: number): number {
  return scaleByRatio(value, 25, 43_560 * 1524 * 1524);
}
