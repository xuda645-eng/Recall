import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import type { RecallStateSnapshot } from '../src/types';
import { WEREAD_OPERATIONS, type WereadCapabilityStatus, type WereadOperation } from '../shared/weread-api';
import { validateMergeBatch } from '../shared/weread-merge';

// Only synthetic native HTTP responses are used, never live WeRead, Ark or library writes.
// The real Miaoda /personal/ shell, capability bootstrap and SDK transport are not replaced.
const origin = 'http://localhost:8187';
const personalPath = '/app/app_17hv4js1tsy/personal/';
const nativePrefix = '/app/app_17hv4js1tsy/api/recall/weread/';
const accountKey = 'a'.repeat(64);
const storedAccount = 'b'.repeat(64);
const bookId = 'synthetic-miaoda-weread-book';
const bookTitle = '妙搭合成阅读书';
const originals = ['  合成原文一。\r\n保留观察与结论之间的依据。\n  ', '合成原文二。保留结论的适用条件。'];
const questions = ['合成问题一：原文如何说明观察与结论之间的依据？', '合成问题二：原文说明了哪些结论的适用条件？'];
const manualQuestion = '手动问题：观察与结论之间需要保留什么？';

interface NativeCall {
  operation: WereadOperation | 'status';
  method: string;
  accountKey: string | null;
  cacheControl: string | null;
  input: unknown;
}

class NativeWeread {
  capability: WereadCapabilityStatus = { available: true, aiAvailable: false, accountKey };
  failures: Partial<Record<WereadOperation, number>> = {};
  requests: NativeCall[] = [];
  unexpected: string[] = [];
  legacy: string[] = [];
  statusCachePolicies: (string | null)[] = [];
  markTexts = [...originals];

  calls(operation: NativeCall['operation']): NativeCall[] {
    return this.requests.filter(request => request.operation === operation);
  }

  highlights() {
    return this.markTexts.map((markText, index) => ({
      bookmarkId: `synthetic-mark-${index + 1}`, markText, chapterUid: 'synthetic-chapter',
      chapterIdx: 1, chapterTitle: '合成章节', range: `${index * 100}-40`,
    }));
  }

  async install(page: Page): Promise<void> {
    page.on('response', async response => {
      if (response.url() === `${origin}${nativePrefix}status`) this.statusCachePolicies.push(await response.headerValue('Cache-Control'));
    });
    await page.route('**/api/weread/**', async route => {
      this.legacy.push(new URL(route.request().url()).pathname);
      await route.fulfill({ status: 503, json: { error: 'Legacy WeRead routes are forbidden in this suite' } });
    });
    await page.route('**/api/recall/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const operation = url.pathname.slice(nativePrefix.length);
      if (url.origin !== origin || !url.pathname.startsWith(nativePrefix) || url.search
        || operation !== 'status' && !WEREAD_OPERATIONS.some(allowed => allowed === operation)) {
        this.unexpected.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({ status: 503, json: { error: 'No unmocked Recall service may run' } });
        return;
      }
      const call: NativeCall = {
        operation: operation as NativeCall['operation'], method: request.method(),
        accountKey: await request.headerValue('X-Recall-Account-Key'),
        cacheControl: await request.headerValue('Cache-Control'),
        input: request.postData() ? request.postDataJSON() : null,
      };
      this.requests.push(call);
      if (call.method !== (operation === 'status' ? 'GET' : 'POST')
        || operation !== 'status' && call.accountKey !== accountKey) {
        this.unexpected.push(`Invalid native method or account binding: ${operation}`);
        await route.fulfill({ status: 403, json: { error: 'Synthetic native binding rejected' } });
        return;
      }
      const headers = { 'Cache-Control': 'no-store' };
      if (operation === 'status') {
        await route.fulfill({ headers, json: this.capability });
        return;
      }
      const failure = this.failures[operation as WereadOperation];
      if (failure) {
        if (failure === 401) this.capability = { available: false, aiAvailable: false, accountKey: null };
        await route.fulfill({ status: failure, headers, json: { error: 'Synthetic native service failure' } });
        return;
      }
      const input = call.input as Record<string, unknown>;
      if (operation === 'books') {
        await route.fulfill({ headers, json: { books: [
          { bookId, title: bookTitle, author: '合成作者', highlightCount: 2, cover: null,
            markedFinished: false, thoughtsCount: 0, bookmarkCount: 0, totalNoteCount: 2, lastNoteAt: '2026-11-13' },
          { bookId: 'synthetic-empty-book', title: '妙搭空笔记书', highlightCount: 0 },
        ], cursor: null } });
      } else if (operation === 'book') {
        if (input.bookId !== bookId) this.unexpected.push('An unselected book was requested');
        await route.fulfill({ headers, json: { format: 'recall-weread-export-v1', books: [
          { bookId, title: bookTitle, author: '合成作者', highlights: this.highlights() },
        ] } });
      } else if (operation === 'progress') {
        await route.fulfill({ headers, json: { bookId: input.bookId, readingProgress: input.bookId === bookId ? 35 : null } });
      } else if (operation === 'budget') {
        await route.fulfill({ headers, json: { remaining: 300 } });
      } else if (operation === 'question') {
        const index = this.markTexts.indexOf(input.markText as string);
        if (index < 0 || input.summary !== false) this.unexpected.push('Question input does not match selected synthetic originals');
        await route.fulfill({ headers, json: { question: questions[index], summary: null, cached: false } });
      } else if (operation === 'merge') {
        const batch = validateMergeBatch(input);
        await route.fulfill({ headers, json: { cards: [{
          highlightIds: batch.highlights.map(highlight => highlight.id),
          question: '这两条合成原文共同说明了哪些结论依据与适用条件？',
        }], cached: false } });
      }
    });
  }
}

