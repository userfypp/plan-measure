import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSize, checkStartup, compareResults, median, sizeLimits } from './budgets.mjs';
import { measureSize } from './size.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('Los límites detectan principal, gzip, arranque y dependencias diferidas', () => {
  const good = { ...sizeLimits, startupFiles: ['assets/index.js'] };
  checkSize(good);
  for (const metric of Object.keys(sizeLimits)) assert.throws(() => checkSize({ ...good, [metric]: good[metric] + 1 }));
  for (const file of ['pdfjs.js', 'pdf.worker.js', 'pdf-lib.js', 'pdf-ABCD.js', 'annotatedPdf-ABCD.js', 'es-ABCD.js', 'https://example.test/assets/es-BOjZJYv9.js', 'xlsx.js']) assert.throws(() => checkSize({ ...good, startupFiles: [file] }));
});
test('El grafo de arranque sigue imports estáticos y excluye import()', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-size-'));
  try {
    fs.mkdirSync(path.join(tmp, 'assets'));
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
test('La comparación falla con +31 %, objetivos FPS y muestras incompletas', () => {
  const baseline = { schema: 1, samples: 5, scenarios: [{ name: 'M1000/4x/zoom', rawMedianFps: 40, metrics: { maxPauseMs: 100, elapsedMs: 1000, longTasks: 10, domNodes: 700, mountedShapes: 5000, heapBytes: 1000000, fps: 40 } }] };
  assert.deepEqual(compareResults(structuredClone(baseline), baseline), []);
  for (const metric of ['maxPauseMs', 'elapsedMs', 'longTasks', 'domNodes', 'mountedShapes', 'heapBytes']) {
    const mutant = structuredClone(baseline);
    mutant.scenarios[0].metrics[metric] *= 1.31;
    assert.ok(compareResults(mutant, baseline).some(failure => failure.includes(metric)));
  }
  const fps = structuredClone(baseline); fps.scenarios[0].metrics.fps = 31; fps.scenarios[0].rawMedianFps = 29;
  assert.ok(compareResults(fps, baseline).some(failure => failure.includes('objetivo')));
  assert.throws(() => compareResults({ ...baseline, samples: 1 }, baseline));
  assert.equal(median([9, 2, 4, 1, 3]), 3);
});

test('El probe de arranque rechaza peticiones PDF y workers incluso blob:', () => {
  checkStartup(['http://localhost/plan-measure/assets/index.js']);
  assert.throws(() => checkStartup(['http://localhost/plan-measure/assets/es-BOjZJYv9.js']));
  assert.throws(() => checkStartup([], ['blob:http://localhost/worker-pdf']));
});
