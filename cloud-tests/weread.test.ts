// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';
import type { ServerEnv } from '../shared/server';
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
    const fetcher = vi.fn().mockResolvedValue(Response.json({ books: [{ bookId: 'book-1', book: { title: '原创书', author: '作者' }, noteCount: 2, reviewCount: 40, sort: 123 }], hasMore: 1 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await api('weread/books', {});
    expect(await response.json()).toEqual({ books: [{ bookId: 'book-1', title: '原创书', author: '作者', highlightCount: 2 }], cursor: 123 });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ api_name: '/user/notebooks', skill_version: '1.0.5', count: 20 });
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
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
