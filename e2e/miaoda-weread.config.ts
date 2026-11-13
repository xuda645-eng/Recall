import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const output = process.env.RECALL_MIAODA_WEREAD_OUTPUT || '/tmp/recall-miaoda-weread-e2e';

export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs',
  testDir: '.', testMatch: 'miaoda-weread.spec.ts', timeout: 60000, workers: 1, retries: 0,
  expect: { timeout: 15000 },
  outputDir: `${output}/results`,
  reporter: [['line'], ['json', { outputFile: `${output}/results.json` }]],
  use: {
    baseURL: 'http://localhost:8187/app/app_17hv4js1tsy/personal/',
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    locale: 'zh-CN', headless: true, serviceWorkers: 'block', trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'miaoda-weread-iphone15-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'miaoda-weread-iphone15-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
});
