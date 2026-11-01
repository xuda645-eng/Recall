import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import type { WereadJob } from '../src/lib/weread-job';

const original = ['  原创划线一。\n\n说明观点与条件。  ', '原创划线二，需要回忆第二个条件。'];
const questions = ['第一条原创材料提出了什么观点和条件？', '第二条原创材料需要回忆哪个条件？'];
const seed = () => ({ ...createSeedSnapshot(), cards: [], decks: [], reviewLogs: [], studySessions: [], settings: { ...createSeedSnapshot().settings, onboardingComplete: true } });
async function snapshot(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null')); }
async function setup(page: Page, count = 2, fail: boolean | number = false, budget = 300, delay = 200) {
  const calls: string[] = [];
  let failed = false;
  const marks = Array.from({ length: count }, (_, index) => ({ bookmarkId: `mark-${index}`, markText: original[index] || `原创第 ${index} 条划线。`, chapterUid: '1', chapterTitle: '原创章节' }));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON();
    if (url.pathname === '/api/auth/session') { await route.fulfill({ status: 503, json: { error: 'synthetic' } }); return; }
    if (url.pathname === '/api/weread/books') {
      await route.fulfill({ json: { books: [
        { bookId: 'original', title: '阅读的回声', author: '原创作者', highlightCount: count, markedFinished: false, readingProgress: null, totalNoteCount: count + 4, thoughtsCount: 3, bookmarkCount: 1, lastNoteAt: '2026-10-31', coverUrl: null },
        { bookId: 'empty', title: '没有划线的书', highlightCount: 0, markedFinished: true },
      ], cursor: null } }); return;
    }
    if (url.pathname === '/api/weread/progress') { await route.fulfill({ json: { bookId: body.bookId, readingProgress: body.bookId === 'original' ? 1 : 100 } }); return; }
    if (url.pathname === '/api/weread/budget') { await route.fulfill({ json: { remaining: budget } }); return; }
    if (url.pathname === '/api/weread/book') { expect(body.bookId).toBe('original'); await route.fulfill({ json: { format: 'recall-weread-export-v1', books: [{ bookId: 'original', title: '阅读的回声', author: '原创作者', highlights: marks }] } }); return; }
    if (url.pathname === '/api/weread/question') {
      expect(body.summary).toBe(false);
      calls.push(body.markText);
      const failAt = fail === true ? 1 : typeof fail === 'number' ? fail : null;
      if (failAt !== null && body.markText === marks[failAt].markText && !failed) { failed = true; await route.fulfill({ status: 502, json: { error: 'synthetic-failure' } }); return; }
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      await route.fulfill({ json: { question: questions[marks.findIndex(mark => mark.markText === body.markText)] || '这个原创段落提出了什么具体观点？', summary: null, cached: false } }); return;
    }
    throw new Error(`Unexpected API route ${url.pathname}`);
  });
  await page.goto('/');
  await expect(page.locator('.memory-app')).toBeVisible();
  await page.evaluate(data => { localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); location.hash = 'weread'; }, seed());
  await page.reload();
  await expect(page.getByRole('button', { name: '连接微信读书', exact: true })).toBeVisible();
  return calls;
}
async function choose(page: Page) {
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  await expect(page.getByRole('heading', { name: '选择想记住的书' })).toBeVisible();
  await page.getByRole('button', { name: /阅读的回声，.*条我的划线/ }).click();
  await page.getByRole('button', { name: '下一步 · AI 问题与导入' }).click();
  await expect(page.getByRole('heading', { name: '让划线变成问题' })).toBeVisible();
}
test('正式连接入口、个人书卡字段与搜索，百分比1不误作100%', async ({ page }, testInfo) => {
  const calls = await setup(page);
  await expect(page.locator('.wr-workspace')).not.toContainText('5 MB');
  await page.screenshot({ path: `/tmp/recall-weread-landing-${testInfo.project.name}.png` });
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  const card = page.getByRole('button', { name: '阅读的回声，2 条我的划线' });
  await expect(card).toContainText('阅读进度 1%');
  await expect(card).toContainText('笔记共 6 条');
  await expect(page.getByRole('button', { name: '没有划线的书，0 条我的划线' })).toBeDisabled();
  await page.screenshot({ path: `/tmp/recall-weread-books-${testInfo.project.name}.png` });
  await card.click();
  await page.getByRole('searchbox').fill('不存在');
  await expect(page.getByRole('heading', { name: '暂时没有匹配的书' })).toBeVisible();
  await expect(page.locator('.wr-dock')).toContainText('已选 1 本');
  expect(calls).toEqual([]);
});
for (const markedFinished of [true, false, null, undefined]) {
  test(`书卡仅明确已读完时显示标记，其他状态隐藏且保留进度：${String(markedFinished)}`, async ({ page }) => {
    const calls = await setup(page);
    await page.route('**/api/weread/books', route => route.fulfill({ json: { books: [
      { bookId: 'original', title: '阅读的回声', highlightCount: 2, markedFinished },
    ], cursor: null } }));
    const before = await snapshot(page);
    await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
    const card = page.getByRole('button', { name: '阅读的回声，2 条我的划线' });
    const badge = card.locator('.wr-reading > span');
    await expect(badge).toHaveCount(markedFinished === true ? 1 : 0);
    if (markedFinished === true) await expect(badge).toHaveText('已标记读完');
    await expect(card.locator('.wr-reading')).not.toContainText('状态未提供');
    await expect(card.locator('.wr-reading')).not.toContainText('在读');
    await expect(card).toContainText('阅读进度 1%');
    expect(await card.locator('.wr-meter > i').evaluate(meter => meter.style.width)).toBe('1%');
    for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 852 }, { width: 760, height: 852 }, { width: 852, height: 393 }]) {
      await page.setViewportSize(viewport);
      await expect(card).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    expect(await snapshot(page)).toEqual(before);
    expect(calls).toEqual([]);
  });
}
test('确认页仅顶栏返回保留选书，退出和再次进入不残留返回处理', async ({ page }) => {
  const calls = await setup(page);
  const before = await snapshot(page);
  await choose(page);
  await expect(page.getByRole('button', { name: '再选一选', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回导入', exact: true })).toHaveCount(0);
  const back = page.locator('.memory-bar').getByRole('button', { name: '返回', exact: true });
  await back.click();
  await expect(page.getByRole('heading', { name: '选择想记住的书' })).toBeVisible();
  await expect(page.getByRole('button', { name: '阅读的回声，2 条我的划线' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '下一步 · AI 问题与导入' }).click();
  await expect(page.getByRole('heading', { name: '让划线变成问题' })).toBeVisible();
  await back.click();
  await back.click();
  await expect(page.getByRole('heading', { name: '把知识，收进卡片。' })).toBeVisible();
  await page.getByRole('button', { name: '导入划线', exact: true }).click();
  await expect(page.getByRole('button', { name: '连接微信读书', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '其他导入方式', exact: true }).click();
  await expect(page.locator('input[type="file"][accept=".json,application/json"]')).toBeVisible();
  await back.click();
  await expect(page.getByRole('button', { name: '连接微信读书', exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  expect(calls).toEqual([]);
});
test('展开划线支持全选全不选和半选，数量同步且仅导入确认选中的原文', async ({ page }, testInfo) => {
  const calls = await setup(page);
  const before = await snapshot(page);
  await choose(page);
  await page.getByRole('button', { name: '选择划线 · 默认全选', exact: true }).click();
  const all = page.getByRole('checkbox', { name: /全选 \/ 全不选/ });
  const rows = page.locator('.wr-highlight-options > label:not(.wr-highlight-all) input');
  const generate = page.getByRole('button', { name: '生成并自动导入', exact: true });
  await expect(all).toBeChecked();
  await expect(rows).toHaveCount(2);
  await all.uncheck();
  await expect(all).not.toBeChecked();
  await expect(page.locator('.wr-highlight-options input:checked')).toHaveCount(0);
  await expect(page.locator('.wr-confirm-count')).toContainText('0');
  await expect(generate).toBeDisabled();
  await rows.first().check();
  await expect(all).toBeChecked({ indeterminate: true });
  await expect(page.locator('.wr-highlight-all')).toContainText('已选 1 / 2 条划线');
  await expect(page.locator('.wr-confirm-count')).toContainText('1');
  await all.check();
  await expect(all).toBeChecked();
  await expect(rows.nth(1)).toBeChecked();
  await rows.nth(1).uncheck();
  await page.getByRole('button', { name: '选择划线 · 默认全选', exact: true }).click();
  await page.getByRole('button', { name: '选择划线 · 默认全选', exact: true }).click();
  await expect(all).toBeChecked({ indeterminate: true });
  const box = await page.locator('.wr-highlight-all').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.locator('.wr-highlight-all').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/recall-weread-selection-${testInfo.project.name}.png` });
  expect(await snapshot(page)).toEqual(before);
  expect(calls).toEqual([]);
  await generate.click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toEqual([original[0]]);
  expect((await snapshot(page)).cards.map((card: { back: string }) => card.back)).toEqual([original[0]]);
});
test('确认后真实流程生成并自动导入，原文保持，重复导入跳过模型', async ({ page }) => {
  const calls = await setup(page);
  await choose(page);
  expect((await snapshot(page)).cards).toHaveLength(0);
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  const data = await snapshot(page);
  expect(data.cards).toHaveLength(2);
  expect(data.cards.map((card: { back: string }) => card.back)).toEqual(original);
  expect(data.cards.map((card: { front: string }) => card.front)).toEqual(questions);
  expect(data.decks).toHaveLength(1);
  expect(calls).toEqual(original);
  await page.getByRole('button', { name: '继续选择其他书' }).click();
  await page.getByRole('button', { name: '阅读的回声，2 条我的划线' }).click();
  await page.getByRole('button', { name: '下一步 · AI 问题与导入' }).click();
  await expect(page.locator('.wr-confirm-count')).toContainText('0');
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toEqual(original);
  expect((await snapshot(page)).cards).toHaveLength(2);
});
test('失败全批不导入，刷新保留已成功问题且不续跑，重试只继续剩余', async ({ page }) => {
  const calls = await setup(page, 2, true);
  await choose(page);
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(calls).toHaveLength(2);
  expect((await snapshot(page)).cards).toHaveLength(0);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const failedBackground = await page.locator('.wr-job-books .wr-failed').evaluate(element => getComputedStyle(element).backgroundColor);
  expect(failedBackground).toBe('rgb(71, 52, 44)');
  await page.reload();
  await expect(page.getByRole('heading', { name: '进度已为你保留' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(2);
  await page.getByRole('button', { name: '重试并继续' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls.filter(value => value === original[0])).toHaveLength(1);
  expect(calls.filter(value => value === original[1])).toHaveLength(2);
  expect((await snapshot(page)).cards.map((card: { back: string }) => card.back)).toEqual(original);
});
test('单次101条默认全选并全部生成导入，重复导入不重做问题', async ({ page }) => {
  const calls = await setup(page, 101, false, 300, 0);
  await choose(page);
  await expect(page.locator('.wr-confirm-count')).toContainText('101');
  await expect(page.getByRole('button', { name: '生成并自动导入' })).toBeEnabled();
  await page.getByRole('button', { name: '选择划线 · 默认全选' }).click();
  await expect(page.locator('.wr-highlight-options > label:not(.wr-highlight-all) input:checked')).toHaveCount(101);
  expect(calls).toEqual([]);
  expect((await snapshot(page)).cards).toHaveLength(0);
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible({ timeout: 30000 });
  const data = await snapshot(page);
  expect(data.cards).toHaveLength(101);
  expect(data.cards.map((card: { back: string }) => card.back)).toEqual(calls);
  expect(new Set(calls).size).toBe(101);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '继续选择其他书' }).click();
  await page.getByRole('button', { name: '阅读的回声，101 条我的划线' }).click();
  await page.getByRole('button', { name: '下一步 · AI 问题与导入' }).click();
  await expect(page.locator('.wr-confirm-count')).toContainText('0');
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toHaveLength(101);
  expect((await snapshot(page)).cards).toHaveLength(101);
});
test('超过20条仍受每日剩余额度保护，不发原文或导入', async ({ page }) => {
  const calls = await setup(page, 101, false, 100, 0);
  await choose(page);
  await expect(page.getByRole('button', { name: '生成并自动导入' })).toBeEnabled();
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('alert')).toContainText('今日最多还可尝试 100');
  expect(calls).toEqual([]);
  expect((await snapshot(page)).cards).toHaveLength(0);
});
test('超过20个成功问题的任务失败后刷新可恢复，重试只处理剩余并整批导入', async ({ page }) => {
  const calls = await setup(page, 41, 25, 300, 0);
  await choose(page);
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(calls).toHaveLength(26);
  expect((await snapshot(page)).cards).toHaveLength(0);
  const completed = calls.slice(0, 25);
  await page.reload();
  await expect(page.getByRole('heading', { name: '进度已为你保留' })).toBeVisible();
  await expect(page.locator('.wr-job-summary strong')).toContainText('25');
  await page.waitForTimeout(300);
  expect(calls).toHaveLength(26);
  await page.getByRole('button', { name: '重试并继续' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toHaveLength(42);
  for (const text of completed) expect(calls.filter(value => value === text)).toHaveLength(1);
  expect((await snapshot(page)).cards.map((card: { back: string }) => card.back)).toEqual([...new Set(calls)]);
});
test('大批量任务超过20条后可以主动暂停，刷新不续跑且已完成问题不重做', async ({ page }) => {
  const calls = await setup(page, 41, false, 300, 50);
  await choose(page);
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect.poll(async () => Number.parseInt(await page.locator('.wr-job-summary strong').innerText(), 10)).toBeGreaterThan(20);
  await page.getByRole('button', { name: '暂停，保留进度' }).click();
  await expect(page.getByRole('heading', { name: '进度已为你保留' })).toBeVisible();
  const count = Number.parseInt(await page.locator('.wr-job-summary strong').innerText(), 10);
  expect(count).toBeGreaterThan(20);
  expect(count).toBeLessThan(41);
  expect((await snapshot(page)).cards).toHaveLength(0);
  const completed = calls.slice(0, count);
  await page.reload();
  await expect(page.getByRole('heading', { name: '进度已为你保留' })).toBeVisible();
  const pausedCalls = calls.length;
  await page.waitForTimeout(300);
  expect(calls).toHaveLength(pausedCalls);
  await page.getByRole('button', { name: '重试并继续' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  for (const text of completed) expect(calls.filter(value => value === text)).toHaveLength(1);
  expect(new Set(calls).size).toBe(41);
  expect((await snapshot(page)).cards.map((card: { back: string }) => card.back)).toEqual([...new Set(calls)]);
});
test('选书页安全区、触控、窄屏和滚动没有溢出或误选', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  await page.locator('.memory-app').evaluate(element => { (element as HTMLElement).style.setProperty('--safe-inset-top', '59px'); (element as HTMLElement).style.setProperty('--safe-bottom', '34px'); });
  for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 740 }, { width: 760, height: 900 }, { width: 761, height: 1000 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.locator('.memory-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const targets = await page.locator('.wr-workspace button:visible').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    expect(targets.every(height => height >= 44)).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('.memory-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  const dockButton = await page.locator('.wr-dock .m-primary').boundingBox();
  expect(dockButton!.y + dockButton!.height).toBeLessThanOrEqual(852 - 34);
  await expect(page.locator('.wr-dock')).toContainText('已选 0 本');
});
test('长书单底部下一步完整上移，安全区留白且末本书能滚动到按钮上方', async ({ page }, testInfo) => {
  const calls = await setup(page);
  await page.route('**/api/weread/books', route => route.fulfill({ json: { books: Array.from({ length: 12 }, (_, index) => ({
    bookId: `synthetic-dock-${index}`, title: `合成书籍 ${index + 1}`, highlightCount: 2,
  })), cursor: null } }));
  const before = await snapshot(page);
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  await expect(page.locator('.wr-book')).toHaveCount(12);
  const next = page.getByRole('button', { name: '下一步 · AI 问题与导入', exact: true });
  for (const viewport of [{ width: 393, height: 852 }, { width: 603, height: 824 }, { width: 320, height: 740 }, { width: 760, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined))));
    for (const inset of [16, 34]) {
      await page.locator('.memory-app').evaluate((element, inset) => { (element as HTMLElement).style.setProperty('--safe-bottom', `${inset}px`); }, inset);
      await page.locator('.memory-content').evaluate(element => { element.scrollTop = 0; });
      await expect(next).toBeInViewport();
      const button = (await next.boundingBox())!;
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(viewport.height - button.y - button.height).toBeGreaterThanOrEqual(inset + 16 - 1);
      await page.locator('.memory-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
      const last = (await page.locator('.wr-book').last().boundingBox())!;
      const dock = (await page.locator('.wr-dock').boundingBox())!;
      expect(last.y + last.height).toBeLessThanOrEqual(dock.y + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await expect(page.locator('.wr-dock')).toContainText('已选 0 本');
    }
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('.memory-content').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: `/tmp/recall-weread-raised-dock-${testInfo.project.name}.png` });
  expect(await snapshot(page)).toEqual(before);
  expect(calls).toEqual([]);
});
test('草稿写入失败不调用模型，恢复存储后才继续', async ({ page }) => {
  const calls = await setup(page);
  await choose(page);
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    Object.assign(window, { restoreDraftWrites: () => { IDBObjectStore.prototype.put = originalPut; } });
    IDBObjectStore.prototype.put = function() { throw new DOMException('synthetic draft quota', 'QuotaExceededError'); };
  });
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('button', { name: '重试并继续' })).toBeVisible();
  expect(calls).toEqual([]); expect((await snapshot(page)).cards).toHaveLength(0);
  await page.evaluate(() => (window as unknown as { restoreDraftWrites: () => void }).restoreDraftWrites());
  await page.getByRole('button', { name: '重试并继续' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toEqual(original);
});
test('生成后的草稿写入失败保留内存问题，重试不重做已成功问题', async ({ page }) => {
  const calls = await setup(page);
  await choose(page);
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    Object.assign(window, { restoreDraftWrites: () => { IDBObjectStore.prototype.put = originalPut; } });
    IDBObjectStore.prototype.put = function(value, key) {
      if (value.generated?.length) throw new DOMException('synthetic generated quota', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('button', { name: '重试并继续' })).toBeVisible();
  expect(calls).toEqual([original[0]]); expect((await snapshot(page)).cards).toHaveLength(0);
  await page.evaluate(() => (window as unknown as { restoreDraftWrites: () => void }).restoreDraftWrites());
  await page.getByRole('button', { name: '重试并继续' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toEqual(original);
});
test('卡片保存失败只重试导入，成功的问题和原文不丢失', async ({ page }) => {
  const calls = await setup(page);
  await choose(page);
  await page.evaluate(() => {
    const originalSet = Storage.prototype.setItem;
    Object.assign(window, { restoreCardWrites: () => { Storage.prototype.setItem = originalSet; } });
    Storage.prototype.setItem = function(key, value) {
      if (key === 'recall.snapshot.v1') throw new DOMException('synthetic card quota', 'QuotaExceededError');
      return originalSet.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('button', { name: '重试导入', exact: true })).toBeVisible();
  expect(calls).toEqual(original); expect((await snapshot(page)).cards).toHaveLength(0);
  await page.evaluate(() => (window as unknown as { restoreCardWrites: () => void }).restoreCardWrites());
  await page.getByRole('button', { name: '重试导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toEqual(original); expect((await snapshot(page)).cards.map((card: { back: string }) => card.back)).toEqual(original);
});
test('另一个页面持有任务锁时不保存、不发原文；释放后可继续', async ({ page }) => {
  const calls = await setup(page);
  await choose(page);
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      void navigator.locks.request('recall-weread-job', () => new Promise<void>(release => {
        Object.assign(window, { releaseJobLock: release }); resolve();
      }));
    });
  });
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('alert')).toContainText('另一个页面');
  expect(calls).toEqual([]);
  await page.evaluate(() => (window as unknown as { releaseJobLock: () => void }).releaseJobLock());
  await page.getByRole('button', { name: '重试并继续' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toEqual(original);
});
test('卡片已写入但完成记录失败时明确告知，重试跳过已写入卡片', async ({ page }) => {
  const calls = await setup(page);
  await choose(page);
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    Object.assign(window, { restoreDraftWrites: () => { IDBObjectStore.prototype.put = originalPut; } });
    IDBObjectStore.prototype.put = function(value, key) {
      if (value.status === 'done') throw new DOMException('synthetic receipt quota', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('button', { name: '重试导入', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('卡片已写入');
  expect((await snapshot(page)).cards).toHaveLength(2);
  await page.evaluate(() => (window as unknown as { restoreDraftWrites: () => void }).restoreDraftWrites());
  await page.getByRole('button', { name: '重试导入', exact: true }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toEqual(original); expect((await snapshot(page)).cards).toHaveLength(2);
});
test('内容冲突暂停且刷新后可重新确认，保留已经生成的问题和复习进度', async ({ page }) => {
  const calls = await setup(page);
  await choose(page);
  await page.evaluate(() => {
    const originalSet = Storage.prototype.setItem;
    Object.assign(window, { restoreCardWrites: () => { Storage.prototype.setItem = originalSet; } });
    Storage.prototype.setItem = function(key, value) {
      if (key === 'recall.snapshot.v1') throw new DOMException('synthetic quota', 'QuotaExceededError');
      return originalSet.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('button', { name: '重试导入', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    (window as unknown as { restoreCardWrites: () => void }).restoreCardWrites();
    const savedJob = await new Promise<WereadJob>(resolve => {
      const request = indexedDB.open('recall-weread-drafts', 1);
      request.onsuccess = () => { const read = request.result.transaction('jobs').objectStore('jobs').get('active'); read.onsuccess = () => { resolve(read.result); request.result.close(); }; };
    });
    const data = JSON.parse(localStorage.getItem('recall.snapshot.v1')!);
    const id = savedJob.drafts[0].id;
    const deckId = 'weread-book:original';
    data.decks.push({ id: deckId, name: '阅读的回声', description: deckId, parentId: null, color: 'slate', createdAt: savedJob.createdAt, updatedAt: savedJob.createdAt });
    data.cards.push({ id, deckId, cardType: 'basic', front: '另一个页面编辑的问题', back: savedJob.drafts[0].highlight.markText, contentKind: 'qa', recallKind: 'question', source: '微信读书 · 阅读的回声 · 原创章节', bookTitle: '阅读的回声', chapter: '原创章节', sourceRef: { provider: 'weread', bookId: 'original', bookmarkId: 'mark-0', chapterUid: '1' }, tags: [], hint: '', state: 'new', reps: 7, lapses: 0, stability: 0, difficulty: 0, createdAt: savedJob.createdAt, updatedAt: savedJob.createdAt, nextReviewDate: savedJob.createdAt, learningSteps: 0, elapsedDays: 0, scheduledDays: 0, lastReviewDate: null });
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: '重试导入', exact: true }).click();
  await expect(page.getByRole('button', { name: '重新检查导入变化' })).toBeVisible();
  await page.getByRole('button', { name: '重新检查导入变化' }).click();
  await expect(page.locator('.wr-confirm-books')).toContainText('阅读的回声');
  await expect(page.locator('.wr-confirm-count')).toContainText('0');
  await page.locator('.wr-changes input').check();
  await page.getByRole('button', { name: '生成并自动导入' }).click();
  await expect(page.getByRole('heading', { name: '让读过的，留得住。' })).toBeVisible();
  expect(calls).toEqual(original);
  const data = await snapshot(page);
  expect(data.cards).toHaveLength(2); expect(data.cards[0].reps).toBe(7); expect(data.cards[0].front).toBe(questions[0]);
});
