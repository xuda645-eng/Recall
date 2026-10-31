import { expect, test, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import type { Card, MemoryStudyPreferences } from '../src/types';

const past = '2026-10-01T00:00:00.000Z';
function fixture(preferences: Partial<MemoryStudyPreferences> = {}) {
  const seed = createSeedSnapshot();
  const decks = [
    { ...seed.decks[0], id: 'root', name: '知识目录', parentId: null },
    ...Array.from({ length: 6 }, (_, index) => ({ ...seed.decks[0], id: `leaf-${index}`, name: `子卡组 ${index + 1} 的长标题`, parentId: 'root' })),
  ];
  function makeCard(id: string, fresh = false): Card {
    return {
      ...seed.cards[0], id, deckId: 'leaf-0', front: `独立问题 ${id}`, back: id === 'old-01' ? `独立答案 ${id}\n\n${'长答案需要独立滚动，不应切换当前卡片。\n\n'.repeat(60)}` : `独立答案 ${id}`,
      contentKind: 'qa', cardType: 'basic', archivedAt: undefined, importedAt: past,
      createdAt: past, updatedAt: past, nextReviewDate: past,
      state: fresh ? 'new' : 'review', lastReviewDate: fresh ? null : past,
      reps: fresh ? 0 : 4, lapses: 0, stability: fresh ? 0 : 4,
      difficulty: fresh ? 0 : 4, elapsedDays: 0, scheduledDays: fresh ? 0 : 4, learningSteps: 0,
    };
  }
  const cards = [
    ...Array.from({ length: 12 }, (_, index) => makeCard(`old-${String(index).padStart(2, '0')}`)),
    ...Array.from({ length: 12 }, (_, index) => makeCard(`new-${String(index).padStart(2, '0')}`, true)),
    { ...makeCard('future'), nextReviewDate: '2099-01-01T00:00:00.000Z' },
    { ...makeCard('archived'), archivedAt: past },
    { ...makeCard('excerpt'), contentKind: 'excerpt' as const, front: '', back: '保留的划线原文', bookTitle: '原书名', chapter: '原章节', source: '原来源', nextReviewDate: '2099-01-01T00:00:00.000Z' },
  ];
  return {
    ...seed, decks, cards, reviewLogs: [], studySessions: [],
    settings: { ...seed.settings, onboardingComplete: true, reviewPlan: undefined, studyPreferences: { newCardRatio: 0.3, batchSize: 10, sessionMinutes: 30, ...preferences } },
  };
}
async function seedPage(page: Page, data = fixture(), route = 'home') {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-app')).toBeVisible();
  await page.evaluate(({ value, hash }) => {
    localStorage.clear();
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(value));
    window.location.hash = hash;
  }, { value: data, hash: route });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-app')).toBeVisible();
}
async function snapshot(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null'));
}
async function navigate(page: Page, label: string) {
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await page.locator('#memory-drawer').getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
}
async function grade(page: Page, rating = 'good') {
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await page.locator(`[data-rating="${rating}"]`).click();
}
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('首页区分总积压、新卡和小轮次，按比例推荐而不承诺清零', async ({ page }) => {
  await seedPage(page);
  const hero = page.getByRole('region', { name: '本次温习推荐' });
  await expect(hero.locator('.m-big')).toContainText('10');
  await expect(hero).toContainText('旧卡 7 张 · 新卡 3 张');
  await expect(hero).toContainText('时长目标 30 分钟');
  await expect(page.locator('.m-study-backlog')).toContainText('总待复习 12 张 · 待学习 12 张');
  await expect(hero).not.toContainText('今日复习已完成');
});

