import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSeedSnapshot } from '../src/data/seed';

test('V1.1 公网缓存完整与持久化，Chromium 断网重开；WebKit 公网断网仍待验证', async ({ browser, browserName }) => {
  test.setTimeout(600000);
  const context = await browser.newContext({ baseURL: 'https://recall-memory.pages.dev/', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'allow', locale: 'zh-CN' });
  try {
    const directory = process.env.RECALL_VERIFY_DIST;
    if (!directory) throw new Error('RECALL_VERIFY_DIST must point to the committed production bundle');
    const build = JSON.parse(await readFile(resolve(directory, 'version.json'), 'utf8')) as { version: string; releaseVersion?: string };
    const initial = createSeedSnapshot();
    initial.decks.forEach((deck, index) => { deck.name = `公开验收合成卡组 ${index + 1}`; });
    initial.cards.forEach(card => { card.front = '合成问题，用于验证离线缓存。'; card.back = '合成答案，不是真实用户数据。'; });
    initial.settings = { ...initial.settings, onboardingComplete: true, syncEnabled: false, syncCode: null };
    context.on('console', message => { if (message.type() === 'error') console.log('Public cache console', message.text()); });
    context.on('requestfailed', request => console.log('Public cache request failed', new URL(request.url()).pathname, request.failure()?.errorText));
    context.on('request', request => {
      const url = new URL(request.url());
      expect(url.origin).toBe('https://recall-memory.pages.dev');
      if (!url.pathname.startsWith('/api/')) expect(request.method()).toBe('GET');
    });
    await context.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'synthetic-offline-acceptance' } }));
    const page = await context.newPage();
    await page.addInitScript(data => { if (!localStorage.getItem('recall.snapshot.v1')) localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); }, initial);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await expect(page.locator('.m-paper-review-card')).toBeVisible({ timeout: 120000 });
    const dock = page.locator('.m-paper-home-dock');
    await expect(dock.getByRole('button', { name: '开始复习', exact: true })).toBeVisible();
    await expect(dock.getByRole('button')).toHaveCount(1);
    await expect(dock.locator('small')).toHaveCount(0);
    expect(await dock.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, events: getComputedStyle(element).pointerEvents }))).toEqual({ background: 'rgba(0, 0, 0, 0)', events: 'none' });
    await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
    await expect(page.locator('[data-app-version]')).toHaveText(build.releaseVersion ?? build.version);
    await expect(page.locator('#memory-drawer').getByRole('button', { name: '同步并检查更新', exact: true })).toBeVisible();
    await expect(page.locator('.m-drawer-sync').getByRole('button')).toHaveCount(0);
    expect(await page.locator('.m-drawer-info').evaluate(element => ['.m-drawer-sync-status', '.m-drawer-sync > small', '.m-app-version > small'].map(selector => getComputedStyle(element.querySelector(selector)!).fontSize))).toEqual(['14px', '12px', '12px']);
    const geometry = await page.locator('.m-app-version.is-compact').evaluate(element => { const version = element.querySelector('small')!.getBoundingClientRect(); const action = element.querySelector('button')!.getBoundingClientRect(); return { versionCenter: version.top + version.height / 2, actionCenter: action.top + action.height / 2, width: action.width, height: action.height, text: element.querySelector('button')!.textContent }; });
    expect(geometry.actionCenter).toBeCloseTo(geometry.versionCenter, 4);
    expect(geometry).toMatchObject({ width: 44, height: 44, text: '' });
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
    await page.screenshot({ path: test.info().outputPath('drawer-sync-update.png'), scale: 'css' });
    await page.keyboard.press('Escape');
    try {
      await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state), { timeout: 300000 }).toBe('activated');
    } catch (error) {
      console.log('Public SW activation diagnostic', await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); return { controller: navigator.serviceWorker.controller?.state, active: registration?.active?.state, waiting: registration?.waiting?.state, installing: registration?.installing?.state, scope: registration?.scope, cacheNames: await caches.keys() }; }));
      throw error;
    }
    const before = await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'));
    const cache = await page.evaluate(async () => { const names = await caches.keys(); const cacheName = names.find(name => name.includes('precache')); if (!cacheName) return []; return (await (await caches.open(cacheName)).keys()).map(request => request.url); });
    expect(cache.some(url => new URL(url).pathname === '/index.html')).toBe(true);
    expect(cache.some(url => new URL(url).pathname.includes('memory-workspace'))).toBe(true);
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
