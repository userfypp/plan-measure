import assert from 'node:assert/strict';
import fs from 'node:fs';

// Los números del presupuesto viven en size-budget.json: la CI los compara con los de la base, así que
// bajarlos no requiere aprobación y subirlos o quitarlos sí. Todos son bytes decimales.
const budget = JSON.parse(fs.readFileSync(new URL('./size-budget.json', import.meta.url), 'utf8'));
// Techos absolutos: todo build debe caber. Cada uno es el tamaño medido más `ceilingHeadroom.target`
// márgenes; subirlo requiere aprobación y bajarlo es obligatorio cuando el build queda más de
// `ceilingHeadroom.maximum` márgenes por debajo.
export const sizeLimits = budget.sizeLimits;
// Crecimiento que un pull request puede añadir a cada métrica sin aprobación. En el historial de main
// lo superan todas las funcionalidades (desde 541 B gzip) y casi ninguna corrección (20 de 22, hasta 91 B gzip).
export const sizeGrowthAllowance = budget.sizeGrowthAllowance;
// Holgura de los techos sobre el build, en múltiplos de `sizeGrowthAllowance`.
export const ceilingHeadroom = budget.ceilingHeadroom;
// La añade el mantenedor a un pull request tras revisar un aumento justificado; nunca un agente.
export const SIZE_APPROVAL_LABEL = 'size: approved';
export const forbiddenStartup = /(?:pdfjs|pdf(?:[.-]|\.worker)|pdf-lib|annotatedPdf|xlsx|pdfjs-dist|pdfLib|(?:^|\/)es-[^/]+\.js(?:[?#]|$))/i;
export function checkStartup(requests, workers = []) {
  for (const request of requests) assert.ok(!forbiddenStartup.test(request), `Carga inicial diferida infringida: ${request}`);
  assert.equal(workers.length, 0, `Worker durante arranque: ${workers.join(', ')}`);
}
/** Techo que corresponde a un tamaño medido: el tamaño más `ceilingHeadroom.target` márgenes. */
export function sizeCeiling(metric, value, allowance = sizeGrowthAllowance) {
  return value + ceilingHeadroom.target * allowance[metric];
}
export function checkSize(metrics, limits = sizeLimits, allowance = sizeGrowthAllowance) {
  for (const key of Object.keys(limits)) {
    assert.ok(Number.isFinite(metrics[key]), `Falta tamaño ${key}`);
    assert.ok(Number.isInteger(allowance[key]) && allowance[key] > 0, `Falta margen por PR para ${key}`);
    assert.ok(metrics[key] <= limits[key],
      `${key}: ${metrics[key]} > ${limits[key]}. Divide el código; si el aumento está justificado, sube el techo a ${sizeCeiling(key, metrics[key], allowance)} con la etiqueta "${SIZE_APPROVAL_LABEL}"`);
    // Trinquete: un ahorro grande baja el techo para que ese margen no se gaste sin decidirlo.
    assert.ok(limits[key] <= metrics[key] + ceilingHeadroom.maximum * allowance[key],
      `${key}: el techo ${limits[key]} deja más de ${ceilingHeadroom.maximum} márgenes sobre ${metrics[key]}; bájalo a ${sizeCeiling(key, metrics[key], allowance)}`);
  }
  checkStartup(metrics.startupFiles);
}
/**
 * Compara el presupuesto y el build de la base con los de un pull request. Devuelve las filas del
 * informe y lo que requiere la etiqueta de aprobación: crecimiento por encima del margen y cualquier
 * relajación del presupuesto (un techo, margen u holgura que sube o desaparece, o la lista de
 * dependencias prohibidas en el arranque que cambia).
 */
export function compareSizeBudgets(base, head) {
  const rows = Object.keys(head.budgets.sizeLimits).map(metric => ({
    metric, base: base.metrics[metric], head: head.metrics[metric], delta: head.metrics[metric] - base.metrics[metric],
    allowance: head.budgets.sizeGrowthAllowance[metric], limit: head.budgets.sizeLimits[metric],
  }));
  const needsApproval = [];
  for (const row of rows) {
    assert.ok(Number.isFinite(row.base) && Number.isFinite(row.head), `Falta tamaño ${row.metric}`);
    assert.ok(Number.isInteger(row.allowance) && row.allowance > 0, `Falta margen por PR para ${row.metric}`);
    if (row.delta > row.allowance) needsApproval.push(`${row.metric} crece ${row.delta} B (margen por PR: ${row.allowance} B)`);
  }
  for (const group of ['sizeLimits', 'sizeGrowthAllowance', 'ceilingHeadroom']) {
    for (const [key, previous] of Object.entries(base.budgets[group] ?? {})) {
      const next = head.budgets[group]?.[key];
      if (next === undefined) needsApproval.push(`${group}.${key} desaparece`);
      else if (next > previous) needsApproval.push(`${group}.${key} sube de ${previous} a ${next}`);
    }
  }
  if (base.budgets.forbiddenStartup !== undefined && String(base.budgets.forbiddenStartup) !== String(head.budgets.forbiddenStartup)) {
    needsApproval.push('forbiddenStartup cambia');
  }
  return { rows, needsApproval };
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
