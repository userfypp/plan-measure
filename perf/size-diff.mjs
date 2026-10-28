// Compares the dist/ build with that of another revision, built in a temporary worktree with the same
// measurement code. Fails if the pull request grows more than its allowance or relaxes the budget without
// the approval label (`--approved`). Usage: npm run build && npm run perf:size:diff -- --base origin/main
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as headBudgets from './budgets.mjs';
import { measureSize } from './size.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Changing how the budget is measured or enforced also requires approval; its numbers
// (size-budget.json) are compared by value in compareSizeBudgets.
export const sizeMachinery = ['perf/budgets.mjs', 'perf/size.mjs', 'perf/size-diff.mjs', '.github/workflows/performance.yml'];

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const budgetsOf = module => ({
  sizeLimits: module.sizeLimits, sizeGrowthAllowance: module.sizeGrowthAllowance,
  ceilingHeadroom: module.ceilingHeadroom, forbiddenStartup: module.forbiddenStartup,
});

export function formatReport(rows, needsApproval, approved) {
  const sign = value => (value > 0 ? `+${value}` : String(value));
  const lines = [
    '| Metric | Base | PR | Change | Per-PR allowance | Ceiling |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(row => `| ${row.metric} | ${row.base} | ${row.head} | ${sign(row.delta)} | ${row.allowance} | ${row.limit} |`),
  ];
  if (needsApproval.length) {
    lines.push('', approved ? `Approved with the "${headBudgets.SIZE_APPROVAL_LABEL}" label:` : `Requires the "${headBudgets.SIZE_APPROVAL_LABEL}" label:`);
    lines.push(...needsApproval.map(item => `- ${item}`));
  }
  return lines.join('\n');
}

async function main(argv) {
  const baseIndex = argv.indexOf('--base');
  const baseRef = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
  if (!baseRef) throw Error('Specify the base revision: --base <rev>');
  const approved = argv.includes('--approved');
  const dist = path.join(repo, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw Error('Missing dist/: run npm run build first');
  const baseSha = git('rev-parse', '--verify', `${baseRef}^{commit}`);
  const headMetrics = measureSize(dist);

  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-measure-size-base-'));
  const modules = path.join(worktree, 'node_modules');
  let baseMetrics, baseModule;
  git('worktree', 'add', '--detach', worktree, baseSha);
  try {
    // npm ci installs exactly the lockfile: if it matches, so does node_modules; if not, the base installs its own.
    const sameDependencies = git('diff', '--name-only', baseSha, '--', 'package-lock.json') === '';
    if (sameDependencies) fs.symlinkSync(path.join(repo, 'node_modules'), modules, 'dir');
    else execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: worktree, stdio: 'inherit' });
    execFileSync('npm', ['run', 'build'], { cwd: worktree, stdio: 'inherit' });
    baseMetrics = measureSize(path.join(worktree, 'dist'));
    baseModule = await import(pathToFileURL(path.join(worktree, 'perf/budgets.mjs')).href);
  } finally {
    // Remove the link before the worktree so the repository's node_modules is left untouched.
    if (fs.lstatSync(modules, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(modules);
    git('worktree', 'remove', '--force', worktree);
  }

  const { rows, needsApproval } = headBudgets.compareSizeBudgets(
    { metrics: baseMetrics, budgets: budgetsOf(baseModule) },
    { metrics: headMetrics, budgets: budgetsOf(headBudgets) },
  );
  // Files not yet committed count the same as in the merge commit that CI measures.
  const changedMachinery = [
    git('diff', '--name-only', baseSha, '--', ...sizeMachinery),
    git('ls-files', '--others', '--exclude-standard', '--', ...sizeMachinery),
  ].join('\n').split('\n').filter(Boolean).sort();
  needsApproval.push(...changedMachinery.map(file => `${file} changes`));

  const report = formatReport(rows, needsApproval, approved);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Size vs ${baseSha.slice(0, 7)}\n\n${report}\n`);
  if (needsApproval.length && !approved) {
    console.error(`\nIf the increase is justified, the maintainer adds the "${headBudgets.SIZE_APPROVAL_LABEL}" label to the pull request; otherwise, split the code.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
