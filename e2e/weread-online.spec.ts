import { test as base, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import type { WereadBook } from '../src/lib/memory-weread';
import type { Card, RecallStateSnapshot } from '../src/types';

const origin = `http://127.0.0.1:${Number(process.env.RECALL_WEREAD_PORT || 4197)}`;
const at = '2026-10-01T00:00:00.000Z';
const aiAction = 'AI 生成所选问题';
const editedQuestion = '我编辑的问题：这个结论的适用条件是什么？';
const aiSummary = '合成辅助摘要，不是划线原文。';
const longQuestion = '为什么主动回忆能检验理解？\n\n' + '先说明结论、条件和依据，再检查自己的遗漏。\n\n'.repeat(45);
const longOriginal = '  划线原文第一行。\n\n' + ('保持原文，不用问题或摘要替换。\n\n' + 'synthetic-unbroken-source-' + 'x'.repeat(160) + '\n\n').repeat(22) + '原文末尾，阅读结束。  ';

function booksFixture(count = 2, long = false): WereadBook[] {
  return [
    { bookId: 'synthetic-reading', title: '合成阅读书', author: '测试作者', highlights: Array.from({ length: count }, (_, index) => ({
      bookmarkId: `synthetic-mark-${index + 1}`,
      markText: long && index === 0 ? longOriginal : `  合成划线 ${index + 1}。\n\n第二行保持不变。  `,
      chapterUid: `synthetic-chapter-${index + 1}`,
      chapterTitle: `合成章节 ${index + 1}`,
    })) },
    { bookId: 'synthetic-thinking', title: '合成思考书', highlights: [{ bookmarkId: 'synthetic-other', markText: '仅在选中这本书后才读取。' }] },
    { bookId: 'synthetic-empty', title: '合成空书', author: '测试作者', highlights: [] },
  ];
}

function snapshotFixture(): RecallStateSnapshot {
  const seed = createSeedSnapshot(new Date(at));
  return {
    ...seed,
    decks: [], cards: [], reviewLogs: [], studySessions: [],
    settings: { ...seed.settings, onboardingComplete: true, reviewPlan: { mode: 'fixed', intervals: { again: 60000, hard: 86400000, good: 2592000000, easy: 15552000000 } } },
  };
}

function reviewedSnapshot(books: WereadBook[]): RecallStateSnapshot {
  const seed = createSeedSnapshot(new Date(at));
  const book = books[0];
  const deckId = `weread-book:${book.bookId}`;
  const cards: Card[] = book.highlights.map((highlight, index) => ({
    ...seed.cards[0],
    id: `weread:${book.bookId}:${highlight.bookmarkId}`, deckId, cardType: 'basic', contentKind: 'qa', recallKind: 'question',
    front: `已经编辑的问题 ${index + 1}？`, back: highlight.markText, hint: '', tags: [],
    bookTitle: book.title, chapter: highlight.chapterTitle,
    source: `微信读书 · ${book.title} · ${highlight.chapterTitle}`,
    sourceRef: { provider: 'weread', bookId: book.bookId, bookmarkId: highlight.bookmarkId, chapterUid: highlight.chapterUid },
    aiSummary, importedAt: at, lastImportedAt: at, createdAt: at, updatedAt: at, archivedAt: at,
    state: 'review', reps: 8 + index, lapses: 2, stability: 12.5, difficulty: 4.2,
    elapsedDays: 3, scheduledDays: 20, learningSteps: 0, lastReviewDate: at, nextReviewDate: '2027-01-01T00:00:00.000Z',
  }));
  return {
    ...snapshotFixture(),
    decks: [{ ...seed.decks[0], id: deckId, name: book.title, description: deckId, parentId: null, importedAt: at }],
    cards,
    reviewLogs: [{ id: 'synthetic-review', cardId: cards[0].id, rating: 'good', reviewDate: at, stability: 12.5, difficulty: 4.2, elapsedDays: 3, scheduledDays: 20 }],
  };
}

interface QuestionRequest { markText: string; summary: boolean; }
interface QuestionReply { question: string; summary: string | null; cached: boolean; }
interface MockReply { status?: number; body: QuestionReply | { error: string }; }

class WereadApi {
  books = booksFixture();
  shelfRequests: { cursor?: number }[] = [];
  bookRequests: { bookId: string }[] = [];
  questionRequests: QuestionRequest[] = [];
  settledQuestions = 0;
  shelfFailures = 0;
  budget = 300;
  unexpectedRequests: string[] = [];
  pageErrors: string[] = [];
  question: (request: QuestionRequest, index: number) => Promise<MockReply> = async request => ({
    body: { question: `AI 问题：${request.markText.trim().split('\n')[0]}？`, summary: request.summary ? aiSummary : null, cached: false },
  });

  async install(context: BrowserContext): Promise<void> {
    context.on('page', page => page.on('pageerror', error => this.pageErrors.push(error.message)));
    for (const page of context.pages()) page.on('pageerror', error => this.pageErrors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        this.unexpectedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort('blockedbyclient');
        return;
      }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      if (url.pathname === '/api/auth/session' && request.method() === 'GET') {
        await route.fulfill({ status: 503, json: { error: '合成本地测试，不启用云同步。' } });
        return;
      }
      if (!['/api/weread/books', '/api/weread/book', '/api/weread/budget', '/api/weread/question'].includes(url.pathname)) {
        this.unexpectedRequests.push(`${request.method()} ${url.pathname}`);
        await route.abort('blockedbyclient');
        return;
      }
      expect(request.method()).toBe('POST');
      expect(request.headers()['content-type']).toContain('application/json');
      expect(url.search).toBe('');
      const body: Record<string, unknown> = request.postDataJSON();
      if (url.pathname === '/api/weread/budget') {
        expect(body).toEqual({});
        await route.fulfill({ json: { remaining: this.budget } });
      } else if (url.pathname === '/api/weread/books') {
        expect(Object.keys(body).filter(key => key !== 'cursor')).toEqual([]);
        expect(body.cursor === undefined || body.cursor === 2).toBe(true);
        this.shelfRequests.push(body as { cursor?: number });
        if (this.shelfFailures > 0) {
          this.shelfFailures--;
          await route.fulfill({ status: 503, json: { error: '合成书架暂时不可用，请重试。' } });
          return;
        }
        const pageBooks = body.cursor === 2 ? this.books.slice(2) : this.books.slice(0, 2);
        await route.fulfill({ json: {
          books: pageBooks.map(book => ({ bookId: book.bookId, title: book.title, author: book.author, highlightCount: book.highlights.length })),
          cursor: body.cursor === 2 ? null : 2,
        } });
      } else if (url.pathname === '/api/weread/book') {
        expect(Object.keys(body)).toEqual(['bookId']);
        const book = this.books.find(candidate => candidate.bookId === body.bookId);
        expect(book, 'Only synthetic selected books may be fetched').toBeDefined();
        this.bookRequests.push(body as { bookId: string });
        await route.fulfill({ json: { format: 'recall-weread-export-v1', books: [book] } });
      } else {
        expect(Object.keys(body).sort()).toEqual(['markText', 'summary']);
        expect(typeof body.summary).toBe('boolean');
        expect(this.books.some(book => book.highlights.some(highlight => highlight.markText === body.markText))).toBe(true);
        const payload = body as unknown as QuestionRequest;
        this.questionRequests.push(payload);
        const reply = await this.question(payload, this.questionRequests.length);
        try {
          await route.fulfill({ status: reply.status ?? 200, json: reply.body });
        } catch (error) {
          if (!request.failure()) throw error;
        } finally { this.settledQuestions++; }
      }
    });
  }
}

