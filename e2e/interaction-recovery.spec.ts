import { expect, test, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import { readFileSync } from 'node:fs';

const at = '2026-10-01T00:00:00Z';
const image = readFileSync(new URL('./fixtures/source-screenshot.png', import.meta.url));
function fixture() {
  const seed = createSeedSnapshot();
  const decks = [
    { ...seed.decks[0], id: 'root', name: '恢复测试根目录', parentId: null },
    { ...seed.decks[0], id: 'child', name: '恢复测试子目录', parentId: 'root' },
    { ...seed.decks[0], id: 'empty', name: '深层空白目标', parentId: 'child' },
  ];
  const cards = Array.from({ length: 3 }, (_, index) => ({ ...seed.cards[0], id: `recovery-${index}`, deckId: 'child', front: `恢复测试问题 ${index}`, back: `独立答案 ${index}\n\n${'长答案独立阅读。\n\n'.repeat(60)}`, archivedAt: undefined, cardType: 'basic' as const, contentKind: 'qa' as const, state: 'new' as const, lastReviewDate: null, nextReviewDate: at, stability: 0, difficulty: 0, reps: 0, lapses: 0, learningSteps: 0, scheduledDays: 0, elapsedDays: 0 }));
  return { ...seed, decks, cards, reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true, reviewPlan: { mode: 'fixed' as const, intervals: { again: 60000, hard: 86400000, good: 2592000000, easy: 15552000000 } } } };
}
async function seedPage(page: Page, route = 'cards') {
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-app')).toBeVisible();
  await page.evaluate(({ data, route }) => { localStorage.clear(); localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); location.hash = route; }, { data: fixture(), route });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', route);
}
async function snapshot(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!));
}
async function navigate(page: Page, name: string) {
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await page.locator('#memory-drawer').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
}
async function edit(page: Page) {
  await page.getByRole('button', { name: '管理卡片：恢复测试问题 0', exact: true }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await expect(page.getByRole('dialog').locator('textarea[name=front]')).toBeVisible();
}
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('交互恢复：深层空卡组按名称匹配祖先，打开后仍保留层级', async ({ page }) => {
  await seedPage(page, 'folders');
  await page.getByRole('searchbox').fill('深层空白目标');
  await expect(page.locator('.m-folder')).toHaveCount(1);
  await page.locator('.m-folder-open').click();
  await page.getByRole('searchbox').fill('深层空白目标');
  await expect(page.locator('.m-folder')).toHaveCount(1);
  await page.locator('.m-folder-open').click();
  await expect(page.getByRole('button', { name: /深层空白目标.*0 张卡片/ })).toBeVisible();
});

test('交互恢复：子目录筛选排序与阅读范围在刷新及前进返回后恢复', async ({ page }) => {
  await seedPage(page, 'folders');
  await page.locator('.m-folder-open').click();
  await page.locator('.m-folder-open').click();
  await page.getByRole('searchbox').fill('恢复测试问题');
  await page.getByRole('button', { name: '筛选与排序', exact: true }).click();
  await page.getByLabel('排序', { exact: true }).selectOption('name');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await page.reload();
  await expect(page.locator('.m-context')).toHaveText('恢复测试子目录');
  await expect(page.getByRole('searchbox')).toHaveValue('恢复测试问题');
  await expect(page.locator('.m-filter-chips')).toContainText('名称');
  await page.locator('[data-card-id="recovery-1"] .m-card-open').click();
  await expect(page.locator('.m-context')).toHaveText('2 / 3');
  await page.goBack();
  await expect(page.locator('.m-context')).toHaveText('恢复测试子目录');
  await expect(page.getByRole('searchbox')).toHaveValue('恢复测试问题');
  await page.goForward();
  await expect(page.locator('.m-context')).toHaveText('2 / 3');
  expect((await snapshot(page)).reviewLogs).toEqual([]);
});

test('交互恢复：普通浏览刷新保留当前卡答案和滚动，不恢复隐式评分', async ({ page }) => {
  await seedPage(page);
  await page.locator('[data-card-id="recovery-1"] .m-card-open').click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  const panel = page.locator('.m-reading[data-active=true]');
  await panel.evaluate(element => { element.scrollTop = 240; element.dispatchEvent(new Event('scroll')); });
  await page.getByRole('button', { name: '开启评分（更新排期）', exact: true }).click();
  await page.reload();
  await expect(page.locator('.m-context')).toHaveText('2 / 3');
  await expect(panel).toHaveAttribute('aria-label', '卡片正文');
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBeGreaterThan(200);
  await expect(page.locator('[data-rating]')).toHaveCount(0);
  expect((await snapshot(page)).reviewLogs).toEqual([]);
});

test('交互恢复：评分后刷新不重放记录，已练标记和撤销仍可用', async ({ page }) => {
  await seedPage(page, 'home');
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await page.getByRole('button', { name: /开始学习新卡/ }).click();
  const first = await page.locator('.m-reading[data-active=true]').getAttribute('data-card-id');
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await page.locator('[data-rating=good]').click();
  await expect(page.locator('.m-context')).toHaveText('2 / 3');
  const before = await snapshot(page);
  await page.reload();
  await expect(page.locator('.m-context')).toHaveText('2 / 3');
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: '上一张', exact: true }).click();
  await expect(page.locator('.m-rated')).toContainText('记住了');
  await expect(page.locator('[data-rating]')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销评分', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(0);
  expect((await snapshot(page)).cards.find((card: { id: string }) => card.id === first).nextReviewDate).toBe(at);
});

