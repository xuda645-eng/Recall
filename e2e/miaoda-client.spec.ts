import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

async function isolatedArtifacts() {
  const root = resolve('dist-miaoda-client');
  const base = '/app/app_17hv4js1tsy/recall/';
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;
      if (!pathname.startsWith(base)) { response.writeHead(404).end(); return; }
      const file = resolve(root, pathname === base ? 'miaoda-client.html' : decodeURIComponent(pathname.slice(base.length)));
      if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
      const bytes = await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing isolated artifact server');
  let stopped = false;
  return {
    url: `http://127.0.0.1:${address.port}${base}`,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      server.closeAllConnections();
      await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    },
  };
}

function fixture() {
  const seed = createSeedSnapshot();
  const at = '2026-10-01T00:00:00.000Z';
  return {
    ...seed,
    decks: [{ ...seed.decks[0], id: 'migration-root', name: '迁移合成练习', parentId: null }],
    cards: [{ ...seed.cards[0], id: 'migration-first', deckId: 'migration-root',
      front: '如何验证迁移？\n\n' + '使用合成数据验证阅读和持久化。\n\n'.repeat(40),
      back: '保留原文、复习记录和本机数据。\n\n'.repeat(45),
      state: 'new', contentKind: 'qa', nextReviewDate: at, lastReviewDate: null, reps: 0,
      stability: 0, difficulty: 0, lapses: 0, learningSteps: 0, elapsedDays: 0, scheduledDays: 0,
    }],
    reviewLogs: [], studySessions: [],
    settings: { ...seed.settings, onboardingComplete: true, syncCode: null, syncEnabled: false,
      studyPreferences: { newCardRatio: 1, batchSize: 10, sessionMinutes: 30 },
      reviewPlan: { mode: 'fixed', intervals: { again: 60000, hard: 86400000, good: 2592000000, easy: 15552000000 } },
    },
  };
}

async function ready(page: Page) {
  await expect(page.locator('.memory-app')).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
}

async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null'));
}

