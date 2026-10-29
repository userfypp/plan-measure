import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { checkSize, sizeGrowthAllowance, sizeLimits } from "./budgets.mjs";

const repo =
  process.env.PLAN_MEASURE_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function measureSize(dist) {
  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  const entries = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  if (entries.length !== 1) throw Error("Expected a single main JS file");
  const preloads = [...html.matchAll(/<link\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => /\brel="modulepreload"/.test(tag))
    .map((tag) => tag.match(/\bhref="([^"]+)"/)?.[1])
    .filter(Boolean);
  const local = (url) => path.join(dist, url.replace(/^.*?\/assets\//, "assets/"));
  // Static imports only; import() is precisely the deferred loading to protect.
  function staticGraph(urls) {
    const files = new Set();
    function visit(url) {
      const file = local(url);
      if (files.has(file)) return;
      files.add(file);
      const js = fs.readFileSync(file, "utf8");
      for (const match of js.matchAll(
        /(?:\bimport\s*(?:[^;"']*?\bfrom\s*)?|\bexport\s*[^;"']*?\bfrom\s*)["'](\.[^"']+\.m?js)["']/g,
      )) {
        visit("/assets/" + path.basename(match[1]));
      }
    }
    urls.forEach(visit);
    return files;
  }
  const startupFiles = staticGraph([...entries, ...preloads]);
  // The viewer loads when a plan is opened: count its chunk and whatever it imports that is not already in startup.
  const viewers = fs
    .readdirSync(path.join(dist, "assets"))
    .filter((file) => /^PdfViewer-[\w-]+\.js$/.test(file));
  if (viewers.length !== 1) throw Error("Expected a single PdfViewer chunk");
  const viewerFiles = [...staticGraph(["/assets/" + viewers[0]])].filter(
    (file) => !startupFiles.has(file),
  );
  const bytes = (files) => files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const main = fs.readFileSync(local(entries[0]));
  return {
    mainBytes: main.length,
    mainGzipBytes: gzipSync(main).length,
    startupBytes: bytes([...startupFiles]),
    viewerBytes: bytes(viewerFiles),
    startupFiles: [...startupFiles].map((file) => path.relative(dist, file)),
    viewerFiles: viewerFiles.map((file) => path.relative(dist, file)),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const metrics = measureSize(path.join(repo, "dist"));
  checkSize(metrics);
  console.log(
    JSON.stringify({ metrics, limits: sizeLimits, growthAllowance: sizeGrowthAllowance }, null, 2),
  );
}
