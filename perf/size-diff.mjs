// Compara el build de dist/ con el de otra revisión, construida en un worktree temporal con el mismo
// código de medición. Falla si el pull request crece más que su margen o relaja el presupuesto sin la
// etiqueta de aprobación (`--approved`). Uso: npm run build && npm run perf:size:diff -- --base origin/main
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as headBudgets from './budgets.mjs';
import { measureSize } from './size.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Cambiar cómo se mide o se exige el presupuesto también requiere aprobación; sus números
// (size-budget.json) se comparan por valor en compareSizeBudgets.
export const sizeMachinery = ['perf/budgets.mjs', 'perf/size.mjs', 'perf/size-diff.mjs', '.github/workflows/performance.yml'];

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const budgetsOf = module => ({
  sizeLimits: module.sizeLimits, sizeGrowthAllowance: module.sizeGrowthAllowance,
  ceilingHeadroom: module.ceilingHeadroom, forbiddenStartup: module.forbiddenStartup,
});

export function formatReport(rows, needsApproval, approved) {
  const sign = value => (value > 0 ? `+${value}` : String(value));
  const lines = [
    '| Métrica | Base | PR | Diferencia | Margen por PR | Techo |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(row => `| ${row.metric} | ${row.base} | ${row.head} | ${sign(row.delta)} | ${row.allowance} | ${row.limit} |`),
  ];
  if (needsApproval.length) {
    lines.push('', approved ? `Aprobado con la etiqueta "${headBudgets.SIZE_APPROVAL_LABEL}":` : `Requiere la etiqueta "${headBudgets.SIZE_APPROVAL_LABEL}":`);
    lines.push(...needsApproval.map(item => `- ${item}`));
  }
  return lines.join('\n');
}

async function main(argv) {
  const baseIndex = argv.indexOf('--base');
  const baseRef = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
  if (!baseRef) throw Error('Indica la revisión base: --base <rev>');
  const approved = argv.includes('--approved');
  const dist = path.join(repo, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw Error('Falta dist/: ejecuta npm run build antes');
  const baseSha = git('rev-parse', '--verify', `${baseRef}^{commit}`);
  const headMetrics = measureSize(dist);

  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-measure-size-base-'));
  const modules = path.join(worktree, 'node_modules');
  let baseMetrics, baseModule;
  git('worktree', 'add', '--detach', worktree, baseSha);
  try {
    // npm ci instala exactamente el lockfile: si coincide, node_modules también; si no, la base instala el suyo.
    const sameDependencies = git('diff', '--name-only', baseSha, '--', 'package-lock.json') === '';
    if (sameDependencies) fs.symlinkSync(path.join(repo, 'node_modules'), modules, 'dir');
    else execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: worktree, stdio: 'inherit' });
    execFileSync('npm', ['run', 'build'], { cwd: worktree, stdio: 'inherit' });
    baseMetrics = measureSize(path.join(worktree, 'dist'));
    baseModule = await import(pathToFileURL(path.join(worktree, 'perf/budgets.mjs')).href);
  } finally {
    // Quita el enlace antes que el worktree para no tocar el node_modules del repositorio.
    if (fs.lstatSync(modules, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(modules);
    git('worktree', 'remove', '--force', worktree);
  }

  const { rows, needsApproval } = headBudgets.compareSizeBudgets(
    { metrics: baseMetrics, budgets: budgetsOf(baseModule) },
    { metrics: headMetrics, budgets: budgetsOf(headBudgets) },
  );
  // Los archivos aún sin commit cuentan igual que en el commit de merge que mide la CI.
  const changedMachinery = [
    git('diff', '--name-only', baseSha, '--', ...sizeMachinery),
    git('ls-files', '--others', '--exclude-standard', '--', ...sizeMachinery),
  ].join('\n').split('\n').filter(Boolean).sort();
  needsApproval.push(...changedMachinery.map(file => `${file} cambia`));

  const report = formatReport(rows, needsApproval, approved);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Tamaño frente a ${baseSha.slice(0, 7)}\n\n${report}\n`);
  if (needsApproval.length && !approved) {
    console.error(`\nSi el aumento está justificado, el mantenedor añade la etiqueta "${headBudgets.SIZE_APPROVAL_LABEL}" al pull request; si no, divide el código.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
