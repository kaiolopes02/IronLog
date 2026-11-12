// Performance budget gate: initial (preloaded/critical) JS + CSS, gzipped.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const LIMIT_KB = 120;

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1]);
if (assets.length === 0) {
  console.error('bundle gate: no assets referenced by dist/index.html');
  process.exit(1);
}

let total = 0;
for (const asset of new Set(assets)) {
  const file = join(DIST, asset);
  if (!existsSync(file)) continue;
  const gz = gzipSync(readFileSync(file)).length;
  total += gz;
  console.warn(`${(gz / 1024).toFixed(1)} KB gzip  ${asset}`);
}

const kb = total / 1024;
console.warn(`initial payload: ${kb.toFixed(1)} KB gzip (limit ${LIMIT_KB} KB)`);
if (kb > LIMIT_KB) {
  console.error(`bundle gate FAILED: ${kb.toFixed(1)} KB > ${LIMIT_KB} KB`);
  process.exit(1);
}
console.warn('bundle gate OK');
