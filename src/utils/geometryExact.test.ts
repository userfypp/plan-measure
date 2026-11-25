import { describe, expect, it } from "vitest";
import type { Point } from "../types/domain";
import { isPointStrictlyInsidePolygon, polygonAreaPageUnitsSquared } from "./geometry";

// Coordinates are integers scaled by 2^-SCALE_BITS, so every one is an exact double and the
// reference below works on the integers alone, independently of the code under test.
const SCALE_BITS = 20;
const SCALE = 2 ** SCALE_BITS;

interface ExactPoint {
  x: bigint;
  y: bigint;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

function integer(next: () => number, bits: number): bigint {
  // Two draws give up to 52 bits; the sign is a third.
  const high = BigInt(Math.floor(next() * 2 ** 26));
  const low = BigInt(Math.floor(next() * 2 ** 26));
  const value = ((high << 26n) | low) >> BigInt(52 - bits);
  return next() < 0.5 ? -value : value;
}

const toPoint = ({ x, y }: ExactPoint): Point => ({ x: Number(x) / SCALE, y: Number(y) / SCALE });

function exactCross(a: ExactPoint, b: ExactPoint, c: ExactPoint): bigint {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Twice the area, in units of 2^(-2 * SCALE_BITS). */
function exactDoubledArea(points: ExactPoint[]): bigint {
  let sum = 0n;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    sum += a.x * b.y - a.y * b.x;
  }
  return sum < 0n ? -sum : sum;
}

/** The area as the nearest double: the integer part and the remainder are each exact enough. */
function exactAreaAsNumber(doubled: bigint): number {
  const unit = 2n ** BigInt(2 * SCALE_BITS + 1);
  return Number(doubled / unit) + Number(doubled % unit) / Number(unit);
}

/** A point on the line a→b, nudged by -1, 0 or +1 grid steps across it. */
function nearLine(next: () => number, a: ExactPoint, b: ExactPoint): ExactPoint {
  const step = BigInt(Math.floor(next() * 7) - 3);
  const nudge = BigInt(Math.floor(next() * 3) - 1);
  return { x: a.x + step * (b.x - a.x) + nudge, y: a.y + step * (b.y - a.y) };
}

describe("geometry against an exact integer reference", () => {
  it("returns the polygon area within its rounding bound of the exact value", () => {
    const next = random(377);
    for (let trial = 0; trial < 2_000; trial += 1) {
      const bits = 8 + Math.floor(next() * 44);
      const count = 3 + Math.floor(next() * 8);
      const exact: ExactPoint[] = Array.from({ length: count }, () => ({
        x: integer(next, bits),
        y: integer(next, bits),
      }));
      // Half the trials make the last point almost collinear with two others.
      if (count > 3 && next() < 0.5) exact[count - 1] = nearLine(next, exact[0]!, exact[1]!);
      const expected = exactAreaAsNumber(exactDoubledArea(exact));
      const actual = polygonAreaPageUnitsSquared(exact.map(toPoint));
      if (expected === 0) {
        expect(actual, `trial ${trial}`).toBe(0);
        continue;
      }
      // The fast path keeps the sign and an error within a few roundings of the largest products,
      // so a sliver far from the origin may lose relative precision but never its magnitude.
      const largest =
        Math.max(...exact.flatMap(({ x, y }) => [Math.abs(Number(x)), Math.abs(Number(y))])) /
        SCALE;
      const bound = 8 * count * Number.EPSILON * largest * largest;
      expect(Math.abs(actual - expected), `trial ${trial}`).toBeLessThanOrEqual(bound);
      expect(Math.abs(actual - expected), `trial ${trial}`).toBeLessThan(expected);
      // At page scale (under 2^16 units from the origin) the result is accurate to 1e-12.
      if (largest < 2 ** 16 && expected > 1)
        expect(Math.abs(actual - expected) / expected, `trial ${trial}`).toBeLessThan(1e-12);
    }
  });

  it("returns exactly zero for collinear and repeated points", () => {
    const next = random(3770);
    for (let trial = 0; trial < 500; trial += 1) {
      const a = { x: integer(next, 50), y: integer(next, 50) };
      const direction = { x: integer(next, 8), y: integer(next, 8) };
      const points = [0n, 1n, 3n, -2n].map((step) => ({
        x: a.x + step * direction.x,
        y: a.y + step * direction.y,
      }));
      expect(polygonAreaPageUnitsSquared(points.map(toPoint)), `trial ${trial}`).toBe(0);
    }
  });

  it("returns the exact area when large triangle areas cancel to one grid step", () => {
    const next = random(37701);
    let checked = 0;
    for (let trial = 0; trial < 500; trial += 1) {
      const a = { x: integer(next, 44), y: integer(next, 44) };
      const u = { x: integer(next, 40), y: integer(next, 40) };
      const w = { x: integer(next, 40), y: integer(next, 40) };
      const v = almostParallel({ x: u.x + w.x, y: u.y + w.y });
      if (!v) continue;
      // Twice the area is cross(u, w) + cross(u + w, u + v) - cross(u, w) = cross(u + w, v) = ±1.
      const polygon = [
        a,
        { x: a.x + u.x, y: a.y + u.y },
        { x: a.x + u.x + w.x, y: a.y + u.y + w.y },
        { x: a.x + u.x + v.x, y: a.y + u.y + v.y },
      ];
      const doubled = exactDoubledArea(polygon);
      expect(doubled).toBe(1n);
      checked += 1;
      expect(polygonAreaPageUnitsSquared(polygon.map(toPoint)), `trial ${trial}`).toBe(
        exactAreaAsNumber(doubled),
      );
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("decides orientation exactly for points a single grid step from a triangle edge", () => {
    const next = random(37700);
    let checked = 0;
    for (let trial = 0; trial < 2_000; trial += 1) {
      // u is a long edge; v is almost parallel to it with cross(u, v) = ±1 grid step², the
      // smallest nonzero turn, far below what the doubles' products can resolve.
      const u = { x: integer(next, 40), y: integer(next, 40) };
      const v = almostParallel(u);
      if (!v) continue;
      const a = { x: integer(next, 44), y: integer(next, 44) };
      const b = { x: a.x + 2n * u.x, y: a.y + 2n * u.y };
      // The third corner is well to the left of a→b.
      const c = { x: a.x + u.x - 4n * u.y, y: a.y + u.y + 4n * u.x };
      const triangle = [a, b, c];
      for (const offset of [v, { x: -v.x, y: -v.y }, u]) {
        const point = { x: a.x + offset.x, y: a.y + offset.y };
        const turns = [0, 1, 2].map((index) =>
          exactCross(triangle[index]!, triangle[(index + 1) % 3]!, point),
        );
        const inside = turns.every((turn) => turn > 0n);
        checked += 1;
        expect(
          isPointStrictlyInsidePolygon(toPoint(point), triangle.map(toPoint)),
          `trial ${trial}`,
        ).toBe(inside);
      }
    }
    expect(checked).toBeGreaterThan(1_000);
  });
});

/** A vector v with cross(u, v) = ±1 and 0 < dot(u, v) < |u|², from the extended Euclidean algorithm. */
function almostParallel(u: ExactPoint): ExactPoint | null {
  // Solve u.x * s - u.y * r = 1 for (r, s).
  let [oldR, r] = [u.x, u.y];
  let [oldS, s] = [1n, 0n];
  let [oldT, t] = [0n, 1n];
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
    [oldT, t] = [t, oldT - quotient * t];
  }
  if (oldR !== 1n && oldR !== -1n) return null;
  // u.x * oldS + u.y * oldT = gcd, so v = (-oldT, oldS) gives cross(u, v) = ±1.
  let v = { x: -oldT, y: oldS };
  const length = u.x * u.x + u.y * u.y;
  const dot = () => u.x * v.x + u.y * v.y;
  // Slide v along u until it lies over the edge's first half.
  const shift = -dot() / length;
  v = { x: v.x + shift * u.x, y: v.y + shift * u.y };
  while (dot() <= 0n) v = { x: v.x + u.x, y: v.y + u.y };
  return v;
}
