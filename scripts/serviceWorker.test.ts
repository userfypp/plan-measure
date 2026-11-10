import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listPrecacheFiles, serviceWorkerSource } from "./serviceWorker";

const template = `const VERSION = "__VERSION__";
const PRECACHE_URLS = /*PRECACHE_URLS*/ [];
const PDFJS_PREFIX = "__PDFJS_PREFIX__";`;

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function build(files: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), "service-worker-"));
  folders.push(folder);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(folder, path, ".."), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  return folder;
}

describe("listPrecacheFiles", () => {
  it("lists the shell and its assets but not pdf.js resources, source maps or the worker", () => {
    const folder = build({
      "index.html": "<html>",
      "sw.js": "worker",
      "manifest.webmanifest": "{}",
      "assets/index-abc.js": "js",
      "assets/index-abc.js.map": "map",
      "pdfjs/1.0.0/wasm/a.wasm": "wasm",
    });
    expect(listPrecacheFiles(folder).map(({ path }) => path)).toEqual([
      "assets/index-abc.js",
      "index.html",
      "manifest.webmanifest",
    ]);
  });
});

describe("serviceWorkerSource", () => {
  const files = [
    { path: "assets/a.js", hash: "1" },
    { path: "index.html", hash: "2" },
  ];

  it("injects the precache list, the version and the pdf.js prefix", () => {
    const source = serviceWorkerSource(template, files, "pdfjs/1.0.0/");
    expect(source).toContain('"assets/a.js"');
    expect(source).toContain('"index.html"');
    expect(source).toContain('PDFJS_PREFIX = "pdfjs/1.0.0/"');
    expect(source).not.toContain("__VERSION__");
    expect(source).not.toContain("/*PRECACHE_URLS*/");
  });

  it("changes the version when a file changes and keeps it otherwise", () => {
    const version = (list: typeof files) =>
      /VERSION = "(\w+)"/.exec(serviceWorkerSource(template, list, "p/"))?.[1];
    expect(version(files)).toBe(version([...files]));
    expect(version(files)).not.toBe(version([files[0]!, { path: "index.html", hash: "3" }]));
  });
});
