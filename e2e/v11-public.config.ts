import { defineConfig } from '@playwright/test';
import { isIP } from 'node:net';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const ipv4 = process.env.RECALL_PRODUCTION_IPV4;
if (ipv4 && isIP(ipv4) !== 4) throw new Error('RECALL_PRODUCTION_IPV4 must be a verified production DNS A record');
export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs',
  testDir: '.',
  testMatch: ['v11-public.spec.ts', 'weread-public.spec.ts'],
  outputDir: '../quality/v11/public',
  timeout: 180000,
  expect: { timeout: 30000 },
  workers: 1,
  retries: 0,
  use: { baseURL: 'https://recall-memory.pages.dev/', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN', serviceWorkers: 'block', headless: true },
  projects: [
    { name: 'v11-public-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
    { name: 'v11-public-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM, args: ipv4 ? [`--host-resolver-rules=MAP recall-memory.pages.dev ${ipv4}`] : undefined } } },
  ],
});
