// Measures the JS that users download at startup and when they open a plan, and checks it against
// perf/size-budget.json. Usage: npm run build && npm run perf:size
// The full pull request check, which also compares with a base build, is size-diff.mjs.
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { SIZE_APPROVAL_LABEL, evaluateSize, percent } from "./budgets.mjs";

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
  // Each file is compressed on its own, as the server sends it, so moving code between chunks
  // of the same graph barely changes the sum.
  const chunks = [
    ...[...startupFiles].map((file) => ({ file, graph: "startup" })),
    ...viewerFiles.map((file) => ({ file, graph: "viewer" })),
  ].map(({ file, graph }) => {
    const content = fs.readFileSync(file);
    return {
      file: path.relative(dist, file),
      graph,
      bytes: content.length,
      gzipBytes: gzipSync(content).length,
    };
  });
  const sum = (graph, key) =>
    chunks.filter((chunk) => chunk.graph === graph).reduce((total, chunk) => total + chunk[key], 0);
  return {
    startupGzipBytes: sum("startup", "gzipBytes"),
    viewerGzipBytes: sum("viewer", "gzipBytes"),
    startupBytes: sum("startup", "bytes"),
    viewerBytes: sum("viewer", "bytes"),
    startupFiles: [...startupFiles].map((file) => path.relative(dist, file)),
    viewerFiles: viewerFiles.map((file) => path.relative(dist, file)),
    chunks,
  };
}

/** Chunk name without its content hash, so the same chunk matches across builds. */
export const chunkName = (file) => path.basename(file).replace(/-[\w-]{8}(?=\.m?js$)/, "");

/** Gzip change per chunk (added, removed or resized), largest first. */
export function chunkChanges(base, head, limit = 10) {
  const byName = new Map();
  for (const [side, metrics] of [
    ["base", base],
    ["head", head],
  ])
    for (const chunk of metrics.chunks) {
      const key = `${chunk.graph}:${chunkName(chunk.file)}`;
      const row = byName.get(key) ?? { name: chunkName(chunk.file), graph: chunk.graph };
      row[side] = (row[side] ?? 0) + chunk.gzipBytes;
      byName.set(key, row);
    }
  return [...byName.values()]
    .map((row) => ({ ...row, delta: (row.head ?? 0) - (row.base ?? 0) }))
    .filter((row) => row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

const number = (value) => (value === undefined ? "–" : value.toLocaleString("en-US"));
const signed = (value) => (value > 0 ? "+" : "") + number(value);

/** Markdown report: the metrics table, the changed chunks, the verdict and what to do next. */
export function formatSizeReport(result, { base, head, baseName } = {}) {
  const compared = result.rows.some((row) => row.base !== undefined);
  const lines = compared
    ? [
        `| Metric | Base${baseName ? ` (${baseName})` : ""} | PR | Change | Allowed growth | Ceiling |`,
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        ...result.rows.map(
          (row) =>
            `| ${row.label} | ${number(row.base)} | ${number(row.head)} | ${signed(row.delta)} (${percent(row.delta, row.base)}) | ${row.allowance === undefined ? "–" : `+${number(row.allowance)}`} | ${number(row.ceiling)} |`,
        ),
      ]
    : [
        "| Metric | Build | Ceiling |",
        "| --- | ---: | ---: |",
        ...result.rows.map(
          (row) => `| ${row.label} | ${number(row.head)} | ${number(row.ceiling)} |`,
        ),
      ];
  if (base && head) {
    const changes = chunkChanges(base, head);
    if (changes.length)
      lines.push(
        "",
        "Changed chunks (gzip, largest first):",
        "",
        "| Chunk | Graph | Base | PR | Change |",
        "| --- | --- | ---: | ---: | ---: |",
        ...changes.map(
          (row) =>
            `| \`${row.name}\` | ${row.graph} | ${number(row.base)} | ${number(row.head)} | ${signed(row.delta)} |`,
        ),
      );
  }
  const list = (items) => items.map((item) => `- ${item}`);
  lines.push("");
  if (result.failures.length)
    lines.push(
      "**Fail.** Fix these; the label does not override them:",
      "",
      ...list(result.failures),
      "",
    );
  if (result.needsApproval.length && result.approved)
    lines.push(
      `**Approved** with the "${SIZE_APPROVAL_LABEL}" label:`,
      "",
      ...list(result.needsApproval),
      "",
    );
  else if (result.needsApproval.length)
    lines.push(
      `**Needs the "${SIZE_APPROVAL_LABEL}" label:**`,
      "",
      ...list(result.needsApproval),
      "",
      `First try to load the new code lazily or split it. If the change is justified, the maintainer reviews it and adds the "${SIZE_APPROVAL_LABEL}" label, which re-runs this check; contributors never add it themselves.`,
      "",
    );
  if (result.pass && !result.needsApproval.length) lines.push("**Pass.**", "");
  if (result.notices.length) lines.push("Notes:", "", ...list(result.notices), "");
  if (!compared)
    lines.push(
      "Growth against a base was not checked. The full pull request check is `npm run perf:size:diff -- --base origin/main`.",
    );
  return lines.join("\n").trimEnd();
}

/** Prints the report, adds it to the GitHub job summary with annotations, and sets the exit code. */
export function publishSizeReport(result, report, title) {
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${title}\n\n${report}\n`);
  if (process.env.GITHUB_ACTIONS) {
    const annotate = (level, message) =>
      console.log(`::${level} title=Bundle size::${message.replace(/\r?\n/g, " ")}`);
    result.failures.forEach((message) => annotate("error", message));
    if (!result.approved)
      result.needsApproval.forEach((message) =>
        annotate("error", `${message}. Needs the "${SIZE_APPROVAL_LABEL}" label.`),
      );
    result.notices.forEach((message) => annotate("notice", message));
  }
  if (!result.pass) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = path.join(repo, "dist");
  if (!fs.existsSync(path.join(dist, "index.html")))
    throw Error("Missing dist/: run npm run build first");
  const head = measureSize(dist);
  const result = evaluateSize({ head });
  publishSizeReport(result, formatSizeReport(result, { head }), "Bundle size");
}
