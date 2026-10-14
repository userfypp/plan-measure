import Konva from "konva";
import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>(["../../**/*.{ts,tsx}", "!../../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("konvaRuntime", () => {
  it("registers every react-konva node the app renders", () => {
    const used = new Set<string>();
    for (const source of Object.values(sources)) {
      for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-konva"/g)) {
        for (const name of match[1]!.split(",")) {
          const node = name.trim().split(/\s+as\s+/)[0]!;
          if (node && !node.startsWith("type ")) used.add(node);
        }
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const node of used) {
      expect(Konva, node).toHaveProperty(node);
    }
  });

  it("is the module that resolves for konva", () => {
    expect(Konva).not.toHaveProperty("Transformer");
    expect(Konva).not.toHaveProperty("Filters.Blur");
  });
});