async function navigate(page: Page, label: string) {
  const logo = page.getByRole('button', { name: '打开项目菜单', exact: true });
  if (await logo.isVisible()) await logo.click();
  await page.locator('#memory-drawer').getByRole('button', { name: label, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(value => {
    if (!localStorage.getItem('recall.miaoda.synthetic-seeded')) {
      localStorage.setItem('recall.snapshot.v1', JSON.stringify(value));
      localStorage.setItem('recall.miaoda.synthetic-seeded', '1');
    }
  }, fixture());
});

test('same-page SDK shell, scoped worker and mobile geometry', async ({ page }) => {
  const businessRequests: string[] = [];
  page.on('request', request => {
    if (/\/api\/(?:auth|sync|media|weread)(?:\/|\?|$)/.test(new URL(request.url()).pathname)) businessRequests.push(request.method());
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const logo = page.getByRole('button', { name: '打开项目菜单', exact: true });
  const box = await logo.boundingBox();
  expect(box?.width).toBe(48);
  expect(box?.height).toBe(48);
  await logo.click();
  await expect(page.locator('#memory-drawer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(logo).toBeFocused();
  expect(businessRequests).toEqual([]);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) throw new Error('Missing manifest');
    return (await fetch(link.href)).json();
  });
  expect(manifest.scope).toBe('/app/app_17hv4js1tsy/recall/');
  expect(manifest.start_url).toBe(manifest.scope);
  await page.screenshot({ path: test.info().outputPath('local-miaoda-home.png'), scale: 'css' });
});

test('actual SDK transport preserves application path and HTTP CSRF gates on read-only readiness', async ({ page, browserName }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await ready(page);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'suda-csrf-token');
  const request = page.waitForRequest(value => value.url().endsWith('/api/recall/migration-status'));
  const result = await page.evaluate(async () => {
    const modulePath = '/app/app_17hv4js1tsy/client/src/api/recall-http.ts';
    const module = await import(modulePath);
    const transport = module.createMiaodaBackendTransport();
    const response: Response = await transport('/api/recall/migration-status', { cache: 'no-store' });
    return { status: response.status, cache: response.headers.get('cache-control'),
      body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : null };
  });
  const outgoing = await request;
  expect(new URL(outgoing.url()).pathname).toBe('/app/app_17hv4js1tsy/api/recall/migration-status');
  const headers = await outgoing.allHeaders();
  expect(headers['cache-control']).toBe('no-store');
  if (browserName === 'webkit' && !csrf) {
    expect(result.status).toBe(403);
    test.info().annotations.push({ type: 'unverified',
      description: 'HTTP loopback WebKit lacks the platform Secure CSRF cookie; only rejection was verified, not authenticated readiness.' });
    return;
  }
  expect(Boolean(csrf?.value && headers['x-suda-csrf-token'] === csrf.value)).toBe(true);
  expect(result.status).toBe(200);
  expect(result.cache).toContain('no-store');
  expect(result.body.readyForMigration).toBe(false);
});

test('long reading, rating, undo and refresh preserve synthetic records', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /确认开始复习|开始学习新卡/ }).click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  for (const rating of ['again', 'hard', 'good', 'easy']) {
    const box = await page.locator(`[data-rating="${rating}"]`).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('[data-rating="again"]').click();
  await expect.poll(async () => (await state(page)).reviewLogs.length).toBe(1);
  await page.getByRole('button', { name: '撤销上次评分', exact: true }).click();
  await expect.poll(async () => (await state(page)).reviewLogs.length).toBe(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  expect((await state(page)).cards[0].reps).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('offline same-origin reopening preserves data without platform identity HTML', async ({ page, context }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect.poll(() => page.evaluate(async () => {
    const keys = await caches.keys();
    return keys.some(key => key.startsWith('recall-miaoda-static:'));
  })).toBe(true);
  const before = await state(page);
  await page.evaluate(() => Reflect.set(window, '__migrationOnlineDocument', true));
  await context.setOffline(true);
  try {
    await page.goto('./?offline-reopen=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.memory-app')).toBeVisible();
    expect(await state(page)).toEqual(before);
    expect(await page.evaluate(() => Boolean(Reflect.get(window, '__migrationOnlineDocument')))).toBe(false);
    expect(await page.evaluate(() => Boolean(Reflect.get(window, '__platform__')))).toBe(false);
  } finally { await context.setOffline(false); }
});

test('isolated static artifacts reopen a fresh offline document with their origin stopped', async ({ page, context }) => {
  const server = await isolatedArtifacts();
  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await ready(page);
    const before = await state(page);
    await page.evaluate(() => Reflect.set(window, '__migrationOnlineDocument', true));
    await server.stop();
    await expect(context.request.get(server.url + 'uncached-probe', { timeout: 1000 })).rejects.toThrow();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page);
    expect(await page.evaluate(() => Boolean(Reflect.get(window, '__migrationOnlineDocument')))).toBe(false);
    expect(await page.evaluate(() => Boolean(Reflect.get(window, '__platform__')))).toBe(false);
    expect(await state(page)).toEqual(before);
    await page.getByRole('button', { name: '开始复习', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: /确认开始复习|开始学习新卡/ }).click();
    await page.getByRole('button', { name: '显示答案', exact: true }).click();
    await page.locator('[data-rating="good"]').click();
    await expect.poll(async () => (await state(page)).reviewLogs.length).toBe(1);
    test.info().annotations.push({ type: 'scope', description: 'Static-artifact offline acceptance only, not the SDK shell or physical installed PWA.' });
  } finally { await server.stop(); }
});

test('safe-area stress, narrow widths and platform attribution do not cover controls', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await ready(page);
  for (const width of [393, 320, 760, 761, 852]) {
    await page.setViewportSize({ width, height: width === 852 ? 393 : 852 });
    await page.locator('.memory-app').evaluate(element => {
      const app = element as HTMLElement;
      app.style.setProperty('--safe-top', '59px');
      app.style.setProperty('--safe-bottom', 'max(34px, var(--miaoda-bottom-clearance, 0px))');
    });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const start = page.getByRole('button', { name: '开始复习', exact: true });
    const bounds = await start.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    const badge = page.locator('[data-custom-element$="-watermark-mobile"], [data-custom-element$="-watermark-desktop"]').first();
    if (await badge.count()) {
      await expect.poll(async () => {
        const control = await start.boundingBox();
        const attribution = await badge.boundingBox();
        return Boolean(control && attribution && control.y + control.height <= attribution.y - 7);
      }).toBe(true);
    }
  }
});

