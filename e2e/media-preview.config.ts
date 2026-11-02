import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const preview = new URL(process.env.RECALL_MEDIA_PREVIEW_URL || 'https://image-attachments-20261101.recall-memory.pages.dev/');
if (preview.protocol !== 'https:' || !preview.hostname.endsWith('.recall-memory.pages.dev') || preview.username || preview.password || preview.pathname !== '/') throw new Error('Only an isolated Recall preview is allowed');
export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs', testDir: '.', testMatch: 'media-preview.spec.ts', timeout: 90000, expect: { timeout: 20000 }, workers: 1,
  use: { baseURL: preview.href, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN', headless: true },
  projects: [
    { name: 'media-preview-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'media-preview-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
});
