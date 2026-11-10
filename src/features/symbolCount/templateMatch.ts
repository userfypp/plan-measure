/**
 * Template matching for "find similar symbols": zero-mean normalized cross-correlation (ZNCC) of
 * a boxed symbol against a grayscale raster of the page, coarse to fine over a small pyramid.
 * Pure and synchronous so it runs unchanged in a worker and in tests.
 *
 * Everything works on "ink" (255 - gray): the paper is 0, so a line drawing is sparse and the
 * coarse pass only visits the template's inked pixels.
 */

export interface GrayImage {
  /** Row-major luminance, 0 (black) to 255 (white). */
  data: Uint8Array;
  width: number;
  height: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SymbolMatch {
  /** Center of the match, in raster pixels. */
  x: number;
  y: number;
  /** Size of the matched box (swapped for quarter-turn orientations). */
  width: number;
  height: number;
  /** ZNCC at full resolution, at most 1. */
  score: number;
}

export type SymbolMatchFailure = "empty" | "small";

export interface SymbolMatchResult {
  matches: SymbolMatch[];
  /** Why nothing could be searched: a blank box, or a symbol too small to tell apart. */
  failure?: SymbolMatchFailure;
}

export interface SymbolMatchOptions {
  /** Also find the symbol rotated by quarter turns and mirrored. */
  orientations: boolean;
  /** Lowest score returned; callers filter further without searching again. */
  minScore?: number;
  maxMatches?: number;
  onProgress?: (fraction: number) => void;
}

interface Plane {
  data: Uint8Array;
  width: number;
  height: number;
}

export const DEFAULT_MIN_SCORE = 0.5;
const DEFAULT_MAX_MATCHES = 2000;
const MIN_TEMPLATE_SIDE = 4;
const MIN_TEMPLATE_LONG_SIDE = 6;
const COARSE_MIN_SIDE = 6;
const FORCED_COARSE_MIN_SIDE = 3;
const MAX_PYRAMID_LEVEL = 2;
/** Above this many pixels the coarse pass must run on a reduced level (its sums need 16 B/px). */
const MAX_COARSE_PIXELS = 4 * 1024 * 1024;
const COARSE_KEEP = 1500;
const COARSE_SLACK = 0.25;
const LEVEL_SLACK = 0.12;
const REFINE_RADIUS = 2;

export function findSymbolMatches(
  image: GrayImage,
  box: PixelRect,
  options: SymbolMatchOptions,
): SymbolMatchResult {
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const maxMatches = options.maxMatches ?? DEFAULT_MAX_MATCHES;
  const ink = invert(image);
  const rect = trimToInk(ink, clampRect(box, image.width, image.height));
  if (!rect) return { matches: [], failure: "empty" };
  if (
    Math.min(rect.width, rect.height) < MIN_TEMPLATE_SIDE ||
    Math.max(rect.width, rect.height) < MIN_TEMPLATE_LONG_SIDE
  ) {
    return { matches: [], failure: "small" };
  }

  const base = crop(ink, rect);
  const variants = options.orientations ? orientationsOf(base) : [base];
  const coarseLevel = pickCoarseLevel(rect, image.width * image.height);
  const levels: Plane[] = [ink];
  for (let level = 1; level <= coarseLevel; level += 1) levels.push(downsample(levels[level - 1]!));
  const coarse = levels[coarseLevel]!;
  const sums = integralSums(coarse);

  const found: SymbolMatch[] = [];
  variants.forEach((variant, index) => {
    const templates: Plane[] = [variant];
    for (let level = 1; level <= coarseLevel; level += 1) {
      templates.push(downsample(templates[level - 1]!));
    }
    let candidates = coarseCandidates(
      coarse,
      sums,
      templates[coarseLevel]!,
      Math.max(0.2, minScore - COARSE_SLACK),
    );
    for (let level = coarseLevel - 1; level >= 0; level -= 1) {
      const floor = level === 0 ? minScore : minScore - LEVEL_SLACK;
      candidates = refine(levels[level]!, templates[level]!, candidates, floor);
    }
    if (coarseLevel === 0)
      candidates = candidates.filter((candidate) => candidate.score >= minScore);
    for (const candidate of candidates) {
      found.push({
        x: candidate.x + variant.width / 2,
        y: candidate.y + variant.height / 2,
        width: variant.width,
        height: variant.height,
        score: Math.min(1, candidate.score),
      });
    }
    options.onProgress?.((index + 1) / variants.length);
  });

  return { matches: suppressOverlaps(found, rect).slice(0, maxMatches) };
}

function clampRect(box: PixelRect, width: number, height: number): PixelRect {
  const left = Math.max(0, Math.min(width, Math.floor(Math.min(box.x, box.x + box.width))));
  const top = Math.max(0, Math.min(height, Math.floor(Math.min(box.y, box.y + box.height))));
  const right = Math.max(0, Math.min(width, Math.ceil(Math.max(box.x, box.x + box.width))));
  const bottom = Math.max(0, Math.min(height, Math.ceil(Math.max(box.y, box.y + box.height))));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function invert(image: GrayImage): Plane {
  const data = new Uint8Array(image.width * image.height);
  const source = image.data;
  for (let index = 0; index < data.length; index += 1) data[index] = 255 - source[index]!;
  return { data, width: image.width, height: image.height };
}

/** Shrinks the box to its ink plus a one-pixel margin, so a loosely drawn box still matches. */
function trimToInk(ink: Plane, rect: PixelRect): PixelRect | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const { data, width } = ink;
  let strongest = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const value = data[y * width + x]!;
      if (value > strongest) strongest = value;
    }
  }
  const threshold = Math.max(24, strongest * 0.35);
  if (strongest < threshold) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -1;
  let bottom = -1;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (data[y * width + x]! < threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  left = Math.max(rect.x, left - 1);
  top = Math.max(rect.y, top - 1);
  right = Math.min(rect.x + rect.width - 1, right + 1);
  bottom = Math.min(rect.y + rect.height - 1, bottom + 1);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function crop(plane: Plane, rect: PixelRect): Plane {
  const data = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y += 1) {
    const start = (rect.y + y) * plane.width + rect.x;
    data.set(plane.data.subarray(start, start + rect.width), y * rect.width);
  }
  return { data, width: rect.width, height: rect.height };
}

