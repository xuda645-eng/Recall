import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();

export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs',
  testDir: '.',
  testMatch: 'miaoda-client.spec.ts',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 2,
  use: {
    baseURL: 'http://localhost:8187/app/app_17hv4js1tsy/recall/',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    headless: true, locale: 'zh-CN', trace: 'retain-on-failure',
  },
  projects: [
    { name: 'miaoda-iphone15-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'miaoda-iphone15-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
});
