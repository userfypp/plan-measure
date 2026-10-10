import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { chromium } from 'playwright';
import { generateFixtures } from './fixtures.mjs';
import { measureSize } from './size.mjs';
import { instrument, ready, seed, calibration, measure, gesture, drag } from './browser.mjs';
import { checkStartup, median, compareResults, fpsWarnings } from './budgets.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = process.env.PLAN_MEASURE_REPO || path.dirname(root);
const update = process.argv.includes('--update-baseline');
const strict = process.argv.includes('--strict');
const samples = Number(process.env.PERF_SAMPLES || 5);
const counts = process.env.PERF_COUNT ? [Number(process.env.PERF_COUNT)] : [1000, 5000];
const cpus = process.env.PERF_CPU ? [Number(process.env.PERF_CPU)] : [1, 4];
const partial = samples !== 5 || counts.length !== 2 || cpus.length !== 2 || process.env.PERF_SKIP_PDF === '1';
if (update && partial) throw Error('La línea base requiere matriz completa y cinco muestras; retira PERF_* de filtrado');
if (!fs.existsSync(path.join(repo, 'dist/index.html'))) throw Error('Ejecuta npm run build antes del benchmark');
const fixtures = generateFixtures(path.join(root, '.tmp'), { large: process.env.PERF_SKIP_PDF !== '1' });
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
const baselineFile = path.join(root, 'baseline.json');
const baseline = !update && fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile)) : null;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sourceCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
if (sourceCommit.status !== 0) throw Error('No se pudo identificar el commit del checkout');
const sourceDiff = spawnSync('git', ['diff', 'HEAD', '--', 'src', 'package.json', 'package-lock.json', 'vite.config.ts'], { cwd: repo, encoding: 'utf8' });
if (sourceDiff.status !== 0) throw Error('No se pudo identificar el diff de la fuente');
const buildMetrics = measureSize(path.join(repo, 'dist'));
const environment = { sourceCommit: sourceCommit.stdout.trim(), sourceDirty: sourceDiff.stdout.length > 0,
  sourceDiffSha256: sha256(sourceDiff.stdout), node: process.version, platform: process.platform, arch: process.arch, osRelease: os.release(),
  indexHtmlSha256: sha256(fs.readFileSync(path.join(repo, 'dist/index.html'))),
  startupFiles: buildMetrics.startupFiles.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(repo, 'dist', file))) })) };
const port = Number(process.env.PERF_PORT || 4183);
const url = process.env.PERF_URL || `http://127.0.0.1:${port}/plan-measure/`;
let server;
if (!process.env.PERF_URL) {
  server = spawn(process.execPath, [path.join(repo, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: repo, stdio: 'pipe' });
  let stderr = ''; server.stderr.on('data', data => { stderr += data; });
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw Error('Preview terminó: ' + stderr);
      try { if ((await fetch(url)).ok) break; } catch { /* servidor arrancando */ }
      if (attempt === 59) throw Error('Preview no disponible');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) { server.kill(); throw error; }
}
const output = { schema: 1, samples, environment, createdAt: new Date().toISOString(), viewport: { width: 1440, height: 900, dpr: 2 },
  fixture: { seed: 20261009, pdfCBytes: fs.existsSync(fixtures.scan) ? fs.statSync(fixtures.scan).size : null }, rawSamples: [], scenarios: [] };
