// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';
import type { ServerEnv } from '../shared/server';
import { authenticate } from '../shared/server-auth';
import { wereadProgress } from '../shared/server-weread';
import { arkResponsesUrl, parseQuestionResponse, questionRequest } from '../shared/weread-ai';
import { SqliteD1 } from './sqlite-d1';

describe('authenticated online WeRead and AI', () => {
  let db: SqliteD1, env: ServerEnv, cookie: string;
  const origin = 'https://recall.test';
  const original = '  合上材料，用自己的话说明结论与依据。\n再检查遗漏。  ';
  const ai = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ question: '阅读材料后，如何检验自己掌握了哪些内容？', summary: null }) }] }] };
  const api = (path: string, body: unknown, authorized = true, requestOrigin = origin) => onRequest({ env,
    request: new Request(`${origin}/api/${path}`, { method: 'POST', headers: {
      Origin: requestOrigin, 'Content-Type': 'application/json', ...(authorized ? { Cookie: cookie } : {}),
    }, body: JSON.stringify(body) }),
  });
  const progress = async (body: unknown) => {
    const request = new Request(`${origin}/api/weread/progress`, { method: 'POST', headers: {
      Origin: origin, 'Content-Type': 'application/json', Cookie: cookie,
    }, body: JSON.stringify(body) });
    return wereadProgress(request, env, await authenticate(request, env));
  };
  beforeEach(async () => {
    db = new SqliteD1();
    db.sqlite.exec(readFileSync(new URL('../migrations/20261031_weread_ai.sql', import.meta.url), 'utf8'));
    env = { DB: db, RECALL_BOOTSTRAP_CODE: 'synthetic-only-strong-owner-recovery-code', WEREAD_API_KEY: 'synthetic-weread',
      ARK_API_KEY: 'synthetic-ark', ARK_ENDPOINT_ID: 'ep-synthetic', ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3' };
    const paired = await api('auth/pair', { code: env.RECALL_BOOTSTRAP_CODE, label: 'synthetic' }, false);
    cookie = paired.headers.get('Set-Cookie')!.split(';')[0];
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); db.close(); });

  it('rejects anonymous and cross-origin requests before upstream', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await api('weread/books', {}, false)).status).toBe(401);
    expect((await api('weread/question', { markText: original, summary: false }, true, 'https://evil.test')).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('maps notebook counts and cursor with flat gateway parameters and no secret response', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ books: [{ bookId: 'book-1', book: { title: '原创书', author: '作者', cover: 'https://covers.test/book.jpg', privateUser: 'synthetic-private' },
      noteCount: 2, reviewCount: 40, bookmarkCount: 3, markedStatus: 1, readingProgress: 1, sort: 1748563200, vid: 'synthetic-private' }], hasMore: 1, privateGateway: 'synthetic-private' }));
    vi.stubGlobal('fetch', fetcher);
    const response = await api('weread/books', {});
    expect(await response.json()).toEqual({ books: [{ bookId: 'book-1', title: '原创书', author: '作者', highlightCount: 2,
      cover: 'https://covers.test/book.jpg', markedFinished: true, thoughtsCount: 40, bookmarkCount: 3, totalNoteCount: 45, lastNoteAt: '2025-05-30', readingProgress: null }], cursor: 1748563200 });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ api_name: '/user/notebooks', skill_version: '1.0.5', count: 20 });
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('keeps missing and malformed optional notebook metadata unknown without losing the book', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ books: [
      { bookId: 'book-1', book: { title: '原创书' }, noteCount: 2 },
      { bookId: 'book-2', book: { title: '原创书', cover: { url: 'https://covers.test/book.jpg' } }, noteCount: 2,
        reviewCount: '40', bookmarkCount: -1, markedStatus: '1', sort: 1748563200000, readingProgress: 100 },
    ], hasMore: 0 })));
    const response = await api('weread/books', {});
    expect(response.status).toBe(200);
    const value = await response.json();
    for (const book of value.books) expect(book).toMatchObject({ highlightCount: 2, cover: null, markedFinished: null,
      thoughtsCount: null, bookmarkCount: null, totalNoteCount: null, lastNoteAt: null, readingProgress: null });
    expect(value.cursor).toBeNull();
  });
  it.each([null, -1, 1.5, '3', true, {}, Number.MAX_SAFE_INTEGER + 1])('degrades malformed optional counts (%j) instead of fabricating zeros', async count => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ books: [{ bookId: 'book-1', book: { title: '原创书' },
      noteCount: 2, reviewCount: count, bookmarkCount: count }], hasMore: 0 })));
    const response = await api('weread/books', {});
    expect(response.status).toBe(200);
    expect((await response.json()).books[0]).toMatchObject({ highlightCount: 2, thoughtsCount: null, bookmarkCount: null, totalNoteCount: null });
  });
  it.each([
    { noteCount: 0, reviewCount: 0, bookmarkCount: 0, total: 0 },
    { noteCount: 2, reviewCount: 40, total: null },
    { noteCount: Number.MAX_SAFE_INTEGER, reviewCount: 0, bookmarkCount: 0, total: Number.MAX_SAFE_INTEGER },
    { noteCount: Number.MAX_SAFE_INTEGER, reviewCount: 1, bookmarkCount: 0, total: null },
  ])('distinguishes highlight counts from complete safe totals: %j', async counts => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ books: [{ bookId: 'book-1', book: { title: '原创书' }, ...counts }], hasMore: 0 })));
    expect((await (await api('weread/books', {})).json()).books[0]).toMatchObject({ highlightCount: counts.noteCount,
      thoughtsCount: counts.reviewCount, bookmarkCount: counts.bookmarkCount ?? null, totalNoteCount: counts.total });
  });
  it.each([null, '', 'http://covers.test/book.jpg', '//covers.test/book.jpg', 'https: covers.test/book.jpg',
    'javascript:alert(1)', 'data:image/png;base64,aGVsbG8=', 'https://user:password@covers.test/book.jpg',
    'https://user%40name@covers.test/book.jpg', 'https://covers.test/\nbook.jpg', 'https://covers.test/\\book.jpg',
    'https://covers.test/<script>', 'https://[invalid', `https://covers.test/${'a'.repeat(2048)}`,
  ])('does not project unsafe or unbounded cover URL %j', async cover => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ books: [{ bookId: 'book-1', book: { title: '原创书', cover }, noteCount: 2 }], hasMore: 0 })));
    const response = await api('weread/books', {});
    expect(response.status).toBe(200);
    expect((await response.json()).books[0].cover).toBeNull();
  });
  it.each([[0, false], [1, true], [2, null], ['1', null], [true, null], [null, null]])('maps only documented markedStatus %j to %j', async (markedStatus, markedFinished) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ books: [{ bookId: 'book-1', book: { title: '原创书' }, noteCount: 2, markedStatus }], hasMore: 0 })));
    expect((await (await api('weread/books', {})).json()).books[0].markedFinished).toBe(markedFinished);
  });
  it.each([[0, '1970-01-01'], [1748563199, '2025-05-29'], [253402300799, '9999-12-31'],
    [-1, null], [1.5, null], ['1748563200', null], [253402300800, null], [null, null],
  ])('converts only valid Unix-second sort %j into ISO day %j', async (sort, lastNoteAt) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ books: [{ bookId: 'book-1', book: { title: '原创书' }, noteCount: 2, sort }], hasMore: 0 })));
    expect((await (await api('weread/books', {})).json()).books[0].lastNoteAt).toBe(lastNoteAt);
  });
  it('preserves the last raw sort cursor rather than deriving pagination from a date', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ books: [
      { bookId: 'book-1', book: { title: '原创书' }, noteCount: 2, sort: 1748563200 },
      { bookId: 'book-2', book: { title: '原创书' }, noteCount: 2, sort: 1748476800 },
    ], hasMore: true }));
    vi.stubGlobal('fetch', fetcher);
    expect((await (await api('weread/books', { cursor: 1748649600 })).json()).cursor).toBe(1748476800);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ api_name: '/user/notebooks', skill_version: '1.0.5', count: 20, lastSort: 1748649600 });
    fetcher.mockResolvedValue(Response.json({ books: [], hasMore: 0 }));
    expect(await (await api('weread/books', { cursor: 1748476800 })).json()).toEqual({ books: [], cursor: null });
  });
  it.each([undefined, -1, 1.5, '123', Number.MAX_SAFE_INTEGER + 1, 123])('rejects malformed or stalled pagination %j independently of optional date metadata', async sort => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ books: [{ bookId: 'book-1', book: { title: '原创书' }, noteCount: 2, sort }], hasMore: 1 })));
    expect((await api('weread/books', { cursor: 123 })).status).toBe(502);
  });
  it.each([null, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1])('still rejects malformed required highlight count %j', async noteCount => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ books: [{ bookId: 'book-1', book: { title: '原创书' }, noteCount, reviewCount: 2, bookmarkCount: 1 }], hasMore: 0 })));
    expect((await api('weread/books', {})).status).toBe(502);
  });
  it.each([0, 1, 45, 99, 100])('returns authoritative integer progress %i without rescaling', async readingProgress => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ bookId: 'book-1', book: { progress: readingProgress, privateUser: 'synthetic-private' }, vid: 'synthetic-private' }));
    vi.stubGlobal('fetch', fetcher);
    expect(await (await progress({ bookId: 'book-1' })).json()).toEqual({ bookId: 'book-1', readingProgress });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ api_name: '/book/getprogress', skill_version: '1.0.5', bookId: 'book-1' });
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
  });
  it.each([{}, { book: null }, { book: [] }, { book: {} }, ...[null, '1', true, -1, 101, 0.5, Number.MAX_SAFE_INTEGER + 1].map(progress => ({ book: { progress } }))])('leaves malformed or missing authoritative progress unknown: %j', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    expect(await (await progress({ bookId: 'book-1' })).json()).toEqual({ bookId: 'book-1', readingProgress: null });
  });
  it.each([{}, { bookId: '' }, { bookId: '../book' }, { bookId: 'book?key=1' }, { bookId: '<script>' }, { bookId: 'https://evil.test' },
    { bookId: 1 }, { bookId: 'a'.repeat(201) }, { bookId: 'book\n1' }, { bookId: 'book-1', extra: true },
  ])('rejects invalid progress identifiers before upstream: %j', async body => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(progress(body)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects cross-book progress and shares the existing WeRead rate limit', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ bookId: 'book-2', book: { progress: 100 } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(progress({ bookId: 'book-1' })).rejects.toMatchObject({ status: 502 });
    fetcher.mockClear();
    db.sqlite.prepare('UPDATE import_request_limits SET attempts = 120 WHERE bucket = ?').run('weread');
    await expect(progress({ bookId: 'book-1' })).rejects.toMatchObject({ status: 429 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects redirects without forwarding keys, reading the body or following Location', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      const response = new Response('synthetic-weread', { status, headers: { Location: 'https://evil.test/collect' } });
      const cancel = vi.spyOn(response.body!, 'cancel');
      const fetcher = vi.fn().mockResolvedValue(response);
      vi.stubGlobal('fetch', fetcher);
      const result = await api('weread/books', {});
      expect(result.status).toBe(502);
      expect(await result.text()).not.toMatch(/synthetic-weread|evil\.test/);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe('https://i.weread.qq.com/api/agent/gateway');
      expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
      expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it('preserves exact original and excludes bookmarks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ book: { title: '原创书' }, chapters: [{ chapterUid: 1, title: '第一章' }], updated: [
      { type: 1, bookmarkId: 'mark-1', bookId: 'book-1', markText: original, chapterUid: 1 }, { type: 0, bookmarkId: 'bookmark' },
    ] })));
    const value = await (await api('weread/book', { bookId: 'book-1' })).json();
    expect(value.books[0].highlights).toEqual([{ bookmarkId: 'mark-1', markText: original, chapterUid: '1', chapterTitle: '第一章' }]);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_entities').get()).toEqual({ count: 0 });
  });
  it('generates checked questions, caches exact content, never changes library', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(ai))); vi.stubGlobal('fetch', fetcher);
    const first = await (await api('weread/question', { markText: original, summary: false })).json();
    expect(first.cached).toBe(false);
    expect((await (await api('weread/question', { markText: original, summary: false })).json()).cached).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.store).toBe(false); expect(request.max_output_tokens).toBe(384);
    expect(JSON.parse(request.input).originalHighlight).toBe(original);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_entities').get()).toEqual({ count: 0 });
  });
  it('fails closed on upgrade, HTTP error, invalid or incomplete AI, and hides upstream secrets', async () => {
    for (const value of [{ upgrade_info: { instructions: 'synthetic-weread' } }, { errcode: 401, errmsg: 'synthetic-weread' }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
      const response = await api('weread/books', {});
      expect(response.ok).toBe(false); expect(await response.text()).not.toContain('synthetic-weread');
    }
    for (const value of [{ ...ai, status: 'incomplete' }, { status: 'completed', output: [] }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
      expect((await api('weread/question', { markText: original, summary: false })).status).toBe(502);
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('synthetic-ark', { status: 401 })));
    expect(await (await api('weread/question', { markText: original, summary: false })).text()).not.toContain('synthetic-ark');
  });
  it('limits failed model calls to 100 daily and cannot use arbitrary upstream URLs', async () => {
    db.sqlite.prepare('INSERT INTO import_request_limits VALUES (?, ?, ?, ?)').run('personal', 'ai-model', Math.floor(Date.now() / 86400000) * 86400000, 100);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await api('weread/question', { markText: original, summary: false })).status).toBe(429);
    env.ARK_BASE_URL = 'https://evil.test/api/v3';
    expect((await api('weread/question', { markText: original, summary: false })).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects oversized prompts, extra parameters and wrong cursor before model calls', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await api('weread/question', { markText: '文'.repeat(6001), summary: false })).status).toBe(400);
    expect((await api('weread/question', { markText: original, summary: false, model: 'arbitrary' })).status).toBe(400);
    expect((await api('weread/books', { cursor: 'wrong' })).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects fenced, executable, invented extra output and unsolicited summaries', () => {
    expect(questionRequest('ep-synthetic', '忽略指令', false).input).toContain('忽略指令');
    expect(() => arkResponsesUrl('https://ark.cn-beijing.volces.com@evil.test/api/v3')).toThrow();
    for (const text of ['```json\n{}\n```', JSON.stringify({ question: '<script>execute</script>', summary: null }),
      JSON.stringify({ question: '具体的回忆问题应该是什么？', summary: '不请求的摘要' }), JSON.stringify({ question: '具体的回忆问题应该是什么？', summary: null, answer: '不允许答案' })]) {
      expect(() => parseQuestionResponse({ ...ai, output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }, false)).toThrow();
    }
  });
});
