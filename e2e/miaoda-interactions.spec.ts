import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import { PersonalSyncEngine } from '../server/personal-sync';
import type { PersonalRow } from '../shared/personal-sync';

function fixture() {
  const seed = createSeedSnapshot();
  return { ...seed,
    decks: [
      { ...seed.decks[0], id: 'interaction-empty', name: '空组测试', parentId: null },
      { ...seed.decks[0], id: 'interaction-child', name: '空子组测试', parentId: 'interaction-empty' },
      { ...seed.decks[0], id: 'interaction-reading', name: '阅读测试', parentId: null },
    ],
    cards: [{ ...seed.cards[0], id: 'interaction-card', deckId: 'interaction-reading', contentKind: 'qa',
      front: '合成阅读问题', back: '合成阅读正文。\n\n'.repeat(80), state: 'new', reps: 0,
      stability: 0, difficulty: 0, lapses: 0, learningSteps: 0, elapsedDays: 0, scheduledDays: 0,
      nextReviewDate: '2099-01-01T00:00:00Z', lastReviewDate: null }],
    reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true, syncCode: null, syncEnabled: false },
  };
}
async function snapshot(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null'));
}
async function navigate(page: Page, name: string) {
  await expect(page.locator('.memory-app')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const logo = page.getByRole('button', { name: '打开项目菜单', exact: true });
  const drawer = page.locator('#memory-drawer');
  if (await drawer.getAttribute('aria-hidden') === 'true') await logo.click();
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  await drawer.getByRole('button', { name, exact: true }).click();
}
async function archiveEmpty(page: Page) {
  await navigate(page, '卡组目录');
  await page.getByRole('button', { name: '管理空组测试', exact: true }).click();
  await page.getByRole('button', { name: '归档整个卡组', exact: true }).click();
  await page.getByRole('button', { name: '确认归档空卡组', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).decks.find((deck: { id: string }) => deck.id === 'interaction-empty').archivedAt).toBeTruthy();
}
async function seedSynthetic(page: Page) {
  await page.addInitScript(value => {
    if (location.origin !== 'http://localhost:8187' || localStorage.getItem('recall.interaction.seeded')) return;
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(value));
    localStorage.setItem('recall.interaction.seeded', '1');
    localStorage.setItem('recall.miaoda.personal.notice.v1', 'accepted');
  }, fixture());
}
test.beforeEach(async ({ page }) => {
  await seedSynthetic(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-app')).toBeVisible();
});

test('drawer has direct connection, compact version and time without preview prose', async ({ page }) => {
  const before = await snapshot(page);
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  const drawer = page.locator('#memory-drawer');
  await expect(drawer.getByText('飞书同步 · 尚未连接', { exact: true })).toBeVisible();
  await expect(drawer.getByLabel('当前版本')).toBeVisible();
  await expect(drawer.getByText('最近同步：尚无记录', { exact: true })).toBeVisible();
  await expect(drawer).not.toContainText('个人同步测试版');
  await expect(drawer).not.toContainText('卡片和图片同步需手动连接');
  const action = drawer.getByRole('button', { name: '连接飞书同步', exact: true });
  const bounds = await action.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44); expect(bounds?.height).toBeGreaterThanOrEqual(44);
  await action.click();
  await expect(page.getByRole('dialog').getByRole('button', { name: '连接个人同步', exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开项目菜单', exact: true })).toBeFocused();
});

test('drawer sync/refresh uses an isolated in-memory backend and retains synthetic progress', async ({ page }) => {
  let row: PersonalRow | null = null;
  const account = 'e'.repeat(64);
  const engine = new PersonalSyncEngine({ async read() { return row; }, async compareSwap(_owner, _library, expected, next) { if ((row?.revision ?? 0) !== expected) return false; row = next; return true; } });
  await page.route('**/api/recall/personal-sync*', async route => {
    const request = route.request();
    const state = request.method() === 'POST' ? await engine.mutate('123', 'synthetic-interaction', request.postDataJSON())
      : await engine.read('123', 'synthetic-interaction', Number(new URL(request.url()).searchParams.get('since') || 0));
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'X-Recall-Account-Key': account }, body: JSON.stringify(state) });
  });
  await page.evaluate(() => localStorage.setItem('recall.miaoda.personal.enabled.v1', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  const action = page.locator('#memory-drawer').getByRole('button', { name: '同步并刷新', exact: true });
  await expect(action).toBeEnabled();
  await expect(page.locator('#memory-drawer')).toContainText('飞书同步 · 已同步');
  const before = await snapshot(page);
  await action.click();
  await expect(page.getByRole('button', { name: '打开项目菜单', exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/app/app_17hv4js1tsy/personal/');
  expect(await snapshot(page)).toEqual(before);
  expect((await engine.read('123', 'synthetic-interaction')).entities.filter(entity => entity.kind === 'card')).toHaveLength(1);
  test.info().annotations.push({ type: 'scope', description: 'Local frozen client, ephemeral in-memory synthetic backend; no platform/owner database writes.' });
});

test('browsing defaults to four ratings, scroll is read-only, rating and undo survive reload', async ({ page }) => {
  await navigate(page, '全部卡片');
  await page.locator('.m-card-open').filter({ hasText: '合成阅读问题' }).click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  await expect(page.locator('.m-ratings button')).toHaveCount(4);
  await expect(page.getByRole('button', { name: '开启评分（更新排期）', exact: true })).toHaveCount(0);
  const before = await snapshot(page);
  await page.locator('.m-reading[data-active=true]').evaluate(element => { element.scrollTop = 420; });
  expect(await snapshot(page)).toEqual(before);
  for (const button of await page.locator('.m-ratings button').all()) {
    const bounds = await button.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44); expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('[data-rating=good]').click();
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '撤销评分', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).reviewLogs.length).toBe(0);
  expect((await snapshot(page)).cards).toEqual([{ ...before.cards[0], updatedAt: expect.any(String) }]);
});

test('empty folders archive with descendants, undo, restore, and delete only after confirmation', async ({ page }) => {
  const before = await snapshot(page);
  await archiveEmpty(page);
  await page.getByRole('button', { name: /撤销归档/ }).click();
  await expect.poll(async () => (await snapshot(page)).decks.find((deck: { id: string }) => deck.id === 'interaction-empty').archivedAt).toBeFalsy();
  await archiveEmpty(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await navigate(page, '已归档');
  await page.getByRole('button', { name: '管理归档卡组：空组测试', exact: true }).click();
  await page.getByRole('button', { name: '移出归档（恢复）', exact: true }).click();
  await page.getByRole('button', { name: '确认移出归档空卡组', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).decks.find((deck: { id: string }) => deck.id === 'interaction-empty').archivedAt).toBeFalsy();
  await archiveEmpty(page);
  await navigate(page, '已归档');
  await page.getByRole('button', { name: '管理归档卡组：空组测试', exact: true }).click();
  await page.getByRole('button', { name: '彻底删除', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认彻底删除', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: '删除确认', exact: true }).fill('删除');
  await page.getByRole('button', { name: '确认彻底删除', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).decks.length).toBe(1);
  expect((await snapshot(page)).cards).toEqual(before.cards);
  expect((await snapshot(page)).reviewLogs).toEqual(before.reviewLogs);
});

test('Miaoda hides an unavailable WeRead entry while retaining file sources', async ({ page }) => {
  await page.route('**/api/recall/weread/status', route => route.fulfill({ json: { available: false, aiAvailable: false, accountKey: null } }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await navigate(page, '导入');
  await expect(page.getByRole('button', { name: '导入划线', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择 Markdown 文件', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择带图卡片文件', exact: true })).toBeVisible();
  expect((await snapshot(page)).cards).toHaveLength(1);
});

test('every personal entry installs explicit original-resolution iOS icons rather than platform thumbnails', async ({ page }) => {
  await expect(page).toHaveTitle('Recall');
  const icons = await page.locator('head link[rel="apple-touch-icon"]').evaluateAll(elements => elements.map(element => ({ sizes: element.getAttribute('sizes'), href: element.getAttribute('href') })));
  expect(icons.map(icon => icon.sizes)).toEqual(['180x180', '512x512', '1024x1024']);
  for (const icon of icons) expect(icon.href).not.toMatch(/x-tos-process|resize|rounded-corners/);
  const favicon = page.locator('head link[rel="icon"]');
  await expect(favicon).toHaveCount(1);
  await expect(favicon).toHaveAttribute('type', 'image/svg+xml');
  const originalFavicon = await favicon.getAttribute('href');
  await page.evaluate(() => {
    const icon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = '/platform-thumbnail.png?x-tos-process=resize';
    document.head.querySelector('link[rel="apple-touch-icon"][sizes="180x180"]')?.remove();
    const competing = document.createElement('link');
    competing.rel = 'apple-touch-icon';
    competing.href = '/platform-thumbnail.png?x-tos-process=resize';
    document.head.append(competing);
  });
  await expect(favicon).toHaveAttribute('href', originalFavicon!);
  await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveCount(3);
  await expect(page.locator('head link[rel="apple-touch-icon"][sizes="180x180"]')).toHaveAttribute('href', icons[0].href!);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('head link[rel="apple-touch-icon"][sizes="180x180"]')).toHaveCount(1);
  expect((await snapshot(page)).cards).toHaveLength(1);
});

test('drawer maintains clearance and touch targets across safe areas and widths', async ({ page }) => {
  await page.locator('.memory-app').evaluate(element => {
    const root = element as HTMLElement;
    root.style.setProperty('--safe-top', '59px'); root.style.setProperty('--safe-bottom', '34px');
  });
  for (const width of [393, 380, 320, 760]) {
    await page.setViewportSize({ width, height: 852 });
    const logo = page.getByRole('button', { name: '打开项目菜单', exact: true });
    if (await logo.isVisible()) await logo.click();
    const action = page.locator('#memory-drawer').getByRole('button', { name: '连接飞书同步', exact: true });
    await expect(action).toBeVisible();
    await action.scrollIntoViewIfNeeded();
    const bounds = await action.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44); expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.y + bounds!.height, `Drawer control visible at ${width}px`).toBeLessThanOrEqual(852);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `No page overflow at ${width}px` }).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('synthetic-drawer.png'), scale: 'css' });
});

test('desktop drawer uses genuine desktop viewports at the breakpoint and wider widths', async ({ browser }) => {
  for (const width of [761, 1024]) {
    const context = await browser.newContext({ viewport: { width, height: 852 }, isMobile: false, hasTouch: false, locale: 'zh-CN' });
    try {
      const page = await context.newPage();
      await seedSynthetic(page);
      await page.goto('http://localhost:8187/app/app_17hv4js1tsy/personal/', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.memory-app')).toBeVisible();
      const action = page.locator('#memory-drawer').getByRole('button', { name: '连接飞书同步', exact: true });
      await expect(action).toBeVisible();
      await action.scrollIntoViewIfNeeded();
      const bounds = await action.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(44); expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(852);
      expect(await page.evaluate(() => innerWidth)).toBe(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await snapshot(page)).cards).toHaveLength(1);
    } finally { await context.close(); }
  }
});