function rotateQuarter(plane: Plane): Plane {
  const { width, height } = plane;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[x * height + (height - 1 - y)] = plane.data[y * width + x]!;
    }
  }
  return { data, width: height, height: width };
}

function mirror(plane: Plane): Plane {
  const { width, height } = plane;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + (width - 1 - x)] = plane.data[y * width + x]!;
    }
  }
  return { data, width, height };
}

/** The eight quarter-turn and mirror orientations, without the ones a symmetric symbol repeats. */
function orientationsOf(base: Plane): Plane[] {
  const all: Plane[] = [base];
  for (let turn = 1; turn < 4; turn += 1) all.push(rotateQuarter(all[turn - 1]!));
  for (let turn = 0; turn < 4; turn += 1) all.push(mirror(all[turn]!));
  const unique: Plane[] = [];
  for (const plane of all) {
    if (!unique.some((other) => nearlyEqual(other, plane))) unique.push(plane);
  }
  return unique;
}

/** Compared after one halving, so antialiasing differences between orientations do not count. */
function nearlyEqual(a: Plane, b: Plane): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const blurred = downsample(b);
  const stats = templateStats(blurred);
  return stats !== null && scoreAt(downsample(a), blurred, stats, 0, 0) >= 0.9;
}

function pickCoarseLevel(rect: PixelRect, pixels: number): number {
  const side = Math.min(rect.width, rect.height);
  let level = 0;
  while (level < MAX_PYRAMID_LEVEL && side >> (level + 1) >= COARSE_MIN_SIDE) level += 1;
  while (
    level < MAX_PYRAMID_LEVEL &&
    pixels / 4 ** level > MAX_COARSE_PIXELS &&
    side >> (level + 1) >= FORCED_COARSE_MIN_SIDE
  ) {
    level += 1;
  }
  return level;
}

