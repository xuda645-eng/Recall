import { defineConfig } from '@playwright/test';
import baseline from '../playwright.config';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const url = process.env.RECALL_PAPER_URL || 'http://127.0.0.1:4410/';
const target = new URL(url);
if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('Paper acceptance requires a loopback-only isolated build');

export default defineConfig({
  ...baseline,
  testDir: '.',
  testMatch: 'paper-editorial.spec.ts',
  globalSetup: '../scripts/playwright-global-setup.mjs',
  timeout: 60000,
  use: { ...baseline.use, baseURL: url },
  webServer: undefined,
});