test('无效旧版FSRS权重不阻断首页和设置入口，选卡不改写原始权重', async ({ page }) => {
  const data = fixture();
  const weights = Array.from({ length: 21 }, () => 1);
  weights[20] = { valueOf: 0, toString: 0 } as unknown as number;
  data.settings.fsrsWeights = weights;
  await seedPage(page, data);
  await expect(page.locator('.m-hero')).toContainText('旧卡 7 张 · 新卡 3 张');
  expect((await snapshot(page)).settings.fsrsWeights).toEqual(weights);
  await navigate(page, '设置与数据');
  await page.getByRole('button', { name: '配置', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('slider', { name: '新卡占比', exact: true })).toBeVisible();
});

test('PWA比例和轮次设置持久化，保存不改写卡片排期和历史', async ({ page }) => {
  const data = fixture();
  await seedPage(page, data, 'settings');
  const original = await snapshot(page);
  await page.getByRole('button', { name: '配置', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: '复习计划', exact: true })).toHaveCount(1);
  const ratio = sheet.getByRole('slider', { name: '新卡占比', exact: true });
  await ratio.focus(); await ratio.press('End');
  await sheet.getByLabel('每轮卡片数', { exact: true }).fill('5');
  const timeInput = sheet.getByLabel('每次时长目标（分钟）', { exact: true });
  await timeInput.fill('40');
  await timeInput.scrollIntoViewIfNeeded();
  await expect.poll(async () => {
    const timeBounds = (await timeInput.boundingBox())!;
    const saveBounds = (await sheet.getByRole('button', { name: '保存计划', exact: true }).boundingBox())!;
    return timeBounds.y + timeBounds.height <= saveBounds.y;
  }).toBe(true);
  await page.screenshot({ path: test.info().outputPath('review-plan.png'), scale: 'css' });
  await sheet.getByRole('button', { name: '保存计划', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  const updated = await snapshot(page);
  expect(updated.cards).toEqual(original.cards);
  expect(updated.reviewLogs).toEqual(original.reviewLogs);
  expect(updated.settings.studyPreferences).toEqual({ newCardRatio: 1, batchSize: 5, sessionMinutes: 40 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-app')).toBeVisible();
  expect((await snapshot(page)).settings.studyPreferences).toEqual(updated.settings.studyPreferences);
  await navigate(page, '今日复习');
  await expect(page.locator('.m-hero')).toContainText('旧卡 0 张 · 新卡 5 张');
});

test('智能评分隐藏所有预测时间，记住了至少完整24小时且可撤销', async ({ page }) => {
  await seedPage(page, fixture({ newCardRatio: 1, batchSize: 2 }));
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  const currentId = await page.locator('.m-reading[data-active="true"]').getAttribute('data-card-id');
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await expect(page.locator('.m-ratings small')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '记住了', exact: true })).toBeVisible();
  await page.locator('[data-rating="good"]').click();
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(1);
  const reviewed = (await snapshot(page)).cards.find((card: Card) => card.id === currentId);
  expect(Date.parse(reviewed.nextReviewDate) - Date.parse(reviewed.lastReviewDate)).toBeGreaterThanOrEqual(86_400_000);
  await page.getByRole('button', { name: '撤销上次评分', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(0);
  expect((await snapshot(page)).cards.find((card: Card) => card.id === currentId).nextReviewDate).toBe(past);
});

test('进行中修改配比只调整未练部分，保留当前卡、滚动和评分记录', async ({ page }) => {
  await seedPage(page, fixture({ newCardRatio: 0, batchSize: 3 }));
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await grade(page);
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(1);
  const active = page.locator('.m-reading[data-active="true"]');
  await expect(active).toHaveAttribute('data-card-id', 'old-01');
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await active.evaluate(element => { element.scrollTop = 100; });
  expect(await active.evaluate(element => element.scrollTop)).toBe(100);
  const currentId = await active.getAttribute('data-card-id');
  const before = await snapshot(page);
  await page.getByRole('button', { name: '卡片与复习选项', exact: true }).click();
  await page.getByRole('button', { name: /复习计划 ·/ }).click();
  await page.getByRole('slider', { name: '新卡占比', exact: true }).focus();
  await page.getByRole('slider', { name: '新卡占比', exact: true }).press('End');
  await page.getByRole('button', { name: '保存计划', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(active).toHaveAttribute('data-card-id', currentId!);
  expect(await active.evaluate(element => element.scrollTop)).toBe(100);
  expect((await snapshot(page)).cards).toEqual(before.cards);
  expect((await snapshot(page)).reviewLogs).toEqual(before.reviewLogs);
  await page.getByRole('button', { name: '下一张', exact: true }).click();
  await expect(active).toHaveAttribute('data-card-id', /new-/);
  await expect(active).not.toHaveAttribute('data-card-id', before.reviewLogs[0].cardId);
});

test('小轮次完成不强迫清空，可继续下一轮并保留撤销', async ({ page }) => {
  await seedPage(page, fixture({ newCardRatio: 1, batchSize: 2 }));
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await grade(page);
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(1);
  await expect(page.getByRole('button', { name: '显示答案', exact: true })).toBeVisible();
  await grade(page);
  await expect(page.getByRole('heading', { name: '本轮完成', exact: true })).toBeVisible();
  await expect(page.locator('.m-completion')).toContainText('不代表所有待复习卡片已清空');
  await expect(page.getByRole('button', { name: '再练一轮 · 2 张', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '撤销上次评分', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(1);
  await expect(page.locator('.m-reading[data-active="true"]')).toBeVisible();
  await page.locator('[data-rating="good"]').click();
  await expect(page.getByRole('heading', { name: '本轮完成', exact: true })).toBeVisible();
  const completed = (await snapshot(page)).reviewLogs.map((log: { cardId: string }) => log.cardId);
  await page.getByRole('button', { name: '再练一轮 · 2 张', exact: true }).click();
  await expect(page.getByRole('button', { name: '显示答案', exact: true })).toBeVisible();
  expect(completed).not.toContain(await page.locator('.m-reading[data-active="true"]').getAttribute('data-card-id'));
  expect((await snapshot(page)).reviewLogs).toHaveLength(2);
  await page.getByRole('button', { name: '退出复习', exact: true }).click();
  await expect(page.locator('.m-hero')).toBeVisible();
});

test('卡组管理定位正确，多个子卡组可横滑且不造成整页溢出', async ({ page }) => {
  await seedPage(page);
  const folder = page.locator('.m-folder').first();
  const management = folder.getByRole('button', { name: '管理知识目录', exact: true });
  const frame = (await folder.boundingBox())!;
  const control = (await management.boundingBox())!;
  expect(control.x).toBeGreaterThan(frame.x + frame.width / 2);
  expect(control.y - frame.y).toBeLessThan(35);
  expect(control.width).toBeGreaterThanOrEqual(44);
  expect(control.height).toBeGreaterThanOrEqual(44);
  const strip = folder.getByRole('region', { name: '知识目录的子卡组', exact: true });
  await strip.scrollIntoViewIfNeeded();
  expect(await strip.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await strip.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  expect(await strip.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect(folder.getByRole('button', { name: '子卡组 6 的长标题', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('folder-strip.png'), scale: 'css' });
});

test('统计归档导入无无关顶部操作，子卡组返回但一级目录添加', async ({ page }) => {
  await seedPage(page);
  for (const label of ['统计', '已归档', '导入']) {
    await navigate(page, label);
    await expect(page.locator('.memory-bar .m-top-action')).toHaveCount(0);
    const placeholder = (await page.locator('.m-top-action-placeholder').boundingBox())!;
    expect(placeholder.width).toBe(48);
  }
  await navigate(page, '卡组目录');
  await expect(page.locator('.memory-bar').getByRole('button', { name: '添加', exact: true })).toBeVisible();
  await page.locator('.m-folder-open').first().click();
  await expect(page.locator('.memory-bar').getByRole('button', { name: '返回', exact: true })).toBeVisible();
  await page.locator('.memory-bar').getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.m-context')).toHaveText('卡组目录');
});

test('手动新增仅问答卡，必填校验与现有摘录编辑均保留', async ({ page }) => {
  await seedPage(page);
  await page.locator('.memory-bar').getByRole('button', { name: '添加', exact: true }).click();
  await page.getByRole('button', { name: '添加卡片', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('combobox', { name: '类型', exact: true })).toHaveCount(0);
  await sheet.getByLabel('答案', { exact: true }).fill('完整答案');
  await sheet.getByRole('button', { name: '保存卡片', exact: true }).click();
  await expect(sheet).toBeVisible();
  expect(await sheet.getByLabel('问题', { exact: true }).evaluate(element => (element as HTMLTextAreaElement).validity.valueMissing)).toBe(true);
  await sheet.getByLabel('问题', { exact: true }).fill('完整问题');
  await sheet.getByRole('button', { name: '保存卡片', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect((await snapshot(page)).cards.find((card: Card) => card.front === '完整问题').contentKind).toBe('qa');
  await navigate(page, '全部卡片');
  await page.getByRole('button', { name: '管理卡片：原书名', exact: true }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await page.getByRole('textbox', { name: '划线原文', exact: true }).fill('更新的划线原文');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const excerpt = (await snapshot(page)).cards.find((card: Card) => card.id === 'excerpt');
  expect(excerpt.contentKind).toBe('excerpt'); expect(excerpt.bookTitle).toBe('原书名');
  expect(excerpt.chapter).toBe('原章节'); expect(excerpt.source).toBe('原来源');
  expect(excerpt.reps).toBe(4); expect(excerpt.nextReviewDate).toBe('2099-01-01T00:00:00.000Z');
});
