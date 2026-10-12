import { useEffect, useState } from "react";
import styles from "./DebugOverlay.module.css";

export interface DebugStats {
  cacheEntries: number;
  cachePixels: number;
  lastRenderMs: number | null;
}

interface DebugOverlayProps {
  /** Reads the viewer's current stats; the viewer never re-renders for the overlay. */
  getStats: () => DebugStats;
}

const REFRESH_MS = 500;

/**
 * Optional diagnostics (Settings → Performance). Only mounted while enabled, so it
 * costs nothing otherwise: its own rAF counter and a 2 Hz state update, no viewer re-renders.
 */
export function DebugOverlay({ getStats }: DebugOverlayProps) {
  const [view, setView] = useState<{ fps: number } & DebugStats>(() => ({
    fps: 0,
    ...getStats(),
  }));

  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= REFRESH_MS) {
        setView({ fps: Math.round((frames * 1000) / elapsed), ...getStats() });
        frames = 0;
        windowStart = now;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [getStats]);

  return (
    <div className={styles.overlay} aria-hidden="true" data-testid="debug-overlay">
      <span>{view.fps} FPS</span>
      <span>
        Cache {view.cacheEntries} · {(view.cachePixels / 1_000_000).toFixed(1)} Mpx
      </span>
      <span>Render {view.lastRenderMs === null ? "–" : `${Math.round(view.lastRenderMs)} ms`}</span>
    </div>
  );
}