/** Halves a plane with a [1 3 3 1] kernel per axis: smooth enough to tolerate odd offsets. */
function downsample(source: Plane): Plane {
  const width = Math.max(1, (source.width + 1) >> 1);
  const height = Math.max(1, (source.height + 1) >> 1);
  const lastX = source.width - 1;
  const lastY = source.height - 1;
  const rows = new Uint16Array(width * source.height);
  for (let y = 0; y < source.height; y += 1) {
    const row = y * source.width;
    for (let x = 0; x < width; x += 1) {
      const center = 2 * x;
      const a = source.data[row + (center > 0 ? center - 1 : 0)]!;
      const b = source.data[row + (center < lastX ? center : lastX)]!;
      const c = source.data[row + (center + 1 < lastX ? center + 1 : lastX)]!;
      const d = source.data[row + (center + 2 < lastX ? center + 2 : lastX)]!;
      rows[y * width + x] = a + 3 * b + 3 * c + d;
    }
  }
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const center = 2 * y;
    const a = (center > 0 ? center - 1 : 0) * width;
    const b = (center < lastY ? center : lastY) * width;
    const c = (center + 1 < lastY ? center + 1 : lastY) * width;
    const d = (center + 2 < lastY ? center + 2 : lastY) * width;
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] =
        (rows[a + x]! + 3 * rows[b + x]! + 3 * rows[c + x]! + rows[d + x]! + 32) >> 6;
    }
  }
  return { data, width, height };
}

interface IntegralSums {
  sum: Float64Array;
  squares: Float64Array;
  stride: number;
}

function integralSums(plane: Plane): IntegralSums {
  const stride = plane.width + 1;
  const sum = new Float64Array(stride * (plane.height + 1));
  const squares = new Float64Array(stride * (plane.height + 1));
  for (let y = 0; y < plane.height; y += 1) {
    let rowSum = 0;
    let rowSquares = 0;
    const row = y * plane.width;
    const above = y * stride;
    const current = above + stride;
    for (let x = 0; x < plane.width; x += 1) {
      const value = plane.data[row + x]!;
      rowSum += value;
      rowSquares += value * value;
      sum[current + x + 1] = sum[above + x + 1]! + rowSum;
      squares[current + x + 1] = squares[above + x + 1]! + rowSquares;
    }
  }
  return { sum, squares, stride };
}

interface Candidate {
  /** Top-left corner of the matched window at the current level. */
  x: number;
  y: number;
  score: number;
}

function coarseCandidates(
  image: Plane,
  sums: IntegralSums,
  template: Plane,
  minScore: number,
): Candidate[] {
  const { width, height } = image;
  const tw = template.width;
  const th = template.height;
  if (tw > width || th > height) return [];
  const count = tw * th;
  const offsets: number[] = [];
  const values: number[] = [];
  let templateSum = 0;
  let templateSquares = 0;
  for (let y = 0; y < th; y += 1) {
    for (let x = 0; x < tw; x += 1) {
      const value = template.data[y * tw + x]!;
      if (value === 0) continue;
      offsets.push(y * width + x);
      values.push(value);
      templateSum += value;
      templateSquares += value * value;
    }
  }
  const templateVariance = templateSquares - (templateSum * templateSum) / count;
  if (templateVariance <= 0) return [];
  const sparseOffsets = Int32Array.from(offsets);
  const sparseValues = Float32Array.from(values);
  const terms = sparseOffsets.length;
  // A window with far less or far more ink than the symbol cannot reach the score floor.
  const leastInk = templateSum * 0.4;
  const mostInk = templateSum * 2.5;

  const spanX = width - tw + 1;
  const spanY = height - th + 1;
  const scores = new Float32Array(spanX * spanY);
  const { sum, squares, stride } = sums;
  const data = image.data;
  for (let y = 0; y < spanY; y += 1) {
    const top = y * stride;
    const bottom = (y + th) * stride;
    for (let x = 0; x < spanX; x += 1) {
      const windowSum =
        sum[bottom + x + tw]! - sum[bottom + x]! - sum[top + x + tw]! + sum[top + x]!;
      if (windowSum < leastInk || windowSum > mostInk) continue;
      const windowSquares =
        squares[bottom + x + tw]! -
        squares[bottom + x]! -
        squares[top + x + tw]! +
        squares[top + x]!;
      const windowVariance = windowSquares - (windowSum * windowSum) / count;
      if (windowVariance <= 1e-6) continue;
      const origin = y * width + x;
      let cross = 0;
      for (let term = 0; term < terms; term += 1) {
        cross += data[origin + sparseOffsets[term]!]! * sparseValues[term]!;
      }
      const score =
        (cross - (windowSum * templateSum) / count) / Math.sqrt(windowVariance * templateVariance);
      if (score >= minScore) scores[y * spanX + x] = score;
    }
  }

  const candidates: Candidate[] = [];
  for (let y = 0; y < spanY; y += 1) {
    for (let x = 0; x < spanX; x += 1) {
      const score = scores[y * spanX + x]!;
      if (score === 0) continue;
      let peak = true;
      for (let dy = -1; dy <= 1 && peak; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= spanY) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= spanX || (dx === 0 && dy === 0)) continue;
          const other = scores[ny * spanX + nx]!;
          // Ties keep the first window in scan order, so a plateau yields one candidate.
          if (other > score || (other === score && (dy < 0 || (dy === 0 && dx < 0)))) {
            peak = false;
            break;
          }
        }
      }
      if (peak) candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > COARSE_KEEP) candidates.length = COARSE_KEEP;
  return candidates;
}

