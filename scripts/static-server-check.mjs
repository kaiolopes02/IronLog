import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Reproduz um servidor estático tipo Live Server: sem transformar TSX.
const root = process.cwd();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const filePath = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404).end('not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((resolve) => server.listen(5199, resolve));

const browser = await chromium.launch();
const page = await browser.newPage({ locale: 'pt-BR' });
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));
await page.goto('http://127.0.0.1:5199/index.html');
await page.waitForTimeout(1500);
console.log('TEXT:', (await page.locator('body').innerText()).slice(0, 120) || '(vazio)');
console.log('LOGS:\n' + logs.join('\n'));
await browser.close();
server.close();