const test = base.extend<{ api: WereadApi }>({
  api: async ({ context }, provide) => {
    const api = new WereadApi();
    await api.install(context);
    await provide(api);
    expect(api.unexpectedRequests, 'No production, cloud mutation, or unmocked API requests').toEqual([]);
    expect(api.pageErrors, 'No uncaught application errors').toEqual([]);
  },
});

async function snapshot(page: Page): Promise<RecallStateSnapshot> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1') || 'null') as RecallStateSnapshot);
}

async function boot(page: Page, data = snapshotFixture()): Promise<void> {
  await page.addInitScript(({ initial, expectedOrigin }) => {
    if (location.origin !== expectedOrigin || sessionStorage.getItem('synthetic-weread-seeded')) return;
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(initial));
    localStorage.setItem('recall.reading.font', '18');
    sessionStorage.setItem('synthetic-weread-seeded', '1');
  }, { initial: data, expectedOrigin: origin });
  await page.goto('/');
  await expect(page.locator('.memory-app')).toBeVisible();
  expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }))).toEqual({ width: 393, height: 852, dpr: 3 });
  await page.getByRole('button', { name: '导入知识', exact: true }).tap();
  await page.getByRole('button', { name: '导入划线', exact: true }).tap();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'weread');
  await page.getByRole('button', { name: '其他导入方式', exact: true }).tap();
}

