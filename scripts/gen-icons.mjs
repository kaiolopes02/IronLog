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

/** Draws an OLED barbell: orange bar and plates on black or transparent. */
function draw(width, height, padding, fillBackground = true) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const inner = Math.min(width, height) - padding * 2;
  const left = Math.round((width - inner) / 2);
  const top = Math.round((height - inner) / 2);
  const barHeight = Math.max(1, Math.round(inner * 0.1));
  const barY = top + Math.round((inner - barHeight) / 2);
  const plateWidth = Math.round(inner * 0.14);
  const plateHeight = Math.round(inner * 0.52);
  const plateY = top + Math.round((inner - plateHeight) / 2);
  const plateX = [left + Math.round(inner * 0.14), left + Math.round(inner * 0.72)];

  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 4;
      let r = 0, g = 0, b = 0;
      const inBar = y >= barY && y < barY + barHeight && x >= left && x < left + inner;
      const inPlate = plateX.some(
        (px) => x >= px && x < px + plateWidth && y >= plateY && y < plateY + plateHeight,
      );
      if (inBar || inPlate) {
        r = 249;
        g = 115;
        b = 22;
        raw[i + 3] = 255;
      } else if (fillBackground) {
        raw[i + 3] = 255;
      }
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
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
for (const [name, size, pad] of files) writeFileSync(join(OUT, name), draw(size, size, pad));

// Android launchers. The adaptive foreground is transparent and drawn inside
// the 66dp safe zone of its 108dp canvas, so no launcher mask clips the bar.
const RES = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'android',
  'app',
  'src',
  'main',
  'res',
);
const DENSITIES = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
];
for (const [density, legacy, adaptive] of DENSITIES) {
  const dir = join(RES, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ic_launcher.png'), draw(legacy, legacy, 0));
  writeFileSync(join(dir, 'ic_launcher_round.png'), draw(legacy, legacy, 0));
  writeFileSync(
    join(dir, 'ic_launcher_foreground.png'),
    draw(adaptive, adaptive, Math.round(adaptive * 0.25), false),
  );
}

// Launch splash: logo on pure black, one asset per documented screen density.
// Android 12+ reads the same logo through the theme's splash icon.
const SPLASHES = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
];
for (const [dir, width, height] of SPLASHES) {
  const path = join(RES, dir);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'splash.png'), draw(width, height, Math.round(Math.min(width, height) * 0.325)));
}

console.warn(`icons written: ${files.map((f) => f[0]).join(', ')} + android mipmaps + splash`);