const test = base.extend<{ native: NativeWeread }>({
  native: async ({ page }, provide) => {
    const native = new NativeWeread();
    await native.install(page);
    test.info().annotations.push({ type: 'scope', description: 'Local real Miaoda /personal/ shell and native SDK URLs, synthetic HTTP responses only; no live WeRead/Ark, owner database writes or physical iPhone acceptance.' });
    await provide(native);
    expect(native.unexpected).toEqual([]);
    expect(native.legacy).toEqual([]);
    expect(native.calls('status').length).toBeGreaterThan(0);
    expect(native.calls('status').every(call => call.accountKey === null)).toBe(true);
    // WebKit routing can rewrite request cache headers; the status response must remain uncached.
    expect(native.statusCachePolicies.length).toBeGreaterThan(0);
    expect(native.statusCachePolicies.every(policy => policy?.includes('no-store'))).toBe(true);
    expect(await page.evaluate(() => ({
      account: localStorage.getItem('recall.miaoda.personal.account.v1'),
      enabled: localStorage.getItem('recall.miaoda.personal.enabled.v1'),
    }))).toEqual({ account: storedAccount, enabled: '0' });
  },
});

async function snapshot(page: Page): Promise<RecallStateSnapshot> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null'));
}

async function open(page: Page, native: NativeWeread): Promise<void> {
  const seed = createSeedSnapshot(new Date('2026-11-13T00:00:00Z'));
  const empty = { ...seed, decks: [], cards: [], reviewLogs: [], studySessions: [],
    settings: { ...seed.settings, onboardingComplete: true, syncCode: null, syncEnabled: false } };
  await page.addInitScript(value => {
    if (location.origin !== 'http://localhost:8187' || localStorage.getItem('recall.e2e.miaoda.weread.seeded.v1')) return;
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(value));
    localStorage.setItem('recall.e2e.miaoda.weread.seeded.v1', '1');
    localStorage.setItem('recall.miaoda.personal.notice.v1', 'accepted');
    localStorage.setItem('recall.miaoda.personal.enabled.v1', '0');
    localStorage.setItem('recall.miaoda.personal.account.v1', 'b'.repeat(64));
  }, empty);
  await page.goto('./#import', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-app')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(personalPath);
  await expect.poll(() => native.calls('status').length).toBeGreaterThan(0);
  await expect(page.locator('.memory-content')).not.toContainText('正在检查微信读书授权');
}

async function importRoute(page: Page): Promise<void> {
  const drawer = page.locator('#memory-drawer');
  if (await drawer.getAttribute('aria-hidden') === 'true') await page.getByRole('button', { name: '打开项目菜单', exact: true }).click();
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  await drawer.getByRole('button', { name: '导入', exact: true }).click();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'import');
}

