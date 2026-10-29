import assert from "node:assert/strict";
import fs from "node:fs";

// The budget numbers live in size-budget.json: CI compares them with the base's, so lowering them
// needs no approval and raising or removing them does. All are decimal bytes.
const budget = JSON.parse(fs.readFileSync(new URL("./size-budget.json", import.meta.url), "utf8"));
// Absolute ceilings: every build must fit. Each is the measured size plus `ceilingHeadroom.target`
// allowances; raising one requires approval, and lowering it is mandatory once the build falls more than
// `ceilingHeadroom.maximum` allowances below it.
export const sizeLimits = budget.sizeLimits;
// Growth a pull request may add to each metric without approval. In main's history every feature
// exceeds it (from 541 B gzip) and almost no fix does (20 of 22, up to 91 B gzip).
export const sizeGrowthAllowance = budget.sizeGrowthAllowance;
// Headroom of the ceilings over the build, in multiples of `sizeGrowthAllowance`.
export const ceilingHeadroom = budget.ceilingHeadroom;
// The maintainer adds it to a pull request after reviewing a justified increase; never an agent.
export const SIZE_APPROVAL_LABEL = "size: approved";
export const forbiddenStartup =
  /(?:pdfjs|pdf(?:[.-]|\.worker)|pdf-lib|annotatedPdf|xlsx|pdfjs-dist|pdfLib|(?:^|\/)es-[^/]+\.js(?:[?#]|$))/i;
export function checkStartup(requests, workers = []) {
  for (const request of requests)
    assert.ok(!forbiddenStartup.test(request), `Deferred dependency loaded at startup: ${request}`);
  assert.equal(workers.length, 0, `Worker during startup: ${workers.join(", ")}`);
}
/** Ceiling for a measured size: the size plus `ceilingHeadroom.target` allowances. */
export function sizeCeiling(metric, value, allowance = sizeGrowthAllowance) {
  return value + ceilingHeadroom.target * allowance[metric];
}
export function checkSize(metrics, limits = sizeLimits, allowance = sizeGrowthAllowance) {
  for (const key of Object.keys(limits)) {
    assert.ok(Number.isFinite(metrics[key]), `Missing size for ${key}`);
    assert.ok(
      Number.isInteger(allowance[key]) && allowance[key] > 0,
      `Missing per-PR allowance for ${key}`,
    );
    assert.ok(
      metrics[key] <= limits[key],
      `${key}: ${metrics[key]} > ${limits[key]}. Split the code; if the growth is justified, raise the ceiling to ${sizeCeiling(key, metrics[key], allowance)} with the "${SIZE_APPROVAL_LABEL}" label`,
    );
    // Ratchet: a large saving lowers the ceiling so that the freed headroom is not spent without a decision.
    assert.ok(
      limits[key] <= metrics[key] + ceilingHeadroom.maximum * allowance[key],
      `${key}: the ceiling ${limits[key]} leaves more than ${ceilingHeadroom.maximum} allowances over ${metrics[key]}; lower it to ${sizeCeiling(key, metrics[key], allowance)}`,
    );
  }
  checkStartup(metrics.startupFiles);
}
/**
 * Compares the base's budget and build with those of a pull request. Returns the report rows and what
 * requires the approval label: growth above the allowance and any relaxation of the budget (a ceiling,
 * allowance or headroom that rises or disappears, or a change to the list of dependencies forbidden
 * at startup).
 */
export function compareSizeBudgets(base, head) {
  const rows = Object.keys(head.budgets.sizeLimits).map((metric) => ({
    metric,
    base: base.metrics[metric],
    head: head.metrics[metric],
    delta: head.metrics[metric] - base.metrics[metric],
    allowance: head.budgets.sizeGrowthAllowance[metric],
    limit: head.budgets.sizeLimits[metric],
  }));
  const needsApproval = [];
  for (const row of rows) {
    assert.ok(
      Number.isFinite(row.base) && Number.isFinite(row.head),
      `Missing size for ${row.metric}`,
    );
    assert.ok(
      Number.isInteger(row.allowance) && row.allowance > 0,
      `Missing per-PR allowance for ${row.metric}`,
    );
    if (row.delta > row.allowance)
      needsApproval.push(
        `${row.metric} grows ${row.delta} B (per-PR allowance: ${row.allowance} B)`,
      );
  }
  for (const group of ["sizeLimits", "sizeGrowthAllowance", "ceilingHeadroom"]) {
    for (const [key, previous] of Object.entries(base.budgets[group] ?? {})) {
      const next = head.budgets[group]?.[key];
      if (next === undefined) needsApproval.push(`${group}.${key} is removed`);
      else if (next > previous)
        needsApproval.push(`${group}.${key} rises from ${previous} to ${next}`);
    }
  }
  if (
    base.budgets.forbiddenStartup !== undefined &&
    String(base.budgets.forbiddenStartup) !== String(head.budgets.forbiddenStartup)
  ) {
    needsApproval.push("forbiddenStartup changes");
  }
  return { rows, needsApproval };
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
      // A new long task or one more shape is not a regression by itself.
      const floor =
        metric === "longTasks"
          ? 2
          : metric === "mountedShapes"
            ? 10
            : metric === "domNodes"
              ? 20
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
