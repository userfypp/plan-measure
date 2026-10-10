import { describe, expect, it } from "vitest";
import { LruRenderCache } from "./renderCache";

describe("LruRenderCache", () => {
  it("keeps recently used rasters and evicts the least recently used one", () => {
    const cache = new LruRenderCache<string>(2, 10);
    cache.set("a", "page-a", 4);
    cache.set("b", "page-b", 4);

    expect(cache.get("a")).toBe("page-a");
    cache.set("c", "page-c", 4);

    expect(cache.get("a")).toBe("page-a");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("page-c");
    expect(cache.size).toBe(2);
    expect(cache.pixels).toBe(8);
  });

  it("does not retain a raster that exceeds the pixel budget", () => {
    const cache = new LruRenderCache<string>(2, 10);
    cache.set("large", "too-large", 11);

    expect(cache.get("large")).toBeUndefined();
    expect(cache.size).toBe(0);
    expect(cache.pixels).toBe(0);
  });

  it("finds an entry without changing which raster is evicted next", () => {
    const cache = new LruRenderCache<string>(2, 10);
    cache.set("1:a", "page-1", 4);
    cache.set("2:a", "page-2", 4);

    expect(cache.find((key) => key.startsWith("1:"))).toBe("page-1");
    expect(cache.find((key) => key.startsWith("3:"))).toBeUndefined();
    cache.set("3:a", "page-3", 4);

    expect(cache.get("1:a")).toBeUndefined();
  });
});
