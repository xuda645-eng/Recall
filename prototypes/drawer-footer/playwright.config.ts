import { defineConfig } from '@playwright/test';
import baseline from '../../playwright.config';
import { assertBrowserLaunchAllowed } from '../../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
export default defineConfig({
  ...baseline,
  testDir: '.',
  testMatch: 'footer.spec.ts',
  globalSetup: '../../scripts/playwright-global-setup.mjs',
  outputDir: '../../quality/footer-prototype',
  timeout: 30000,
  use: { ...baseline.use, baseURL: 'http://127.0.0.1:4424/' },
  webServer: undefined,
});
