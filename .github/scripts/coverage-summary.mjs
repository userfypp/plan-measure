import { appendFile, readFile } from "node:fs/promises";
import { isMain } from "./github-api.mjs";

const METRICS = ["statements", "branches", "functions", "lines"];

/** Markdown table of the totals in a Vitest `json-summary` coverage report. */
export function formatCoverageSummary(summary) {
  const rows = METRICS.map((metric) => {
    const { pct, covered, total } = summary.total[metric];
    return `| ${metric} | ${pct}% (${covered}/${total}) |`;
  });
  return ["### Coverage", "", "| Metric | Covered |", "| --- | --- |", ...rows, ""].join("\n");
}

if (isMain(import.meta.url)) {
  const summary = JSON.parse(await readFile("coverage/coverage-summary.json", "utf8"));
  await appendFile(process.env.GITHUB_STEP_SUMMARY, formatCoverageSummary(summary));
}
