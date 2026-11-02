import { defineConfig } from '@playwright/test';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const remote = process.env.RECALL_IMPORT_CHOICES_URL;
if (remote) {
  const target = new URL(remote);
  if (target.protocol !== 'https:' || !target.hostname.endsWith('.recall-memory.pages.dev') || target.username || target.password || target.pathname !== '/') throw new Error('Only an isolated Recall preview is allowed');
}
export default defineConfig({
  globalSetup: '../scripts/playwright-global-setup.mjs', testDir: '.', testMatch: 'import-choices.spec.ts', timeout: 60000, expect: { timeout: 10000 }, workers: 2,
  use: { baseURL: remote || 'http://127.0.0.1:4199/', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN', headless: true },
  projects: [
    { name: 'import-choices-chromium', use: { browserName: 'chromium', launchOptions: { executablePath: process.env.RECALL_CHROMIUM } } },
    { name: 'import-choices-webkit', use: { browserName: 'webkit', launchOptions: { executablePath: process.env.RECALL_WEBKIT } } },
  ],
  webServer: remote ? undefined : { cwd: new URL('..', import.meta.url).pathname, command: 'node node_modules/vite/bin/vite.js build --mode production --outDir /tmp/recall-import-choices-build-20261102 --emptyOutDir && node scripts/serve-task-preview.mjs /tmp/recall-import-choices-build-20261102 4199', url: 'http://127.0.0.1:4199/', reuseExistingServer: false, timeout: 60000 },
});
