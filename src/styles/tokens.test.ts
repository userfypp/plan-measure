// @ts-expect-error Vitest executes this regression test in Node; app TypeScript intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function blocks(selector: string): string[] {
  const result: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.matchAll(pattern)) {
    if (match[1]!.trim() === selector) result.push(match[2]!);
  }
  return result;
}

describe("text size tokens", () => {
  it.each(["110", "125"])(
    "scales the %s% blocks without touching micro text or glyph badges",
    (size) => {
      const found = blocks(`:root[data-text-size="${size}"]`);
      expect(found).toHaveLength(1);
      const body = found[0]!;
      expect(body).toContain("--font-size-base:");
      expect(body).toContain("--line-height-base:");
      expect(body).not.toContain("--font-size-micro");
      expect(body).not.toContain("--line-height-micro");
      expect(body).not.toContain("--font-size-glyph-badge");
    },
  );
});
