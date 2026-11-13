import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();

export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs',
  testDir: '.', testMatch: 'miaoda-interactions.spec.ts', timeout: 60000, workers: 1,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://localhost:8187/app/app_17hv4js1tsy/personal/',
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    locale: 'zh-CN', headless: true, trace: 'retain-on-failure',
  },
  projects: [
    { name: 'interactions-iphone15-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'interactions-iphone15-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
});
