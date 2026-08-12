import type { LinearUnit } from "../types/domain";

const MILLIMETRES_PER_UNIT: Record<LinearUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
};

export function toMillimetres(value: number, unit: LinearUnit): number {
  return value * MILLIMETRES_PER_UNIT[unit];
}

export function fromMillimetres(value: number, unit: LinearUnit): number {
  return value / MILLIMETRES_PER_UNIT[unit];
}

export function convertLinear(value: number, from: LinearUnit, to: LinearUnit): number {
  return fromMillimetres(toMillimetres(value, from), to);
}

export function fromSquareMillimetres(value: number, unit: LinearUnit): number {
  const divisor = MILLIMETRES_PER_UNIT[unit];
  return value / (divisor * divisor);
}

export function convertArea(value: number, from: LinearUnit, to: LinearUnit): number {
  const source = MILLIMETRES_PER_UNIT[from];
  const target = MILLIMETRES_PER_UNIT[to];
  return (value * source * source) / (target * target);
}
