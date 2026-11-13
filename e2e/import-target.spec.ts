import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';

const markdown = '# 合成导入\n<!-- recall:card {"id":"synthetic-target-card"} -->\n问题：合成问题？\n\n合成答案。\n<!-- recall:end -->';

async function navigate(page: Page, name: string) {
  const drawer = page.locator('#memory-drawer');
  if (await drawer.getAttribute('aria-hidden') === 'true') await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await drawer.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
}

async function upload(page: Page, media: boolean) {
  await page.getByRole('button', { name: media ? '选择带图卡片文件' : '选择 Markdown 文件', exact: true }).click();
  await page.locator('input[type=file]').first().setInputFiles({
    name: media ? 'synthetic-target.recall-media.json' : 'synthetic-target.md',
    mimeType: media ? 'application/json' : 'text/markdown',
    buffer: Buffer.from(media ? JSON.stringify({ format: 'recall-media', version: 1, markdown, images: [] }) : markdown),
  });
  await expect(page.getByRole('button', { name: '导入到 根目录', exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  const seed = createSeedSnapshot();
  const at = '2026-11-13T12:00:00+08:00';
  await page.addInitScript(snapshot => {
    if (localStorage.getItem('recall.import.target.seeded')) return;
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(snapshot));
    localStorage.setItem('recall.import.target.seeded', '1');
    localStorage.setItem('recall.miaoda.personal.notice.v1', 'accepted');
  }, { ...seed, decks: [
    { ...seed.decks[0], id: 'active', name: '有效目录', parentId: null },
    { ...seed.decks[0], id: 'target', name: '临时目标', parentId: null },
    { ...seed.decks[0], id: 'target-child', name: '临时子目录', parentId: 'target' },
    { ...seed.decks[0], id: 'archived', name: '旧归档目录', parentId: null },
    { ...seed.decks[0], id: 'archived-child', name: '旧归档子目录', parentId: 'archived' },
    { ...seed.decks[0], id: 'empty-archived', name: '空归档目录', parentId: null, archivedAt: at },
  ], cards: [{ ...seed.cards[0], id: 'synthetic-archived-card', deckId: 'archived', archivedAt: at }],
  reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true, syncEnabled: false, syncCode: null } });
  await page.goto('./#import');
  await expect(page.locator('.memory-app')).toBeVisible();
});

for (const media of [false, true]) {
  test(`import targets exclude archived branches and empty marked folders (${media ? 'media' : 'markdown'})`, async ({ page }) => {
    await upload(page, media);
    await page.getByRole('button', { name: '导入到 根目录', exact: true }).click();
    const tree = page.getByRole('tree', { name: '导入到' });
    for (const name of ['旧归档目录', '旧归档子目录', '空归档目录']) {
      await expect(tree.getByRole('button', { name: `选择目录：${name}`, exact: true })).toHaveCount(0);
    }
    await expect(tree.getByRole('button', { name: '选择目录：有效目录', exact: true })).toBeVisible();
    await tree.getByRole('button', { name: '展开临时目标的子目录', exact: true }).click();
    await expect(tree.getByRole('button', { name: '选择目录：临时子目录', exact: true })).toBeVisible();
    for (const button of await tree.getByRole('button').all()) {
      const bounds = await button.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
    }
    for (const viewport of [{ width: 320, height: 852 }, { width: 760, height: 852 }, { width: 852, height: 393 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await expect(tree.getByRole('button', { name: '选择目录：有效目录', exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator('.memory-app').evaluate(element => {
      (element as HTMLElement).style.setProperty('--safe-top', '59px');
      (element as HTMLElement).style.setProperty('--safe-bottom', '34px');
    });
    await tree.getByRole('button', { name: '选择目录：有效目录', exact: true }).click();
    await expect(page.getByRole('button', { name: '导入到 有效目录', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '确认导入', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const before = await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'));
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'))).toBe(before);
  });
}

test('a target archived and deleted during preview must be explicitly replaced, never silently changed to root', async ({ page }) => {
  await upload(page, false);
  await page.getByRole('button', { name: '导入到 根目录', exact: true }).click();
  await page.getByRole('button', { name: '选择目录：临时目标', exact: true }).click();
  await navigate(page, '卡组目录');
  await page.getByRole('button', { name: '管理临时目标', exact: true }).click();
  await page.getByRole('button', { name: '归档整个卡组', exact: true }).click();
  await page.getByRole('button', { name: '确认归档空卡组', exact: true }).click();
  await navigate(page, '导入');
  await expect(page.getByRole('button', { name: '导入到 请选择目录', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('已归档或删除');
  await expect(page.getByRole('button', { name: '确认导入', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeEnabled();
  await navigate(page, '已归档');
  await page.getByRole('button', { name: '管理归档卡组：临时目标', exact: true }).click();
  await page.getByRole('button', { name: '彻底删除', exact: true }).click();
  await page.getByRole('textbox', { name: '删除确认', exact: true }).fill('删除');
  await page.getByRole('button', { name: '确认彻底删除', exact: true }).click();
  await navigate(page, '导入');
  await expect(page.getByRole('button', { name: '确认导入', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '导入到 请选择目录', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: '根目录', exact: true })).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('button', { name: '选择目录：临时目标', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '选择目录：根目录', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认导入', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).cards.some((card: { id: string }) => card.id === 'synthetic-target-card'))).toBe(false);
});