let browser;
async function context(cpu) {
  const result = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
  await result.addInitScript(instrument); const page = await result.newPage(); page.setDefaultTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  const cdp = await result.newCDPSession(page); await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const requests = []; const workers = [];
  page.on('request', request => requests.push(request.url()));
  page.on('worker', worker => workers.push(worker.url()));
  await page.goto(url); await page.waitForLoadState('networkidle');
  checkStartup(requests, workers);
  const calibrationMs = await calibration(page);
  return { result, page, cdp, errors, calibrationMs };
}
async function record(name, sample, c, action, { fps = false } = {}) {
  const { gestureTiming, ...metrics } = await measure(c.page, c.cdp, action);
  if (!fps) delete metrics.fps;
  if (name.includes('/zoom') && metrics.mountedShapes === 0) throw Error('Instrumentación no encontró formas montadas');
  const row = { name, sample, calibrationMs: c.calibrationMs, metrics, gestureTiming, persistence: c.persistence };
  output.rawSamples.push(row);
  fs.writeFileSync(path.join(root, 'results/latest.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(row));
}
try {
  browser = await chromium.launch(process.env.PERF_BROWSER_CHANNEL ? { channel: process.env.PERF_BROWSER_CHANNEL } : {});
  output.browser = browser.version();
  for (let sample = 0; sample < samples; sample++) for (const cpu of cpus) {
    for (const count of counts) {
      const c = await context(cpu);
      try {
        await c.page.locator('input[accept="application/pdf,.pdf"]').setInputFiles(fixtures.control); await ready(c.page); await c.page.waitForTimeout(1000);
        c.persistence = await seed(c.page, count);
        const name = `M${count}/${cpu}x`;
        await record(name + '/pan', sample, c, () => gesture(c.page, 'pan'), { fps: true });
        await c.page.getByRole('button', { name: 'Fit page to viewer', exact: true }).click(); await c.page.waitForTimeout(500);
        await record(name + '/zoom', sample, c, () => gesture(c.page, 'zoom'), { fps: true });
        await c.page.getByRole('button', { name: 'Fit page to viewer', exact: true }).click(); await c.page.waitForTimeout(500);
        await record(name + '/drag', sample, c, () => drag(c.page), { fps: true });
        await record(name + '/firstCSV', sample, c, async () => {
          // Incluye descarga inicial del chunk y apertura del diálogo; primera exportación real.
          await c.page.getByRole('button', { name: 'Export', exact: true }).click();
          const pending = c.page.waitForEvent('download'); await c.page.getByRole('button', { name: 'Export CSV', exact: true }).click();
          const download = await pending; await download.saveAs(path.join(root, '.tmp', 'latest.csv'));
          if (fs.statSync(path.join(root, '.tmp', 'latest.csv')).size === 0) throw Error('CSV vacío');
        });
        await record(name + '/closeCSV', sample, c, async () => {
          await c.page.keyboard.press('Escape');
          await c.page.getByRole('button', { name: 'Export CSV', exact: true }).waitFor({ state: 'hidden' });
          await c.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        });
        await record(name + '/panel', sample, c, async () => {
          await c.page.getByRole('button', { name: /^Workspace module:/ }).click();
          await c.page.getByRole('menuitemradio', { name: 'Measurements', exact: true }).click();
          await c.page.locator('[data-measurement-id="perf-0"][data-measurement-control="selection"]').waitFor({ state: 'visible' });
          await c.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        });
        if (c.errors.length) throw Error(c.errors.join('\n'));
      } finally { await c.result.close(); }
    }
    if (process.env.PERF_SKIP_PDF !== '1') {
      const c = await context(cpu);
      try {
        await record(`PDF-C/${cpu}x/open`, sample, c, async () => {
          await c.page.locator('input[accept="application/pdf,.pdf"]').setInputFiles(fixtures.scan); await ready(c.page); await c.page.waitForTimeout(1200);
        });
        if (c.errors.length) throw Error(c.errors.join('\n'));
      } finally { await c.result.close(); }
    }
  }
  for (const name of [...new Set(output.rawSamples.map(row => row.name))]) {
    const rows = output.rawSamples.filter(row => row.name === name);
    const calibrationMs = median(rows.map(row => row.calibrationMs));
    const referenceCalibrationMs = baseline?.scenarios.find(row => row.name === name)?.calibrationMs || calibrationMs;
    const metrics = {};
    for (const metric of Object.keys(rows[0].metrics)) {
      metrics[metric] = median(rows.map(row => {
        const ratio = referenceCalibrationMs / row.calibrationMs;
        return row.metrics[metric] * (metric.endsWith('Ms') ? ratio : metric === 'fps' ? 1 / ratio : 1);
      }));
    }
    output.scenarios.push({ name, calibrationMs, referenceCalibrationMs,
      ...(metrics.fps === undefined ? {} : { rawMedianFps: median(rows.map(row => row.metrics.fps)) }), metrics });
  }
  if (!partial) {
    output.targetWarnings = fpsWarnings(output);
    if (output.targetWarnings.length) console.warn('AVISO: mínimos absolutos de zoom incumplidos' + (strict ? ' (modo estricto: fallo)' : ' (modo normal: no bloquean)') + ':\n' + output.targetWarnings.join('\n'));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Rendimiento e2e: modo ${strict ? 'estricto' : 'normal'}\n\n${output.targetWarnings.length ? '**Aviso: mínimos absolutos de zoom incumplidos.**\n\n' + output.targetWarnings.map(warning => '- ' + warning).join('\n') : 'Mínimos absolutos de zoom cumplidos.'}\n\n`);
  }
  fs.writeFileSync(path.join(root, 'results/latest.json'), JSON.stringify(output, null, 2));
  if (update) {
    // Registrar una base conserva los avisos; el modo estricto exige los mínimos.
    fs.writeFileSync(baselineFile, JSON.stringify(output, null, 2) + '\n');
    console.log('Línea base actualizada explícitamente. Revisa/commitea el diff; el modo estricto conserva los mínimos FPS.');
  } else if (partial) console.log('Ejecución parcial diagnóstica: no compara ni actualiza línea base.');
  else {
    if (!baseline) throw Error('Falta perf/baseline.json: ejecuta perf:update-baseline explícitamente');
    const failures = compareResults(output, baseline, { strict });
    if (failures.length) throw Error('Presupuestos incumplidos:\n' + failures.join('\n'));
    console.log('Todos los presupuestos e2e en verde.');
  }
} finally { await browser?.close(); server?.kill('SIGTERM'); }