test('交互恢复：新卡草稿刷新可继续，显式保存只创建一次且清理草稿', async ({ page }) => {
  await seedPage(page, 'import');
  await page.getByText('其他方式', { exact: true }).click();
  await page.getByRole('button', { name: /手动添加卡片/ }).click();
  await page.locator('textarea[name=front]').fill('尚未保存的新问题');
  await page.locator('textarea[name=back]').fill('尚未保存的新答案');
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('textarea[name=front]')).toHaveValue('尚未保存的新问题');
  await expect(page.locator('textarea[name=back]')).toHaveValue('尚未保存的新答案');
  expect((await snapshot(page)).cards).toHaveLength(3);
  await page.getByRole('button', { name: '保存卡片', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).cards).toHaveLength(4);
  expect(await page.evaluate(() => localStorage.getItem('recall.workspace.draft.v1'))).toBeNull();
});

test('交互恢复：关闭确认取消不丢草稿，明确放弃才清理', async ({ page }) => {
  await seedPage(page);
  await edit(page);
  await page.locator('textarea[name=front]').fill('测试草稿');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  await expect(page.locator('textarea[name=front]')).toHaveValue('测试草稿');
  expect(await page.evaluate(() => localStorage.getItem('recall.workspace.draft.v1'))).not.toBeNull();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('recall.workspace.draft.v1'))).toBeNull();
  expect((await snapshot(page)).cards[0].front).toBe('恢复测试问题 0');
});

