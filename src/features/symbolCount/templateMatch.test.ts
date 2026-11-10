import { describe, expect, it } from "vitest";
import { findSymbolMatches, type GrayImage, type SymbolMatch } from "./templateMatch";

/** Supersampling factor: shapes are drawn 3x larger and averaged down, like an antialiased raster. */
const SS = 3;
const SYMBOL = 24;

type Orientation = { turns: 0 | 1 | 2 | 3; mirrored: boolean };

class Sheet {
  readonly width: number;
  readonly height: number;
  private readonly ink: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.ink = new Uint8Array(width * SS * height * SS);
  }

  /** Marks a supersampled pixel as inked. */
  private dot(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width * SS || y >= this.height * SS) return;
    this.ink[y * this.width * SS + x] = 1;
  }

  /** A one-pixel-wide stroke between two points given in supersampled units. */
  private stroke(x0: number, y0: number, x1: number, y1: number) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(x0 + ((x1 - x0) * step) / steps);
      const y = Math.round(y0 + ((y1 - y0) * step) / steps);
      for (let dy = 0; dy < SS; dy += 1)
        for (let dx = 0; dx < SS; dx += 1) this.dot(x + dx, y + dy);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number) {
    this.stroke(x0 * SS, y0 * SS, x1 * SS, y1 * SS);
  }

  /**
   * A door: leaf and swing arc. It has no symmetry, so each orientation is distinct.
   * `thirdsX`/`thirdsY` shift it by thirds of a pixel to exercise antialiasing phases.
   */
  door(left: number, top: number, orientation: Orientation, thirdsX = 0, thirdsY = 0) {
    const size = SYMBOL * SS;
    const place = (u: number, v: number): [number, number] => {
      let x = orientation.mirrored ? size - 1 - u : u;
      let y = v;
      for (let turn = 0; turn < orientation.turns; turn += 1) [x, y] = [size - 1 - y, x];
      return [left * SS + thirdsX + x, top * SS + thirdsY + y];
    };
    const segment = (u0: number, v0: number, u1: number, v1: number) => {
      const [x0, y0] = place(u0, v0);
      const [x1, y1] = place(u1, v1);
      this.stroke(x0, y0, x1, y1);
    };
    const reach = size - 2 * SS;
    segment(SS, SS, SS, reach);
    for (let step = 0; step < 24; step += 1) {
      const a0 = (Math.PI / 2) * (step / 24);
      const a1 = (Math.PI / 2) * ((step + 1) / 24);
      const radius = reach - SS;
      segment(
        SS + Math.round(radius * Math.sin(a0)),
        reach - Math.round(radius * Math.cos(a0)),
        SS + Math.round(radius * Math.sin(a1)),
        reach - Math.round(radius * Math.cos(a1)),
      );
    }
  }

  square(left: number, top: number, size: number) {
    this.line(left, top, left + size, top);
    this.line(left + size, top, left + size, top + size);
    this.line(left + size, top + size, left, top + size);
    this.line(left, top + size, left, top);
  }

  /** A symbol with full quarter-turn and mirror symmetry. */
  crossedSquare(left: number, top: number, size: number) {
    this.square(left, top, size);
    this.line(left, top, left + size, top + size);
    this.line(left + size, top, left, top + size);
  }

  image(): GrayImage {
    const data = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        let covered = 0;
        for (let dy = 0; dy < SS; dy += 1) {
          for (let dx = 0; dx < SS; dx += 1) {
            covered += this.ink[(y * SS + dy) * this.width * SS + x * SS + dx]!;
          }
        }
        data[y * this.width + x] = 255 - Math.round((covered * 255) / (SS * SS));
      }
    }
    return { data, width: this.width, height: this.height };
  }
}

const upright: Orientation = { turns: 0, mirrored: false };

function near(
  matches: SymbolMatch[],
  left: number,
  top: number,
  tolerance = 2,
): SymbolMatch | undefined {
  const x = left + SYMBOL / 2;
  const y = top + SYMBOL / 2;
  return matches.find(
    (match) => Math.abs(match.x - x) <= tolerance && Math.abs(match.y - y) <= tolerance,
  );
}

/** A plan fragment: walls, doors in several places and phases, and shapes that are not doors. */
function plan() {
  const sheet = new Sheet(420, 300);
  sheet.line(10, 150, 410, 150);
  sheet.line(210, 10, 210, 290);
  sheet.line(10, 10, 410, 10);
  const uprightDoors: Array<[number, number, number, number]> = [
    [30, 30, 0, 0],
    [121, 47, 1, 0],
    [263, 81, 2, 1],
    [340, 200, 1, 2],
    [77, 233, 0, 1],
  ];
  for (const [left, top, thirdsX, thirdsY] of uprightDoors) {
    sheet.door(left, top, upright, thirdsX, thirdsY);
  }
  const turnedDoors: Array<[number, number, Orientation]> = [
    [150, 190, { turns: 1, mirrored: false }],
    [250, 180, { turns: 2, mirrored: false }],
    [300, 30, { turns: 3, mirrored: false }],
    [30, 90, { turns: 0, mirrored: true }],
    [360, 100, { turns: 1, mirrored: true }],
  ];
  for (const [left, top, orientation] of turnedDoors) sheet.door(left, top, orientation, 1, 1);
  sheet.square(170, 90, 22);
  sheet.crossedSquare(230, 240, 20);
  sheet.crossedSquare(120, 110, 20);
  return { image: sheet.image(), uprightDoors, turnedDoors };
}

