import type Konva from "konva";
import { useEffect, useId, useState } from "react";
import { RASTER_CACHE_LIMITS, getAppPreferences } from "../../utils/appPreferences";
import styles from "./DebugOverlay.module.css";

/** What only the viewer knows; the overlay adds the frame timings and the browser's own numbers. */
export interface DebugStats {
  zoomPercent: number;
  /** The page bitmap on screen, in device pixels; null before the first render. */
  raster: { width: number; height: number } | null;
  cacheEntries: number;
  cachePixels: number;
  /** How long the last page render took; null until one has finished. */
  lastRenderMs: number | null;
  /** The annotation layer: its nodes are what each redraw has to walk. */
  annotationLayer: Konva.Container | null;
}

interface DebugOverlayProps {
  /** Reads the viewer's current stats; the viewer never re-renders for the overlay. */
  getStats: () => DebugStats;
}

interface FrameStats {
  fps: number;
  slowestMs: number;
}

const REFRESH_MS = 500;
// Chromium only: the JS heap in use. Other browsers do not expose it, so its row is omitted.
const MEGABYTE = 1024 * 1024;
const COUNT_FORMAT = new Intl.NumberFormat("en-US");

function usedHeapBytes(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof memory?.usedJSHeapSize === "number" ? memory.usedJSHeapSize : null;
}

/** Every node under a Konva container. */
function countCanvasNodes(container: Konva.Container | null): number {
  if (!container) return 0;
  let count = 0;
  for (const child of container.getChildren()) {
    count += 1;
    // Groups hold children of their own; Konva is a type-only import here, so test by shape.
    if ("getChildren" in child) count += countCanvasNodes(child as Konva.Container);
  }
  return count;
}

function megapixels(pixels: number): string {
  return (pixels / 1_000_000).toFixed(1);
}

interface Reading {
  frames: FrameStats | null;
  heapBytes: number | null;
  stats: DebugStats;
}

/**
 * Optional diagnostics (Settings → Performance). Only mounted while enabled, so it costs nothing
 * otherwise: its own rAF loop and a 2 Hz state update, no viewer re-renders. The frame rate is the
 * browser's paint rate while the overlay is open: it holds at the display rate when idle and drops
 * while a pan, zoom or redraw is too heavy, and the slowest frame of each half second shows the stutter
 * an average hides.
 */
export default function DebugOverlay({ getStats }: DebugOverlayProps) {
  const titleId = useId();
  const [reading, setReading] = useState<Reading>(() => ({
    frames: null,
    heapBytes: usedHeapBytes(),
    stats: getStats(),
  }));

  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let previousFrame = windowStart;
    let slowest = 0;
    let raf = 0;
    const tick = (now: number) => {
      frames += 1;
      slowest = Math.max(slowest, now - previousFrame);
      previousFrame = now;
      const elapsed = now - windowStart;
      if (elapsed >= REFRESH_MS) {
        setReading({
          frames: { fps: Math.round((frames * 1000) / elapsed), slowestMs: slowest },
          heapBytes: usedHeapBytes(),
          stats: getStats(),
        });
        frames = 0;
        slowest = 0;
        windowStart = now;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [getStats]);

  const { frames, heapBytes, stats } = reading;
  const limits = RASTER_CACHE_LIMITS[getAppPreferences().rasterCache];
  const rows: Array<[label: string, value: string]> = [
    ["Frame rate", frames ? `${frames.fps} fps` : "–"],
    ["Slowest frame", frames ? `${Math.round(frames.slowestMs)} ms` : "–"],
    ["Page render", stats.lastRenderMs === null ? "–" : `${Math.round(stats.lastRenderMs)} ms`],
    [
      "Page bitmap",
      stats.raster
        ? `${COUNT_FORMAT.format(stats.raster.width)} × ${COUNT_FORMAT.format(stats.raster.height)} px`
        : "–",
    ],
    [
      "Raster cache",
      `${stats.cacheEntries}/${limits.maxEntries} · ${megapixels(stats.cachePixels)}/${megapixels(limits.maxPixels)} Mpx`,
    ],
    ["Canvas nodes", COUNT_FORMAT.format(countCanvasNodes(stats.annotationLayer))],
    ["Zoom", `${Math.round(stats.zoomPercent)}%`],
    ["Pixel ratio", `${Math.round(window.devicePixelRatio * 100) / 100}×`],
  ];
  if (heapBytes !== null) rows.push(["JS memory", `${Math.round(heapBytes / MEGABYTE)} MB`]);

  return (
    <section
      className={styles.overlay}
      aria-hidden="true"
      aria-labelledby={titleId}
      data-testid="debug-overlay"
    >
      <h2 id={titleId} className={styles.title}>
        Diagnostics
      </h2>
      <dl className={styles.list}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.row}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