async function choose(page: Page, native: NativeWeread): Promise<void> {
  const entry = page.getByRole('button', { name: '导入划线', exact: true });
  await touchTarget(entry);
  await entry.click();
  const connect = page.getByRole('button', { name: '连接微信读书', exact: true });
  await touchTarget(connect);
  await connect.click();
  await expect(page.getByRole('button', { name: '妙搭空笔记书，0 条我的划线' })).toBeDisabled();
  const book = page.getByRole('button', { name: `${bookTitle}，2 条我的划线` });
  await touchTarget(book);
  await book.click();
  const next = page.getByRole('button', { name: native.capability.aiAvailable ? '下一步 · AI 问题与导入' : '下一步 · 手动整理划线', exact: true });
  await touchTarget(next);
  await next.click();
  await expect(page.getByRole('heading', { name: '让划线变成问题', exact: true })).toBeVisible();
}

async function manual(page: Page): Promise<void> {
  await page.getByRole('radio', { name: /^手动问题 \/ 保留摘录/ }).check();
  await page.getByRole('button', { name: '下一步 · 手动预览', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI 生成所选问题', exact: true })).toHaveCount(0);
}

async function editManual(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: '第 1 条划线的卡片形式', exact: true }).selectOption('qa');
  await page.getByRole('textbox', { name: '第 1 条划线的回忆提示', exact: true }).fill(manualQuestion);
  await page.getByRole('combobox', { name: '第 2 条划线的卡片形式', exact: true }).selectOption('excerpt');
}

async function complete(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '导入完成', exact: true })).toBeVisible();
}

async function touchTarget(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
}

test('owner unavailable hides online entry and never reads private books', async ({ page, native }) => {
  native.capability = { available: false, aiAvailable: false, accountKey: null };
  await open(page, native);
  const before = await snapshot(page);
  await expect(page.getByRole('button', { name: '导入划线', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '选择 Markdown 文件', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '选择带图卡片文件', exact: true })).toBeVisible();
  await expect(page.locator('.memory-content')).toContainText('当前飞书账号未获微信读书授权');
  expect(native.requests.every(request => request.operation === 'status')).toBe(true);
  expect(await snapshot(page)).toEqual(before);
});

test('available without AI imports manual QA/excerpt only after confirmation and skips duplicates without changing progress', async ({ page, native }) => {
  await open(page, native);
  await choose(page, native);
  await expect(page.getByRole('radio', { name: /^逐条生成/ })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /^智能合并/ })).toHaveCount(0);
  await manual(page);
  await editManual(page);
  expect((await snapshot(page)).cards).toEqual([]);
  await page.getByRole('button', { name: '检查导入变化', exact: true }).click();
  expect((await snapshot(page)).cards).toEqual([]);
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await complete(page);
  const imported = await snapshot(page);
  expect(imported.cards).toHaveLength(2);
  expect(imported.cards.map(card => card.back)).toEqual(originals);
  expect(imported.cards[0]).toMatchObject({ front: manualQuestion, contentKind: 'qa', sourceRef: { provider: 'weread', bookId, bookmarkId: 'synthetic-mark-1' } });
  expect(imported.cards[1]).toMatchObject({ front: '', contentKind: 'excerpt', sourceRef: { provider: 'weread', bookId, bookmarkId: 'synthetic-mark-2' } });
  await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('recall.snapshot.v1')!) as RecallStateSnapshot;
    value.cards.forEach((card, index) => Object.assign(card, {
      state: 'review', reps: 17 + index, lapses: 2, stability: 12.5, difficulty: 4.2,
      elapsedDays: 3, scheduledDays: 20, learningSteps: 0,
      lastReviewDate: '2026-11-13T00:00:00Z', nextReviewDate: '2099-01-01T00:00:00Z',
    }));
    value.cards[1].archivedAt = '2026-11-13T00:00:00Z';
    value.reviewLogs = [{ id: 'synthetic-review', cardId: value.cards[0].id, rating: 'good',
      reviewDate: '2026-11-13T00:00:00Z', stability: 12.5, difficulty: 4.2, elapsedDays: 3, scheduledDays: 20 }];
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(value));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-app')).toBeVisible();
  const progressed = await snapshot(page);
  await importRoute(page);
  await choose(page, native);
  await manual(page);
  await expect(page.getByRole('textbox', { name: '第 1 条划线的回忆提示', exact: true })).toHaveValue(manualQuestion);
  await page.getByRole('button', { name: '检查导入变化', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: '明确更新这张卡片的内容与来源', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await complete(page);
  const repeated = await snapshot(page);
  expect(repeated.cards).toEqual(progressed.cards);
  expect(repeated.decks).toEqual(progressed.decks);
  expect(repeated.reviewLogs).toEqual(progressed.reviewLogs);
  await expect(page.locator('.m-import-completion-counts > div').filter({ hasText: '跳过已有' }).locator('strong')).toHaveText('2');
  expect(native.calls('book')).toHaveLength(2);
  for (const operation of ['question', 'merge', 'budget'] as const) expect(native.calls(operation)).toEqual([]);
});