async function reopen(page: Page, data?: RecallStateSnapshot): Promise<void> {
  await page.evaluate(value => {
    if (value) localStorage.setItem('recall.snapshot.v1', JSON.stringify(value));
    location.hash = 'weread';
  }, data);
  await page.reload();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'weread');
  await page.getByRole('button', { name: '其他导入方式', exact: true }).tap();
}

const draftCards = (page: Page) => page.locator('.m-weread-card');
const prompt = (page: Page, index: number) => page.getByRole('textbox', { name: `第 ${index} 条划线的回忆提示`, exact: true });
const stopAction = (page: Page) => page.getByRole('button', { name: /停止.*生成|停止$/ });

async function connect(page: Page, titles = ['合成阅读书']): Promise<void> {
  await page.getByRole('button', { name: '连接微信读书', exact: true }).tap();
  for (const title of titles) await page.getByRole('checkbox', { name: new RegExp(title) }).check();
}

async function drafts(page: Page, titles?: string[]): Promise<void> {
  await connect(page, titles);
  await page.getByRole('button', { name: '预览并编辑回忆卡', exact: true }).tap();
  await expect(prompt(page, 1)).toBeVisible();
}

async function generated(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index++) {
    await expect(draftCards(page).nth(index).getByText(/AI.*已生成|AI.*生成的问题|AI 生成/).first()).toBeVisible();
  }
  await expect(stopAction(page)).not.toBeVisible();
}

async function originals(page: Page, books: WereadBook[]): Promise<void> {
  const highlights = books.flatMap(book => book.highlights);
  await expect(draftCards(page)).toHaveCount(highlights.length);
  for (const [index, highlight] of highlights.entries()) {
    expect(await draftCards(page).nth(index).locator('.m-original-highlight p').textContent()).toBe(highlight.markText);
  }
}

