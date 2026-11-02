import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const origin = 'https://127.0.0.1:8798';
const bootstrap = 'synthetic-media-local-only-bootstrap-not-production';
const image = readFileSync(new URL('./fixtures/source-screenshot.png', import.meta.url));
const imageId = createHash('sha256').update(image).digest('hex') + '.png';
async function authorize(page: Page, label: string) {
  await page.goto('/#settings');
  await page.evaluate(async ({ code, label }) => {
    const response = await fetch('/api/auth/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, label }) });
    if (!response.ok) throw new Error('Local synthetic pairing failed');
  }, { code: bootstrap, label });
  await page.reload();
  await expect(page.getByText('云同步 · 已同步', { exact: true })).toBeVisible();
}
test('本地 D1 两设备图片上传下载、重复同步不传图片且撤销后拒绝读取', async ({ browser, baseURL }) => {
  if (baseURL !== origin + '/') throw new Error('Media mutation tests require the isolated loopback origin');
  const first = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
  const second = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, serviceWorkers: 'block', viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
  const page = await first.newPage();
  const other = await second.newPage();
  try {
    await page.goto('/');
    const session = await page.evaluate(async ({ bootstrap }) => {
      const result = await fetch('/api/auth/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: bootstrap, label: 'Synthetic local first' }) });
      return result.json();
    }, { bootstrap });
    expect(session.spaceId).toBe('synthetic-media-test');
    const unique = `local-media-${Date.now()}`;
    await page.goto('/#import'); await page.reload();
    const markdown = `# ${unique}\n<!-- recall:card {"id":"${unique}"} -->\n问题：Local image source?\n\nSynthetic answer\n![Source](recall://${imageId})\n<!-- recall:end -->`;
    await page.locator('input[type=file]').setInputFiles({ name: 'local.recall-media.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'recall-media', version: 1, markdown, images: [{ id: imageId, mime: 'image/png', base64: image.toString('base64') }] })) });
    await page.getByRole('button', { name: '确认导入', exact: true }).click();
    await expect(page.getByText('导入完成', { exact: true })).toBeVisible();
    await page.goto('/#settings'); await page.reload();
    await expect(page.getByText(/来源图片：已同步/)).toBeVisible();
    await authorize(other, 'Synthetic local second');
    await expect(other.getByText(/来源图片：已同步/)).toBeVisible();
    const local = await other.evaluate((id: string) => new Promise<boolean>((resolve, reject) => { const request = indexedDB.open('recall-media-v1'); request.onsuccess = () => { const image = request.result.transaction('images').objectStore('images').get(id); image.onsuccess = () => { resolve(!!image.result); request.result.close(); }; }; request.onerror = () => reject(request.error); }), imageId);
    expect(local).toBe(true);
    const uploads: string[] = [];
    page.on('request', request => { if (request.method() === 'PUT' && request.url().includes('/api/media/')) uploads.push(request.url()); });
    await page.getByRole('button', { name: '立即同步', exact: true }).click();
    await expect(page.getByText('云同步 · 已同步', { exact: true })).toBeVisible();
    expect(uploads).toHaveLength(0);
    const status = await other.evaluate(async (id: string) => { await fetch('/api/auth/logout', { method: 'POST' }); return (await fetch('/api/media/' + id)).status; }, imageId);
    expect(status).toBe(401);
  } finally { await first.close(); await second.close(); }
});
