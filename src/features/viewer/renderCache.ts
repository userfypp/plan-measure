export const MAX_RENDER_CACHE_ENTRIES = 2;
export const MAX_RENDER_CACHE_PIXELS = 8 * 1024 * 1024;

interface CacheEntry<T> {
  value: T;
  pixels: number;
}

export class LruRenderCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  private totalPixels = 0;

  constructor(
    private readonly maxEntries = MAX_RENDER_CACHE_ENTRIES,
    private readonly maxPixels = MAX_RENDER_CACHE_PIXELS,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, pixels: number): void {
    if (pixels <= 0 || pixels > this.maxPixels) return;
    const previous = this.entries.get(key);
    if (previous) {
      this.totalPixels -= previous.pixels;
      this.entries.delete(key);
    }
    this.entries.set(key, { value, pixels });
    this.totalPixels += pixels;

    while (this.entries.size > this.maxEntries || this.totalPixels > this.maxPixels) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (oldest) this.totalPixels -= oldest.pixels;
    }
  }

  clear(): void {
    this.entries.clear();
    this.totalPixels = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  get pixels(): number {
    return this.totalPixels;
  }
}
