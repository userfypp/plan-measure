import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

export interface PrecacheFile {
  /** Path relative to the output folder, with `/` separators. */
  path: string;
  hash: string;
}

/**
 * Every emitted file the worker precaches: the page, its JS and CSS, the pdf.js worker, the icons
 * and the manifest. The versioned pdf.js resources are large and only needed by some plans, so the
 * worker caches them at run time; source maps and the worker itself are never precached.
 */
export function listPrecacheFiles(directory: string): PrecacheFile[] {
  const files: PrecacheFile[] = [];
  const visit = (relative: string) => {
    for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
      const path = posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (path !== "pdfjs") visit(path);
      } else if (path !== "sw.js" && !path.endsWith(".map")) {
        const hash = createHash("sha256")
          .update(readFileSync(join(directory, path)))
          .digest("hex");
        files.push({ path, hash });
      }
    }
  };
  visit("");
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * Fills the constants of the worker template. The version hashes the paths and contents of the
 * precache list, so any change to the build gives a new cache and lets the old ones be deleted.
 */
export function serviceWorkerSource(
  template: string,
  files: readonly PrecacheFile[],
  pdfjsPrefix: string,
): string {
  const version = createHash("sha256")
    .update(files.map(({ path, hash }) => `${path}:${hash}`).join("\n"))
    .digest("hex")
    .slice(0, 16);
  const urls = JSON.stringify(
    files.map(({ path }) => path),
    null,
    2,
  );
  return template
    .replace("__VERSION__", () => version)
    .replace("/*PRECACHE_URLS*/ []", () => urls)
    .replace("__PDFJS_PREFIX__", () => pdfjsPrefix);
}
