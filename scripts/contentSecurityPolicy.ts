import { createHash } from "node:crypto";

const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

/**
 * Adds a Content-Security-Policy `<meta>` to a built page. GitHub Pages cannot send headers, and a
 * meta tag only governs what follows it, so it opens `<head>`. Each inline script is allowed by
 * its hash, so editing one needs no manual update. `'wasm-unsafe-eval'` is for the pdf.js worker's
 * WebAssembly decoders; scripts never get `'unsafe-eval'`. Inline styles stay allowed because
 * Konva and the layout set `style` attributes.
 */
export function withContentSecurityPolicy(html: string): string {
  const hashes = [...html.matchAll(inlineScript)].map(
    ([, source]) => `'sha256-${createHash("sha256").update(source).digest("base64")}'`,
  );
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return html.replace(
    /<head[^>]*>/,
    (head) => `${head}<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
  );
}
