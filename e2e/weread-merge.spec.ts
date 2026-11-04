import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import { createMergeDemo } from '../src/lib/weread-merge-session';

const originals = ['  概念定义。\r\n\t 保持空白。  ', '具体条件与说明。', '方法的第一步。', '方法的第二步。'];
const seed = () => ({ ...createSeedSnapshot(), cards: [], decks: [], reviewLogs: [], studySessions: [], settings: { ...createSeedSnapshot().settings, onboardingComplete: true } });
async function mergeDraft(page: Page, replacement?: string): Promise<string> {
  return page.evaluate(value => new Promise<string>((resolve, reject) => {
    const open = indexedDB.open('recall-weread-merge-drafts', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction('sessions', value === undefined ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = value === undefined ? store.get('active') : store.put(JSON.parse(value));
      transaction.oncomplete = () => { resolve(value ?? JSON.stringify(request.result)); db.close(); };
      transaction.onabort = () => { reject(transaction.error); db.close(); };
    };
  }), replacement);
}
async function seedMergeDemo(page: Page): Promise<void> {
  await mergeDraft(page, JSON.stringify(await createMergeDemo(seed())));
  await page.reload();
  await expect(page.locator('.wr-merge-card')).toHaveCount(2);
}
async function completedMergeDraft(page: Page, days = 0): Promise<string> {
  const completed = await createMergeDemo(seed());
  completed.status = 'done';
  completed.receipt = { added: 2, updated: 0, skipped: 0, deckIds: ['synthetic-finished'] };
  completed.createdAt = new Date(Date.now() - days * 86400000).toISOString();
  completed.expiresAt = Date.parse(completed.createdAt) + 7 * 86400000;
  const value = JSON.stringify(completed);
  await mergeDraft(page, value);
  return value;
}
async function setup(page: Page, fail = false, missing = false) {
  const calls: string[][] = [];
  let failed = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session') { await route.fulfill({ status: 503, json: { error: 'synthetic' } }); return; }
    const body = route.request().postDataJSON();
    if (path.endsWith('/books')) await route.fulfill({ json: { books: [{ bookId: 'synthetic', title: '合成关联书', highlightCount: 4 }, { bookId: 'synthetic-next', title: '合成下一本书', highlightCount: 4 }], cursor: null } });
    else if (path.endsWith('/progress')) await route.fulfill({ json: { bookId: body.bookId, readingProgress: null } });
    else if (path.endsWith('/budget')) await route.fulfill({ json: { remaining: 300 } });
    else if (path.endsWith('/book')) await route.fulfill({ json: { format: 'recall-weread-export-v1', books: [{ bookId: body.bookId, title: body.bookId === 'synthetic' ? '合成关联书' : '合成下一本书', highlights: [3, 1, 0, 2].map(index => ({
      bookmarkId: `m${index}`, markText: originals[index], chapterUid: '1', chapterTitle: '合成章节',
      ...(missing ? {} : { chapterIdx: 1, range: `${index * 100}-20` }),
    })) }] } });
    else if (path.endsWith('/merge')) {
      const ids = body.highlights.map((item: { id: string }) => item.id);
      calls.push(ids);
      expect(ids).toEqual(['m0', 'm1', 'm2', 'm3']);
      expect(body.highlights.map((item: { markText: string }) => item.markText)).toEqual(originals);
      if (fail && !failed) { failed = true; await route.fulfill({ status: 502, json: { error: 'synthetic-failure' } }); return; }
      await route.fulfill({ json: { cards: [
        { highlightIds: ['m0', 'm1'], question: '这一概念有哪些具体条件？' }, { highlightIds: ['m2', 'm3'], question: '这一方法包含哪两个步骤？' },
      ] } });
    } else throw new Error(`Unexpected API ${path}`);
  });
  await page.goto('/');
  await page.evaluate(data => { localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); location.hash = 'weread'; }, seed());
  await page.reload();
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  await page.getByRole('button', { name: '合成关联书，4 条我的划线' }).click();
  await page.getByRole('button', { name: '下一步 · AI 问题与导入' }).click();
  return calls;
}
const snapshot = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null'));

async function enterMerge(page: Page): Promise<void> {
  await page.getByRole('radio', { name: /^智能合并/ }).check();
  await page.getByRole('button', { name: '下一步 · 合并预览', exact: true }).click();
}

