import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs', testDir: '.', testMatch: 'media-cloud.spec.ts', timeout: 90000, expect: { timeout: 20000 }, workers: 1,
  use: { baseURL: 'https://127.0.0.1:8798/', ignoreHTTPSErrors: true, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN', headless: true },
  projects: [
    { name: 'media-cloud-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'media-cloud-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
});
