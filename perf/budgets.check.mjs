import test from "node:test";
import assert from "node:assert/strict";
import {
  CEILING_HEADROOM,
  SIZE_APPROVAL_LABEL,
  budgetRelaxations,
  checkStartup,
  compareResults,
  evaluateSize,
  fpsWarnings,
  growthAllowance,
  median,
  sizeBudget,
  sizeMetrics,
  suggestedCeiling,
  validateSizeBudget,
} from "./budgets.mjs";
import { chunkChanges, chunkName, formatSizeReport, measureSize } from "./size.mjs";
import { sizeMachinery } from "./size-diff.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const budget = {
  ceilings: { startupGzipBytes: 110_000, viewerGzipBytes: 220_000 },
  growthTolerance: { ratio: 0.0025, minimumBytes: 256 },
};
const build = (changes = {}) => ({
  startupGzipBytes: 100_000,
  viewerGzipBytes: 200_000,
  startupBytes: 300_000,
  viewerBytes: 600_000,
  startupFiles: ["assets/index.js"],
  ...changes,
});
const evaluate = (head, options = {}) => evaluateSize({ head, base: build(), budget, ...options });

test("The committed budget is valid, enforces gzip only and has real headroom", () => {
  validateSizeBudget(sizeBudget);
  assert.deepEqual(Object.keys(sizeBudget.ceilings).sort(), [
    "startupGzipBytes",
    "viewerGzipBytes",
  ]);
  for (const ceiling of Object.values(sizeBudget.ceilings)) assert.equal(ceiling % 1024, 0);
  for (const bad of [
    { ...budget, ceilings: {} },
    { ...budget, ceilings: { mainBytes: 1 } },
    { ...budget, ceilings: { startupGzipBytes: 1.5 } },
    { ...budget, growthTolerance: { ratio: 0, minimumBytes: 256 } },
    { ...budget, growthTolerance: { ratio: 0.01, minimumBytes: 0 } },
  ])
    assert.throws(() => evaluateSize({ head: build(), budget: bad }), /size-budget\.json/);
});
test("The allowance is a share of the base with an absolute floor", () => {
  assert.equal(growthAllowance(100_000, budget.growthTolerance), 256);
  assert.equal(growthAllowance(200_000, budget.growthTolerance), 500);
  assert.equal(growthAllowance(200_001, budget.growthTolerance), 501);
  assert.equal(suggestedCeiling(100_000), 110_592);
  assert.ok(suggestedCeiling(100_000) >= 100_000 * (1 + CEILING_HEADROOM));
});
test("Smaller builds and noise-level growth pass without the label", () => {
  const smaller = evaluate(build({ startupGzipBytes: 60_000, viewerGzipBytes: 150_000 }));
  assert.equal(smaller.pass, true);
  assert.deepEqual(smaller.failures, []);
  assert.deepEqual(smaller.needsApproval, []);
  // A ceiling far above the build is only a suggestion to lower it, never a failure.
  assert.match(smaller.notices.join("\n"), /lower `ceilings.startupGzipBytes` to 66560/);
  const noise = evaluate(build({ startupGzipBytes: 100_256, viewerGzipBytes: 200_500 }));
  assert.equal(noise.pass, true);
  assert.deepEqual(noise.needsApproval, []);
  assert.deepEqual(noise.notices, []);
  // Raw bytes are informational: any change in them passes.
  assert.equal(evaluate(build({ startupBytes: 900_000, viewerBytes: 1 })).pass, true);
});
test("Growth over the allowance needs the label, and the label approves it", () => {
  const head = build({ startupGzipBytes: 100_257, viewerGzipBytes: 200_501 });
  const pending = evaluate(head);
  assert.equal(pending.pass, false);
  assert.deepEqual(pending.failures, []);
  assert.deepEqual(pending.needsApproval, [
    `${sizeMetrics.startupGzipBytes} grows 257 B (+0.26 %), over the 256 B allowed without approval`,
    `${sizeMetrics.viewerGzipBytes} grows 501 B (+0.25 %), over the 500 B allowed without approval`,
  ]);
  const approved = evaluate(head, { approved: true });
  assert.equal(approved.pass, true);
  assert.deepEqual(approved.needsApproval, pending.needsApproval);
  const unneeded = evaluate(build(), { approved: true });
  assert.equal(unneeded.pass, true);
  assert.match(unneeded.notices.join("\n"), /label is not needed/);
});
test("A ceiling or a deferred dependency at startup fails even with the label", () => {
  const over = evaluate(build({ startupGzipBytes: 110_001 }), { approved: true });
  assert.equal(over.pass, false);
  assert.equal(over.failures.length, 1);
  assert.match(
    over.failures[0],
    new RegExp(
      `110001 B is over its 110000 B ceiling.*set \`ceilings.startupGzipBytes\` to ${suggestedCeiling(110_001)} in \`perf/size-budget.json\``,
    ),
  );
  // Exactly at the ceiling passes; without a base only the ceilings and startup rules apply.
  assert.equal(evaluateSize({ head: build({ startupGzipBytes: 110_000 }), budget }).pass, true);
  assert.equal(evaluateSize({ head: build({ startupGzipBytes: 110_001 }), budget }).pass, false);
  for (const file of [
    "pdfjs.js",
    "pdf.worker.js",
    "pdf-lib.js",
    "pdf-ABCD.js",
    "annotatedPdf-ABCD.js",
    "es-ABCD.js",
    "https://example.test/assets/es-BOjZJYv9.js",
    "xlsx.js",
  ]) {
    const result = evaluate(build({ startupFiles: [file] }), { approved: true });
    assert.equal(result.pass, false, file);
    assert.match(result.failures[0], /Deferred dependency loaded at startup/);
  }
});
test("Loosening the budget or the size tooling needs the label; tightening does not", () => {
  const relaxed = (changes) => budgetRelaxations(budget, { ...budget, ...changes });
  assert.deepEqual(relaxed({ ceilings: { ...budget.ceilings, startupGzipBytes: 110_001 } }), [
    "ceilings.startupGzipBytes rises from 110000 to 110001",
  ]);
  assert.deepEqual(relaxed({ ceilings: { startupGzipBytes: 110_000 } }), [
    "ceilings.viewerGzipBytes is removed",
  ]);
  assert.deepEqual(relaxed({ growthTolerance: { ratio: 0.003, minimumBytes: 257 } }), [
    "growthTolerance.ratio rises from 0.0025 to 0.003",
    "growthTolerance.minimumBytes rises from 256 to 257",
  ]);
  assert.deepEqual(
    relaxed({
      ceilings: { startupGzipBytes: 100_000, viewerGzipBytes: 200_000 },
      growthTolerance: { ratio: 0.001, minimumBytes: 100 },
    }),
    [],
  );
  // A base from before this format has nothing to compare; the tooling change covers it.
  assert.deepEqual(budgetRelaxations({ sizeLimits: { mainBytes: 1 } }, budget), []);
  assert.deepEqual(budgetRelaxations(undefined, budget), []);
  const raised = {
    ...budget,
    ceilings: { ...budget.ceilings, viewerGzipBytes: 230_000 },
  };
  const result = evaluateSize({
    head: build(),
    base: build(),
    budget: raised,
    baseBudget: budget,
    changedMachinery: ["perf/size.mjs"],
  });
  assert.equal(result.pass, false);
  assert.deepEqual(result.needsApproval, [
    "ceilings.viewerGzipBytes rises from 220000 to 230000",
    "perf/size.mjs changes how size is measured or enforced",
  ]);
  assert.equal(
    evaluateSize({
      head: build(),
      base: build(),
      budget: raised,
      baseBudget: budget,
      approved: true,
    }).pass,
    true,
  );
});
test("The report shows base, change, allowance, ceiling, changed chunks and what to do", () => {
  const chunk = (file, graph, gzipBytes) => ({ file, graph, bytes: gzipBytes * 3, gzipBytes });
  const base = build({
    chunks: [
      chunk("assets/index-AAAAAAAA.js", "startup", 100_000),
      chunk("assets/PdfViewer-BBBBBBBB.js", "viewer", 200_000),
      chunk("assets/old-CCCCCCCC.js", "viewer", 10),
    ],
  });
  const head = build({
    startupGzipBytes: 100_400,
    chunks: [
      chunk("assets/index-DDDDDDDD.js", "startup", 100_300),
      chunk("assets/react-EEEEEEEE.js", "startup", 100),
      chunk("assets/PdfViewer-FFFFFFFF.js", "viewer", 200_000),
    ],
  });
  assert.equal(chunkName("assets/pdf.worker.min-CjEcRF4W.mjs"), "pdf.worker.min.mjs");
  assert.deepEqual(chunkChanges(base, head), [
    { name: "index.js", graph: "startup", base: 100_000, head: 100_300, delta: 300 },
    { name: "react.js", graph: "startup", head: 100, delta: 100 },
    { name: "old.js", graph: "viewer", base: 10, delta: -10 },
  ]);
  const pending = evaluateSize({ head, base, budget });
  const report = formatSizeReport(pending, { base, head, baseName: "abc1234" });
  assert.match(
    report,
    /\| Startup JS \(gzip\) \| 100,000 \| 100,400 \| \+400 \(\+0\.40 %\) \| \+256 \| 110,000 \|/,
  );
  assert.match(
    report,
    /\| Startup JS \(raw, info\) \| 300,000 \| 300,000 \| 0 \(0\.00 %\) \| – \| – \|/,
  );
  assert.match(report, /\| `react\.js` \| startup \| – \| 100 \| \+100 \|/);
  assert.match(report, new RegExp(`Needs the "${SIZE_APPROVAL_LABEL}" label:\\*\\*\n\n- Startup`));
  assert.match(report, /contributors never add it themselves/);
  const approved = formatSizeReport(evaluateSize({ head, base, budget, approved: true }), {
    base,
    head,
  });
  assert.match(approved, new RegExp(`Approved\\*\\* with the "${SIZE_APPROVAL_LABEL}" label`));
  assert.doesNotMatch(approved, /Pass/);
  const local = formatSizeReport(evaluateSize({ head: build(), budget }));
  assert.match(local, /\| Startup JS \(gzip\) \| 100,000 \| 110,000 \|/);
  assert.match(local, /\*\*Pass\.\*\*/);
  assert.match(local, /npm run perf:size:diff -- --base origin\/main/);
  const failed = formatSizeReport(
    evaluateSize({ head: build({ viewerGzipBytes: 220_001 }), budget }),
  );
  assert.match(failed, /\*\*Fail\.\*\* Fix these; the label does not override them/);
});
test("CI compares with the merge base and reads the current labels, not the event payload", () => {
  const root = new URL("../", import.meta.url);
  const workflow = fs.readFileSync(new URL(".github/workflows/performance.yml", root), "utf8");
  assert.match(workflow, /types: \[[^\]]*\blabeled\b[^\]]*\bunlabeled\b[^\]]*\]/);
  assert.match(workflow, /fetch-depth: 2/);
  assert.match(workflow, /pull-requests: read/);
  assert.ok(workflow.includes(`grep -qxF '${SIZE_APPROVAL_LABEL}'`));
  assert.match(workflow, /gh api "repos\/\$GITHUB_REPOSITORY\/pulls\/\$PR_NUMBER"/);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.labels/);
  assert.match(workflow, /npm run perf:size:diff -- --base HEAD\^1/);
  const scripts = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8")).scripts;
  assert.equal(scripts["perf:size"], "node perf/size.mjs");
  assert.equal(scripts["perf:size:diff"], "node perf/size-diff.mjs");
  for (const file of sizeMachinery) assert.ok(fs.existsSync(new URL(file, root)), file);
  // Lowering a ceiling only touches the numbers: it cannot require the label.
  assert.ok(!sizeMachinery.includes("perf/size-budget.json"));
});
test("The startup graph follows static imports and excludes import()", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-size-"));
  const failsStartup = () =>
    evaluateSize({ head: measureSize(tmp), budget }).failures.some((failure) =>
      failure.startsWith("Deferred dependency"),
    );
  try {
    fs.mkdirSync(path.join(tmp, "assets"));
    fs.writeFileSync(path.join(tmp, "assets/PdfViewer-ABCD.js"), "export const viewer=1");
    fs.writeFileSync(
      path.join(tmp, "index.html"),
      '<script type="module" src="/plan-measure/assets/index.js"></script>',
    );
    fs.writeFileSync(
      path.join(tmp, "assets/index.js"),
      'import "./shared.js";import("./pdf-lib.js")',
    );
    fs.writeFileSync(path.join(tmp, "assets/shared.js"), "export const a=1");
    assert.deepEqual(measureSize(tmp).startupFiles, ["assets/index.js", "assets/shared.js"]);
    assert.equal(failsStartup(), false);
    fs.appendFileSync(path.join(tmp, "assets/index.js"), ';import "./pdf-lib.js"');
    fs.writeFileSync(path.join(tmp, "assets/pdf-lib.js"), "export const pdf=1");
    assert.equal(failsStartup(), true);
    fs.writeFileSync(path.join(tmp, "assets/index.js"), 'export{pdf}from"./pdf-lib.js"');
    assert.equal(failsStartup(), true);
    fs.writeFileSync(path.join(tmp, "assets/index.js"), 'import "./pdf.worker-ABCD.mjs"');
    fs.writeFileSync(path.join(tmp, "assets/pdf.worker-ABCD.mjs"), "export const worker=1");
    assert.equal(failsStartup(), true);
    fs.writeFileSync(path.join(tmp, "assets/index.js"), "export const app=1");
    fs.writeFileSync(
      path.join(tmp, "index.html"),
      '<script src="/assets/index.js"></script><link href="/assets/es-ABCD.js" rel="modulepreload">',
    );
    fs.writeFileSync(path.join(tmp, "assets/es-ABCD.js"), "export const pdfLib=1");
    assert.equal(failsStartup(), true);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});