for (const days of [0, 8]) {
  test(`已完成${days}天的旧合并记录不劫持微信读书入口且不删除卡片`, async ({ page }) => {
    const calls = await setup(page);
    const before = await snapshot(page);
    const completed = await completedMergeDraft(page, days);
    await page.reload();
    await expect(page.getByRole('button', { name: '连接微信读书', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '导入完成' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '取消无法恢复的合并草稿' })).toHaveCount(0);
    expect(await mergeDraft(page)).toBe(completed);
    expect(await snapshot(page)).toEqual(before);
    expect(calls).toEqual([]);
  });
}

test('选书后出现旧完成记录也从当前选择生成，完成返回书架并可再导入下一本书', async ({ page }) => {
  const calls = await setup(page);
  const requestedBooks: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/weread/merge') requestedBooks.push(request.postDataJSON().bookId);
  });
  await completedMergeDraft(page);
  await enterMerge(page);
  await expect(page.getByRole('heading', { name: '把相关划线放在一起' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '导入完成' })).toHaveCount(0);
  await expect(page.locator('.wr-merge-sources')).toContainText('合成关联书');
  await expect(page.locator('.wr-merge-sources')).not.toContainText('原创合并示例');
  expect((await snapshot(page)).cards).toEqual([]);
  const progress = page.getByRole('progressbar', { name: '原划线整理进度' });
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  await expect(progress).toHaveAttribute('aria-valuemax', '4');
  await page.getByRole('button', { name: '生成分组与问题', exact: true }).click();
  await expect(progress).toHaveAttribute('aria-valuenow', '4');
  await expect(page.getByRole('region', { name: '划线整理进度' })).toContainText('100%');
  await page.getByRole('button', { name: '确认导入 2 张卡片', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  await expect(page.getByRole('region', { name: '导入任务完成' })).toContainText('4 条原划线已处理');
  await expect(page.locator('.m-import-completion-counts > div').first()).toContainText('2');
  await expect(page.locator('.wr-merge-summary')).toHaveCount(0);
  await expect(page.locator('.wr-merge-cards')).toHaveCount(0);
  const firstImport = await snapshot(page);
  expect(firstImport.cards).toHaveLength(2);
  await page.locator('.memory-bar').getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('heading', { name: '选择想记住的书' })).toBeVisible();
  await expect(page.getByRole('button', { name: '合成关联书，4 条我的划线' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '合成下一本书，4 条我的划线' }).click();
  await page.getByRole('button', { name: '下一步 · AI 问题与导入' }).click();
  await enterMerge(page);
  await expect(page.locator('.wr-merge-sources')).toContainText('合成下一本书');
  expect(await snapshot(page)).toEqual(firstImport);
  await page.getByRole('button', { name: '生成分组与问题', exact: true }).click();
  await page.getByRole('button', { name: '确认导入 2 张卡片', exact: true }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  const secondImport = await snapshot(page);
  expect(secondImport.cards).toHaveLength(4);
  for (const card of firstImport.cards) expect(secondImport.cards.find((item: { id: string }) => item.id === card.id)).toEqual(card);
  expect(requestedBooks).toEqual(['synthetic', 'synthetic-next']);
  expect(calls).toHaveLength(2);
  await page.getByRole('button', { name: '继续选择其他书', exact: true }).click();
  await expect(page.getByRole('heading', { name: '选择想记住的书' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '连接微信读书', exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(secondImport);
});

test('生成方式只是选择，合并数量不预猜，范围变更不会静默切换或自动导入', async ({ page }) => {
  const calls = await setup(page);
  const before = await snapshot(page);
  const individual = page.getByRole('radio', { name: /^逐条生成/ });
  const merge = page.getByRole('radio', { name: /^智能合并/ });
  await expect(individual).toBeChecked();
  await merge.check();
  await expect(page.locator('.wr-confirm-count')).toHaveText('合并后卡片数预览时确定');
  await expect(page.locator('.wr-action-note')).toContainText('已有卡片不变');
  await expect(page.getByRole('button', { name: '生成并自动导入', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '调整划线', exact: true }).click();
  const all = page.getByRole('checkbox', { name: /全选 \/ 全不选/ });
  await all.uncheck();
  await expect(merge).toBeChecked();
  await expect(page.getByRole('button', { name: '下一步 · 合并预览', exact: true })).toBeDisabled();
  await all.check();
  await individual.check();
  await expect(page.getByRole('button', { name: '生成并自动导入', exact: true })).toBeEnabled();
  expect(calls).toEqual([]);
  expect(await snapshot(page)).toEqual(before);
  await enterMerge(page);
  await expect(page.getByRole('button', { name: '生成分组与问题' })).toBeVisible();
  expect(calls).toEqual([]);
  expect(await snapshot(page)).toEqual(before);
  await page.locator('.memory-bar').getByRole('button', { name: '返回', exact: true }).click();
  await expect(merge).toBeChecked();
  await expect(page.locator('.wr-scope-control')).toContainText('已选 4 / 4 条');
});

test('智能分组合并、原文顺序、改问题、确认后导入与刷新恢复', async ({ page }, info) => {
  const calls = await setup(page);
  await enterMerge(page);
  await page.getByRole('button', { name: '生成分组与问题' }).click();
  await expect(page.getByRole('heading', { name: '检查你的知识单元' })).toBeVisible();
  expect((await snapshot(page)).cards).toEqual([]);
  expect(calls).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: '检查你的知识单元' })).toBeVisible();
  expect(calls).toHaveLength(1);
  const prompt = page.getByRole('textbox', { name: '合并卡片 1 的问题' });
  await prompt.fill('这个概念的定义和适用条件分别是什么？');
  await prompt.blur();
  await expect(page.getByRole('button', { name: '确认导入 2 张卡片' })).toBeEnabled();
  for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 852 }, { width: 760, height: 852 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: info.outputPath('grouped-originals-iphone15.png'), fullPage: true });
  await page.getByRole('button', { name: '确认导入 2 张卡片' }).click();
  await expect(page.getByRole('heading', { name: '导入完成' })).toBeVisible();
  const saved = await snapshot(page);
  expect(saved.cards).toHaveLength(2);
  expect(saved.cards[0].back).toBe(originals.slice(0, 2).join('\n\n'));
  expect(saved.cards[0].sourceRef.highlights.map((item: { markText: string }) => item.markText)).toEqual(originals.slice(0, 2));
  expect(saved.cards[0].front).toBe('这个概念的定义和适用条件分别是什么？');
  await page.getByRole('button', { name: '查看卡组', exact: true }).click();
  await expect(page.locator('.m-card-open')).toHaveCount(2);
  await page.getByRole('button', { name: '管理卡片：这个概念的定义和适用条件分别是什么？', exact: true }).click();
  await page.getByRole('button', { name: '编辑卡片', exact: true }).click();
  await expect(page.locator('textarea[name="back"]')).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('附加来源截图')).toHaveCount(0);
  await page.locator('textarea[name="front"]').fill('定义和条件怎样共同限定这个概念？');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.locator('textarea[name="front"]')).toHaveCount(0);
  expect((await snapshot(page)).cards[0].back).toBe(originals.slice(0, 2).join('\n\n'));
  await page.locator('.m-card-open').first().click();
  await page.getByRole('button', { name: '显示答案', exact: true }).click();
  const active = page.locator('.m-reading[data-active="true"]');
  await expect(active.locator('.m-weread-source-segments section')).toHaveCount(2);
  expect(await active.locator('.m-weread-source-segments section > p').allTextContents()).toEqual(originals.slice(0, 2));
});

