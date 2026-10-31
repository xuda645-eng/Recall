import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { assertBrowserLaunchAllowed } from './browser-runtime.mjs';

assertBrowserLaunchAllowed();
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exitCode = code ?? 1;
});
