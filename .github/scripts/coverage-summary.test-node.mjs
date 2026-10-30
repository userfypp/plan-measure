import test from "node:test";
import assert from "node:assert/strict";
import { formatCoverageSummary } from "./coverage-summary.mjs";

const metric = (covered, total) => ({ total, covered, skipped: 0, pct: (covered / total) * 100 });

test("formats the coverage totals as a Markdown table", () => {
  const summary = {
    total: {
      lines: metric(9, 10),
      statements: metric(18, 20),
      functions: metric(3, 4),
      branches: metric(1, 2),
    },
  };
  assert.equal(
    formatCoverageSummary(summary),
    [
      "### Coverage",
      "",
      "| Metric | Covered |",
      "| --- | --- |",
      "| statements | 90% (18/20) |",
      "| branches | 50% (1/2) |",
      "| functions | 75% (3/4) |",
      "| lines | 90% (9/10) |",
      "",
    ].join("\n"),
  );
});
