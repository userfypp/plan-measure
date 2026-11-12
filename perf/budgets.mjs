import assert from "node:assert/strict";
import fs from "node:fs";

// Bundle size. The numbers live in size-budget.json; how they are enforced is explained in
// docs/PERFORMANCE.md ("JavaScript size"). All sizes are decimal bytes.
export const sizeBudget = JSON.parse(
  fs.readFileSync(new URL("./size-budget.json", import.meta.url), "utf8"),
);
// The maintainer adds it to a pull request after reviewing a justified increase; never an agent.
export const SIZE_APPROVAL_LABEL = "size: approved";
// Every metric in the report, in order. Only those with a ceiling in size-budget.json are enforced;
// raw bytes are informational (they move with chunk layout and minifier naming, not with what users download).
export const sizeMetrics = {
  startupGzipBytes: "Startup JS (gzip)",
  viewerGzipBytes: "Plan-open JS (gzip)",
  startupBytes: "Startup JS (raw, info)",
  viewerBytes: "Plan-open JS (raw, info)",
};
// A ceiling is set this far above the build, so it only stops long-term drift, never one pull request.
export const CEILING_HEADROOM = 0.1;
export const forbiddenStartup =
  /(?:pdfjs|pdf(?:[.-]|\.worker)|pdf-lib|annotatedPdf|xlsx|pdfjs-dist|pdfLib|(?:^|\/)es-[^/]+\.js(?:[?#]|$))/i;
export function checkStartup(requests, workers = []) {
  for (const request of requests)
    assert.ok(!forbiddenStartup.test(request), `Deferred dependency loaded at startup: ${request}`);
  assert.equal(workers.length, 0, `Worker during startup: ${workers.join(", ")}`);
}
/** The ceiling to write for a measured size: 10 % above it, rounded up to a whole KiB. */
export function suggestedCeiling(value) {
  return Math.ceil((value * (1 + CEILING_HEADROOM)) / 1024) * 1024;
}
/** Growth a pull request may add to a metric without approval: a share of the base, with a floor. */
export function growthAllowance(baseValue, tolerance = sizeBudget.growthTolerance) {
  return Math.max(tolerance.minimumBytes, Math.ceil(baseValue * tolerance.ratio));
}
export function validateSizeBudget(budget) {
  const ceilings = Object.entries(budget?.ceilings ?? {});
  assert.ok(ceilings.length > 0, "size-budget.json: no ceilings");
  for (const [metric, ceiling] of ceilings) {
    assert.ok(metric in sizeMetrics, `size-budget.json: unknown metric ${metric}`);
    assert.ok(
      Number.isInteger(ceiling) && ceiling > 0,
      `size-budget.json: invalid ceiling ${metric}`,
    );
  }
  const { ratio, minimumBytes } = budget.growthTolerance ?? {};
  assert.ok(ratio > 0 && ratio < 1, "size-budget.json: growthTolerance.ratio must be in (0, 1)");
  assert.ok(
    Number.isInteger(minimumBytes) && minimumBytes > 0,
    "size-budget.json: growthTolerance.minimumBytes must be a positive integer",
  );
}
/** Ways the pull request loosens the base's budget. A base without this format contributes none. */
export function budgetRelaxations(base, head) {
  if (!base?.ceilings) return [];
  const relaxations = [];
  for (const [metric, previous] of Object.entries(base.ceilings)) {
    const next = head.ceilings[metric];
    if (next === undefined) relaxations.push(`ceilings.${metric} is removed`);
    else if (next > previous)
      relaxations.push(`ceilings.${metric} rises from ${previous} to ${next}`);
  }
  for (const [key, previous] of Object.entries(base.growthTolerance ?? {})) {
    const next = head.growthTolerance[key];
    if (next > previous)
      relaxations.push(`growthTolerance.${key} rises from ${previous} to ${next}`);
  }
  return relaxations;
}
/**
 * Applies the size rules to a build (`head`) and, when given, the base it is compared with (measured
 * on the same machine). Returns the report rows and three lists: `failures` (a ceiling or a deferred
 * dependency at startup; the label does not override them), `needsApproval` (growth over the
 * allowance, a looser budget or changed size tooling; the label accepts them) and `notices`, which
 * never fail.
 */
export function evaluateSize({
  head,
  base,
  budget = sizeBudget,
  baseBudget,
  approved = false,
  changedMachinery = [],
}) {
  validateSizeBudget(budget);
  const failures = [];
  const needsApproval = [];
  const notices = [];
  for (const file of head.startupFiles ?? [])
    if (forbiddenStartup.test(file))
      failures.push(
        `Deferred dependency loaded at startup: ${file}. Load it with \`import()\` (\`recoverableLazy\`) instead of a static import.`,
      );
  const rows = Object.entries(sizeMetrics).map(([metric, label]) => {
    const value = head[metric];
    assert.ok(Number.isFinite(value), `Missing size for ${metric}`);
    const ceiling = budget.ceilings[metric];
    const baseValue = base?.[metric];
    if (base) assert.ok(Number.isFinite(baseValue), `Missing base size for ${metric}`);
    const delta = base ? value - baseValue : undefined;
    const allowance =
      ceiling !== undefined && base
        ? growthAllowance(baseValue, budget.growthTolerance)
        : undefined;
    if (ceiling !== undefined && value > ceiling)
      failures.push(
        `${label}: ${value} B is over its ${ceiling} B ceiling. Load new code lazily or split it. If the growth is justified, set \`ceilings.${metric}\` to ${suggestedCeiling(value)} in \`perf/size-budget.json\`; raising a ceiling needs the "${SIZE_APPROVAL_LABEL}" label.`,
      );
    if (allowance !== undefined && delta > allowance)
      needsApproval.push(
        `${label} grows ${delta} B (${percent(delta, baseValue)}), over the ${allowance} B allowed without approval`,
      );
    if (ceiling !== undefined && ceiling > value * (1 + 2 * CEILING_HEADROOM))
      notices.push(
        `${label}: the ${ceiling} B ceiling is more than ${200 * CEILING_HEADROOM} % above the build; you may lower \`ceilings.${metric}\` to ${suggestedCeiling(value)} (no label needed).`,
      );
    return { metric, label, base: baseValue, head: value, delta, allowance, ceiling };
  });
  if (baseBudget) needsApproval.push(...budgetRelaxations(baseBudget, budget));
  needsApproval.push(
    ...changedMachinery.map((file) => `${file} changes how size is measured or enforced`),
  );
  if (approved && !needsApproval.length)
    notices.push(`The "${SIZE_APPROVAL_LABEL}" label is not needed: nothing requires approval.`);
  const pass = !failures.length && (approved || !needsApproval.length);
  return { rows, failures, needsApproval, notices, approved, pass };
}
export function percent(delta, base) {
  const value = (100 * delta) / base;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} %`;
}
export function median(values) {
  assert.ok(values.length > 0 && values.every(Number.isFinite), "Invalid samples");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export const relativeTolerance = 0.3;
export function fpsWarnings(current) {
  return current.scenarios.flatMap((row) => {
    if (!/^M1000\/4x\/zoom$|^M5000\/1x\/zoom$/.test(row.name)) return [];
    assert.ok(Number.isFinite(row.rawMedianFps), `Missing raw FPS for ${row.name}`);
    return row.rawMedianFps < 30
      ? [`${row.name}/raw fps: ${row.rawMedianFps.toFixed(2)} < target 30`]
      : [];
  });
}
export function compareResults(current, baseline, { strict = false } = {}) {
  assert.equal(current.schema, baseline.schema, "The benchmark version changed");
  assert.equal(current.samples, 5, "The comparison requires five samples");
  assert.equal(baseline.samples, 5, "The baseline requires five samples");
  assert.deepEqual(
    current.scenarios.map((row) => row.name).sort(),
    baseline.scenarios.map((row) => row.name).sort(),
    "Incomplete or duplicate scenarios",
  );
  for (const result of [current, baseline]) {
    if (!result.rawSamples) continue;
    for (const scenario of result.scenarios) {
      const samples = result.rawSamples
        .filter((row) => row.name === scenario.name)
        .map((row) => row.sample)
        .sort((a, b) => a - b);
      assert.deepEqual(
        samples,
        [0, 1, 2, 3, 4],
        `Incomplete or duplicate samples ${scenario.name}`,
      );
    }
  }
  const warnings = fpsWarnings(current);
  const failures = [];
  for (const row of current.scenarios) {
    const previous = baseline.scenarios.find((item) => item.name === row.name);
    assert.ok(previous, `Missing baseline for ${row.name}`);
    assert.deepEqual(
      Object.keys(row.metrics).sort(),
      Object.keys(previous.metrics).sort(),
      `Incomplete metrics ${row.name}`,
    );
    for (const [metric, value] of Object.entries(row.metrics)) {
      assert.ok(
        Number.isFinite(value) && Number.isFinite(previous.metrics[metric]),
        `Invalid metric ${row.name}/${metric}`,
      );
      if (metric === "fps") continue; // The relative drop is checked below.
      // A new long task, one more shape, or one more frame is not a regression by itself.
      const floor =
        metric === "longTasks"
          ? 2
          : metric === "mountedShapes"
            ? 10
            : metric === "domNodes"
              ? 20
              : metric === "maxPauseMs" || metric === "elapsedMs"
                ? 17
                : 0;
      if (
        value >
        Math.max(
          previous.metrics[metric] * (1 + relativeTolerance),
          previous.metrics[metric] + floor,
        )
      ) {
        failures.push(
          `${row.name}/${metric}: ${value.toFixed(2)} > ${previous.metrics[metric].toFixed(2)} +30 %`,
        );
      }
    }
    if (
      row.metrics.fps !== undefined &&
      row.metrics.fps < previous.metrics.fps * (1 - relativeTolerance)
    ) {
      failures.push(`${row.name}/fps: drop of more than 30 %`);
    }
  }
  assert.equal(current.scenarios.length, baseline.scenarios.length, "Incomplete scenarios");
  if (strict) failures.push(...warnings);
  return failures;
}
