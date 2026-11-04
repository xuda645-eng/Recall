import { expect, test, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';

const past = '2026-10-01T00:00:00Z';
function fixture() {
  const seed = createSeedSnapshot();
  const decks = ['root', 'child', 'new', 'future', 'empty', 'archive'].map(id => ({ ...seed.decks[0], id, name: id === 'root' ? 'AI汽车' : id === 'child' ? '智能驾驶' : id, parentId: id === 'child' ? 'root' : null }));
  const cards = ['root', 'child', 'new', 'future', 'archive'].map(id => ({ ...seed.cards[0], id, deckId: id, front: `问题${id}`, archivedAt: id === 'archive' ? past : undefined, reps: id === 'new' ? 0 : 2, lastReviewDate: id === 'new' ? null : past, nextReviewDate: id === 'future' ? '2099-01-01T00:00:00Z' : past }));
  return { ...seed, decks, cards, reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true } };
}
async function seedPage(page: Page, data = fixture(), preference = 'child') {
  await page.goto('./');
  await expect(page.locator('.memory-app')).toBeVisible();
  await page.evaluate(({ data, preference }) => {
    localStorage.clear(); localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); localStorage.setItem('recall.study.deck', preference); location.hash = 'home';
  }, { data, preference });
  await page.reload();
  await expect(page.locator('.memory-app')).toBeVisible();
}
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('点击不评分的自由浏览时，即使刚到复习时间也不自动开启评分', async ({ page }) => {
  const data = fixture();
  const time = new Date('2026-11-04T12:00:00Z');
  data.cards = [{ ...data.cards.find(card => card.id === 'future')!, nextReviewDate: new Date(time.getTime() + 5000).toISOString() }];
  await seedPage(page, data, 'future');
  await page.clock.install({ time });
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  const browse = page.getByRole('button', { name: '自由浏览（不评分）' });
  await expect(browse).toBeVisible();
  await page.clock.setSystemTime(new Date(time.getTime() + 6000));
  await browse.click();
  await page.getByRole('button', { name: '显示答案' }).click();
  await expect(page.locator('[data-rating]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '退出浏览' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).reviewLogs)).toEqual([]);
});

test('面板保留层级且选择不启动，父组含下级，关闭路径及键盘焦点均安全', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await seedPage(page);
  const before = await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'));
  const start = page.getByRole('button', { name: '开始复习', exact: true });
  await start.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('未归档 · 5 个卡组');
  await expect(page.getByRole('button', { name: '选择卡组：archive' })).toHaveCount(0);
  const child = page.getByRole('button', { name: '选择卡组：智能驾驶' });
  await expect(child).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '选择卡组：AI汽车' })).toContainText('2待复习0新卡2未归档');
  await page.getByRole('button', { name: '收起AI汽车的子卡组' }).click();
  await expect(child).not.toBeVisible();
  await page.getByRole('button', { name: '展开AI汽车的子卡组' }).click();
  await page.getByRole('button', { name: '选择卡组：AI汽车' }).click();
  await expect(page.locator('.m-picker-selection')).toContainText('本轮 2 张');
  await expect(page.locator('.m-reading')).toHaveCount(0);
  await page.getByRole('button', { name: '确认开始复习' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '关闭面板' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '确认开始复习' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(start).toBeFocused();
  await start.click();
  await page.locator('.m-sheet-wrap').click({ position: { x: 5, y: 5 } });
  await expect(start).toBeFocused();
  await start.click();
  await page.getByRole('button', { name: '关闭面板' }).click();
  await expect(start).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('recall.snapshot.v1'))).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('recall.study.deck'))).toBe('child');
  expect(errors).toEqual([]);
});

test('新卡可学习，未到期卡只浏览，空卡组可见但禁用，混合总数不重复', async ({ page }) => {
  await seedPage(page);
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await page.getByRole('button', { name: '选择卡组：empty' }).click();
  await expect(page.getByRole('button', { name: '暂无卡片' })).toBeDisabled();
  await page.getByRole('button', { name: '选择卡组：new' }).click();
  await expect(page.locator('.m-picker-selection')).toContainText('旧卡 0 张 · 新卡 1 张');
  await page.getByRole('button', { name: '开始学习新卡' }).click();
  await expect(page.getByRole('region', { name: '到期复习' })).toContainText('new');
  await page.getByRole('button', { name: '退出复习' }).click();
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await page.getByRole('button', { name: '选择卡组：future' }).click();
  await page.getByRole('button', { name: '自由浏览（不评分）' }).click();
  await page.getByRole('button', { name: '显示答案' }).click();
  await expect(page.locator('[data-rating]')).toHaveCount(0);
  await page.getByRole('button', { name: '退出浏览' }).click();
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await page.getByText('其他复习方式', { exact: true }).click();
  const mixed = page.getByRole('button', { name: /混合全部卡组/ });
  await expect(mixed).toContainText('2待复习1新卡4未归档');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).reviewLogs)).toEqual([]);
});

test('面板独立滚动与安全区，窄屏横屏和大字号下固定确认不遮挡列表', async ({ page }) => {
  const data = fixture();
  data.decks[0].name = '很长的卡组名称用于验证选择面板内容换行与按钮布局';
  await seedPage(page, data);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({ content: '.memory-app { --safe-top:59px; --safe-bottom:34px; }' });
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  for (const size of [{ width: 393, height: 852 }, { width: 320, height: 700 }, { width: 760, height: 852 }, { width: 852, height: 393 }, { width: 1200, height: 900 }]) {
    await page.setViewportSize(size);
    await expect(page.getByRole('dialog')).toBeVisible();
    const body = page.locator('.m-picker-body');
    await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const bodyFrame = (await body.boundingBox())!;
    const footer = (await page.locator('.m-picker-footer').boundingBox())!;
    expect(bodyFrame.height).toBeGreaterThan(0);
    expect(bodyFrame.y + bodyFrame.height).toBeLessThanOrEqual(footer.y + 1);
    const confirm = page.getByRole('button', { name: '确认开始复习' });
    await expect(confirm).toBeInViewport();
    const bounds = (await confirm.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(48);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height - 33);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addStyleTag({ content: '.m-picker-name strong, .m-picker-selection strong { font-size:22px; }' });
  await page.locator('.m-picker-body').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: test.info().outputPath('picker-safe-area.png'), scale: 'css' });
  const buttons = await page.getByRole('dialog').locator('button:visible').all();
  for (const button of buttons) {
    const bounds = (await button.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
});

test('无卡组仍可打开面板，失效偏好不自动开启混合', async ({ page }) => {
  const data = fixture(); data.decks = []; data.cards = [];
  await seedPage(page, data, 'missing');
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('还没有未归档卡组');
  await expect(page.getByRole('button', { name: '暂无卡片' })).toBeDisabled();
  await page.getByRole('button', { name: '关闭面板' }).click();
  await seedPage(page, fixture(), 'archive');
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await expect(page.getByRole('button', { name: '选择卡组：智能驾驶' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /混合全部卡组/ })).not.toBeVisible();
});