test('交互恢复：浏览器返回保留草稿，恢复后仍须显式保存', async ({ page }) => {
  await seedPage(page, 'home');
  await navigate(page, '全部卡片');
  await edit(page);
  await page.locator('textarea[name=front]').fill('返回前的草稿');
  await page.goBack();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'home');
  await expect(page.getByRole('button', { name: '恢复草稿', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(page.locator('textarea[name=front]')).toHaveValue('返回前的草稿');
  expect((await snapshot(page)).cards[0].front).toBe('恢复测试问题 0');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
});

test('交互恢复：后来同步的正文不被恢复草稿静默覆盖，评分字段保留', async ({ page }) => {
  await seedPage(page);
  await edit(page);
  await page.locator('textarea[name=front]').fill('我的草稿问题');
  await page.evaluate(() => { const data = JSON.parse(localStorage.getItem('recall.snapshot.v1')!); data.cards[0].front = '另一个设备的新正文'; data.cards[0].reps = 8; localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); });
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  page.removeAllListeners('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await snapshot(page)).cards[0].front).toBe('另一个设备的新正文');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).cards[0]).toMatchObject({ front: '我的草稿问题', reps: 8 });
});

test('交互恢复：附图、替换和移除同步预览与本机草稿，刷新不带回旧图', async ({ page }) => {
  await seedPage(page);
  await edit(page);
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await page.locator('.recall-media-editor input[type=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: image });
  const preview = page.getByRole('region', { name: '卡片排版预览' });
  await expect(preview.locator('.recall-media-preview')).toHaveCount(1);
  const original = await page.locator('textarea[name=back]').inputValue();
  const replacement = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 80; canvas.height = 80;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#16794b'; context.fillRect(0, 0, 80, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '替换截图 1', exact: true }).click();
  await (await chooser).setFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from(replacement, 'base64') });
  await expect.poll(() => page.locator('textarea[name=back]').inputValue()).not.toBe(original);
  await expect(preview.locator('.recall-media-preview')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.workspace.draft.v1')!).fields.back)).toBe(await page.locator('textarea[name=back]').inputValue());
  await page.getByRole('button', { name: '移除截图 1', exact: true }).click();
  await expect(preview.locator('.recall-media-preview')).toHaveCount(0);
  await expect(page.locator('.recall-media-editor [role=status]')).toHaveText('当前答案附有 0 张来源图片');
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  expect(await page.locator('textarea[name=back]').inputValue()).not.toContain('recall://');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(preview.locator('.recall-media-preview')).toHaveCount(0);
});

test('交互恢复：损坏的界面缓存不触发错误边界，也不改卡库', async ({ page }) => {
  await seedPage(page);
  const before = await snapshot(page);
  await page.addInitScript(() => { localStorage.setItem('recall.workspace.context.v1', '{'); localStorage.setItem('recall.workspace.draft.v1', '{'); });
  await page.reload();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'cards');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await snapshot(page)).toEqual(before);
});

test('交互恢复：草稿存储失败明确提示，当前输入及关闭确认保留', async ({ page }) => {
  await seedPage(page);
  await edit(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'recall.workspace.draft.v1') throw new DOMException('synthetic quota', 'QuotaExceededError'); original.call(this, key, value); }; });
  await page.locator('textarea[name=front]').fill('仍在页面的草稿');
  await expect(page.getByRole('alert')).toContainText('草稿未能写入本机');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  await expect(page.locator('textarea[name=front]')).toHaveValue('仍在页面的草稿');
});

test('交互恢复：卡组名称和上级目录草稿可恢复，未保存前不改层级', async ({ page }) => {
  await seedPage(page, 'folders');
  await page.getByRole('button', { name: '管理恢复测试根目录', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('未保存的卡组名称');
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('未保存的卡组名称');
  expect((await snapshot(page)).decks[0].name).toBe('恢复测试根目录');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).decks[0].name).toBe('未保存的卡组名称');
});

test('交互恢复：原卡片删除后不复活旧编号，草稿仅显式恢复为新卡', async ({ page }) => {
  await seedPage(page);
  await edit(page);
  await page.locator('textarea[name=front]').fill('保留但不复活的草稿');
  await page.evaluate(() => { const data = JSON.parse(localStorage.getItem('recall.snapshot.v1')!); data.cards = data.cards.filter((card: { id: string }) => card.id !== 'recovery-0'); localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); });
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存卡片', exact: true })).toBeVisible();
  expect((await snapshot(page)).cards).toHaveLength(2);
  await page.getByRole('button', { name: '保存卡片', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const cards = (await snapshot(page)).cards;
  expect(cards).toHaveLength(3);
  expect(cards.some((card: { id: string }) => card.id === 'recovery-0')).toBe(false);
});
