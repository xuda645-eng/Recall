import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import baseline from '../playwright.config';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
export default defineConfig({
  ...baseline,
  testDir: '.',
  testMatch: ['product-review.spec.ts', 'memory-workspace.spec.ts', 'memory-study.spec.ts', 'media.spec.ts', 'import-choices.spec.ts'],
  globalSetup: '../scripts/playwright-global-setup.mjs',
  webServer: process.env.RECALL_URL ? undefined : {
    ...baseline.webServer,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4193 --strictPort',
    reuseExistingServer: false,
  },
});
