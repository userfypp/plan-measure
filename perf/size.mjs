import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { checkSize, sizeLimits } from './budgets.mjs';

const repo = process.env.PLAN_MEASURE_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function measureSize(dist) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const entries = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
  if (entries.length !== 1) throw Error('Se esperaba un único JS principal');
  const preloads = [...html.matchAll(/<link\b[^>]*>/g)]
    .map(match => match[0]).filter(tag => /\brel="modulepreload"/.test(tag))
    .map(tag => tag.match(/\bhref="([^"]+)"/)?.[1]).filter(Boolean);
  const local = url => path.join(dist, url.replace(/^.*?\/assets\//, 'assets/'));
  const startupFiles = new Set();
  function visit(url) {
    const file = local(url);
    if (startupFiles.has(file)) return;
    startupFiles.add(file);
    const js = fs.readFileSync(file, 'utf8');
    // Solo imports estáticos; import() es precisamente la carga diferida a proteger.
    for (const match of js.matchAll(/(?:\bimport\s*(?:[^;"']*?\bfrom\s*)?|\bexport\s*[^;"']*?\bfrom\s*)["'](\.[^"']+\.m?js)["']/g)) {
      visit('/assets/' + path.basename(match[1]));
    }
  }
  [...entries, ...preloads].forEach(visit);
  const main = fs.readFileSync(local(entries[0]));
  return { mainBytes: main.length, mainGzipBytes: gzipSync(main).length,
    startupBytes: [...startupFiles].reduce((sum, file) => sum + fs.statSync(file).size, 0),
    startupFiles: [...startupFiles].map(file => path.relative(dist, file)) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const metrics = measureSize(path.join(repo, 'dist'));
  checkSize(metrics);
  console.log(JSON.stringify({ metrics, limits: sizeLimits }, null, 2));
}
