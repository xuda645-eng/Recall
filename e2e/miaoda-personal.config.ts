import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();

export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs',
  testDir: '.', testMatch: 'miaoda-personal.spec.ts', workers: 1, timeout: 90000,
  use: {
    baseURL: 'http://localhost:8187/app/app_17hv4js1tsy/recall/',
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true,
    hasTouch: true, locale: 'zh-CN', headless: true, trace: 'retain-on-failure',
  },
  projects: [{ name: 'personal-actual-sdk-chromium', use: {
    browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM },
  } }],
});