/** Re-scores each candidate around its position on the next finer level and keeps the best. */
function refine(
  image: Plane,
  template: Plane,
  candidates: Candidate[],
  minScore: number,
): Candidate[] {
  const stats = templateStats(template);
  if (!stats) return [];
  const refined: Candidate[] = [];
  for (const candidate of candidates) {
    let best: Candidate | null = null;
    for (let dy = -REFINE_RADIUS; dy <= REFINE_RADIUS; dy += 1) {
      for (let dx = -REFINE_RADIUS; dx <= REFINE_RADIUS; dx += 1) {
        const x = candidate.x * 2 + dx;
        const y = candidate.y * 2 + dy;
        const score = scoreAt(image, template, stats, x, y);
        if (score >= minScore && (!best || score > best.score)) best = { x, y, score };
      }
    }
    if (best) refined.push(best);
  }
  return refined;
}

interface TemplateStats {
  sum: number;
  variance: number;
}

function templateStats(template: Plane): TemplateStats | null {
  let sum = 0;
  let squares = 0;
  for (let index = 0; index < template.data.length; index += 1) {
    const value = template.data[index]!;
    sum += value;
    squares += value * value;
  }
  const variance = squares - (sum * sum) / template.data.length;
  return variance > 0 ? { sum, variance } : null;
}

function scoreAt(
  image: Plane,
  template: Plane,
  stats: TemplateStats,
  x: number,
  y: number,
): number {
  const tw = template.width;
  const th = template.height;
  if (x < 0 || y < 0 || x + tw > image.width || y + th > image.height) return 0;
  let windowSum = 0;
  let windowSquares = 0;
  let cross = 0;
  for (let row = 0; row < th; row += 1) {
    const imageRow = (y + row) * image.width + x;
    const templateRow = row * tw;
    for (let column = 0; column < tw; column += 1) {
      const value = image.data[imageRow + column]!;
      windowSum += value;
      windowSquares += value * value;
      cross += value * template.data[templateRow + column]!;
    }
  }
  const count = tw * th;
  const windowVariance = windowSquares - (windowSum * windowSum) / count;
  if (windowVariance <= 1e-6) return 0;
  return (cross - (windowSum * stats.sum) / count) / Math.sqrt(windowVariance * stats.variance);
}

/** Keeps the best match of every group whose centers are closer than half the symbol. */
function suppressOverlaps(matches: SymbolMatch[], rect: PixelRect): SymbolMatch[] {
  const reach = Math.max(3, Math.min(rect.width, rect.height) / 2);
  const reachSquared = reach * reach;
  const sorted = [...matches].sort((a, b) => b.score - a.score);
  const kept: SymbolMatch[] = [];
  const cells = new Map<string, SymbolMatch[]>();
  for (const match of sorted) {
    const cellX = Math.floor(match.x / reach);
    const cellY = Math.floor(match.y / reach);
    let free = true;
    for (let dy = -1; dy <= 1 && free; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const near = cells.get(`${cellX + dx}:${cellY + dy}`);
        if (
          near?.some((other) => (other.x - match.x) ** 2 + (other.y - match.y) ** 2 < reachSquared)
        ) {
          free = false;
          break;
        }
      }
    }
    if (!free) continue;
    kept.push(match);
    const key = `${cellX}:${cellY}`;
    const cell = cells.get(key);
    if (cell) cell.push(match);
    else cells.set(key, [match]);
  }
  return kept;
}
