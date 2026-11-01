import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSeedSnapshot } from '../src/data/seed';

test('公网合成书卡标记、顶栏返回和划线全选，不调用真实书籍或模型', async ({ page, context }) => {
  const base = 'https://recall-memory.pages.dev';
  const seed = createSeedSnapshot(new Date('2026-10-01T00:00:00.000Z'));
  const initial = { ...seed, decks: [], cards: [], reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true } };
  const books = [true, false, null, undefined].map((markedFinished, index) => ({ bookId: `synthetic-${index}`, title: `合成书籍 ${index}`, highlightCount: 2, markedFinished }));
  const apiRequests: string[] = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) throw new Error('Only the existing production origin may be read');
    if (!url.pathname.startsWith('/api/')) { expect(request.method()).toBe('GET'); await route.continue(); return; }
    apiRequests.push(url.pathname);
    if (url.pathname === '/api/auth/session') { await route.fulfill({ status: 503, json: { error: 'synthetic-local-only' } }); return; }
    if (url.pathname === '/api/weread/books') { await route.fulfill({ json: { books, cursor: null } }); return; }
    const body = request.postDataJSON();
    expect(books.some(book => book.bookId === body.bookId)).toBe(true);
    if (url.pathname === '/api/weread/progress') { await route.fulfill({ json: { bookId: body.bookId, readingProgress: 100 } }); return; }
    if (url.pathname === '/api/weread/book') {
      const book = books.find(book => book.bookId === body.bookId)!;
      await route.fulfill({ json: { format: 'recall-weread-export-v1', books: [{ bookId: book.bookId, title: book.title, highlights: [
        { bookmarkId: 'synthetic-1', markText: '合成原文一，不是真实用户划线。' },
        { bookmarkId: 'synthetic-2', markText: '合成原文二，不是真实用户划线。' },
      ] }] } }); return;
    }
    throw new Error(`Unmocked production API prohibited: ${url.pathname}`);
  });
  await page.addInitScript(({ initial, base }) => { if (location.origin === base) localStorage.setItem('recall.snapshot.v1', JSON.stringify(initial)); }, { initial, base });
  await page.goto('/#weread', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.getByRole('button', { name: '连接微信读书', exact: true })).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  for (const [index, book] of books.entries()) {
    const card = page.getByRole('button', { name: `${book.title}，2 条我的划线` });
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.wr-reading > span')).toHaveCount(index === 0 ? 1 : 0);
    await expect(card).toContainText('阅读进度 100%');
  }
  const next = page.getByRole('button', { name: '下一步 · AI 问题与导入', exact: true });
  await expect(next).toBeInViewport();
  const dockAction = (await next.boundingBox())!;
  expect(852 - dockAction.y - dockAction.height).toBeGreaterThanOrEqual(31);
  await page.getByRole('button', { name: '合成书籍 0，2 条我的划线' }).click();
  await page.getByRole('button', { name: '下一步 · AI 问题与导入' }).click();
  await expect(page.getByRole('heading', { name: '让划线变成问题', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '再选一选', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回导入', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '选择划线 · 默认全选', exact: true }).click();
  const all = page.getByRole('checkbox', { name: /全选 \/ 全不选/ });
  await expect(all).toBeChecked();
  await all.uncheck();
  await expect(page.getByRole('button', { name: '生成并自动导入', exact: true })).toBeDisabled();
  await page.locator('.wr-highlight-options > label:not(.wr-highlight-all) input').first().check();
  await expect(all).toBeChecked({ indeterminate: true });
  await page.locator('.memory-bar').getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('heading', { name: '选择想记住的书' })).toBeVisible();
  await expect(page.getByRole('button', { name: '合成书籍 0，2 条我的划线' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null'))).toEqual(initial);
  expect(apiRequests.every(path => ['/api/auth/session', '/api/weread/books', '/api/weread/progress', '/api/weread/book'].includes(path))).toBe(true);
  expect(await context.cookies()).toEqual([]);
});

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
  const build = JSON.parse(await readFile(resolve(directory, 'version.json'), 'utf8')) as { version: string };
  await expect(page.locator('[data-app-version]')).toHaveText(build.version);
  const paths = ['index.html', 'manifest.webmanifest', 'version.json', 'sw.js', ...names.filter(name => /^(memory-weread-import|memory-workspace)-.*\.(js|css)$/.test(name)).map(name => `assets/${name}`), ...manifest.icons.map(icon => icon.src.replace(/^\//, ''))];
  const expected = await Promise.all(paths.map(async path => ({ path, digest: createHash('sha256').update(await readFile(resolve(directory, path))).digest('hex') })));
  const actual = await page.evaluate(async files => Promise.all(files.map(async ({ path }) => {
    const response = await fetch(`/${path}`, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(120000) });
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return { path, status: response.status, cache: response.headers.get('Cache-Control'), digest: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
  })), expected);
  for (const file of actual) { expect(file.status, file.path).toBe(200); expect(file.digest, file.path).toBe(expected.find(item => item.path === file.path)!.digest); }
  expect(actual.find(file => file.path === 'version.json')!.cache).toBe('no-store');
  const endpoints = await page.evaluate(async paths => Promise.all(paths.map(async path => {
    const response = await fetch(path, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(60000) });
    await response.text();
    return { path, status: response.status, cache: response.headers.get('Cache-Control') };
  })), [...allowedApi]);
  for (const endpoint of endpoints) { expect(endpoint.status, endpoint.path).toBe(401); expect(endpoint.cache).toBe('no-store'); }
  expect(await context.cookies()).toEqual([]);
  console.log(`PASS ${actual.length} committed resource digests and ${endpoints.length} anonymous API gates`);
});
