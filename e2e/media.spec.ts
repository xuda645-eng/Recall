import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createTaskPreviewServer } from '../scripts/serve-task-preview.mjs';

const image = readFileSync(new URL('./fixtures/source-screenshot.png', import.meta.url));
const id = createHash('sha256').update(image).digest('hex') + '.png';
const markdown = `# Screenshot examples\n\n<!-- recall:card {"id":"image-card"} -->\n问题：Why keep a source image?\n\nTo retain context without duplicating uploads.\n\n![Source red frame](recall://${id})\n\n[Source document](https://example.com/source)\n<!-- recall:end -->\n\n<!-- recall:card {"id":"image-card-two"} -->\n问题：How often should an image upload?\n\nOnce per content hash.\n\n![Source red frame](recall://${id})\n<!-- recall:end -->`;
const packageText = JSON.stringify({ format: 'recall-media', version: 1, markdown, images: [{ id, mime: 'image/png', base64: image.toString('base64') }] });
async function importPackage(page: Page, text = packageText) {
  await page.goto('/#import');
  await page.reload();
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.recall-media.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}
async function imageCount(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('recall-media-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const count = request.result.transaction('images').objectStore('images').count();
      count.onsuccess = () => { resolve(count.result); request.result.close(); };
    };
  }));
}
async function openAnswer(page: Page) {
  await page.goto('/#cards');
  await page.reload();
  await page.locator('[data-card-id="image-card"] .m-card-open').click();
  await page.getByRole('button', { name: '显示答案' }).click();
  await expect(page.locator('.m-reading[data-active=true] .recall-media-preview img').first()).toBeVisible();
}
test('带图包预览取消不保存、确认去重并保留进度，拒绝缺图', async ({ page }) => {
  await importPackage(page);
  await expect(page.getByText('1 张图片')).toBeVisible();
  expect(await imageCount(page)).toBe(0);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(await imageCount(page)).toBe(0);
  await importPackage(page);
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('新增 2，更新 0，跳过 0')).toBeVisible();
  expect(await imageCount(page)).toBe(1);
  await page.evaluate(() => { const snapshot = JSON.parse(localStorage.getItem('recall.snapshot.v1')!); snapshot.cards[0].reps = 8; localStorage.setItem('recall.snapshot.v1', JSON.stringify(snapshot)); });
  await importPackage(page);
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('新增 0，更新 0，跳过 2')).toBeVisible();
  expect(await imageCount(page)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).cards[0].reps)).toBe(8);
  await importPackage(page, JSON.stringify({ ...JSON.parse(packageText), images: [] }));
  await expect(page.getByRole('alert')).toContainText('缺少来源图片');
  const damaged = Buffer.concat([Buffer.from('RIFF'), Buffer.from([24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.from([11, 0, 0, 0, 0, 0, 0, 157, 1, 42, 1, 0, 1, 0, 0, 0])]);
  const damagedId = createHash('sha256').update(damaged).digest('hex') + '.webp';
  await importPackage(page, JSON.stringify({ format: 'recall-media', version: 1, markdown: markdown.replaceAll(id, damagedId), images: [{ id: damagedId, mime: 'image/webp', base64: damaged.toString('base64') }] }));
  await expect(page.getByRole('alert')).toContainText('无法解码');
  expect(await imageCount(page)).toBe(1);
});
test('来源图片缩略、放大拖动关闭不评分，离线刷新仍可读取', async ({ page: originalPage, context: originalContext, browser, browserName }) => {
  const server = browserName === 'webkit' ? createTaskPreviewServer({ directory: new URL('../dist', import.meta.url).pathname }) : null;
  if (server) await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server?.address();
  const context = address && typeof address !== 'string' ? await browser.newContext({ baseURL: `http://127.0.0.1:${address.port}/`, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }) : originalContext;
  const page = server ? await context.newPage() : originalPage;
  try {
  await importPackage(page);
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('导入完成', { exact: true })).toBeVisible();
  await openAnswer(page);
  const preview = page.locator('.m-reading[data-active=true] .recall-media-preview');
  expect((await preview.boundingBox())!.height).toBeLessThan(300);
  await preview.click();
  const dialog = page.getByRole('dialog', { name: 'Source red frame' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '放大图片', exact: true }).click();
  await expect(dialog.getByText('150%')).toBeVisible();
  await dialog.locator('.recall-media-stage').evaluate(element => {
    (element as HTMLElement).setPointerCapture = () => {};
    const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, clientX, clientY, pointerType: 'touch' }));
    pointer('pointerdown', 11, 100, 200); pointer('pointerdown', 12, 200, 200);
    pointer('pointermove', 12, 300, 200);
    pointer('pointerup', 11, 100, 200); pointer('pointerup', 12, 300, 200);
  });
  await expect(dialog.getByText('300%')).toBeVisible();
  await dialog.getByRole('button', { name: '重置图片大小' }).click();
  await page.screenshot({ path: test.info().outputPath('image-viewer-iphone15.png') });
  await page.keyboard.press('4');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).reviewLogs.length)).toBe(0);
  for (const button of await dialog.getByRole('button').all()) {
    const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await dialog.getByRole('button', { name: '关闭来源图片' }).click();
  await expect(dialog).toBeHidden();
  await expect(preview).toBeFocused();
  await preview.click(); await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.m-reading[data-active=true]')).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(async () => page.evaluate(async () => {
    const entries = (await Promise.all((await caches.keys()).map(async name => (await caches.open(name)).keys()))).flat();
    const paths = new Set(entries.map(request => new URL(request.url).pathname));
    return paths.has('/index.html') && performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.startsWith('/assets/')).every(entry => paths.has(new URL(entry.name).pathname));
  })).toBe(true);
  if (server) { await new Promise<void>(resolve => server.close(() => resolve())); await expect(context.request.get(new URL('/uncached-probe', page.url()).href, { timeout: 1000 })).rejects.toThrow(); }
  else await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-app')).toBeVisible();
  await openAnswer(page);
  expect(await imageCount(page)).toBe(1);
  } finally { if (server) { if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); await context.close(); } else await context.setOffline(false); }
});
test('手动附图自动压缩、带图备份与合并恢复，窄屏安全区可用', async ({ page, browser }) => {
  await importPackage(page); await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('导入完成', { exact: true })).toBeVisible();
  await page.goto('/#cards');
  await page.reload();
  await page.getByRole('button', { name: /管理卡片：Why keep/ }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await page.getByLabel('附加来源截图').setInputFiles(new URL('./fixtures/source-screenshot.png', import.meta.url).pathname);
  await expect(page.getByText('当前答案附有 2 张来源图片')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '替换截图 1' }).click();
  await chooser;
  await page.getByLabel('附加来源截图').dispatchEvent('cancel');
  await page.getByLabel('附加来源截图').setInputFiles(new URL('./fixtures/source-screenshot.png', import.meta.url).pathname);
  await expect(page.getByText('当前答案附有 2 张来源图片')).toBeVisible();
  await page.getByRole('button', { name: '移除截图 2' }).click();
  await expect(page.getByText('当前答案附有 1 张来源图片')).toBeVisible();
  await page.getByLabel('附加来源截图').setInputFiles(new URL('./fixtures/source-screenshot.png', import.meta.url).pathname);
  await expect(page.getByText('当前答案附有 2 张来源图片')).toBeVisible();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.goto('/#settings');
  await page.reload();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '备份（含来源图片）', exact: true }).click();
  const download = await downloaded;
  const path = await download.path();
  const restored = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const second = await restored.newPage();
  await second.goto('/#settings');
  second.on('dialog', dialog => dialog.accept());
  await second.locator('input[type=file]').setInputFiles(path!);
  await expect.poll(async () => second.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!)?.cards.length)).toBe(2);
  expect(await imageCount(second)).toBe(2);
  await openAnswer(second);
  await second.locator('.m-reading[data-active=true] .recall-media-preview').first().click();
  await second.getByRole('dialog').evaluate(element => { (element as HTMLElement).style.padding = '71px 14px 46px'; });
  for (const width of [320, 393, 760, 761]) {
    await second.setViewportSize({ width, height: 852 });
    expect(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(second.locator('.memory-content')).toHaveAttribute('data-route', 'read');
    await expect(second.getByRole('button', { name: '关闭来源图片' })).toBeVisible();
  }
  await second.getByRole('button', { name: '关闭来源图片' }).click();
  await second.getByRole('button', { name: '归档当前卡片' }).click();
  await second.goto('/#archived'); await second.reload();
  await second.locator('[data-card-id="image-card"] .m-card-open').click();
  await expect(second.getByRole('dialog').locator('.recall-media-preview')).toHaveCount(2);
  expect(await imageCount(second)).toBe(2);
  await restored.close();
});
