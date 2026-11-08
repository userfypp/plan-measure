import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withContentSecurityPolicy } from "./contentSecurityPolicy";

const page = (script: string) =>
  `<!doctype html><html><head><meta charset="UTF-8" /><script>${script}</script></head><body><script type="module" src="/assets/index.js"></script></body></html>`;
const hash = (script: string) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`;
const policyOf = (html: string) => /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];

describe("withContentSecurityPolicy", () => {
  it("allows the inline script by its hash and the module script by origin only", () => {
    const html = withContentSecurityPolicy(page("window.theme = 1;"));
    const scriptSrc = policyOf(html)
      ?.split("; ")
      .find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBe(`script-src 'self' 'wasm-unsafe-eval' ${hash("window.theme = 1;")}`);
  });

  it("changes the hash when the script changes", () => {
    const first = policyOf(withContentSecurityPolicy(page("a();")));
    const second = policyOf(withContentSecurityPolicy(page("b();")));
    expect(first).not.toBe(second);
  });

  it("opens <head> so the policy applies to every script", () => {
    const html = withContentSecurityPolicy(page("a();"));
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("charset"));
  });

  it("never allows eval, plugins or a <base> override", () => {
    const policy = policyOf(withContentSecurityPolicy(page("a();"))) ?? "";
    expect(policy).not.toMatch(/(?<!wasm-)unsafe-eval/);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
  });

  it("works for a page with no inline script", () => {
    const html = withContentSecurityPolicy("<html><head></head><body></body></html>");
    expect(policyOf(html)).toContain("script-src 'self' 'wasm-unsafe-eval'; ");
  });
});
