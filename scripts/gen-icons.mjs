// One-off, dependency-free PNG generator for the PWA icon set.
// Run with: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Draws an OLED barbell: black field, orange bar and plates. */
function draw(size, padding) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const inner = size - padding * 2;
  const barHeight = Math.round(inner * 0.1);
  const barY = padding + Math.round((inner - barHeight) / 2);
  const plateWidth = Math.round(inner * 0.14);
  const plateHeight = Math.round(inner * 0.52);
  const plateY = padding + Math.round((inner - plateHeight) / 2);
  const plateX = [padding + Math.round(inner * 0.14), padding + Math.round(inner * 0.72)];

  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      let r = 0, g = 0, b = 0;
      const inBar = y >= barY && y < barY + barHeight && x >= padding && x < size - padding;
      const inPlate = plateX.some(
        (px) => x >= px && x < px + plateWidth && y >= plateY && y < plateY + plateHeight,
      );
      if (inBar || inPlate) { r = 249; g = 115; b = 22; }
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const files = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['maskable-512.png', 512, 64],
  ['apple-touch-icon.png', 180, 0],
  ['favicon-32.png', 32, 0],
];
for (const [name, size, pad] of files) writeFileSync(join(OUT, name), draw(size, pad));
console.warn(`icons written: ${files.map((f) => f[0]).join(', ')}`);
