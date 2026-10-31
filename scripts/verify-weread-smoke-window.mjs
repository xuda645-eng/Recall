import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'recall-smoke-window-'));
const script = fileURLToPath(new URL('./weread-ai-smoke.mjs', import.meta.url));
const hour = 3600000;
const now = Date.now();
const fixtures = [
  { name: '24-hour deadline', startedAt: now - 24 * hour - 1000, lastAttempt: now - 7 * hour, attempts: 1, expected: 'complete' },
  { name: 'older than shortened deadline', startedAt: now - 30 * hour, lastAttempt: now - 7 * hour, attempts: 2, expected: 'complete' },
  { name: 'inside original window', startedAt: now - 23 * hour, lastAttempt: now - 3 * hour, attempts: 3, expected: 'not_due' },
  { name: 'four-attempt cap', startedAt: now - 18 * hour, lastAttempt: now - 7 * hour, attempts: 4, expected: 'complete' },
  { name: 'first failure stops', startedAt: now - 8 * hour, lastAttempt: now - 7 * hour, attempts: 1, stopped: true, expected: 'complete' },
  { name: 'six-hour interval', startedAt: now - hour, lastAttempt: now - hour, attempts: 1, expected: 'not_due' },
  { name: 'concurrent lock', startedAt: now - 7 * hour, lastAttempt: now - 7 * hour, attempts: 1, locked: true, expected: 'already_running' },
];

try {
  for (const [index, fixture] of fixtures.entries()) {
    const statePath = join(directory, `state-${index}.json`);
    const state = { startedAt: fixture.startedAt, lastAttempt: fixture.lastAttempt, attempts: fixture.attempts,
      results: [{ status: fixture.stopped ? 'failed' : 'passed' }], ...(fixture.stopped ? { stopped: true } : {}) };
    const original = JSON.stringify(state);
    await writeFile(statePath, original);
    if (fixture.locked) await writeFile(`${statePath}.lock`, 'owned-by-another-run');
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, RECALL_SMOKE_STATE: statePath, ARK_CREDENTIALS_FILE: join(directory, 'no-ark-credentials'),
        WEREAD_CREDENTIALS_FILE: join(directory, 'no-weread-credentials') },
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 0, fixture.name);
    assert.equal(JSON.parse(result.stdout).status, fixture.expected, fixture.name);
    assert.equal(await readFile(statePath, 'utf8'), original, `${fixture.name}: preserve state, history and original start`);
    if (fixture.locked) assert.equal(await readFile(`${statePath}.lock`, 'utf8'), 'owned-by-another-run');
    else await assert.rejects(readFile(`${statePath}.lock`), { code: 'ENOENT' });
  }
  console.log(`Passed ${fixtures.length} smoke-window checks; no credentials, network calls or production writes.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
