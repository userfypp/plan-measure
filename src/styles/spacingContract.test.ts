import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;
const spacingProperty =
  /(?:^|[;{\s])(gap|row-gap|column-gap|padding[a-z-]*|margin[a-z-]*|inset[a-z-]*|top|right|bottom|left)\s*:\s*([^;}]+)/g;
const allowedLiterals = new Set(["0px", "1px", "-1px"]);

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return stylesheets(path);
    return name.endsWith(".css") && name !== "tokens.css" ? [path] : [];
  });
}

describe("spacing contract", () => {
  it("spaces everything with tokens: no pixel literals beyond 0 and 1px border compensation", () => {
    const offenders: string[] = [];
    for (const path of stylesheets(root)) {
      const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, property, value] of css.matchAll(spacingProperty)) {
        for (const literal of value!.match(/-?\d*\.?\d+px/g) ?? []) {
          if (!allowedLiterals.has(literal)) {
            offenders.push(`${relative(root, path)}: ${property}: ${value!.trim()}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never uses half-pixel lengths", () => {
    const offenders: string[] = [];
    for (const path of stylesheets(root)) {
      const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const literal of css.match(/\d*\.\d*[15]\d*px/g) ?? []) {
        offenders.push(`${relative(root, path)}: ${literal}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
