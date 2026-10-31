import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const outputRoot = '/tmp/recall-weread-online-e2e';
const baseURL = 'http://127.0.0.1:4197/';

export default defineConfig({
  testDir: '.',
  testMatch: 'weread-online.spec.ts',
  outputDir: `${outputRoot}/results`,
  reporter: [
    ['line'],
    ['json', { outputFile: `${outputRoot}/results.json` }],
    ['html', { outputFolder: `${outputRoot}/report`, open: 'never' }],
  ],
  timeout: 45000,
  expect: { timeout: 10000 },
  retries: 0,
  workers: 1,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL,
    headless: true,
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    serviceWorkers: 'block',
    actionTimeout: 10000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'weread-iphone15-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'weread-iphone15-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: `node node_modules/vite/bin/vite.js build --mode production --outDir ${outputRoot}/build --emptyOutDir && node node_modules/vite/bin/vite.js preview --mode production --outDir ${outputRoot}/build --host 127.0.0.1 --port 4197 --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
