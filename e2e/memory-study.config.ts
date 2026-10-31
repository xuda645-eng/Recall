import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import baseline from '../playwright.config';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const port = Number(process.env.RECALL_STUDY_PORT || 4197);
const buildMode = process.env.RECALL_BUILD_MODE === 'pages' ? 'pages' : 'production';
const baseURL = `http://127.0.0.1:${port}/${buildMode === 'pages' ? 'Recall/' : ''}`;

export default defineConfig({
  ...baseline,
  testDir: '.',
  testMatch: ['memory-workspace.spec.ts', 'memory-study.spec.ts'],
  globalSetup: '../scripts/playwright-global-setup.mjs',
  use: { ...baseline.use, baseURL },
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: `node node_modules/vite/bin/vite.js build --mode ${buildMode} && node node_modules/vite/bin/vite.js preview --mode ${buildMode} --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