test('Markdown preview and update retain stable cards and review metadata', async ({ page }) => {
  await page.goto('./#import', { waitUntil: 'domcontentloaded' });
  await ready(page);
  const file = (answer: string) => ({ name: 'migration.md', mimeType: 'text/markdown',
    buffer: Buffer.from(`# 迁移导入\n\n<!-- recall:card {"id":"migration-markdown"} -->\n问题：迁移导入问题\n\n${answer}\n\n<!-- recall:end -->\n`) });
  await page.getByLabel('导入文件').setInputFiles(file('迁移原始答案'));
  await expect(page.getByText('迁移原始答案', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  const before = (await state(page)).cards.find((card: { id: string }) => card.id === 'migration-markdown');
  await page.getByRole('button', { name: '继续导入', exact: true }).click();
  await page.getByLabel('导入文件').setInputFiles(file('迁移更新答案'));
  await expect(page.getByText('检测到变化', { exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  const after = (await state(page)).cards.find((card: { id: string }) => card.id === before.id);
  expect(after.back).toBe('迁移更新答案');
  expect(after.reps).toBe(before.reps);
  expect(after.nextReviewDate).toBe(before.nextReviewDate);
  expect((await state(page)).cards).toHaveLength(2);
});

test('synthetic media package reads from local storage after refresh without cloud uploads', async ({ page }) => {
  await page.goto('./#import', { waitUntil: 'domcontentloaded' });
  await ready(page);
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing synthetic canvas');
    context.fillStyle = '#50624b'; context.fillRect(0, 0, 2, 2);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const image = Buffer.from(base64, 'base64');
  const id = createHash('sha256').update(image).digest('hex') + '.png';
  const markdown = `# 迁移图片\n\n<!-- recall:card {"id":"migration-media"} -->\n问题：迁移图片问题\n\n合成图片答案\n\n![迁移合成图片](recall://${id})\n<!-- recall:end -->\n`;
  const packed = { format: 'recall-media', version: 1, markdown, images: [{ id, mime: 'image/png', base64 }] };
  await page.getByLabel('导入文件').setInputFiles({ name: 'migration.recall-media.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packed)) });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  await page.getByRole('button', { name: '查看卡组', exact: true }).click();
  await page.locator('.m-card-open').filter({ hasText: '迁移图片问题' }).click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await expect(page.getByRole('img', { name: '迁移合成图片' })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  await expect(page.getByRole('img', { name: '迁移合成图片' })).toBeVisible();
  expect((await state(page)).cards).toHaveLength(2);
  await navigate(page, '设置与数据');
  await page.getByRole('button', { name: '备份', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '备份（含来源图片）', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('Missing synthetic image backup');
  const backup = JSON.parse(await readFile(path, 'utf8'));
  expect(backup.images).toHaveLength(1);
  expect(Buffer.from(backup.images[0].base64, 'base64')).toEqual(image);
  expect(backup.backup.cards).toHaveLength(2);
  expect(backup.backup.settings.syncCode).toBeNull();
});

test('local WeRead import retains source text and stable identity on repeat import', async ({ page }) => {
  await page.goto('./#import', { waitUntil: 'domcontentloaded' });
  await ready(page);
  const text = '  迁移原文第一行。\n\n迁移原文第二行。  ';
  const file = { name: 'weread.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
    format: 'recall-weread-export-v1', books: [{ bookId: 'migration-book', title: '迁移合成书', highlights: [{
      bookmarkId: 'migration-highlight', markText: text, chapterUid: 'migration-chapter', chapterTitle: '第一章',
      question: '迁移是否保留原文？', recallKind: 'qa',
    }] }],
  })) };
  const load = async () => {
    await page.getByLabel('导入文件').setInputFiles(file);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '预览并编辑回忆卡', exact: true }).click();
    await page.getByRole('button', { name: '检查导入变化', exact: true }).click();
    await page.getByRole('button', { name: '确认导入', exact: true }).click();
    await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  };
  await load();
  const before = (await state(page)).cards.find((card: { bookTitle?: string }) => card.bookTitle === '迁移合成书');
  expect(before.back).toBe(text);
  expect(before.chapter).toBe('第一章');
  await page.getByRole('button', { name: '继续选择其他书', exact: true }).click();
  await load();
  const after = (await state(page)).cards.find((card: { id: string }) => card.id === before.id);
  expect(after).toEqual(before);
  expect((await state(page)).cards).toHaveLength(2);
});

test('editing sheets, statistics and text backup retain local data without credentials', async ({ page }) => {
  await page.goto('./#cards', { waitUntil: 'domcontentloaded' });
  await ready(page);
  await navigate(page, '全部卡片');
  await page.getByRole('button', { name: /管理卡片：如何验证迁移/ }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await page.getByRole('textbox', { name: '答案', exact: true }).fill('迁移后修改，保留复习记录。');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect.poll(async () => (await state(page)).cards[0].back).toBe('迁移后修改，保留复习记录。');
  await navigate(page, '统计');
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'stats');
  await navigate(page, '设置与数据');
  await page.getByRole('button', { name: '备份', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '仅文字与进度备份', exact: true }).click();
  const download = await pending;
  const file = await download.path();
  if (!file) throw new Error('Missing synthetic backup');
  const backup = JSON.parse(await readFile(file, 'utf8'));
  expect(backup.settings.syncCode).toBeNull();
  expect(backup.settings.syncEnabled).toBe(false);
  expect(backup.cards[0].back).toBe('迁移后修改，保留复习记录。');
});