async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.locator('.memory-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

async function touchTarget(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  const target = await control.evaluate(element => {
    const region = element.matches('input[type="checkbox"]') ? element.closest('label') ?? element : element;
    const bounds = region.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return { name: element.getAttribute('aria-label') ?? region.textContent?.trim().slice(0, 80), width: bounds.width, height: bounds.height, hittable: hit !== null && region.contains(hit) };
  });
  expect.soft(target.width, `${target.name}: minimum touch width`).toBeGreaterThanOrEqual(44);
  expect.soft(target.height, `${target.name}: minimum touch height`).toBeGreaterThanOrEqual(44);
  expect.soft(target.hittable, `${target.name}: touch target must not be covered by a fixed control`).toBe(true);
}

async function confirm(page: Page): Promise<void> {
  await touchTarget(page.getByRole('button', { name: '确认导入', exact: true }));
  await page.getByRole('button', { name: '确认导入', exact: true }).tap();
  await expect(page.locator('.memory-content')).toHaveAttribute('data-route', 'folders');
}

function gate() {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  return { waiting, release };
}

async function settleUI(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test('连接与分页仅获取书架，勾选后才读取所选书籍', async ({ page, api }) => {
  await boot(page);
  const before = await snapshot(page);
  const next = page.getByRole('button', { name: '预览并编辑回忆卡', exact: true });
  await touchTarget(page.getByRole('button', { name: '连接微信读书', exact: true }));
  await page.getByRole('button', { name: '连接微信读书', exact: true }).tap();
  await expect(page.getByRole('checkbox', { name: /合成阅读书/ })).toBeVisible();
  await expect(next).toBeDisabled();
  expect(api.bookRequests).toEqual([]);
  if (api.shelfRequests.length === 1) await page.getByRole('button', { name: /加载更多|更多书籍|下一页/ }).tap();
  await expect(page.getByRole('checkbox', { name: /合成空书/ })).toBeDisabled();
  expect(api.shelfRequests).toEqual([{}, { cursor: 2 }]);
  for (const title of ['合成阅读书', '合成思考书']) {
    const checkbox = page.getByRole('checkbox', { name: new RegExp(title) });
    await expect(checkbox).not.toBeChecked();
    await touchTarget(checkbox);
    await checkbox.check();
  }
  await noOverflow(page);
  expect(api.bookRequests).toEqual([]);
  await touchTarget(next);
  await next.tap();
  await expect(draftCards(page)).toHaveCount(3);
  expect(api.bookRequests.map(request => request.bookId).sort()).toEqual(['synthetic-reading', 'synthetic-thinking']);
  expect(api.questionRequests).toEqual([]);
  await originals(page, api.books.slice(0, 2));
  expect(await snapshot(page)).toEqual(before);
});

test('书架连接失败可重试，失败本身不写入卡片', async ({ page, api }) => {
  api.shelfFailures = 1;
  await boot(page);
  const before = await snapshot(page);
  await page.getByRole('button', { name: '连接微信读书', exact: true }).tap();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(api.bookRequests).toEqual([]);
  expect(await snapshot(page)).toEqual(before);
  await connect(page);
  await page.getByRole('button', { name: '预览并编辑回忆卡', exact: true }).tap();
  await expect(draftCards(page)).toHaveCount(2);
  expect(await snapshot(page)).toEqual(before);
});

test('AI 问题可编辑，确认前不落库，重复导入保留编辑与全部复习排期', async ({ page, api }) => {
  await boot(page);
  const before = await snapshot(page);
  await drafts(page);
  await page.getByRole('checkbox', { name: '同时生成辅助摘要（不是原文答案）', exact: true }).check();
  await touchTarget(page.getByRole('button', { name: aiAction, exact: true }));
  await page.getByRole('button', { name: aiAction, exact: true }).tap();
  await generated(page, 2);
  expect(api.questionRequests.map(request => request.markText)).toEqual(api.books[0].highlights.map(highlight => highlight.markText));
  await prompt(page, 1).fill(editedQuestion);
  await originals(page, [api.books[0]]);
  await noOverflow(page);
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: '检查导入变化', exact: true }).tap();
  await expect(page.getByText('新增 2，变化 0，重复 0', { exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  await confirm(page);
  const imported = await snapshot(page);
  expect(imported.cards).toHaveLength(2);
  expect(imported.decks).toHaveLength(1);
  expect(imported.decks[0]).toMatchObject({ name: '合成阅读书', parentId: null });
  for (const [index, highlight] of api.books[0].highlights.entries()) {
    const card = imported.cards.find(candidate => candidate.sourceRef?.bookmarkId === highlight.bookmarkId)!;
    expect(card.back).toBe(highlight.markText);
    expect(card.chapter).toBe(highlight.chapterTitle);
    expect(card.sourceRef).toEqual({ provider: 'weread', bookId: api.books[0].bookId, bookmarkId: highlight.bookmarkId, chapterUid: highlight.chapterUid });
    expect(card.aiSummary ?? null).toBe(api.questionRequests[index].summary ? aiSummary : null);
  }
  expect(imported.cards.find(card => card.sourceRef?.bookmarkId === 'synthetic-mark-1')?.front).toBe(editedQuestion);
  const reviewed = reviewedSnapshot(api.books);
  reviewed.cards = reviewed.cards.map((card, index) => ({ ...card, front: imported.cards.find(candidate => candidate.id === card.id)!.front, aiSummary: imported.cards[index].aiSummary }));
  await reopen(page, reviewed);
  const preserved = await snapshot(page);
  await drafts(page);
  await expect(prompt(page, 1)).toHaveValue(editedQuestion);
  expect(api.questionRequests).toHaveLength(2);
  await page.getByRole('button', { name: '检查导入变化', exact: true }).tap();
  await expect(page.getByText('新增 0，变化 0，重复 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await confirm(page);
  const repeated = await snapshot(page);
  expect(repeated.cards).toEqual(preserved.cards);
  expect(repeated.reviewLogs).toEqual(preserved.reviewLogs);
  expect(repeated.decks).toEqual(preserved.decks);
  await page.reload();
  expect((await snapshot(page)).cards).toEqual(preserved.cards);
});

test('变化项默认不更新，明确勾选才更新内容且保留编号、归档、日期与排期', async ({ page, api }) => {
  const reviewed = reviewedSnapshot(api.books);
  api.books[0].highlights[1].markText = '  新版合成原文。\n\n原文变化须明确确认。  ';
  api.question = async request => ({ body: { question: editedQuestion, summary: request.summary ? aiSummary : null, cached: true } });
  await boot(page, reviewed);
  const before = await snapshot(page);
  async function previewChange() {
    await drafts(page);
    await expect(prompt(page, 1)).toHaveValue(before.cards[0].front);
    await page.getByRole('button', { name: aiAction, exact: true }).tap();
    await expect(prompt(page, 2)).toHaveValue(editedQuestion);
    await expect(stopAction(page)).not.toBeVisible();
    await originals(page, [api.books[0]]);
    await page.getByRole('button', { name: '检查导入变化', exact: true }).tap();
    await expect(page.getByText('新增 0，变化 1，重复 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '明确更新这张卡片的内容与来源', exact: true })).not.toBeChecked();
  }
  await previewChange();
  expect(api.questionRequests.map(request => request.markText)).toEqual([api.books[0].highlights[1].markText]);
  await confirm(page);
  expect((await snapshot(page)).cards).toEqual(before.cards);
  await reopen(page);
  await previewChange();
  const update = page.getByRole('checkbox', { name: '明确更新这张卡片的内容与来源', exact: true });
  await touchTarget(update);
  await update.check();
  expect((await snapshot(page)).cards).toEqual(before.cards);
  await confirm(page);
  const after = await snapshot(page);
  expect(after.cards).toHaveLength(2);
  expect(after.cards[0]).toEqual(before.cards[0]);
  expect(after.cards[1]).toEqual({ ...before.cards[1], front: editedQuestion, back: api.books[0].highlights[1].markText, aiSummary: api.questionRequests.at(-1)!.summary ? aiSummary : undefined });
  expect(after.reviewLogs).toEqual(before.reviewLogs);
  expect(after.decks).toEqual(before.decks);
});

test('停止生成保留已完成草稿，忽略迟到响应，不自动导入部分结果', async ({ page, api }) => {
  api.books = booksFixture(6);
  const pending = gate();
  api.question = async (request, index) => {
    if (index > 1) await pending.waiting;
    return { body: { question: index === 2 ? '迟到响应，不能写回已停止草稿。' : editedQuestion, summary: null, cached: false } };
  };
  await boot(page);
  const before = await snapshot(page);
  await drafts(page);
  const secondPrompt = await prompt(page, 2).inputValue();
  try {
    await page.getByRole('button', { name: aiAction, exact: true }).tap();
    await expect.poll(() => api.questionRequests.length).toBe(5);
    await expect(prompt(page, 1)).toHaveValue(editedQuestion);
    await expect(page.getByRole('status').filter({ hasText: /已成功\s*1\s*\/\s*6/ }).first()).toBeVisible();
    await touchTarget(stopAction(page));
    await stopAction(page).tap();
    await expect(page.getByRole('button', { name: aiAction, exact: true })).toBeEnabled();
    pending.release();
    await expect.poll(() => api.settledQuestions).toBe(5);
    await settleUI(page);
    await expect(prompt(page, 2)).toHaveValue(secondPrompt);
    await expect(prompt(page, 1)).toHaveValue(editedQuestion);
    expect(api.questionRequests).toHaveLength(5);
    await originals(page, [api.books[0]]);
    expect(await snapshot(page)).toEqual(before);
    await page.getByRole('button', { name: '返回导入', exact: true }).tap();
    await page.reload();
    expect(await snapshot(page)).toEqual(before);
  } finally { pending.release(); }
});

test('部分生成失败不自动导入，错误解除后可重试并明确确认', async ({ page, api }) => {
  let fail = true;
  api.question = async request => {
    if (request.markText === api.books[0].highlights[1].markText && fail) {
      fail = false;
      return { status: 500, body: { error: '合成 AI 生成失败，可重试。' } };
    }
    return { body: { question: editedQuestion, summary: request.summary ? aiSummary : null, cached: false } };
  };
  await boot(page);
  const before = await snapshot(page);
  await drafts(page);
  const failedPrompt = await prompt(page, 2).inputValue();
  await page.getByRole('button', { name: aiAction, exact: true }).tap();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(prompt(page, 1)).toHaveValue(editedQuestion);
  await expect(prompt(page, 2)).toHaveValue(failedPrompt);
  await expect(page.getByRole('button', { name: aiAction, exact: true })).toBeEnabled();
  await originals(page, [api.books[0]]);
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: aiAction, exact: true }).tap();
  await generated(page, 2);
  await expect(prompt(page, 2)).toHaveValue(editedQuestion);
  expect(api.questionRequests.filter(request => request.markText === api.books[0].highlights[1].markText)).toHaveLength(2);
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: '检查导入变化', exact: true }).tap();
  expect(await snapshot(page)).toEqual(before);
  await confirm(page);
  expect((await snapshot(page)).cards).toHaveLength(2);
});

test('手动路径四并发乱序生成，问题仍对应原文且确认前不导入', async ({ page, api }) => {
  api.books = booksFixture(9);
  const pending = gate();
  let active = 0;
  let maximum = 0;
  api.question = async (_request, index) => {
    active++; maximum = Math.max(maximum, active);
    if (index <= 4) await pending.waiting;
    await new Promise(resolve => setTimeout(resolve, (10 - index) * 15));
    active--;
    return { body: { question: `第 ${index} 条原创划线需要回忆什么？`, summary: null, cached: false } };
  };
  await boot(page);
  const before = await snapshot(page);
  await drafts(page);
  try {
    await page.getByRole('button', { name: aiAction, exact: true }).tap();
    await expect.poll(() => api.questionRequests.length).toBe(4);
    expect(maximum).toBe(4);
    pending.release();
    await generated(page, 9);
    expect(maximum).toBe(4);
    for (let index = 1; index <= 9; index++) await expect(prompt(page, index)).toHaveValue(`第 ${index} 条原创划线需要回忆什么？`);
    expect(await snapshot(page)).toEqual(before);
    await originals(page, [api.books[0]]);
  } finally { pending.release(); }
});
test('一次 AI 操作生成全部21条，重试不重复请求且原文和手动导入边界保持', async ({ page, api }) => {
  api.books = booksFixture(21);
  await boot(page);
  const before = await snapshot(page);
  await drafts(page);
  await page.getByRole('button', { name: aiAction, exact: true }).tap();
  await generated(page, 21);
  expect(api.questionRequests).toHaveLength(21);
  expect(new Set(api.questionRequests.map(request => request.markText)).size).toBe(21);
  await expect(prompt(page, 21)).toHaveValue(`AI 问题：${api.books[0].highlights[20].markText.trim().split('\n')[0]}？`);
  await page.getByRole('button', { name: aiAction, exact: true }).tap();
  await expect(page.getByRole('status')).toContainText('没有需要生成的问题');
  expect(api.questionRequests).toHaveLength(21);
  await originals(page, [api.books[0]]);
  await noOverflow(page);
  expect(await snapshot(page)).toEqual(before);
});
test('手动路径大批量生成先检查每日额度，不足时不发送任何原文', async ({ page, api }) => {
  api.books = booksFixture(21);
  api.budget = 20;
  await boot(page);
  const before = await snapshot(page);
  await drafts(page);
  await page.getByRole('button', { name: aiAction, exact: true }).tap();
  await expect(page.getByRole('alert')).toContainText('今日最多还可尝试 20');
  expect(api.questionRequests).toEqual([]);
  expect(await snapshot(page)).toEqual(before);
  await originals(page, [api.books[0]]);
});

test('iPhone 15 长问题与原文独立滚动，安全区、触控与纵向阅读不误评分或切卡', async ({ page, context, browserName, api }) => {
  api.books = booksFixture(2, true);
  api.question = async request => ({ body: { question: editedQuestion, summary: request.summary ? aiSummary : null, cached: false } });
  await boot(page);
  await drafts(page);
  await page.getByRole('button', { name: aiAction, exact: true }).tap();
  await generated(page, 2);
  await prompt(page, 1).fill(longQuestion);
  await originals(page, [api.books[0]]);
  await noOverflow(page);
  await touchTarget(prompt(page, 1));
  await touchTarget(page.getByRole('combobox', { name: '第 1 条划线的卡片形式', exact: true }));
  await touchTarget(page.getByRole('button', { name: '检查导入变化', exact: true }));
  await page.getByRole('button', { name: '检查导入变化', exact: true }).tap();
  await noOverflow(page);
  await confirm(page);
  const before = await snapshot(page);
  expect(before.cards[0].back).toBe(longOriginal);
  await page.getByRole('button', { name: '打开项目菜单', exact: true }).tap();
  await page.locator('#memory-drawer').getByRole('button', { name: '今日复习', exact: true }).tap();
  await expect(page.locator('.memory-shell')).not.toHaveClass(/is-open/);
  await page.getByRole('button', { name: '开始复习', exact: true }).tap();
  await page.locator('.memory-app').evaluate(element => {
    (element as HTMLElement).style.setProperty('--safe-inset-top', '59px');
    (element as HTMLElement).style.setProperty('--safe-bottom', '34px');
  });
  const face = page.locator('.m-reading[data-active="true"]');
  const id = await face.getAttribute('data-card-id');
  const position = page.getByRole('progressbar', { name: '浏览位置', exact: true });
  await expect(position).toHaveAttribute('aria-valuenow', '1');
  async function scrollReading() {
    expect(await face.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    if (browserName === 'chromium') {
      const client = await context.newCDPSession(page);
      const bounds = (await face.boundingBox())!;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 70, y: bounds.y + bounds.height - 45 }] });
      for (let step = 1; step <= 8; step++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + 72, y: bounds.y + bounds.height - 45 - step * 25 }] });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await client.detach();
    } else {
      // WebKit has no CDP touch injection; exercise vertical pointer handling and scroll explicitly.
      await face.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: bounds.x + 70, clientY: bounds.y + 260 }));
        element.scrollTop = 200;
        element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: bounds.x + 72, clientY: bounds.y + 60 }));
        element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: bounds.x + 72, clientY: bounds.y + 60 }));
      });
    }
    await expect.poll(() => face.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(face).toHaveAttribute('data-card-id', id!);
    await expect(position).toHaveAttribute('aria-valuenow', '1');
    expect(await snapshot(page)).toEqual(before);
    await noOverflow(page);
  }
  await scrollReading();
  await expect(page.getByRole('button', { name: '显示答案', exact: true })).toBeVisible();
  await touchTarget(page.getByRole('button', { name: '显示答案', exact: true }));
  await page.getByRole('button', { name: '显示答案', exact: true }).tap();
  await expect(face).toHaveAttribute('aria-label', '卡片正文');
  expect(await face.evaluate(element => element.scrollTop)).toBe(0);
  await scrollReading();
  const footerBounds = (await page.locator('.m-study-footer').boundingBox())!;
  const faceBounds = (await face.boundingBox())!;
  expect(faceBounds.y + faceBounds.height).toBeLessThanOrEqual(footerBounds.y + 1);
  for (const rating of ['again', 'hard', 'good', 'easy']) {
    const control = page.locator(`[data-rating="${rating}"]`);
    await touchTarget(control);
    const bounds = (await control.boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(852 - 34 + 1);
  }
  await face.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(face.getByText('原文末尾，阅读结束。', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('weread-long-reading-safe-area.png'), scale: 'css' });
  expect(await snapshot(page)).toEqual(before);
  await page.reload();
  expect(await snapshot(page)).toEqual(before);
});
