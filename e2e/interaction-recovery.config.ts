import { fileURLToPath } from 'node:url';
import baseline from '../playwright.config';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();
const root = fileURLToPath(new URL('..', import.meta.url));
const output = process.env.RECALL_RECOVERY_OUTPUT || '/private/tmp/recall-interaction-recovery-20261106';
const build = process.env.RECALL_E2E_BUILD_DIR || `${output}/build`;
process.env.RECALL_E2E_BUILD_DIR = build;
const port = Number(process.env.RECALL_RECOVERY_PORT || 4401);
const baseURL = process.env.RECALL_URL || `http://127.0.0.1:${port}/`;

export default {
  ...baseline,
  testDir: '.',
  testMatch: ['interaction-recovery.spec.ts', 'product-review.spec.ts', 'review-deck-picker.spec.ts', 'memory-workspace.spec.ts', 'memory-study.spec.ts', 'media.spec.ts', 'import-choices.spec.ts'],
  globalSetup: '../scripts/playwright-global-setup.mjs',
  outputDir: `${output}/results`,
  reporter: [['line'], ['json', { outputFile: `${output}/results.json` }]],
  use: { ...baseline.use, baseURL, trace: 'retain-on-failure' },
  webServer: process.env.RECALL_URL ? undefined : {
    cwd: root,
    command: `${process.env.RECALL_RECOVERY_PREBUILT === '1' ? '' : `node node_modules/vite/bin/vite.js build --outDir ${build} && `}node node_modules/vite/bin/vite.js preview --outDir ${build} --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
};
