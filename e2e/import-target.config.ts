import baseline from '../playwright.config';
import { fileURLToPath } from 'node:url';
import { assertBrowserLaunchAllowed } from '../scripts/browser-runtime.mjs';

assertBrowserLaunchAllowed();

const root = fileURLToPath(new URL('..', import.meta.url));
const output = process.env.RECALL_IMPORT_TARGET_OUTPUT || '/private/tmp/recall-import-active-folders-20261113';
const miaoda = process.env.RECALL_IMPORT_TARGET_MIAODA === '1';
const directory = `${output}/${miaoda ? 'miaoda' : 'production'}`;
const port = miaoda ? 4417 : 4416;

export default {
  ...baseline,
  globalSetup: '../scripts/playwright-global-setup.mjs',
  testDir: '.', testMatch: ['import-target.spec.ts'], timeout: 60000,
  outputDir: `${output}/${miaoda ? 'miaoda' : 'production'}-results`,
  reporter: [['line'], ['json', { outputFile: `${output}/${miaoda ? 'miaoda' : 'production'}-results.json` }]],
  webServer: {
    cwd: root, command: `node scripts/serve-task-preview.mjs ${directory} ${port}`,
    url: `http://127.0.0.1:${port}/`, reuseExistingServer: false, timeout: 30000,
  },
  use: { ...baseline.use, baseURL: `http://127.0.0.1:${port}/`, trace: 'retain-on-failure' },
};
