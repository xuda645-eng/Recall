import { test, expect } from '@playwright/test';

test('独立 HTTPS 预览可导入合成带图包、放大与备份，所有 API 被隔离', async ({ page, request }, info) => {
  for (const path of ['/api/auth/session', '/api/sync', '/api/media/' + 'a'.repeat(64) + '.png', '/api/weread/books']) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(await response.text()).toContain('PREVIEW_LOCAL_ONLY');
  }
  await page.goto('/media-demo.html');
  await expect(page.getByRole('heading', { name: '来源截图体验' })).toBeVisible();
  const sample = await request.get('/synthetic.recall-media.json');
  expect(sample.ok()).toBe(true);
  const content = await sample.body();
  await page.getByRole('link', { name: '2. 打开 Recall 导入' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.recall-media.json', mimeType: 'application/json', buffer: content });
  await expect(page.getByText('1 张图片', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('新增 2，更新 0，跳过 0')).toBeVisible();
  await page.goto('/#cards'); await page.reload();
  await page.locator('[data-card-id="synthetic-media-demo-1"] .m-card-open').click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await page.locator('.m-reading[data-active=true] .recall-media-preview').click();
  const viewer = page.getByRole('dialog', { name: '合成红框截图', exact: true });
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: '放大图片', exact: true }).click();
  await expect(viewer.locator('footer')).toContainText('150%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('public-image-viewer-iphone15.png') });
  await viewer.getByRole('button', { name: '关闭来源图片' }).click();
  await page.goto('/#settings'); await page.reload();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '备份（含来源图片）', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.recall-media\.json$/);
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const metadata = await manifest.json();
  expect(metadata.start_url).toBe('/');
  for (const icon of metadata.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get('/sw.js')).ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30000 }).toBe(true);
});
