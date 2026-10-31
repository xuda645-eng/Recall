import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();

export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs',
  testDir: '.',
  testMatch: 'weread-public.spec.ts',
  outputDir: '/tmp/recall-weread-public-assets-results',
  timeout: 300000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'https://recall-memory.pages.dev/',
    headless: true,
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'public-iphone15-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } }],
});
