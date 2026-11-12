import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build so CSP and the service worker are
 * exercised the same way users get them.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 1, // WebKit crashes on Windows when two instances run in parallel.
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', locale: 'pt-BR', trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