test('手动拆分与相邻合并不调用AI、不改原文', async ({ page }) => {
  const calls = await setup(page);
  await enterMerge(page);
  await page.getByRole('button', { name: '生成分组与问题' }).click();
  await expect(page.locator('.wr-merge-card')).toHaveCount(2);
  await page.getByRole('button', { name: '拆分为单条' }).first().click();
  await expect(page.locator('.wr-merge-card')).toHaveCount(3);
  await page.getByRole('button', { name: '与下一张合并' }).first().click();
  await expect(page.locator('.wr-merge-card')).toHaveCount(2);
  expect(calls).toHaveLength(1);
  expect((await snapshot(page)).cards).toEqual([]);
});

for (const fault of ['expired', 'invalid']) {
  test(`旧页面取消${fault}草稿不能删除另一页面的新草稿`, async ({ page, context }) => {
    await setup(page);
    await enterMerge(page);
    await page.getByRole('button', { name: '生成分组与问题' }).click();
    await expect(page.locator('.wr-merge-card')).toHaveCount(2);
    const old = JSON.parse(await mergeDraft(page));
    if (fault === 'expired') {
      old.createdAt = new Date(Date.now() - 8 * 86400000).toISOString();
      old.expiresAt = Date.parse(old.createdAt) + 7 * 86400000;
    } else old.version = 2;
    await mergeDraft(page, JSON.stringify(old));
    await page.reload();
    await expect(page.getByRole('button', { name: '取消无法恢复的合并草稿' })).toBeVisible();
    const other = await context.newPage();
    try {
      await other.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'synthetic-no-cloud' } }));
      await other.goto('/#weread');
      await expect(other.getByRole('button', { name: '取消无法恢复的合并草稿' })).toBeVisible();
      other.once('dialog', dialog => dialog.accept());
      await other.getByRole('button', { name: '取消无法恢复的合并草稿' }).click();
      await expect(other.getByRole('button', { name: '取消无法恢复的合并草稿' })).toHaveCount(0);
      await other.goto('/#weread');
      await other.reload();
      await expect(other.getByRole('button', { name: '连接微信读书', exact: true })).toBeVisible();
      await seedMergeDemo(other);
      const replacement = await mergeDraft(other);
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: '取消无法恢复的合并草稿' }).click();
      await expect(page.getByRole('alert')).toContainText('另一个页面的合并草稿已变化');
      expect(await mergeDraft(other)).toBe(replacement);
      expect((await snapshot(page)).cards).toEqual([]);
    } finally { await other.close(); }
  });
}

