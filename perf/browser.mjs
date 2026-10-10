import { prepareSession } from './fixtures.mjs';

export function instrument() {
  window.perfAudit = { longtasks: [], frames: [], draws: new WeakMap() };
  const original = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    const result = original.apply(this, args); window.perfAudit.draws.set(this.canvas, performance.now()); return result;
  };
  new PerformanceObserver(list => window.perfAudit.longtasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask' });
}
export async function ready(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[aria-label^="PDF page"]');
    return canvas && canvas.width > 1 && canvas.height > 1 && getComputedStyle(canvas).visibility === 'visible' && window.perfAudit.draws.has(canvas);
  }, null, { timeout: 120000 });
}
// Como el harness histórico: seed solo en memoria si IndexedDB Blob falla.
// No es un test de persistencia y no altera el formato de sesión.
export async function runtime(page, mode, count) {
  return page.evaluate(({ mode, count, source }) => {
    const canvas = document.querySelector('canvas[aria-label^="PDF page"]');
    let fiber = canvas[Object.keys(canvas).find(key => key.startsWith('__reactFiber'))];
    while (fiber.return) fiber = fiber.return;
    const stack = [fiber.stateNode.current];
    while (stack.length) {
      fiber = stack.pop(); if (fiber.sibling) stack.push(fiber.sibling); if (fiber.child) stack.push(fiber.child);
      const value = fiber.memoizedProps?.value;
      if (value && typeof value.loadSession === 'function' && value.session) {
        if (mode === 'read') return value.session;
        const prepare = eval('(' + source + ')'); value.loadSession(prepare(structuredClone(value.session), count)); return;
      }
    }
    throw Error('No se encontró SessionProvider: revisar instrumentación');
  }, { mode, count, source: prepareSession.toString() });
}
export async function seed(page, count) {
  const unavailable = (await page.locator('body').innerText()).includes('Autosave unavailable');
  if (unavailable) await runtime(page, 'seed', count);
  else {
    await page.evaluate(({ count, source }) => new Promise((resolve, reject) => {
      const prepare = eval('(' + source + ')'); const request = indexedDB.open('plan-measure');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('sessions', 'readwrite'); const store = tx.objectStore('sessions');
        const all = store.getAll(); all.onsuccess = () => { for (const record of all.result) if (record.serialized) {
          record.serialized = JSON.stringify(prepare(JSON.parse(record.serialized), count)); store.put(record);
        } };
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    }), { count, source: prepareSession.toString() });
    await page.reload(); await page.getByRole('button', { name: /Continue project/ }).click(); await ready(page);
  }
  await page.waitForTimeout(700);
  return unavailable ? 'runtime (Blob IndexedDB no disponible)' : 'IndexedDB + reapertura';
}
export async function calibration(page) {
  return page.evaluate(() => {
    const samples = [];
    for (let sample = 0; sample < 7; sample++) {
      const start = performance.now(); let result = 20261009;
      for (let i = 0; i < 2_000_000; i++) result = Math.imul(result ^ i, 1664525) + 1013904223 | 0;
      window.perfAudit.calibrationSink = result;
      samples.push(performance.now() - start);
    }
    return samples.sort((a, b) => a - b)[3];
  });
}
export async function stats(page, cdp) {
  const result = await page.evaluate(() => {
    // El renderer React de Konva tiene raíz independiente. StageWrap conserva
    // FiberRoot en un ref; recorrer ambas raíces evita depender de nombres minificados.
    const canvas = document.querySelector('canvas[aria-label^="PDF page"]');
    let root = canvas[Object.keys(canvas).find(key => key.startsWith('__reactFiber'))]; while (root.return) root = root.return;
    const fibers = [root.stateNode.current]; const ids = new Set(); const seen = new Set(); const visitedFibers = new Set();
    function visitElement(element) {
      if (!element || typeof element !== 'object' || seen.has(element)) return; seen.add(element);
      if (Array.isArray(element)) { element.forEach(visitElement); return; }
      if (element.props?.measurement?.id) ids.add(element.props.measurement.id);
      visitElement(element.props?.children);
    }
    while (fibers.length) {
      const fiber = fibers.pop();
      if (visitedFibers.has(fiber)) continue; visitedFibers.add(fiber);
      if (fiber.child) fibers.push(fiber.child); if (fiber.sibling) fibers.push(fiber.sibling);
      for (let hook = fiber.memoizedState; hook && typeof hook === 'object'; hook = hook.next) {
        const nestedRoot = hook.memoizedState?.current?.current;
        if (nestedRoot && typeof nestedRoot.tag === 'number') fibers.push(nestedRoot);
      }
      visitElement(fiber.memoizedProps?.children);
      if (fiber.memoizedProps?.measurement?.id) ids.add(fiber.memoizedProps.measurement.id);
    }
    return { domNodes: document.querySelectorAll('*').length, mountedShapes: ids.size,
      longTasks: window.perfAudit.longtasks.length, maxPauseMs: Math.max(0, ...window.perfAudit.longtasks, ...window.perfAudit.frames) };
  });
  const { metrics } = await cdp.send('Performance.getMetrics');
  result.heapBytes = metrics.find(metric => metric.name === 'JSHeapUsedSize').value;
  return result;
}
export async function measure(page, cdp, action) {
  await page.evaluate(() => {
    window.perfAudit.frames = []; window.perfAudit.longtasks = []; window.perfAudit.zoomSamples = []; window.perfAudit.sampling = true; let previous = performance.now();
    function frame(now) { if (!window.perfAudit.sampling) return; window.perfAudit.frames.push(now - previous); window.perfAudit.zoomSamples.push(document.querySelector('[aria-label="Zoom controls"]')?.textContent); previous = now; requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  });
  const start = performance.now(); const gestureTiming = await action();
  const elapsedMs = performance.now() - start;
  const frames = await page.evaluate(() => { window.perfAudit.sampling = false; return window.perfAudit.frames; });
  await page.waitForTimeout(350);
  return { ...await stats(page, cdp), gestureTiming, elapsedMs, fps: frames.length ? 1000 * frames.length / frames.reduce((a, b) => a + b, 0) : 0 };
}
export async function gesture(page, kind) {
  const box = await page.locator('canvas[aria-label^="PDF page"]').boundingBox();
  const x = Math.max(120, Math.min(900, box.x + box.width / 2)), y = Math.max(120, Math.min(500, box.y + box.height / 2));
  await page.mouse.move(x, y);
  const before = await page.locator('[aria-label="Zoom controls"]').textContent();
  let acquireMs, releaseMs;
  if (kind === 'pan') { const acquireStart = performance.now(); await page.mouse.down({ button: 'middle' }); acquireMs = performance.now() - acquireStart; }
  const start = Date.now(); let actions = 0;
  for (let i = 0; i < 90 && Date.now() - start < 5000; i++) {
    actions++;
    if (kind === 'pan') await page.mouse.move(x + Math.sin(i / 8) * 90, y + Math.cos(i / 8) * 50);
    else await page.mouse.wheel(0, i % 20 < 10 ? -40 : 40);
    await page.waitForTimeout(16);
  }
  if (kind === 'pan') { const releaseStart = performance.now(); await page.mouse.up({ button: 'middle' }); releaseMs = performance.now() - releaseStart; }
  if (!actions) throw Error('Gesto sin eventos');
  if (kind === 'pan') {
    const after = await page.locator('canvas[aria-label^="PDF page"]').boundingBox();
    if (Math.abs(box.x - after.x) < 1 && Math.abs(box.y - after.y) < 1) throw Error('Pan no adquirió gesto');
  } else {
    const after = await page.locator('[aria-label="Zoom controls"]').textContent();
    // A veces 90 eventos se cancelan en pares: la transformación intermedia también debe observarse.
    const changed = await page.evaluate(() => new Set(window.perfAudit.zoomSamples).size > 1);
    if (before === after && !changed) throw Error('Zoom no cambió');
  }
  return { acquireMs, releaseMs, actions };
}
export async function drag(page) {
  const before = await runtime(page, 'read');
  await page.getByRole('button', { name: /^Select/ }).click();
  const box = await page.locator('canvas[aria-label^="PDF page"]').boundingBox(); const zoom = box.width / 595.2756;
  await page.mouse.click(box.x + 72 * zoom, box.y + 70 * zoom); await page.waitForTimeout(300);
  await page.mouse.move(box.x + 60 * zoom, box.y + 65 * zoom); await page.mouse.down();
  const start = Date.now();
  for (let i = 0; i < 90 && Date.now() - start < 5000; i++) {
    await page.mouse.move(box.x + (60 + Math.sin(i / 12) * 4) * zoom, box.y + (65 + Math.cos(i / 12) * 3) * zoom); await page.waitForTimeout(16);
  }
  await page.mouse.up(); await page.waitForTimeout(250);
  const after = await runtime(page, 'read');
  if (JSON.stringify(before.pages[1].measurements[0].points) === JSON.stringify(after.pages[1].measurements[0].points)) throw Error('Drag no cambió vértice');
}
