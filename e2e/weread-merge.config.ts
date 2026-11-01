import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const port = 4206;
const output = '/tmp/recall-weread-merge-e2e-20261102';
export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs', testDir: '.', testMatch: 'weread-merge.spec.ts',
  outputDir: `${output}/results`, reporter: [['line'], ['json', { outputFile: `${output}/results.json` }]],
  timeout: 45000, expect: { timeout: 10000 }, workers: 1, retries: 0,
  use: { baseURL: `http://127.0.0.1:${port}/`, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, locale: 'zh-CN', serviceWorkers: 'block', headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'merge-iphone15-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'merge-iphone15-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
  webServer: { cwd: fileURLToPath(new URL('..', import.meta.url)), command: `node node_modules/vite/bin/vite.js build --outDir ${output}/build --emptyOutDir && node scripts/serve-task-preview.mjs ${output}/build ${port}`,
    url: `http://127.0.0.1:${port}/`, timeout: 120000, reuseExistingServer: false },
});