test('失败不导入，刷新后显式继续；缺位置不能智能合并', async ({ page }) => {
  const calls = await setup(page, true);
  await enterMerge(page);
  await page.getByRole('button', { name: '生成分组与问题' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await snapshot(page)).cards).toEqual([]);
  await page.reload();
  await expect(page.getByRole('button', { name: '生成分组与问题' })).toBeVisible();
  expect(calls).toHaveLength(1);
  await page.getByRole('button', { name: '生成分组与问题' }).click();
  await expect(page.getByRole('heading', { name: '检查你的知识单元' })).toBeVisible();
  expect(calls).toHaveLength(2);
});

test('缺少原文位置时保留逐条入口而禁止智能合并', async ({ page }) => {
  await setup(page, false, true);
  await expect(page.getByRole('radio', { name: /^智能合并/ })).toBeDisabled();
  await expect(page.locator('.wr-mode-error')).toContainText('可选择逐条生成');
  await expect(page.getByRole('button', { name: '生成并自动导入', exact: true })).toBeEnabled();
});

test('连接页无公开合成示例，保留真实连接与其他导入入口', async ({ page }, info) => {
  const calls: string[] = [];
  await page.route('**/api/**', async route => {
    calls.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 503, json: { error: 'synthetic-no-cloud' } });
  });
  await page.goto('/');
  await page.evaluate(data => { localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); location.hash = 'weread'; }, seed());
  await page.reload();
  const connect = page.getByRole('button', { name: '连接微信读书', exact: true });
  await expect(connect).toBeEnabled();
  await expect(page.getByRole('button', { name: /体验合并示例/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '其他导入方式', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('.memory-app')?.style.setProperty('--safe-top', '59px');
    document.querySelector<HTMLElement>('.memory-app')?.style.setProperty('--safe-bottom', '34px');
  });
  for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 740 }, { width: 760, height: 852 }, { width: 761, height: 852 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    for (const button of [connect]) {
      await button.scrollIntoViewIfNeeded();
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  expect(calls.every(path => path === '/api/auth/session')).toBe(true);
  expect((await snapshot(page)).cards).toEqual([]);
  expect(await mergeDraft(page)).toBeUndefined();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: info.outputPath('weread-landing.png'), fullPage: true });
});

test('内部合成草稿无AI调用，可拆分预览且安全区按钮至少44px', async ({ page }) => {
  let aiCalls = 0;
  await page.route('**/api/**', async route => {
    if (/weread\/(merge|question)/.test(route.request().url())) aiCalls++;
    await route.fulfill({ status: 503, json: { error: 'preview-no-cloud' } });
  });
  await page.goto('/');
  await page.evaluate(data => { localStorage.setItem('recall.snapshot.v1', JSON.stringify(data)); location.hash = 'weread'; }, seed());
  await page.reload();
  await expect(page.getByRole('button', { name: '连接微信读书', exact: true })).toBeVisible();
  await seedMergeDemo(page);
  await expect(page.locator('.wr-consent')).toContainText('不是现场 AI 输出');
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('.memory-app')?.style.setProperty('--safe-top', '59px');
    document.querySelector<HTMLElement>('.memory-app')?.style.setProperty('--safe-bottom', '34px');
  });
  const button = page.getByRole('button', { name: '确认导入 2 张卡片' });
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: '拆分为单条' }).first().click();
  await expect(page.locator('.wr-merge-card')).toHaveCount(3);
  expect(aiCalls).toBe(0);
  expect((await snapshot(page)).cards).toEqual([]);
});
