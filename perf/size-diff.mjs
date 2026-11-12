// The pull request size check: builds another revision in a temporary worktree, measures both builds
// on this machine with this code, and applies the rules of perf/size.mjs plus the growth allowance.
// `--approved` stands for the "size: approved" label (CI reads it from the pull request).
// Usage: npm run build && npm run perf:size:diff -- --base origin/main
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateSize } from "./budgets.mjs";
import { formatSizeReport, measureSize, publishSizeReport } from "./size.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Changing how the budget is measured or enforced also requires approval; its numbers
// (size-budget.json) are compared by value, so lowering them never does.
export const sizeMachinery = [
  "perf/budgets.mjs",
  "perf/size.mjs",
  "perf/size-diff.mjs",
  ".github/workflows/performance.yml",
];

const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

/** The base's size-budget.json, or undefined if it has none or it does not parse. */
function baseBudgetAt(sha) {
  try {
    return JSON.parse(git("show", `${sha}:perf/size-budget.json`));
  } catch {
    return undefined;
  }
}

async function main(argv) {
  const baseIndex = argv.indexOf("--base");
  const baseRef = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
  if (!baseRef) throw Error("Specify the base revision: --base <rev>");
  const approved = argv.includes("--approved");
  const dist = path.join(repo, "dist");
  if (!fs.existsSync(path.join(dist, "index.html")))
    throw Error("Missing dist/: run npm run build first");
  const baseSha = git("rev-parse", "--verify", `${baseRef}^{commit}`);
  const head = measureSize(dist);

  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "plan-measure-size-base-"));
  const modules = path.join(worktree, "node_modules");
  let base;
  git("worktree", "add", "--detach", worktree, baseSha);
  try {
    // npm ci installs exactly the lockfile: if it matches, so does node_modules; if not, the base installs its own.
    const sameDependencies = git("diff", "--name-only", baseSha, "--", "package-lock.json") === "";
    if (sameDependencies) fs.symlinkSync(path.join(repo, "node_modules"), modules, "dir");
    else
      execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: worktree, stdio: "inherit" });
    execFileSync("npm", ["run", "build"], { cwd: worktree, stdio: "inherit" });
    // Measured with this revision's code, so both sides use the same definition of each metric.
    base = measureSize(path.join(worktree, "dist"));
  } finally {
    // Remove the link before the worktree so the repository's node_modules is left untouched.
    if (fs.lstatSync(modules, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(modules);
    git("worktree", "remove", "--force", worktree);
  }

  // Files not yet committed count the same as in the merge commit that CI measures.
  const changedMachinery = [
    git("diff", "--name-only", baseSha, "--", ...sizeMachinery),
    git("ls-files", "--others", "--exclude-standard", "--", ...sizeMachinery),
  ]
    .join("\n")
    .split("\n")
    .filter(Boolean)
    .sort();
  const result = evaluateSize({
    head,
    base,
    baseBudget: baseBudgetAt(baseSha),
    approved,
    changedMachinery,
  });
  const baseName = baseSha.slice(0, 7);
  publishSizeReport(
    result,
    formatSizeReport(result, { base, head, baseName }),
    `Bundle size vs ${baseName}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
