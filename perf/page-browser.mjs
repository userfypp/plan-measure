import fs from 'node:fs';
import path from 'node:path';
import { compareResults, median } from './budgets.mjs';
import { gesture, measure, ready } from './browser.mjs';

// Generated text pages exercise labels and traversal without a committed PDF binary.
export function pageBrowserFixture(directory) {
  const file = path.join(directory, 'page-browser-120-labels.pdf');
  const bodies = ['<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [0 << /S /r >> 4 << /S /D /P (Plan-) /St 1 >> 64 << /S /D /St 1 >>] >> >>', ''];
  const kids = [];
  for (let index = 0; index < 120; index++) {
    const number = bodies.length + 1;
    kids.push(`${number} 0 R`);
    const content = `0.2 w 20 20 550 800 re S BT /F1 24 Tf 60 750 Td (Page ${index + 1}) Tj ET`;
    bodies.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 243 0 R >> >> /Contents ${number + 1} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  bodies[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count 120 >>`;
  bodies.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let text = '%PDF-1.7\n';
  const offsets = [0];
  for (const [index, body] of bodies.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(file, text);
  return file;
}

export async function pageBrowserBenchmarks({ context, root, fixtures, samples, cpus, environment, browser, recordBaseline = false }) {
  const baselineFile = path.join(root, 'page-browser-baseline.json');
  const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : null;
  const output = { schema: 1, samples, environment, browser, createdAt: new Date().toISOString(), rawSamples: [], scenarios: [] };
  const labels = pageBrowserFixture(path.join(root, '.tmp'));
  for (let sample = 0; sample < samples; sample++) for (const cpu of cpus) for (const [fixtureName, file] of [['labels-120', labels], ['scan-A0', fixtures.scan]]) {
    const c = await context(cpu);
    const name = `Pages/${fixtureName}/${cpu}x`;
    const record = async (suffix, action, { fps = false } = {}) => {
      const { gestureTiming, ...metrics } = await measure(c.page, c.cdp, action);
      if (!fps) delete metrics.fps;
      if (gestureTiming?.maxMountedRows !== undefined) metrics.maxMountedRows = gestureTiming.maxMountedRows;
      output.rawSamples.push({ name: `${name}/${suffix}`, sample, calibrationMs: c.calibrationMs, metrics, gestureTiming });
      fs.writeFileSync(path.join(root, 'results/page-browser-latest.json'), JSON.stringify(output, null, 2));
      console.log(JSON.stringify(output.rawSamples.at(-1)));
    };
    try {
      await c.page.locator('input[accept="application/pdf,.pdf"]').setInputFiles(file);
      await ready(c.page);
      await c.page.waitForTimeout(700);
      await record('closed-pan', () => gesture(c.page, 'pan'), { fps: true });
      await c.page.getByRole('button', { name: 'Fit page to viewer', exact: true }).click();
      await c.page.waitForTimeout(500);
      await record('closed-zoom', () => gesture(c.page, 'zoom'), { fps: true });
      await c.page.getByRole('button', { name: 'Fit page to viewer', exact: true }).click();
      await c.page.waitForTimeout(500);
      await record('first-thumbnail', async () => {
        await c.page.getByRole('button', { name: 'Pages', exact: true }).click();
        await c.page.waitForFunction(() => [...document.querySelectorAll('canvas[aria-label^="Thumbnail for page"]')].some(canvas => window.perfAudit.draws.has(canvas)));
      });
      await record('open-pan', () => gesture(c.page, 'pan'), { fps: true });
      await c.page.getByRole('button', { name: 'Fit page to viewer', exact: true }).click();
      await c.page.waitForTimeout(500);
      await record('open-zoom', () => gesture(c.page, 'zoom'), { fps: true });
      await record('traverse', async () => {
        const list = c.page.getByRole('listbox', { name: 'Pages list', exact: true });
        const height = await list.evaluate(element => element.scrollHeight);
        let maxMountedRows = 0;
        for (let top = 0; top < height; top += 480) {
          await list.evaluate((element, scrollTop) => { element.scrollTop = scrollTop; }, top);
          await c.page.waitForTimeout(150);
          maxMountedRows = Math.max(maxMountedRows, await list.getByRole('option').count());
        }
        await c.page.waitForTimeout(700);
        await c.cdp.send('HeapProfiler.collectGarbage');
        return { maxMountedRows };
      });
      // Repeat traversal to expose retained heap growth after reaching the cache limit.
      await record('traverse-again', async () => {
        const list = c.page.getByRole('listbox', { name: 'Pages list', exact: true });
        const height = await list.evaluate(element => element.scrollHeight);
        let maxMountedRows = 0;
        for (let top = height; top >= 0; top -= 480) {
          await list.evaluate((element, scrollTop) => { element.scrollTop = scrollTop; }, top);
          await c.page.waitForTimeout(150);
          maxMountedRows = Math.max(maxMountedRows, await list.getByRole('option').count());
        }
        await c.page.waitForTimeout(700);
        await c.cdp.send('HeapProfiler.collectGarbage');
        return { maxMountedRows };
      });
      if (c.errors.length) throw Error(c.errors.join('\n'));
    } finally { await c.result.close(); }
  }
  for (const name of [...new Set(output.rawSamples.map(row => row.name))]) {
    const rows = output.rawSamples.filter(row => row.name === name);
    const calibrationMs = median(rows.map(row => row.calibrationMs));
    const referenceCalibrationMs = baseline?.scenarios.find(row => row.name === name)?.calibrationMs || calibrationMs;
    const metrics = Object.fromEntries(Object.keys(rows[0].metrics).map(metric => [metric, median(rows.map(row => {
      const ratio = referenceCalibrationMs / row.calibrationMs;
      return row.metrics[metric] * (metric.endsWith('Ms') ? ratio : metric === 'fps' ? 1 / ratio : 1);
    }))]));
    output.scenarios.push({ name, calibrationMs, referenceCalibrationMs, metrics });
  }
  output.panelComparison = output.scenarios.filter(row => /\/open-(pan|zoom)$/.test(row.name)).map(row => {
    const closed = output.scenarios.find(other => other.name === row.name.replace('/open-', '/closed-'));
    return { name: row.name, closedFps: closed.metrics.fps, openFps: row.metrics.fps, changePercent: (row.metrics.fps / closed.metrics.fps - 1) * 100 };
  });
  output.heapComparison = output.scenarios.filter(row => row.name.endsWith('/traverse-again')).map(row => {
    const first = output.scenarios.find(other => other.name === row.name.replace('/traverse-again', '/traverse'));
    return { name: row.name, firstBytes: first.metrics.heapBytes, secondBytes: row.metrics.heapBytes, changeBytes: row.metrics.heapBytes - first.metrics.heapBytes };
  });
  output.panelWarnings = output.scenarios.filter(row => /\/open-(pan|zoom)$/.test(row.name)).flatMap(row => {
    const closed = output.scenarios.find(other => other.name === row.name.replace('/open-', '/closed-'));
    return row.metrics.fps < closed.metrics.fps * 0.7 ? [`${row.name}: open-panel FPS ${row.metrics.fps.toFixed(2)} versus closed ${closed.metrics.fps.toFixed(2)}`] : [];
  });
  fs.writeFileSync(path.join(root, 'results/page-browser-latest.json'), JSON.stringify(output, null, 2));
  if (output.panelWarnings.length) console.warn(output.panelWarnings.join('\n'));
  if (recordBaseline) {
    if (samples !== 5 || cpus.length !== 2) throw Error('The page browser baseline requires five samples at both CPU rates.');
    if (baseline) throw Error('The page browser baseline already exists; preserving its entries.');
    const { rawSamples: measuredSamples, ...baselineOutput } = output;
    if (measuredSamples.length !== output.scenarios.length * 5) throw Error('Incomplete page browser baseline samples.');
    fs.writeFileSync(baselineFile, JSON.stringify(baselineOutput, null, 2) + '\n');
  } else if (samples === 5 && cpus.length === 2) {
    if (!baseline) throw Error('Missing page browser baseline; record it with --record-page-browser-baseline.');
    const failures = compareResults(output, baseline);
    if (failures.length) throw Error(`Page browser budgets failed:\n${failures.join('\n')}`);
  }
  console.log(`Page browser benchmarks complete: ${output.scenarios.length} scenarios.`);
  return output;
}
