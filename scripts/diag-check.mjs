import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ locale: 'pt-BR' });
await page.goto('http://127.0.0.1:5173/diag.html');
await page.waitForTimeout(8000);
console.log(await page.locator('#out').innerText());
await browser.close();