test("The viewer counts its static graph that is not in startup, raw and gzip per file", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-viewer-"));
  const write = (file, text) => fs.writeFileSync(path.join(tmp, file), text);
  try {
    fs.mkdirSync(path.join(tmp, "assets"));
    write("index.html", '<script type="module" src="/assets/index.js"></script>');
    write("assets/index.js", 'import "./shared.js";import("./PdfViewer-ABCD.js")');
    write("assets/shared.js", "export const shared=1");
    write(
      "assets/PdfViewer-ABCD.js",
      'import "./shared.js";import "./pdf-ABCD.js";import("./export-ABCD.js")',
    );
    write("assets/pdf-ABCD.js", "export const pdf=1");
    write("assets/export-ABCD.js", "export const csv=1");
    const metrics = measureSize(tmp);
    assert.deepEqual(metrics.viewerFiles, ["assets/PdfViewer-ABCD.js", "assets/pdf-ABCD.js"]);
    assert.equal(
      metrics.viewerBytes,
      fs.statSync(path.join(tmp, "assets/PdfViewer-ABCD.js")).size +
        fs.statSync(path.join(tmp, "assets/pdf-ABCD.js")).size,
    );
    const viewerChunks = metrics.chunks.filter((chunk) => chunk.graph === "viewer");
    assert.deepEqual(
      viewerChunks.map((chunk) => chunk.file),
      metrics.viewerFiles,
    );
    assert.equal(
      metrics.viewerGzipBytes,
      viewerChunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
    );
    assert.ok(viewerChunks.every((chunk) => chunk.gzipBytes > 0));
    assert.equal(metrics.startupBytes, metrics.chunks[0].bytes + metrics.chunks[1].bytes);
    write("assets/PdfViewer-EFGH.js", "export const other=1");
    assert.throws(() => measureSize(tmp), /PdfViewer/);
    fs.rmSync(path.join(tmp, "assets/PdfViewer-ABCD.js"));
    fs.rmSync(path.join(tmp, "assets/PdfViewer-EFGH.js"));
    assert.throws(() => measureSize(tmp), /PdfViewer/);
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});
test("The comparison fails at +31 % and with incomplete samples; absolute FPS only blocks in strict mode", () => {
  const baseline = {
    schema: 1,
    samples: 5,
    scenarios: [
      {
        name: "M1000/4x/zoom",
        rawMedianFps: 40,
        metrics: {
          maxPauseMs: 100,
          elapsedMs: 1000,
          longTasks: 10,
          domNodes: 700,
          mountedShapes: 5000,
          heapBytes: 1000000,
          fps: 40,
        },
      },
    ],
  };
  assert.deepEqual(compareResults(structuredClone(baseline), baseline), []);
  for (const metric of [
    "maxPauseMs",
    "elapsedMs",
    "longTasks",
    "domNodes",
    "mountedShapes",
    "heapBytes",
  ]) {
    const mutant = structuredClone(baseline);
    mutant.scenarios[0].metrics[metric] *= 1.31;
    assert.ok(compareResults(mutant, baseline).some((failure) => failure.includes(metric)));
  }
  const shortScenario = structuredClone(baseline);
  Object.assign(shortScenario.scenarios[0].metrics, { maxPauseMs: 16.8, elapsedMs: 30 });
  for (const metric of ["maxPauseMs", "elapsedMs"]) {
    const oneFrame = structuredClone(shortScenario);
    oneFrame.scenarios[0].metrics[metric] += 17;
    assert.deepEqual(compareResults(oneFrame, shortScenario), []);
    const twoFrames = structuredClone(shortScenario);
    twoFrames.scenarios[0].metrics[metric] += 18;
    assert.ok(compareResults(twoFrames, shortScenario).some((failure) => failure.includes(metric)));
  }
  const fps = structuredClone(baseline);
  fps.scenarios[0].metrics.fps = 31;
  fps.scenarios[0].rawMedianFps = 29;
  assert.deepEqual(compareResults(fps, baseline), []);
  assert.ok(fpsWarnings(fps).some((warning) => warning.includes("target")));
  assert.deepEqual(compareResults(fps, baseline, { strict: true }), fpsWarnings(fps));
  const relativeFps = structuredClone(baseline);
  relativeFps.scenarios[0].metrics.fps *= 0.69;
  assert.ok(compareResults(relativeFps, baseline).some((failure) => failure.includes("drop")));
  assert.throws(() => compareResults({ ...baseline, samples: 1 }, baseline));
  assert.throws(() => compareResults({ ...baseline, scenarios: [] }, baseline));
  const sampled = {
    ...baseline,
    rawSamples: Array.from({ length: 5 }, (_, sample) => ({
      name: baseline.scenarios[0].name,
      sample,
    })),
  };
  assert.deepEqual(compareResults(sampled, sampled), []);
  assert.throws(() =>
    compareResults({ ...sampled, rawSamples: sampled.rawSamples.slice(1) }, sampled),
  );
  assert.throws(() =>
    compareResults(
      { ...sampled, rawSamples: sampled.rawSamples.map((row) => ({ ...row, sample: 0 })) },
      sampled,
    ),
  );
  const otherCommit = {
    ...sampled,
    environment: {
      sourceCommit: "new-commit",
      sourceDiffSha256: "different",
      indexHtmlSha256: "different",
      startupFiles: [{ sha256: "different" }],
    },
  };
  assert.deepEqual(
    compareResults(otherCommit, { ...sampled, environment: { sourceCommit: "old-commit" } }),
    [],
  );
  assert.equal(median([9, 2, 4, 1, 3]), 3);
});

test("The startup probe rejects PDF requests and workers, even blob:", () => {
  checkStartup(["http://localhost/plan-measure/assets/index.js"]);
  assert.throws(() => checkStartup(["http://localhost/plan-measure/assets/es-BOjZJYv9.js"]));
  assert.throws(() => checkStartup([], ["blob:http://localhost/worker-pdf"]));
});
