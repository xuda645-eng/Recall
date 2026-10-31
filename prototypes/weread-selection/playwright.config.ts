import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();

export default defineConfig({
  testDir: '.',
  testMatch: 'flow.spec.ts',
  timeout: 30000,
  expect: { timeout: 5000 },
  retries: 0,
  outputDir: '../../test-results/weread-design',
  reporter: 'list',
  globalSetup: '../../scripts/playwright-global-setup.mjs',
  use: {
    baseURL: 'http://127.0.0.1:4395',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    headless: true,
  },
  projects: [
    { name: 'iphone15-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'iphone15-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
  webServer: {
    command: 'python3 -m http.server 4395 --bind 127.0.0.1 --directory prototypes/weread-selection',
    url: 'http://127.0.0.1:4395',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
