import type { GrayImage } from "../symbolCount/templateMatch";

/** A pixel darker than this (0 black, 255 paper) is ink. */
export const INK_THRESHOLD = 160;

export type Rgb = readonly [number, number, number];

export interface PlanDiffPalette {
  paper: Rgb;
  /** Ink in both versions. */
  common: Rgb;
  /** Ink only in the current version. */
  added: Rgb;
  /** Ink only in the other version. */
  removed: Rgb;
}

export interface PlanDiffImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/** Marks the ink of `image` as 1, as seen after moving it by (`dx`, `dy`) pixels in a `width` × `height` frame. */
function inkMask(image: GrayImage, width: number, height: number, dx: number, dy: number) {
  const mask = new Uint8Array(width * height);
  const left = Math.max(0, dx);
  const right = Math.min(width, image.width + dx);
  const top = Math.max(0, dy);
  const bottom = Math.min(height, image.height + dy);
  for (let y = top; y < bottom; y += 1) {
    const source = (y - dy) * image.width - dx;
    for (let x = left; x < right; x += 1) {
      if (image.data[source + x]! < INK_THRESHOLD) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/** 1 where the mask or any of its 8 neighbours is 1. */
function dilate(mask: Uint8Array, width: number, height: number) {
  const across = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      across[row + x] =
        mask[row + x]! |
        (x > 0 ? mask[row + x - 1]! : 0) |
        (x < width - 1 ? mask[row + x + 1]! : 0);
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      out[row + x] =
        across[row + x]! |
        (y > 0 ? across[row + x - width]! : 0) |
        (y < height - 1 ? across[row + x + width]! : 0);
    }
  }
  return out;
}

/**
 * Compares two grayscale renders of the same page. The result has the size of `current`; `other`
 * is moved by (`dx`, `dy`) pixels first and what falls outside it counts as blank paper. Ink
 * with ink of the other image within one pixel is common, so antialiasing and half-pixel shifts
 * are not changes.
 */
export function diffPlans(
  current: GrayImage,
  other: GrayImage,
  dx: number,
  dy: number,
  palette: PlanDiffPalette,
): PlanDiffImage {
  const { width, height } = current;
  const now = inkMask(current, width, height, 0, 0);
  const before = inkMask(other, width, height, dx, dy);
  const nowNear = dilate(now, width, height);
  const beforeNear = dilate(before, width, height);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < now.length; i += 1) {
    let color = palette.paper;
    if (now[i] && before[i]) color = palette.common;
    else if (now[i]) color = beforeNear[i] ? palette.common : palette.added;
    else if (before[i]) color = nowNear[i] ? palette.common : palette.removed;
    const at = i << 2;
    rgba[at] = color[0];
    rgba[at + 1] = color[1];
    rgba[at + 2] = color[2];
    rgba[at + 3] = 255;
  }
  return { width, height, rgba };
}
