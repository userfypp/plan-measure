import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZE_APPROVAL_LABEL,
  ceilingHeadroom,
  checkSize,
  checkStartup,
  compareResults,
  compareSizeBudgets,
  forbiddenStartup,
  fpsWarnings,
  median,
  sizeCeiling,
  sizeGrowthAllowance,
  sizeLimits,
} from "./budgets.mjs";
import { measureSize } from "./size.mjs";
import { formatReport, sizeMachinery } from "./size-diff.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("The limits catch main, gzip, startup and deferred dependencies", () => {
  const good = { ...sizeLimits, startupFiles: ["assets/index.js"] };
  checkSize(good);
  for (const metric of Object.keys(sizeLimits))
    assert.throws(() => checkSize({ ...good, [metric]: good[metric] + 1 }));
  for (const file of [
    "pdfjs.js",
    "pdf.worker.js",
    "pdf-lib.js",
    "pdf-ABCD.js",
    "annotatedPdf-ABCD.js",
    "es-ABCD.js",
    "https://example.test/assets/es-BOjZJYv9.js",
    "xlsx.js",
  ])
    assert.throws(() => checkSize({ ...good, startupFiles: [file] }));
});
test("Each ceiling has a per-PR allowance and the target headroom fits under the maximum", () => {
  assert.deepEqual(Object.keys(sizeGrowthAllowance).sort(), Object.keys(sizeLimits).sort());
  for (const value of Object.values(sizeGrowthAllowance))
    assert.ok(Number.isInteger(value) && value > 0);
  assert.ok(Number.isInteger(ceilingHeadroom.target) && ceilingHeadroom.target > 0);
  assert.ok(
    Number.isInteger(ceilingHeadroom.maximum) && ceilingHeadroom.maximum > ceilingHeadroom.target,
  );
  for (const [metric, limit] of Object.entries(sizeLimits))
    assert.ok(Number.isInteger(limit) && limit > 0, metric);
});
test("The ratchet requires lowering a ceiling that leaves more headroom than the maximum", () => {
  const good = { ...sizeLimits, startupFiles: [] };
  for (const metric of Object.keys(sizeLimits)) {
    const lowest = sizeLimits[metric] - ceilingHeadroom.maximum * sizeGrowthAllowance[metric];
    checkSize({ ...good, [metric]: lowest });
    assert.throws(
      () => checkSize({ ...good, [metric]: lowest - 1 }),
      new RegExp(`${metric}: .*lower it to ${sizeCeiling(metric, lowest - 1)}$`),
    );
    assert.throws(
      () => checkSize({ ...good, [metric]: sizeLimits[metric] + 1 }),
      new RegExp(
        `raise the ceiling to ${sizeCeiling(metric, sizeLimits[metric] + 1)} with the "${SIZE_APPROVAL_LABEL}" label`,
      ),
    );
  }
  assert.equal(
    sizeCeiling("mainGzipBytes", 1000),
    1000 + ceilingHeadroom.target * sizeGrowthAllowance.mainGzipBytes,
  );
  assert.throws(
    () => checkSize(good, sizeLimits, { ...sizeGrowthAllowance, viewerBytes: 0 }),
    /per-PR allowance for viewerBytes/,
  );
});
test("The base comparison requires approval when growth exceeds the allowance or the budget is relaxed", () => {
  const budgets = { sizeLimits, sizeGrowthAllowance, ceilingHeadroom, forbiddenStartup };
  const base = { metrics: { ...sizeLimits }, budgets };
  const grown = (metric) => ({
    metrics: { ...sizeLimits, [metric]: sizeLimits[metric] + sizeGrowthAllowance[metric] },
    budgets,
  });
  for (const metric of Object.keys(sizeLimits)) {
    assert.deepEqual(compareSizeBudgets(base, grown(metric)).needsApproval, []);
    const over = grown(metric);
    over.metrics[metric] += 1;
    assert.deepEqual(compareSizeBudgets(base, over).needsApproval, [
      `${metric} grows ${sizeGrowthAllowance[metric] + 1} B (per-PR allowance: ${sizeGrowthAllowance[metric]} B)`,
    ]);
  }
  const shrunk = {
    metrics: Object.fromEntries(
      Object.entries(sizeLimits).map(([key, value]) => [key, value - 10_000]),
    ),
    budgets,
  };
  const { rows, needsApproval } = compareSizeBudgets(base, shrunk);
  assert.deepEqual(needsApproval, []);
  assert.deepEqual(
    rows.map((row) => row.delta),
    Object.keys(sizeLimits).map(() => -10_000),
  );
  const loosened = (changes) =>
    compareSizeBudgets(base, { metrics: base.metrics, budgets: { ...budgets, ...changes } })
      .needsApproval;
  assert.deepEqual(
    loosened({ sizeLimits: { ...sizeLimits, mainBytes: sizeLimits.mainBytes + 1 } }),
    [`sizeLimits.mainBytes rises from ${sizeLimits.mainBytes} to ${sizeLimits.mainBytes + 1}`],
  );
  const { viewerBytes, ...withoutViewer } = sizeLimits;
  assert.deepEqual(
    compareSizeBudgets(
      { metrics: base.metrics, budgets },
      { metrics: base.metrics, budgets: { ...budgets, sizeLimits: withoutViewer } },
    ).needsApproval,
    ["sizeLimits.viewerBytes is removed"],
  );
  assert.ok(viewerBytes > 0);
  assert.deepEqual(
    loosened({
      sizeGrowthAllowance: {
        ...sizeGrowthAllowance,
        mainGzipBytes: sizeGrowthAllowance.mainGzipBytes + 1,
      },
    }),
    [
      `sizeGrowthAllowance.mainGzipBytes rises from ${sizeGrowthAllowance.mainGzipBytes} to ${sizeGrowthAllowance.mainGzipBytes + 1}`,
    ],
  );
  assert.deepEqual(
    loosened({ ceilingHeadroom: { ...ceilingHeadroom, maximum: ceilingHeadroom.maximum + 1 } }),
    [
      `ceilingHeadroom.maximum rises from ${ceilingHeadroom.maximum} to ${ceilingHeadroom.maximum + 1}`,
    ],
  );
  assert.deepEqual(loosened({ forbiddenStartup: /pdfjs/i }), ["forbiddenStartup changes"]);
  // Tightening the budget or adding a new metric needs no approval.
  assert.deepEqual(
    loosened({
      sizeLimits: Object.fromEntries(
        Object.entries(sizeLimits).map(([key, value]) => [key, value - 1]),
      ),
    }),
    [],
  );
  assert.deepEqual(
    compareSizeBudgets(
      { metrics: base.metrics, budgets: { ...budgets, sizeLimits: withoutViewer } },
      base,
    ).needsApproval,
    [],
  );
  // The first base without per-PR allowances only contributes its ceilings.
  assert.deepEqual(
    compareSizeBudgets({ metrics: base.metrics, budgets: { sizeLimits, forbiddenStartup } }, base)
      .needsApproval,
    [],
  );
  assert.throws(
    () =>
      compareSizeBudgets(base, {
        metrics: base.metrics,
        budgets: { ...budgets, sizeGrowthAllowance: {} },
      }),
    /per-PR allowance/,
  );
});
test("The report shows signs and distinguishes pending from approved", () => {
  const rows = [
    { metric: "mainGzipBytes", base: 100, head: 400, delta: 300, allowance: 250, limit: 1000 },
    { metric: "viewerBytes", base: 50, head: 40, delta: -10, allowance: 500, limit: 2000 },
  ];
  const pending = formatReport(
    rows,
    ["mainGzipBytes grows 300 B (per-PR allowance: 250 B)"],
    false,
  );
  assert.match(pending, /\| mainGzipBytes \| 100 \| 400 \| \+300 \| 250 \| 1000 \|/);
  assert.match(pending, /\| viewerBytes \| 50 \| 40 \| -10 \| 500 \| 2000 \|/);
  assert.match(
    pending,
    new RegExp(`Requires the "${SIZE_APPROVAL_LABEL}" label:\n- mainGzipBytes grows 300 B`),
  );
  assert.match(
    formatReport(rows, ["x"], true),
    new RegExp(`Approved with the "${SIZE_APPROVAL_LABEL}" label`),
  );
  assert.doesNotMatch(formatReport(rows, [], false), /label/);
});
test("CI compares with the merge base and reads the same label as the budget", () => {
  const root = new URL("../", import.meta.url);
  const workflow = fs.readFileSync(new URL(".github/workflows/performance.yml", root), "utf8");
  assert.match(workflow, /types: \[[^\]]*\blabeled\b[^\]]*\bunlabeled\b[^\]]*\]/);
  assert.match(workflow, /fetch-depth: 2/);
  // Quoted: without the quotes, the label's ": " would end the YAML scalar.
  assert.ok(
    workflow.includes(
      `APPROVED: "\${{ contains(github.event.pull_request.labels.*.name, '${SIZE_APPROVAL_LABEL}') }}"`,
    ),
  );
  assert.match(workflow, /npm run perf:size:diff -- --base HEAD\^1/);
  const scripts = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8")).scripts;
  assert.equal(scripts["perf:size:diff"], "node perf/size-diff.mjs");
  for (const file of sizeMachinery) assert.ok(fs.existsSync(new URL(file, root)), file);
  // Lowering a ceiling only touches the numbers: it cannot require the label.
  assert.ok(!sizeMachinery.includes("perf/size-budget.json"));
});
test("The startup graph follows static imports and excludes import()", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-size-"));
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
    fs.appendFileSync(path.join(tmp, "assets/index.js"), ';import "./pdf-lib.js"');
    fs.writeFileSync(path.join(tmp, "assets/pdf-lib.js"), "export const pdf=1");
    assert.throws(() => checkSize(measureSize(tmp)));
    fs.writeFileSync(path.join(tmp, "assets/index.js"), 'export{pdf}from"./pdf-lib.js"');
    assert.throws(() => checkSize(measureSize(tmp)));
    fs.writeFileSync(path.join(tmp, "assets/index.js"), 'import "./pdf.worker-ABCD.mjs"');
    fs.writeFileSync(path.join(tmp, "assets/pdf.worker-ABCD.mjs"), "export const worker=1");
    assert.throws(() => checkSize(measureSize(tmp)));
    fs.writeFileSync(path.join(tmp, "assets/index.js"), "export const app=1");
    fs.writeFileSync(
      path.join(tmp, "index.html"),
      '<script src="/assets/index.js"></script><link href="/assets/es-ABCD.js" rel="modulepreload">',
    );
    fs.writeFileSync(path.join(tmp, "assets/es-ABCD.js"), "export const pdfLib=1");
    assert.throws(() => checkSize(measureSize(tmp)));
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
});
test("The viewer counts its static graph that is not in startup", () => {
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
