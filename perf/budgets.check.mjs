import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE_APPROVAL_LABEL, ceilingHeadroom, checkSize, checkStartup, compareResults, compareSizeBudgets, forbiddenStartup,
  fpsWarnings, median, sizeCeiling, sizeGrowthAllowance, sizeLimits,
} from './budgets.mjs';
import { measureSize } from './size.mjs';
import { formatReport, sizeMachinery } from './size-diff.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Los límites detectan principal, gzip, arranque y dependencias diferidas', () => {
  const good = { ...sizeLimits, startupFiles: ['assets/index.js'] };
  checkSize(good);
  for (const metric of Object.keys(sizeLimits)) assert.throws(() => checkSize({ ...good, [metric]: good[metric] + 1 }));
  for (const file of ['pdfjs.js', 'pdf.worker.js', 'pdf-lib.js', 'pdf-ABCD.js', 'annotatedPdf-ABCD.js', 'es-ABCD.js', 'https://example.test/assets/es-BOjZJYv9.js', 'xlsx.js']) assert.throws(() => checkSize({ ...good, startupFiles: [file] }));
});
test('Cada techo tiene margen por PR y la holgura objetivo cabe bajo la máxima', () => {
  assert.deepEqual(Object.keys(sizeGrowthAllowance).sort(), Object.keys(sizeLimits).sort());
  for (const value of Object.values(sizeGrowthAllowance)) assert.ok(Number.isInteger(value) && value > 0);
  assert.ok(Number.isInteger(ceilingHeadroom.target) && ceilingHeadroom.target > 0);
  assert.ok(Number.isInteger(ceilingHeadroom.maximum) && ceilingHeadroom.maximum > ceilingHeadroom.target);
  for (const [metric, limit] of Object.entries(sizeLimits)) assert.ok(Number.isInteger(limit) && limit > 0, metric);
});
test('El trinquete exige bajar un techo que deja más holgura que la máxima', () => {
  const good = { ...sizeLimits, startupFiles: [] };
  for (const metric of Object.keys(sizeLimits)) {
    const lowest = sizeLimits[metric] - ceilingHeadroom.maximum * sizeGrowthAllowance[metric];
    checkSize({ ...good, [metric]: lowest });
    assert.throws(() => checkSize({ ...good, [metric]: lowest - 1 }),
      new RegExp(`${metric}: .*bájalo a ${sizeCeiling(metric, lowest - 1)}$`));
    assert.throws(() => checkSize({ ...good, [metric]: sizeLimits[metric] + 1 }),
      new RegExp(`sube el techo a ${sizeCeiling(metric, sizeLimits[metric] + 1)} con la etiqueta "${SIZE_APPROVAL_LABEL}"`));
  }
  assert.equal(sizeCeiling('mainGzipBytes', 1000), 1000 + ceilingHeadroom.target * sizeGrowthAllowance.mainGzipBytes);
  assert.throws(() => checkSize(good, sizeLimits, { ...sizeGrowthAllowance, viewerBytes: 0 }), /margen por PR para viewerBytes/);
});
test('La comparación con la base pide aprobación al crecer más que el margen o relajar el presupuesto', () => {
  const budgets = { sizeLimits, sizeGrowthAllowance, ceilingHeadroom, forbiddenStartup };
  const base = { metrics: { ...sizeLimits }, budgets };
  const grown = metric => ({ metrics: { ...sizeLimits, [metric]: sizeLimits[metric] + sizeGrowthAllowance[metric] }, budgets });
  for (const metric of Object.keys(sizeLimits)) {
    assert.deepEqual(compareSizeBudgets(base, grown(metric)).needsApproval, []);
    const over = grown(metric); over.metrics[metric] += 1;
    assert.deepEqual(compareSizeBudgets(base, over).needsApproval,
      [`${metric} crece ${sizeGrowthAllowance[metric] + 1} B (margen por PR: ${sizeGrowthAllowance[metric]} B)`]);
  }
  const shrunk = { metrics: Object.fromEntries(Object.entries(sizeLimits).map(([key, value]) => [key, value - 10_000])), budgets };
  const { rows, needsApproval } = compareSizeBudgets(base, shrunk);
  assert.deepEqual(needsApproval, []);
  assert.deepEqual(rows.map(row => row.delta), Object.keys(sizeLimits).map(() => -10_000));
  const loosened = changes => compareSizeBudgets(base, { metrics: base.metrics, budgets: { ...budgets, ...changes } }).needsApproval;
  assert.deepEqual(loosened({ sizeLimits: { ...sizeLimits, mainBytes: sizeLimits.mainBytes + 1 } }),
    [`sizeLimits.mainBytes sube de ${sizeLimits.mainBytes} a ${sizeLimits.mainBytes + 1}`]);
  const { viewerBytes, ...withoutViewer } = sizeLimits;
  assert.deepEqual(compareSizeBudgets({ metrics: base.metrics, budgets }, { metrics: base.metrics, budgets: { ...budgets, sizeLimits: withoutViewer } }).needsApproval,
    ['sizeLimits.viewerBytes desaparece']);
  assert.ok(viewerBytes > 0);
  assert.deepEqual(loosened({ sizeGrowthAllowance: { ...sizeGrowthAllowance, mainGzipBytes: sizeGrowthAllowance.mainGzipBytes + 1 } }),
    [`sizeGrowthAllowance.mainGzipBytes sube de ${sizeGrowthAllowance.mainGzipBytes} a ${sizeGrowthAllowance.mainGzipBytes + 1}`]);
  assert.deepEqual(loosened({ ceilingHeadroom: { ...ceilingHeadroom, maximum: ceilingHeadroom.maximum + 1 } }),
    [`ceilingHeadroom.maximum sube de ${ceilingHeadroom.maximum} a ${ceilingHeadroom.maximum + 1}`]);
  assert.deepEqual(loosened({ forbiddenStartup: /pdfjs/i }), ['forbiddenStartup cambia']);
  // Endurecer el presupuesto o añadir una métrica nueva no necesita aprobación.
  assert.deepEqual(loosened({ sizeLimits: Object.fromEntries(Object.entries(sizeLimits).map(([key, value]) => [key, value - 1])) }), []);
  assert.deepEqual(compareSizeBudgets({ metrics: base.metrics, budgets: { ...budgets, sizeLimits: withoutViewer } }, base).needsApproval, []);
  // La primera base sin márgenes por PR solo aporta sus techos.
  assert.deepEqual(compareSizeBudgets({ metrics: base.metrics, budgets: { sizeLimits, forbiddenStartup } }, base).needsApproval, []);
  assert.throws(() => compareSizeBudgets(base, { metrics: base.metrics, budgets: { ...budgets, sizeGrowthAllowance: {} } }), /margen por PR/);
});
test('El informe muestra signos y distingue lo pendiente de lo aprobado', () => {
  const rows = [{ metric: 'mainGzipBytes', base: 100, head: 400, delta: 300, allowance: 250, limit: 1000 },
    { metric: 'viewerBytes', base: 50, head: 40, delta: -10, allowance: 500, limit: 2000 }];
  const pending = formatReport(rows, ['mainGzipBytes crece 300 B (margen por PR: 250 B)'], false);
  assert.match(pending, /\| mainGzipBytes \| 100 \| 400 \| \+300 \| 250 \| 1000 \|/);
  assert.match(pending, /\| viewerBytes \| 50 \| 40 \| -10 \| 500 \| 2000 \|/);
  assert.match(pending, new RegExp(`Requiere la etiqueta "${SIZE_APPROVAL_LABEL}":\n- mainGzipBytes crece 300 B`));
  assert.match(formatReport(rows, ['x'], true), new RegExp(`Aprobado con la etiqueta "${SIZE_APPROVAL_LABEL}"`));
  assert.doesNotMatch(formatReport(rows, [], false), /etiqueta/);
});
test('La CI compara con la base del merge y lee la misma etiqueta que el presupuesto', () => {
  const root = new URL('../', import.meta.url);
  const workflow = fs.readFileSync(new URL('.github/workflows/performance.yml', root), 'utf8');
  assert.match(workflow, /types: \[[^\]]*\blabeled\b[^\]]*\bunlabeled\b[^\]]*\]/);
  assert.match(workflow, /fetch-depth: 2/);
  // Entre comillas: el ": " de la etiqueta cortaría el escalar YAML sin ellas.
  assert.ok(workflow.includes(`APPROVED: "\${{ contains(github.event.pull_request.labels.*.name, '${SIZE_APPROVAL_LABEL}') }}"`));
  assert.match(workflow, /npm run perf:size:diff -- --base HEAD\^1/);
  const scripts = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8')).scripts;
  assert.equal(scripts['perf:size:diff'], 'node perf/size-diff.mjs');
  for (const file of sizeMachinery) assert.ok(fs.existsSync(new URL(file, root)), file);
  // Bajar un techo solo toca los números: no puede requerir la etiqueta.
  assert.ok(!sizeMachinery.includes('perf/size-budget.json'));
});
test('El grafo de arranque sigue imports estáticos y excluye import()', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-size-'));
  try {
    fs.mkdirSync(path.join(tmp, 'assets'));
    fs.writeFileSync(path.join(tmp, 'assets/PdfViewer-ABCD.js'), 'export const viewer=1');
    fs.writeFileSync(path.join(tmp, 'index.html'), '<script type="module" src="/plan-measure/assets/index.js"></script>');
    fs.writeFileSync(path.join(tmp, 'assets/index.js'), 'import "./shared.js";import("./pdf-lib.js")');
    fs.writeFileSync(path.join(tmp, 'assets/shared.js'), 'export const a=1');
    assert.deepEqual(measureSize(tmp).startupFiles, ['assets/index.js', 'assets/shared.js']);
    fs.appendFileSync(path.join(tmp, 'assets/index.js'), ';import "./pdf-lib.js"');
    fs.writeFileSync(path.join(tmp, 'assets/pdf-lib.js'), 'export const pdf=1');
    assert.throws(() => checkSize(measureSize(tmp)));
    fs.writeFileSync(path.join(tmp, 'assets/index.js'), 'export{pdf}from"./pdf-lib.js"');
    assert.throws(() => checkSize(measureSize(tmp)));
    fs.writeFileSync(path.join(tmp, 'assets/index.js'), 'import "./pdf.worker-ABCD.mjs"');
    fs.writeFileSync(path.join(tmp, 'assets/pdf.worker-ABCD.mjs'), 'export const worker=1');
    assert.throws(() => checkSize(measureSize(tmp)));
    fs.writeFileSync(path.join(tmp, 'assets/index.js'), 'export const app=1');
    fs.writeFileSync(path.join(tmp, 'index.html'), '<script src="/assets/index.js"></script><link href="/assets/es-ABCD.js" rel="modulepreload">');
    fs.writeFileSync(path.join(tmp, 'assets/es-ABCD.js'), 'export const pdfLib=1');
    assert.throws(() => checkSize(measureSize(tmp)));
  } finally { fs.rmSync(tmp, { recursive: true }); }
});
test('El visor cuenta su grafo estático que no está en el arranque', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-viewer-'));
  const write = (file, text) => fs.writeFileSync(path.join(tmp, file), text);
  try {
    fs.mkdirSync(path.join(tmp, 'assets'));
    write('index.html', '<script type="module" src="/assets/index.js"></script>');
    write('assets/index.js', 'import "./shared.js";import("./PdfViewer-ABCD.js")');
    write('assets/shared.js', 'export const shared=1');
    write('assets/PdfViewer-ABCD.js', 'import "./shared.js";import "./pdf-ABCD.js";import("./export-ABCD.js")');
    write('assets/pdf-ABCD.js', 'export const pdf=1');
    write('assets/export-ABCD.js', 'export const csv=1');
    const metrics = measureSize(tmp);
    assert.deepEqual(metrics.viewerFiles, ['assets/PdfViewer-ABCD.js', 'assets/pdf-ABCD.js']);
    assert.equal(metrics.viewerBytes, fs.statSync(path.join(tmp, 'assets/PdfViewer-ABCD.js')).size + fs.statSync(path.join(tmp, 'assets/pdf-ABCD.js')).size);
    write('assets/PdfViewer-EFGH.js', 'export const other=1');
    assert.throws(() => measureSize(tmp), /PdfViewer/);
    fs.rmSync(path.join(tmp, 'assets/PdfViewer-ABCD.js'));
    fs.rmSync(path.join(tmp, 'assets/PdfViewer-EFGH.js'));
    assert.throws(() => measureSize(tmp), /PdfViewer/);
  } finally { fs.rmSync(tmp, { recursive: true }); }
});
test('La comparación falla con +31 % y muestras incompletas; FPS absolutos solo bloquean en estricto', () => {
  const baseline = { schema: 1, samples: 5, scenarios: [{ name: 'M1000/4x/zoom', rawMedianFps: 40, metrics: { maxPauseMs: 100, elapsedMs: 1000, longTasks: 10, domNodes: 700, mountedShapes: 5000, heapBytes: 1000000, fps: 40 } }] };
  assert.deepEqual(compareResults(structuredClone(baseline), baseline), []);
  for (const metric of ['maxPauseMs', 'elapsedMs', 'longTasks', 'domNodes', 'mountedShapes', 'heapBytes']) {
    const mutant = structuredClone(baseline);
    mutant.scenarios[0].metrics[metric] *= 1.31;
    assert.ok(compareResults(mutant, baseline).some(failure => failure.includes(metric)));
  }
  const fps = structuredClone(baseline); fps.scenarios[0].metrics.fps = 31; fps.scenarios[0].rawMedianFps = 29;
  assert.deepEqual(compareResults(fps, baseline), []);
  assert.ok(fpsWarnings(fps).some(warning => warning.includes('objetivo')));
  assert.deepEqual(compareResults(fps, baseline, { strict: true }), fpsWarnings(fps));
  const relativeFps = structuredClone(baseline); relativeFps.scenarios[0].metrics.fps *= 0.69;
  assert.ok(compareResults(relativeFps, baseline).some(failure => failure.includes('caída')));
  assert.throws(() => compareResults({ ...baseline, samples: 1 }, baseline));
  assert.throws(() => compareResults({ ...baseline, scenarios: [] }, baseline));
  const sampled = { ...baseline, rawSamples: Array.from({ length: 5 }, (_, sample) => ({ name: baseline.scenarios[0].name, sample })) };
  assert.deepEqual(compareResults(sampled, sampled), []);
  assert.throws(() => compareResults({ ...sampled, rawSamples: sampled.rawSamples.slice(1) }, sampled));
  assert.throws(() => compareResults({ ...sampled, rawSamples: sampled.rawSamples.map(row => ({ ...row, sample: 0 })) }, sampled));
  const otherCommit = { ...sampled, environment: { sourceCommit: 'new-commit', sourceDiffSha256: 'different', indexHtmlSha256: 'different', startupFiles: [{ sha256: 'different' }] } };
  assert.deepEqual(compareResults(otherCommit, { ...sampled, environment: { sourceCommit: 'old-commit' } }), []);
  assert.equal(median([9, 2, 4, 1, 3]), 3);
});

test('El probe de arranque rechaza peticiones PDF y workers incluso blob:', () => {
  checkStartup(['http://localhost/plan-measure/assets/index.js']);
  assert.throws(() => checkStartup(['http://localhost/plan-measure/assets/es-BOjZJYv9.js']));
  assert.throws(() => checkStartup([], ['blob:http://localhost/worker-pdf']));
});
