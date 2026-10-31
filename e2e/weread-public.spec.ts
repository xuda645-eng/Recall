import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test('公网已提交资源逐字节校验，匿名微信读书端点不授权且不写卡片', async ({ page, context }) => {
  const directory = process.env.RECALL_VERIFY_DIST;
  if (!directory) throw new Error('RECALL_VERIFY_DIST must point to the committed production bundle');
  const base = 'https://recall-memory.pages.dev';
  const allowedApi = new Set(['books', 'book', 'progress', 'budget', 'question'].map(path => `/api/weread/${path}`));
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) throw new Error('Only the existing production origin may be read');
    if (request.method() !== 'GET' && (!allowedApi.has(url.pathname) || request.postData() !== '{}')) throw new Error('Production mutation or real model input is prohibited');
    expect(request.headers().cookie).toBeUndefined();
    expect(request.headers().authorization).toBeUndefined();
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.locator('.memory-app')).toBeVisible({ timeout: 120000 });
  const names = await readdir(resolve(directory, 'assets'));
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.webmanifest'), 'utf8')) as { start_url: string; scope: string; icons: { src: string }[] };
  expect(manifest.start_url).toBe('/'); expect(manifest.scope).toBe('/');
  const paths = ['index.html', 'manifest.webmanifest', 'sw.js', ...names.filter(name => /^(memory-weread-import|memory-workspace)-.*\.(js|css)$/.test(name)).map(name => `assets/${name}`), ...manifest.icons.map(icon => icon.src.replace(/^\//, ''))];
  const expected = await Promise.all(paths.map(async path => ({ path, digest: createHash('sha256').update(await readFile(resolve(directory, path))).digest('hex') })));
  const actual = await page.evaluate(async files => Promise.all(files.map(async ({ path }) => {
    const response = await fetch(`/${path}`, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(120000) });
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return { path, status: response.status, digest: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
  })), expected);
  for (const file of actual) { expect(file.status, file.path).toBe(200); expect(file.digest, file.path).toBe(expected.find(item => item.path === file.path)!.digest); }
  const endpoints = await page.evaluate(async paths => Promise.all(paths.map(async path => {
    const response = await fetch(path, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(60000) });
    await response.text();
    return { path, status: response.status, cache: response.headers.get('Cache-Control') };
  })), [...allowedApi]);
  for (const endpoint of endpoints) { expect(endpoint.status, endpoint.path).toBe(401); expect(endpoint.cache).toBe('no-store'); }
  expect(await context.cookies()).toEqual([]);
  console.log(`PASS ${actual.length} committed resource digests and ${endpoints.length} anonymous API gates`);
});
