import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('三个常用入口同层展示，低频入口折叠，窄屏和安全区内均可用', async ({ page }, info) => {
  await page.goto('/#import');
  const sources = page.getByRole('group', { name: '常用导入' });
  await expect(sources.getByRole('button')).toHaveCount(3);
  const entries = sources.getByRole('button');
  for (const button of await entries.all()) {
    const bounds = (await button.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.y + bounds.height).toBeLessThan(852 - 34);
  }
  await expect(page.getByRole('button', { name: /^手动添加卡片/ })).not.toBeVisible();
  await expect(page.getByRole('button', { name: '其他导入：CSV / Anki / Recall' })).not.toBeVisible();
  await expect(page.locator('.m-import-box')).toHaveCount(0);
  await expect(page.locator('.m-step')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('import-choices-iphone15.png') });
  for (const width of [320, 393, 760, 761]) {
    await page.setViewportSize({ width, height: 852 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(entries.nth(2)).toBeVisible();
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('.memory-app').evaluate(element => { (element as HTMLElement).style.setProperty('--safe-top', '69px'); (element as HTMLElement).style.setProperty('--safe-bottom', '34px'); });
  const heading = (await page.getByRole('heading', { name: '把知识，收进卡片。' }).boundingBox())!;
  const bar = (await page.locator('.memory-bar').boundingBox())!;
  expect(heading.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  for (const button of await entries.all()) expect((await button.boundingBox())!.y + (await button.boundingBox())!.height).toBeLessThan(818);
  await page.getByText('其他方式', { exact: true }).click();
  await page.getByRole('button', { name: '格式说明' }).click();
  await expect(page.getByRole('dialog', { name: 'Markdown 格式' })).toBeVisible();
  await page.getByRole('button', { name: '关闭面板' }).click();
  await page.getByRole('button', { name: /^手动添加卡片/ }).click();
  await expect(page.getByRole('dialog', { name: '添加卡片' })).toBeVisible();
  await page.getByRole('button', { name: '关闭面板' }).click();
  await page.getByRole('button', { name: '其他导入：CSV / Anki / Recall' }).click();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'compat');
});

test('文字和带图入口分别筛选文件，并保留预览、取消与确认步骤', async ({ page }) => {
  const image = readFileSync(new URL('./fixtures/source-screenshot.png', import.meta.url));
  const id = createHash('sha256').update(image).digest('hex') + '.png';
  const markdown = '# Examples\n\n<!-- recall:card {"id":"import-choice-card"} -->\n问题：What is the source?\n\nSynthetic evidence.\n<!-- recall:end -->';
  await page.goto('/#import');
  const markdownPicker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择 Markdown 文件' }).click();
  const textChooser = await markdownPicker;
  expect(await textChooser.element().getAttribute('accept')).toBe('.md,.markdown');
  await textChooser.setFiles({ name: 'synthetic.md', mimeType: 'text/markdown', buffer: Buffer.from(markdown) });
  await expect(page.getByText('新增 1 · 重复 0 · 变更 0')).toBeVisible();
  await expect(page.getByRole('group', { name: '常用导入' })).not.toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('group', { name: '常用导入' })).toBeVisible();
  const mediaPicker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择带图包' }).click();
  const mediaChooser = await mediaPicker;
  expect(await mediaChooser.element().getAttribute('accept')).toBe('.json');
  const packed = { format: 'recall-media', version: 1, markdown: markdown.replace('Synthetic evidence.', `Synthetic evidence.\n\n![Source](recall://${id})`), images: [{ id, mime: 'image/png', base64: image.toString('base64') }] };
  await mediaChooser.setFiles({ name: 'synthetic.recall-media.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packed)) });
  await expect(page.getByText(/^1 张图片 ·/)).toBeVisible();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('新增 1，更新 0，跳过 0')).toBeVisible();
  await page.getByRole('button', { name: '继续导入', exact: true }).click();
  await page.getByRole('button', { name: '导入划线', exact: true }).click();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'weread');
  await expect(page.getByRole('button', { name: '连接微信读书' })).toBeVisible();
});
