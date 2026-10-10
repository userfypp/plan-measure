import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

// xorshift32, semilla estable. Ningún fixture binario se versiona.
export function random(seed = 20261009) {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
function pdf(file, bodies) {
  const fd = fs.openSync(file, 'w');
  const offsets = [0]; let position = 0;
  const write = value => { const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value); fs.writeSync(fd, buffer); position += buffer.length; };
  try {
    write('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');
    bodies.forEach((parts, index) => { offsets.push(position); write(`${index + 1} 0 obj\n`); for (const part of parts) write(part); write('\nendobj\n'); });
    const xref = position;
    write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    for (const offset of offsets.slice(1)) write(`${String(offset).padStart(10, '0')} 00000 n \n`);
    write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  } finally { fs.closeSync(fd); }
}
function ascii85(buffer) {
  const output = Buffer.allocUnsafe(Math.ceil(buffer.length / 4) * 5 + 2);
  let position = 0;
  for (let start = 0; start < buffer.length; start += 4) {
    const length = Math.min(4, buffer.length - start);
    let value = 0;
    for (let k = 0; k < 4; k++) value = value * 256 + (buffer[start + k] || 0);
    const digits = Array(5);
    for (let k = 4; k >= 0; k--) { digits[k] = value % 85 + 33; value = Math.floor(value / 85); }
    for (let k = 0; k < length + 1; k++) output[position++] = digits[k];
  }
  output[position++] = 126; output[position++] = 62;
  return output.subarray(0, position);
}
export function generateFixtures(directory, { large = true } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const control = path.join(directory, 'F-control-A4.pdf');
  if (!fs.existsSync(control)) {
    let content = '0.2 w\n';
    for (let i = 0; i < 50; i++) content += `${i * 37 % 595} ${i * 71 % 842} m ${Math.min(595, i * 37 % 595 + 15 + i % 80)} ${Math.min(842, i * 71 % 842 + 5 + i % 50)} l S\n`;
    content += 'BT /F1 4 Tf\n';
    for (let i = 0; i < 1500; i++) content += `1 0 0 1 ${i * 53 % 595} ${i * 97 % 842} Tm (WALL ${i} 1:100) Tj\n`;
    content += 'ET\n';
    pdf(control, [['<< /Type /Catalog /Pages 2 0 R >>'], ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
      ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'],
      [`<< /Length ${Buffer.byteLength(content)} >>\nstream\n`, content, '\nendstream'], ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']]);
  }
  const scan = path.join(directory, 'C-scan-A0.pdf');
  if (large && !fs.existsSync(scan)) {
    const width = 9933, height = 14043;
    const pixels = Buffer.allocUnsafe(width * height); const rng = random();
    // 16 niveles + ASCII85/Flate reproduce el método del scan C histórico (~95 MiB).
    for (let i = 0; i < pixels.length; i++) pixels[i] = 240 + Math.floor(rng() * 16);
    for (let i = 0; i < 9000; i++) {
      const x = i * 137 % width, y = i * 271 % height;
      for (let step = 0; step < 300 && x + step < width && y + (step >> 1) < height; step++) pixels[(y + (step >> 1)) * width + x + step] = 30;
    }
    const image = ascii85(deflateSync(pixels));
    const content = 'q 2383.937 0 0 3370.394 0 0 cm /Im0 Do Q';
    pdf(scan, [['<< /Type /Catalog /Pages 2 0 R >>'], ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
      ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2383.937 3370.394] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>'],
      [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream'],
      [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter [/ASCII85Decode /FlateDecode] /Length ${image.length} >>\nstream\n`, image, '\nendstream']]);
  }
  return { control, scan };
}
export function prepareSession(session, count) {
  const pg = session.pages[1];
  pg.calibrations = [{ id: 'perf-cal', name: 'Audit scale', mode: 'uniform', start: { x: 10, y: 10 }, end: { x: 110, y: 10 }, referenceDistanceMm: 1000 }];
  pg.activeCalibrationId = 'perf-cal'; pg.nextCalibrationNumber = 2;
  pg.measurements = Array.from({ length: count }, (_, i) => {
    const type = ['line', 'polyline', 'polygon'][i % 3];
    const x = i < 3 ? 60 + i * 100 : 130 + i % 25 * 15;
    const y = i < 3 ? 65 : 150 + Math.floor(i / 25) % 30 * 18;
    const points = type === 'line' ? [{ x, y }, { x: x + 25, y: y + 10 }]
      : Array.from({ length: 24 }, (_, k) => type === 'polygon'
        ? { x: x + 7 * Math.cos(k * 2 * Math.PI / 24), y: y + 7 * Math.sin(k * 2 * Math.PI / 24) }
        : { x: x + k * 0.5, y: y + 4 * Math.sin(k / 3) });
    return { id: 'perf-' + i, name: 'Audit ' + i, calibrationId: 'perf-cal', type, points, classificationValueIds: [], visible: true };
  });
  pg.nextMeasurementNumber = { line: count + 1, polyline: count + 1, polygon: count + 1 };
  session.classificationCatalog = { dimensions: [{ id: 'perf-dimension', name: 'Perf group', archived: false, values: [] }] };
  return session;
}
