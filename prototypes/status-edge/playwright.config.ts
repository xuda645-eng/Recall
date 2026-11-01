import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const remote = process.env.STATUS_EDGE_URL;
if (remote && !/^https:\/\/[a-z0-9-]+\.recall-memory\.pages\.dev\/$/.test(remote)) {
  throw new Error('Only an isolated recall-memory preview origin is allowed.');
}

export default defineConfig({
  testDir: '.', testMatch: 'flow.spec.ts', timeout: remote ? 60000 : 30000,
  expect: { timeout: remote ? 15000 : 5000 }, retries: 0,
  outputDir: '../../test-results/status-edge', reporter: 'list',
  globalSetup: '../../scripts/playwright-global-setup.mjs',
  use: {
    baseURL: remote || 'http://127.0.0.1:4397',
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, locale: 'zh-CN', headless: true,
  },
  projects: [
    { name: 'iphone15-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'iphone15-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
  webServer: remote ? undefined : {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:4397', reuseExistingServer: false, timeout: 15000,
  },
});
