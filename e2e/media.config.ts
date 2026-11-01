import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs', testDir: '.', testMatch: 'media.spec.ts',
  timeout: 60000, expect: { timeout: 10000 }, retries: 0,
  use: { baseURL: process.env.RECALL_MEDIA_URL || 'http://127.0.0.1:4198/', headless: true, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN' },
  projects: [
    { name: 'media-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'media-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
  webServer: process.env.RECALL_MEDIA_URL ? undefined : { cwd: new URL('..', import.meta.url).pathname, command: 'node node_modules/vite/bin/vite.js build --mode production && node scripts/serve-task-preview.mjs dist 4198', url: 'http://127.0.0.1:4198/', reuseExistingServer: false, timeout: 60000 },
});
