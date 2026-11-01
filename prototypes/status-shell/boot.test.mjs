import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./site/probe-boot.js', import.meta.url), 'utf8');
function environment(origin, search = '') {
  const calls = [];
  const styles = [];
  const sandbox = {
    URL, URLSearchParams, Request, Response,
    location: { origin, href: `${origin}/${search}`, search },
    document: { documentElement: { dataset: {} }, createElement: () => ({}), head: { append: element => styles.push(element) } },
    window: { fetch: (...args) => { calls.push(args); return Promise.resolve(new Response('static')); }, stop: () => calls.push('stop') },
  };
  return { sandbox, calls, styles };
}

test('refuses production, arbitrary sites and unapproved loopback ports before data initialization', () => {
  for (const origin of ['https://recall-memory.pages.dev', 'https://example.org', 'http://127.0.0.1:5173']) {
    const { sandbox, calls } = environment(origin);
    assert.throws(() => runInNewContext(source, sandbox), /cannot run/);
    assert.deepEqual(calls, ['stop']);
    assert.equal(sandbox.document.documentElement.dataset.shellProbe, undefined);
  }
});

test('D preserves root styles; E changes only root backgrounds', () => {
  for (const variant of ['d', 'e']) {
    const { sandbox, styles } = environment('http://127.0.0.1:4398', `?case=${variant}`);
    runInNewContext(source, sandbox);
    assert.equal(sandbox.document.documentElement.dataset.shellProbe, variant);
    assert.equal(styles.length, variant === 'e' ? 1 : 0);
    if (variant === 'e') assert.equal(styles[0].textContent, 'html,body,#root{background:#f6f5ef!important}');
  }
});

test('cloud and third-party requests resolve locally without transmission', async () => {
  const { sandbox, calls } = environment('https://example-preview.recall-memory.pages.dev');
  runInNewContext(source, sandbox);
  for (const path of ['/api', '/api/auth/pair', 'https://recall-memory.pages.dev/api/state', 'https://example.org/']) {
    const response = await sandbox.window.fetch(path, { method: 'POST', body: 'synthetic-secret' });
    assert.equal(response.status, 503);
  }
  assert.deepEqual(calls, []);
});

test('same-origin static assets retain native fetch', async () => {
  const { sandbox, calls } = environment('https://example-preview.recall-memory.pages.dev');
  runInNewContext(source, sandbox);
  await sandbox.window.fetch('/assets/app.js');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/assets/app.js');
});
