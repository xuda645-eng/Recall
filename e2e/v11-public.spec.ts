import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSeedSnapshot } from '../src/data/seed';

test('V1.1 公网缓存完整与持久化，Chromium 断网重开；WebKit 公网断网仍待验证', async ({ browser, browserName }) => {
  const context = await browser.newContext({ baseURL: 'https://recall-memory.pages.dev/', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'allow', locale: 'zh-CN' });
  try {
    const initial = createSeedSnapshot();
    initial.decks.forEach((deck, index) => { deck.name = `公开验收合成卡组 ${index + 1}`; });
    initial.cards.forEach(card => { card.front = '合成问题，用于验证离线缓存。'; card.back = '合成答案，不是真实用户数据。'; });
    initial.settings = { ...initial.settings, onboardingComplete: true, syncEnabled: false, syncCode: null };
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      expect(url.origin).toBe('https://recall-memory.pages.dev');
      if (url.pathname.startsWith('/api/')) { await route.fulfill({ status: 503, json: { error: 'synthetic-offline-acceptance' } }); return; }
      expect(request.method()).toBe('GET');
      await route.continue();
    });
    const page = await context.newPage();
    await page.addInitScript(data => { if (!localStorage.getItem('recall.snapshot.v1')) localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); }, initial);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await expect(page.locator('.m-paper-review-card')).toBeVisible();
    await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
    await expect(page.locator('[data-app-version]')).toHaveText('1.1-20261105-1801');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state), { timeout: 120000 }).toBe('activated');
    const before = await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'));
    const cache = await page.evaluate(async () => { const names = await caches.keys(); const cacheName = names.find(name => name.includes('precache')); if (!cacheName) return []; return (await (await caches.open(cacheName)).keys()).map(request => request.url); });
    expect(cache.some(url => new URL(url).pathname === '/index.html')).toBe(true);
    expect(cache.some(url => new URL(url).pathname.includes('memory-workspace'))).toBe(true);
    const directory = process.env.RECALL_VERIFY_DIST;
    if (!directory) throw new Error('RECALL_VERIFY_DIST must point to the committed production bundle');
    const workerSource = await readFile(resolve(directory, 'sw.js'), 'utf8');
    const expectedPaths = [...new Set([...workerSource.matchAll(/\{url:"([^"]+)"/g)].map(match => new URL(match[1], 'https://recall-memory.pages.dev/').pathname))].sort();
    expect(expectedPaths.length).toBeGreaterThan(0);
    expect([...new Set(cache.map(url => new URL(url).pathname))].sort()).toEqual(expectedPaths);
    if (browserName === 'chromium') {
      await context.setOffline(true);
      await expect(page.evaluate(async () => { await fetch(`/uncached-offline-probe-${Date.now()}`, { cache: 'no-store' }); })).rejects.toThrow();
    } else console.log('WebKit: all precache paths and online persistence checked; public offline simulation remains unverified after engine/routing failures. Local stopped-server offline checks are separate.');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.m-paper-review-card')).toBeVisible();
    await expect(page.getByRole('button', { name: '开始复习', exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'))).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(browserName === 'chromium' ? 'v11-offline.png' : 'v11-cached.png'), scale: 'css' });
  } finally { await context.close(); }
});
