import { expect, test, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';

function fixture() {
  const seed = createSeedSnapshot();
  const past = '2026-10-01T00:00:00.000Z';
  const decks = [
    { ...seed.decks[0], id: 'deck-a', name: '主题甲', parentId: null },
    { ...seed.decks[0], id: 'deck-b', name: '主题乙', parentId: null },
  ];
  const cards = Array.from({ length: 18 }, (_, index) => ({
    ...seed.cards[0], id: `card-${index}`, deckId: index < 9 ? 'deck-a' : 'deck-b', front: `共同问题 ${String(index).padStart(2, '0')}`, back: '**独立答案**\n\n' + '长答案需要独立滚动。\n\n'.repeat(25) + '\n### 来源证据\n来源转录不出现在列表摘要里。',
    cardType: 'basic' as const, contentKind: 'qa' as const, archivedAt: undefined, importedAt: past,
    state: index < 2 ? 'new' as const : index < 4 ? 'learning' as const : 'review' as const,
    reps: index < 2 ? 0 : 2, lastReviewDate: index < 2 ? null : past, nextReviewDate: index === 4 ? '2099-01-01T00:00:00.000Z' : past,
    stability: index < 2 ? 0 : 4, difficulty: index < 2 ? 0 : 4, elapsedDays: 0, scheduledDays: index < 2 ? 0 : 4, lapses: 0, learningSteps: 0,
  }));
  return { ...seed, decks, cards, reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true } };
}
async function seedPage(page: Page, route = 'home') {
  await page.goto('./');
  await expect(page.locator('.memory-app')).toBeVisible();
  await page.evaluate(({ data, hash }) => {
    localStorage.clear(); localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); location.hash = hash;
  }, { data: fixture(), hash: route });
  await page.reload();
  await expect(page.locator('.memory-app')).toBeVisible();
}
async function navigate(page: Page, label: string) {
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await page.locator('#memory-drawer').getByRole('button', { name: label, exact: true }).click();
}
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('默认按单一卡组复习，选择与刷新保留偏好，不改变卡片数据', async ({ page }) => {
  await seedPage(page);
  const before = await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'));
  await expect(page.getByRole('combobox', { name: '复习卡组' })).toHaveCount(0);
  await expect(page.locator('.m-home-summary')).toContainText('今日总复习次数');
  await expect(page.locator('.m-home-summary')).toContainText('全部长期复习');
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
  await page.screenshot({ path: test.info().outputPath('home-deck.png'), scale: 'css' });
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择卡组：主题甲' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '选择卡组：主题乙' }).click();
  await expect(page.getByRole('button', { name: '确认开始复习（9）', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'))).toBe(before);
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
  await page.screenshot({ path: test.info().outputPath('review-picker.png'), scale: 'css' });
  await page.getByRole('button', { name: '确认开始复习' }).click();
  await page.getByRole('button', { name: '退出复习' }).click();
  await expect(page.getByRole('button', { name: '开始复习', exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择卡组：主题乙' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '确认开始复习' }).click();
  await expect(page.getByRole('region', { name: '到期复习' })).toContainText('主题乙');
  await expect(page.locator('.m-context')).toHaveText('1 / 9');
  await page.getByRole('button', { name: '退出复习' }).click();
  expect(await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'))).toBe(before);
  const recent = page.locator('.m-recent button').first();
  await recent.click();
  await page.getByRole('button', { name: '退出浏览' }).click();
  await expect(recent).toBeFocused();
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await page.getByText('其他复习方式', { exact: true }).click();
  await page.getByRole('button', { name: /混合全部卡组/ }).click();
  await page.getByRole('button', { name: '确认开始复习' }).click();
  await page.getByRole('button', { name: '退出复习' }).click();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('recall.snapshot.v1')!);
    data.cards = data.cards.map((card: { deckId: string }) => card.deckId === 'deck-b' ? { ...card, archivedAt: new Date().toISOString() } : card);
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await expect(page.getByRole('button', { name: /混合全部卡组/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '选择卡组：主题乙' })).toHaveCount(0);
});

test('搜索阅读沿用匹配范围，退出保留条件、位置与焦点，浏览不写评分', async ({ page }) => {
  await seedPage(page, 'cards');
  await page.getByRole('searchbox').fill('共同问题');
  await page.getByRole('button', { name: '筛选与排序' }).click();
  await page.getByLabel('排序', { exact: true }).selectOption('name');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  const card = page.locator('[data-card-id="card-12"] .m-card-open');
  await card.scrollIntoViewIfNeeded();
  const scroll = await page.locator('.memory-content').evaluate(element => element.scrollTop);
  await card.click();
  await expect(page.locator('.m-context')).toHaveText('13 / 18');
  await page.getByRole('button', { name: '显示答案' }).click();
  await expect(page.locator('[data-rating]')).toHaveCount(0);
  await page.locator('main').press('1');
  await page.getByRole('button', { name: '退出浏览' }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('共同问题');
  await expect(page.locator('.m-filter-chips')).toContainText('名称排序');
  await expect(card).toBeFocused();
  expect(Math.abs(await page.locator('.memory-content').evaluate(element => element.scrollTop) - scroll)).toBeLessThan(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).reviewLogs)).toEqual([]);
});

test('统计区分新卡、学习中与长期复习，当前到期不包含新卡或未来卡', async ({ page }) => {
  await seedPage(page, 'stats');
  await expect(page.locator('.m-progress-counts')).toContainText('待学习 2');
  await expect(page.locator('.m-progress-counts')).toContainText('学习中 2');
  await expect(page.locator('.m-progress-counts')).toContainText('长期复习 14');
  await expect(page.locator('.m-forecast-bars > div').first()).toContainText('15');
});

test('浏览评分需显式开启，评分可撤销，快捷归档入口和三秒窗口保持不变', async ({ page }) => {
  await seedPage(page, 'cards');
  await page.locator('[data-card-id="card-0"] .m-card-open').click();
  await page.getByRole('button', { name: '显示答案' }).click();
  await expect(page.locator('[data-rating]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '归档当前卡片' })).toBeVisible();
  await page.getByRole('button', { name: '开启评分（更新排期）' }).click();
  await expect(page.locator('.m-study-footer')).toContainText('评分将更新复习排期与记录');
  await page.locator('[data-rating="good"]').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).reviewLogs.length)).toBe(1);
  await page.getByRole('button', { name: '撤销上次评分' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).reviewLogs.length)).toBe(0);
});

test('常用设置和完整备份优先，导入帮助不再隐藏，编辑有展开与排版预览', async ({ page }) => {
  await seedPage(page, 'settings');
  await expect(page.getByRole('button', { name: '配置', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '顶部显示诊断' })).toHaveCount(0);
  await page.getByRole('button', { name: '配置', exact: true }).click();
  const plan = page.locator('.m-review-plan');
  await expect(plan.locator('.m-plan-advanced')).toHaveJSProperty('open', false);
  for (const summary of await plan.locator('summary').all()) {
    const bounds = await summary.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: '关闭面板' }).click();
  await page.getByRole('button', { name: '备份', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完整备份（推荐）' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('仅文字备份不包含图片文件');
  await page.getByRole('button', { name: '关闭面板' }).click();
  await navigate(page, '导入');
  await expect(page.getByRole('button', { name: '格式说明' })).toBeVisible();
  await expect(page.getByRole('button', { name: '下载 Markdown 示例' })).toBeVisible();
  await navigate(page, '全部卡片');
  await page.locator('[data-card-id="card-0"]').getByRole('button', { name: /^管理卡片/ }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await page.getByRole('button', { name: '展开答案编辑' }).click();
  expect(await page.getByRole('textbox', { name: '答案', exact: true }).evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(250);
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.getByRole('region', { name: '卡片排版预览' })).toContainText('独立答案');
  await page.getByRole('button', { name: '关闭面板' }).click();
});