test('AI individual questions use only native budget/question routes and memory-bound account headers', async ({ page, native }) => {
  native.capability.aiAvailable = true;
  await open(page, native);
  await choose(page, native);
  expect(native.calls('question')).toEqual([]);
  expect(native.calls('budget')).toEqual([]);
  expect((await snapshot(page)).cards).toEqual([]);
  await page.getByRole('button', { name: '生成并自动导入', exact: true }).click();
  await complete(page);
  const saved = await snapshot(page);
  expect(saved.cards.map(card => card.back)).toEqual(originals);
  expect(saved.cards.map(card => card.front)).toEqual(questions);
  expect(native.calls('budget').map(call => call.input)).toEqual([{}]);
  expect(native.calls('question').map(call => call.input)).toEqual(expect.arrayContaining(originals.map(markText => ({ markText, summary: false }))));
  expect(native.calls('question')).toHaveLength(2);
  expect(native.calls('merge')).toEqual([]);
  expect(native.requests.filter(call => call.operation !== 'status').every(call => call.accountKey === accountKey)).toBe(true);
});

test('AI merge maps an ordered native batch and requires a second explicit import confirmation', async ({ page, native }) => {
  native.capability.aiAvailable = true;
  await open(page, native);
  await choose(page, native);
  await page.getByRole('radio', { name: /^智能合并/ }).check();
  await page.getByRole('button', { name: '下一步 · 合并预览', exact: true }).click();
  await expect(page.getByRole('button', { name: '生成分组与问题', exact: true })).toBeVisible();
  expect(native.calls('merge')).toEqual([]);
  await page.getByRole('button', { name: '生成分组与问题', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认导入 1 张卡片', exact: true })).toBeVisible();
  expect((await snapshot(page)).cards).toEqual([]);
  expect(native.calls('budget').map(call => call.input)).toEqual([{}]);
  expect(native.calls('merge')).toHaveLength(1);
  expect(native.calls('merge')[0].input).toMatchObject({ bookId, chapterUid: 'synthetic-chapter', chapterIdx: 1,
    highlights: native.highlights().map(highlight => ({ id: highlight.bookmarkId, markText: highlight.markText, range: highlight.range })) });
  await page.getByRole('button', { name: '确认导入 1 张卡片', exact: true }).click();
  await complete(page);
  const saved = await snapshot(page);
  expect(saved.cards).toHaveLength(1);
  expect(saved.cards[0].back).toBe(originals.join('\n\n'));
  expect(saved.cards[0].sourceRef?.highlights?.map(highlight => highlight.bookmarkId)).toEqual(['synthetic-mark-1', 'synthetic-mark-2']);
  expect(native.calls('question')).toEqual([]);
});

for (const operation of ['question', 'merge'] as const) {
  test(`AI ${operation} 503 keeps manual capability and reload never executes failed drafts automatically`, async ({ page, native }) => {
    native.capability.aiAvailable = true;
    native.failures[operation] = 503;
    await open(page, native);
    await choose(page, native);
    if (operation === 'merge') {
      await page.getByRole('radio', { name: /^智能合并/ }).check();
      await page.getByRole('button', { name: '下一步 · 合并预览', exact: true }).click();
      await page.getByRole('button', { name: '生成分组与问题', exact: true }).click();
    } else await page.getByRole('button', { name: '生成并自动导入', exact: true }).click();
    const manualName = operation === 'merge' ? '手动整理原划线' : '手动整理本机划线草稿';
    await expect(page.getByRole('button', { name: manualName, exact: true })).toBeVisible();
    await expect(page.locator('.memory-content')).toContainText('请手动整理问题或保留摘录');
    const attempts = native.calls(operation).length;
    const budgetChecks = native.calls('budget').length;
    expect(attempts).toBeGreaterThan(0);
    expect((await snapshot(page)).cards).toEqual([]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: manualName, exact: true })).toBeVisible();
    expect(native.calls(operation)).toHaveLength(attempts);
    expect(native.calls('budget')).toHaveLength(budgetChecks);
    expect((await snapshot(page)).cards).toEqual([]);
    await importRoute(page);
    await expect(page.getByRole('button', { name: '导入划线', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '导入划线', exact: true }).click();
    await page.getByRole('button', { name: manualName, exact: true }).click();
    await editManual(page);
    await page.getByRole('button', { name: '检查导入变化', exact: true }).click();
    expect((await snapshot(page)).cards).toEqual([]);
    await page.getByRole('button', { name: '确认导入', exact: true }).click();
    await complete(page);
    expect((await snapshot(page)).cards.map(card => card.back)).toEqual(originals);
    expect(native.calls(operation)).toHaveLength(attempts);
    expect(native.calls('budget')).toHaveLength(budgetChecks);
  });
}

test('native account 401 revokes capability and hides the online entry without changing library or personal binding', async ({ page, native }) => {
  native.failures.books = 401;
  await open(page, native);
  const before = await snapshot(page);
  await page.getByRole('button', { name: '导入划线', exact: true }).click();
  await page.getByRole('button', { name: '连接微信读书', exact: true }).click();
  await expect(page.locator('.memory-content')).toContainText(/登录账号发生变化或微信读书授权已失效|当前飞书账号未获微信读书授权/);
  await importRoute(page);
  await expect(page.getByRole('button', { name: '导入划线', exact: true })).toHaveCount(0);
  expect(native.calls('books')).toHaveLength(1);
  expect(await snapshot(page)).toEqual(before);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.memory-content')).toContainText('当前飞书账号未获微信读书授权');
  await expect(page.getByRole('button', { name: '导入划线', exact: true })).toHaveCount(0);
  expect(native.calls('books')).toHaveLength(1);
});

for (const aiAvailable of [false, true]) {
  test(`cancel and reload before consent do not import or run models (AI=${aiAvailable})`, async ({ page, native }) => {
    native.capability.aiAvailable = aiAvailable;
    await open(page, native);
    const before = await snapshot(page);
    await choose(page, native);
    await manual(page);
    await editManual(page);
    await page.getByRole('button', { name: '检查导入变化', exact: true }).click();
    await page.getByRole('button', { name: '返回编辑 / 重新检查', exact: true }).click();
    await page.getByRole('button', { name: '返回导入', exact: true }).click();
    const bookReads = native.calls('book').length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: '连接微信读书', exact: true })).toBeVisible();
    expect(await snapshot(page)).toEqual(before);
    expect(native.calls('book')).toHaveLength(bookReads);
    for (const operation of ['question', 'merge', 'budget'] as const) expect(native.calls(operation)).toEqual([]);
  });
}