const doorBox = { x: 30, y: 30, width: SYMBOL, height: SYMBOL };

describe("findSymbolMatches", () => {
  it("finds every upright copy of the boxed symbol at any antialiasing phase", () => {
    const { image, uprightDoors, turnedDoors } = plan();
    const { matches, failure } = findSymbolMatches(image, doorBox, { orientations: false });
    expect(failure).toBeUndefined();
    const confident = matches.filter((match) => match.score >= 0.7);
    for (const [left, top] of uprightDoors) expect(near(confident, left, top)).toBeDefined();
    for (const [left, top] of turnedDoors) expect(near(confident, left, top)).toBeUndefined();
    expect(confident).toHaveLength(uprightDoors.length);
    expect(near(matches, 30, 30)?.score).toBeCloseTo(1, 5);
  });

  it("finds rotated and mirrored copies when orientations are on", () => {
    const { image, uprightDoors, turnedDoors } = plan();
    const { matches } = findSymbolMatches(image, doorBox, { orientations: true });
    const confident = matches.filter((match) => match.score >= 0.7);
    for (const [left, top] of [...uprightDoors, ...turnedDoors]) {
      expect(near(confident, left, top)).toBeDefined();
    }
    expect(confident).toHaveLength(uprightDoors.length + turnedDoors.length);
  });

  it("returns matches from best to worst and reports progress up to completion", () => {
    const { image } = plan();
    const progress: number[] = [];
    const { matches } = findSymbolMatches(image, doorBox, {
      orientations: true,
      onProgress: (fraction) => progress.push(fraction),
    });
    expect(matches.map((match) => match.score)).toEqual(
      [...matches].map((match) => match.score).sort((a, b) => b - a),
    );
    expect(progress).toHaveLength(8);
    expect(progress.at(-1)).toBe(1);
  });

  it("gives the same matches for a loosely drawn box", () => {
    const { image, uprightDoors } = plan();
    const loose = { x: 26, y: 25, width: SYMBOL + 9, height: SYMBOL + 8 };
    const { matches } = findSymbolMatches(image, loose, { orientations: false });
    const confident = matches.filter((match) => match.score >= 0.7);
    expect(confident).toHaveLength(uprightDoors.length);
    for (const [left, top] of uprightDoors) expect(near(confident, left, top)).toBeDefined();
  });

  it("accepts a box dragged from any corner", () => {
    const { image, uprightDoors } = plan();
    const reversed = { x: 30 + SYMBOL, y: 30 + SYMBOL, width: -SYMBOL, height: -SYMBOL };
    const { matches } = findSymbolMatches(image, reversed, { orientations: false });
    expect(matches.filter((match) => match.score >= 0.7)).toHaveLength(uprightDoors.length);
  });

  it("searches a symmetric symbol once and reports each copy once", () => {
    const { image } = plan();
    const progress: number[] = [];
    const { matches } = findSymbolMatches(
      image,
      { x: 228, y: 238, width: 25, height: 25 },
      { orientations: true, onProgress: (fraction) => progress.push(fraction) },
    );
    expect(progress).toEqual([1]);
    const confident = matches.filter((match) => match.score >= 0.7);
    expect(confident).toHaveLength(2);
    expect(
      confident.some((match) => Math.abs(match.x - 130) <= 2 && Math.abs(match.y - 120) <= 2),
    ).toBe(true);
  });

  it("honours the score floor and the match limit", () => {
    const { image } = plan();
    const strict = findSymbolMatches(image, doorBox, { orientations: true, minScore: 0.95 });
    expect(strict.matches.every((match) => match.score >= 0.95)).toBe(true);
    const limited = findSymbolMatches(image, doorBox, { orientations: true, maxMatches: 3 });
    expect(limited.matches).toHaveLength(3);
  });

  it("explains a blank box and a box too small to search", () => {
    const { image } = plan();
    expect(
      findSymbolMatches(image, { x: 60, y: 60, width: 30, height: 30 }, { orientations: true }),
    ).toEqual({ matches: [], failure: "empty" });
    expect(
      findSymbolMatches(image, { x: 100, y: 149, width: 2, height: 3 }, { orientations: true }),
    ).toEqual({ matches: [], failure: "small" });
    expect(
      findSymbolMatches(image, { x: -50, y: -50, width: 10, height: 10 }, { orientations: true }),
    ).toEqual({ matches: [], failure: "empty" });
  });

  it("matches on a large sheet through the reduced levels", () => {
    const sheet = new Sheet(1400, 1000);
    for (let y = 40; y < 1000; y += 120) sheet.line(0, y, 1399, y);
    const doors: Array<[number, number]> = [];
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 9; column += 1) {
        const left = 31 + column * 150 + ((row * 7) % 5);
        const top = 60 + row * 120 + ((column * 3) % 4);
        sheet.door(
          left,
          top,
          { turns: ((row + column) % 4) as 0 | 1 | 2 | 3, mirrored: column % 2 === 1 },
          row % 3,
          column % 3,
        );
        doors.push([left, top]);
      }
    }
    const { matches } = findSymbolMatches(
      sheet.image(),
      { x: doors[0]![0], y: doors[0]![1], width: SYMBOL, height: SYMBOL },
      { orientations: true },
    );
    const confident = matches.filter((match) => match.score >= 0.7);
    for (const [left, top] of doors) expect(near(confident, left, top)).toBeDefined();
    expect(confident).toHaveLength(doors.length);
  });
});
