import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { assertBrowserLaunchAllowed } from '../../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const remote = process.env.STATUS_SHELL_URL;
if (remote && !/^https:\/\/[a-z0-9-]+\.recall-memory\.pages\.dev\/$/.test(remote)) throw new Error('Only an isolated preview origin is allowed');
export default defineConfig({
  testDir: '.', testMatch: 'flow.spec.ts', timeout: remote ? 300000 : 30000,
  expect: { timeout: remote ? 30000 : 5000 }, retries: 0,
  outputDir: '../../test-results/status-shell', reporter: 'list',
  globalSetup: '../../scripts/playwright-global-setup.mjs',
  use: { baseURL: remote || 'http://127.0.0.1:4398', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN', headless: true },
  projects: [
    { name: 'iphone15-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'iphone15-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
  webServer: remote ? undefined : {
    command: 'node scripts/serve-task-preview.mjs dist/status-shell 4398',
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    url: 'http://127.0.0.1:4398', reuseExistingServer: false, timeout: 15000,
  },
});
