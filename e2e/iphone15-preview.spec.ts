import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

async function serveOfflineFixture() {
  const root = resolve(process.env.RECALL_E2E_BUILD_DIR || 'dist');
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;
      const file = resolve(root, pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)));
      if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
      const contents = await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(contents);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Offline fixture did not start');
  let stopped = false;
  return {
    url: `http://127.0.0.1:${address.port}/`,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    },
  };
}

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

test('同源iPhone15预览固定手机比例并共享首页数据', async ({ page }) => {
  await page.goto('./#home');
  await expect(page.locator('.memory-app')).toBeVisible();
  const original = await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'));
  await page.goto('./iphone15.html');
  const app = page.frameLocator('iframe');
  await expect(app.locator('.memory-app')).toBeVisible();
  const shared = await app.locator('body').evaluate(() => ({
    origin: location.origin,
    snapshot: localStorage.getItem('recall.snapshot.v1'),
  }));
  expect(shared.origin).toBe(new URL(page.url()).origin);
  expect(shared.snapshot).toBe(original);
  for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 568 }, { width: 760, height: 852 }, { width: 1280, height: 960 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => app.locator('body').evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width: 393, height: 852 });
    await expect.poll(() => page.locator('iframe').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.bottom <= innerHeight + 1 && bounds.left >= 0 && bounds.right <= innerWidth + 1;
    })).toBe(true);
    expect(await page.locator('iframe').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.width / bounds.height;
    })).toBeCloseTo(393 / 852, 5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 542, height: 824 });
  await app.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await expect(app.locator('#memory-drawer')).toBeVisible();
  await page.getByRole('link', { name: '返回正式首页' }).click();
  await expect(page.locator('.memory-app')).toBeVisible();
  expect(new URL(page.url()).pathname).not.toContain('iphone15');
});

test('同源iPhone15预览离线刷新保留合成卡组', async ({ page, context, browserName }) => {
  test.skip(!!process.env.RECALL_URL, 'Offline synthetic-data checks are local-only');
  const isolated = browserName === 'webkit' ? await serveOfflineFixture() : null;
  try {
    await page.goto(isolated?.url ?? './#home');
    await expect(page.locator('.memory-app')).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
    const seed = createSeedSnapshot();
    seed.decks = [{ ...seed.decks[0], id: 'preview-local', name: '同源预览合成卡组', parentId: null }];
    seed.cards = [];
    seed.reviewLogs = [];
    seed.studySessions = [];
    seed.settings.onboardingComplete = true;
    await page.evaluate(value => localStorage.setItem('recall.snapshot.v1', JSON.stringify(value)), seed);
    await page.reload();
    await expect(page.getByText('同源预览合成卡组', { exact: true })).toBeVisible();
    await page.goto(new URL('./iphone15.html', page.url()).href);
    const app = page.frameLocator('iframe');
    await expect(app.getByText('同源预览合成卡组', { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const matches = await Promise.all(cacheNames.map(async name => (await caches.open(name)).match(new URL('./iphone15.html', location.href), { ignoreSearch: true })));
      return matches.some(Boolean);
    })).toBe(true);
    if (isolated) await isolated.stop();
    else await context.setOffline(true);
    await page.reload();
    await expect(app.getByText('同源预览合成卡组', { exact: true })).toBeVisible();
    expect(await app.locator('body').evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null').decks[0].id)).toBe('preview-local');
  } finally {
    await context.setOffline(false);
    await isolated?.stop();
  }
});
