import assert from 'node:assert/strict';

export const sizeLimits = { mainBytes: 480_000, mainGzipBytes: 140_000, startupBytes: 511_660 };
export const forbiddenStartup = /(?:pdfjs|pdf(?:[.-]|\.worker)|pdf-lib|annotatedPdf|xlsx|pdfjs-dist|pdfLib|(?:^|\/)es-[^/]+\.js(?:[?#]|$))/i;
export function checkStartup(requests, workers = []) {
  for (const request of requests) assert.ok(!forbiddenStartup.test(request), `Carga inicial diferida infringida: ${request}`);
  assert.equal(workers.length, 0, `Worker durante arranque: ${workers.join(', ')}`);
}
export function checkSize(metrics, limits = sizeLimits) {
  for (const key of Object.keys(limits)) {
    assert.ok(Number.isFinite(metrics[key]), `Falta tamaño ${key}`);
    assert.ok(metrics[key] <= limits[key], `${key}: ${metrics[key]} > ${limits[key]}`);
  }
  checkStartup(metrics.startupFiles);
}
export function median(values) {
  assert.ok(values.length > 0 && values.every(Number.isFinite), 'Muestras inválidas');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export const relativeTolerance = 0.30;
export function fpsWarnings(current) {
  return current.scenarios.flatMap(row => {
    if (!/^M1000\/4x\/zoom$|^M5000\/1x\/zoom$/.test(row.name)) return [];
    assert.ok(Number.isFinite(row.rawMedianFps), `Falta FPS real para ${row.name}`);
    return row.rawMedianFps < 30 ? [`${row.name}/fps real: ${row.rawMedianFps.toFixed(2)} < objetivo 30`] : [];
  });
}
export function compareResults(current, baseline, { strict = false } = {}) {
  assert.equal(current.schema, baseline.schema, 'La versión del benchmark cambió');
  assert.equal(current.samples, 5, 'La comparación requiere cinco muestras');
  assert.equal(baseline.samples, 5, 'La línea base requiere cinco muestras');
  assert.deepEqual(current.scenarios.map(row => row.name).sort(), baseline.scenarios.map(row => row.name).sort(), 'Escenarios incompletos o duplicados');
  for (const result of [current, baseline]) {
    if (!result.rawSamples) continue;
    for (const scenario of result.scenarios) {
      const samples = result.rawSamples.filter(row => row.name === scenario.name).map(row => row.sample).sort((a, b) => a - b);
      assert.deepEqual(samples, [0, 1, 2, 3, 4], `Muestras incompletas o duplicadas ${scenario.name}`);
    }
  }
  const warnings = fpsWarnings(current);
  const failures = [];
  for (const row of current.scenarios) {
    const previous = baseline.scenarios.find(item => item.name === row.name);
    assert.ok(previous, `Falta línea base para ${row.name}`);
    assert.deepEqual(Object.keys(row.metrics).sort(), Object.keys(previous.metrics).sort(), `Métricas incompletas ${row.name}`);
    for (const [metric, value] of Object.entries(row.metrics)) {
      assert.ok(Number.isFinite(value) && Number.isFinite(previous.metrics[metric]), `Métrica inválida ${row.name}/${metric}`);
      if (metric === 'fps') continue; // La caída relativa se comprueba debajo.
      // Un long task nuevo o una forma más no representa por sí solo una regresión.
      const floor = metric === 'longTasks' ? 2 : metric === 'mountedShapes' ? 10 : metric === 'domNodes' ? 20 : 0;
      if (value > Math.max(previous.metrics[metric] * (1 + relativeTolerance), previous.metrics[metric] + floor)) {
        failures.push(`${row.name}/${metric}: ${value.toFixed(2)} > ${previous.metrics[metric].toFixed(2)} +30 %`);
      }
    }
    if (row.metrics.fps !== undefined && row.metrics.fps < previous.metrics.fps * (1 - relativeTolerance)) {
      failures.push(`${row.name}/fps: caída superior al 30 %`);
    }
  }
  assert.equal(current.scenarios.length, baseline.scenarios.length, 'Escenarios incompletos');
  if (strict) failures.push(...warnings);
  return failures;
}