test('manual long-text reading and preview retain safe-area clearance, no overflow and 44px controls', async ({ page, native }) => {
  native.markTexts[0] = originals[0] + '\n' + '仅用于本地验收的合成长段落，阅读滚动不应导入或改写内容。'.repeat(100);
  await open(page, native);
  await touchTarget(page.getByRole('button', { name: '导入划线', exact: true }));
  await choose(page, native);
  await touchTarget(page.locator('.wr-generation-mode').filter({ hasText: '手动问题 / 保留摘录' }));
  await manual(page);
  const before = await snapshot(page);
  await page.locator('.memory-app').evaluate(element => {
    const root = element as HTMLElement;
    root.style.setProperty('--safe-inset-top', '59px');
    root.style.setProperty('--safe-top', '59px');
    root.style.setProperty('--safe-bottom', '34px');
  });
  await page.locator('.m-original-highlight').first().scrollIntoViewIfNeeded();
  await page.locator('.memory-content').evaluate(element => element.scrollBy(0, 600));
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect.poll(() => page.locator('.memory-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await snapshot(page)).toEqual(before);
  await editManual(page);
  await page.getByRole('button', { name: '检查导入变化', exact: true }).click();
  for (const viewport of [{ width: 393, height: 852 }, { width: 320, height: 740 }, { width: 760, height: 900 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect.poll(() => page.locator('.memory-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const confirm = page.getByRole('button', { name: '确认导入', exact: true });
    await touchTarget(confirm);
    const bounds = await confirm.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    const clearance = await confirm.evaluate(element => {
      const footer = element.closest('.m-import-footer')!;
      const app = element.closest('.memory-app')!;
      return { position: getComputedStyle(footer).position, bottom: getComputedStyle(footer).bottom,
        paddingBottom: getComputedStyle(footer).paddingBottom, safeBottom: getComputedStyle(app).getPropertyValue('--safe-bottom') };
    });
    if (bounds!.y + bounds!.height > viewport.height - 34) {
      const geometry = await confirm.evaluate(element => {
        function selector(node: Element | null): string | null {
          return node ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${Array.from(node.classList).map(name => `.${name}`).join('')}` : null;
        }
        function measure(node: HTMLElement) {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return { selector: selector(node), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
            position: style.position, display: style.display, overflowX: style.overflowX, overflowY: style.overflowY,
            height: style.height, minHeight: style.minHeight, maxHeight: style.maxHeight, boxSizing: style.boxSizing,
            top: style.top, bottom: style.bottom, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
            marginTop: style.marginTop, marginBottom: style.marginBottom, transform: style.transform, contain: style.contain,
            clientHeight: node.clientHeight, offsetHeight: node.offsetHeight, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight,
            clientWidth: node.clientWidth, scrollLeft: node.scrollLeft, scrollWidth: node.scrollWidth, offsetParent: selector(node.offsetParent) };
        }
        const ancestors = [];
        let current: HTMLElement | null = element as HTMLElement;
        while (current) {
          ancestors.push(measure(current));
          if (current === document.body) break;
          current = current.parentElement;
        }
        const footer = element.closest<HTMLElement>('.m-import-footer')!;
        const footerStyle = getComputedStyle(footer);
        return { viewport: { innerWidth, innerHeight, scrollX, scrollY,
          visual: visualViewport ? { width: visualViewport.width, height: visualViewport.height, offsetTop: visualViewport.offsetTop, offsetLeft: visualViewport.offsetLeft, pageTop: visualViewport.pageTop, pageLeft: visualViewport.pageLeft, scale: visualViewport.scale } : null },
          document: { clientHeight: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight,
            scrollingElement: selector(document.scrollingElement), scrollTop: document.scrollingElement?.scrollTop },
          ancestors, footer: { ...measure(footer), flexDirection: footerStyle.flexDirection, flexWrap: footerStyle.flexWrap,
            alignItems: footerStyle.alignItems, alignContent: footerStyle.alignContent, justifyContent: footerStyle.justifyContent,
            rowGap: footerStyle.rowGap, columnGap: footerStyle.columnGap,
            buttons: Array.from(footer.querySelectorAll('button')).map(button => ({ ...measure(button), label: button.textContent?.trim(),
              flex: getComputedStyle(button).flex, alignSelf: getComputedStyle(button).alignSelf })) } };
      });
      await test.info().attach(`cta-geometry-${viewport.width}x${viewport.height}`, { body: JSON.stringify({ configuredViewport: viewport, geometry }, null, 2), contentType: 'application/json' });
    }
    expect.soft(bounds!.y + bounds!.height, `CTA clearance at ${viewport.width}x${viewport.height}: ${JSON.stringify(clearance)}`).toBeLessThanOrEqual(viewport.height - 34);
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: test.info().outputPath('synthetic-native-weread-safe-area.png'), scale: 'css' });
  expect(await snapshot(page)).toEqual(before);
  for (const operation of ['question', 'merge', 'budget'] as const) expect(native.calls(operation)).toEqual([]);
});
