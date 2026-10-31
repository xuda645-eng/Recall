import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';
import type { ServerEnv } from '../shared/server';
import { arkResponsesUrl } from '../shared/weread-ai';
import { SqliteD1 } from './sqlite-d1';

describe('private WeRead budget preflight', () => {
  let db: SqliteD1;
  let env: ServerEnv;
  let cookie: string;
  const origin = 'https://recall.test';
  const api = (path: string, body: unknown, authenticated = true, requestOrigin = origin) => onRequest({ env, request: new Request(`${origin}/api/${path}`, { method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) }) });
  const day = 86400000;
  const now = Date.parse('2026-11-01T08:00:00Z');
  const windowStart = Math.floor(now / day) * day;
  const seed = (attempts: unknown, space = 'synthetic-budget-space', bucket = 'ai-model', start = windowStart) => {
    db.sqlite.prepare('INSERT INTO import_request_limits VALUES (?, ?, ?, ?)').run(space, bucket, start, attempts as number);
  };
  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.stubGlobal('fetch', vi.fn());
    db = new SqliteD1();
    db.sqlite.exec(readFileSync(new URL('../migrations/20261031_weread_ai.sql', import.meta.url), 'utf8'));
    env = { DB: db, RECALL_SPACE_ID: 'synthetic-budget-space', RECALL_BOOTSTRAP_CODE: 'synthetic-owner-only-recovery-code', ARK_API_KEY: 'synthetic-key', ARK_ENDPOINT_ID: 'ep-test', ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3' };
    const response = await api('auth/pair', { code: env.RECALL_BOOTSTRAP_CODE, label: 'test' }, false);
    cookie = response.headers.get('Set-Cookie')!.split(';')[0];
  });
  afterEach(() => { expect(fetch).not.toHaveBeenCalled(); db.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('requires device auth and same origin, returns no credentials or model calls', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await api('weread/budget', {}, false)).status).toBe(401);
    expect((await api('weread/budget', {}, true, 'https://evil.test')).status).toBe(403);
    expect(await (await api('weread/budget', {})).json()).toEqual({ remaining: 100 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects arbitrary bodies and missing configured service', async () => {
    expect((await api('weread/budget', { key: 'forbidden' })).status).toBe(400);
    env.ARK_API_KEY = undefined;
    expect((await api('weread/budget', {})).status).toBe(503);
  });
  it.each([0, 1, 37, 99, 100, 101, Number.MAX_SAFE_INTEGER])('returns a bounded integer remainder for %i attempts', async attempts => {
    seed(attempts);
    expect(await (await api('weread/budget', {})).json()).toEqual({ remaining: Math.max(0, 100 - attempts) });
  });
  it.each([-1, 0.5, 'bad-count', Number.MAX_SAFE_INTEGER + 1])('fails closed on invalid persisted count %j', async attempts => {
    seed(attempts);
    const response = await api('weread/budget', {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Service unavailable' });
  });
  it('reads only the authenticated space, model bucket and current UTC day without reserving or pruning', async () => {
    seed(11);
    seed(100, 'other-space');
    seed(100, undefined, 'ai-request');
    seed(100, undefined, 'weread');
    seed(100, undefined, undefined, windowStart - day);
    seed(100, undefined, undefined, windowStart + day);
    const before = db.sqlite.prepare('SELECT * FROM import_request_limits ORDER BY space_id, bucket, window_start').all();
    db.executedStatements.length = 0;
    const first = await api('weread/budget', {});
    const second = await api('weread/budget', {});
    expect(await first.json()).toEqual({ remaining: 89 });
    expect(await second.json()).toEqual({ remaining: 89 });
    expect(db.executedStatements).toEqual([]);
    expect(db.sqlite.prepare('SELECT * FROM import_request_limits ORDER BY space_id, bucket, window_start').all()).toEqual(before);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_entities').get()).toEqual({ count: 0 });
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM import_question_cache').get()).toEqual({ count: 0 });
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect(first.headers.get('Pragma')).toBe('no-cache');
    expect(first.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('uses the same UTC window as the model limiter on rollover', async () => {
    seed(100);
    vi.spyOn(Date, 'now').mockReturnValue(windowStart + day - 1);
    expect(await (await api('weread/budget', {})).json()).toEqual({ remaining: 0 });
    vi.spyOn(Date, 'now').mockReturnValue(windowStart + day);
    expect(await (await api('weread/budget', {})).json()).toEqual({ remaining: 100 });
    seed(2, undefined, undefined, windowStart + day);
    expect(await (await api('weread/budget', {})).json()).toEqual({ remaining: 98 });
  });
  it.each(['ARK_API_KEY', 'ARK_ENDPOINT_ID', 'ARK_BASE_URL'] as const)('does not report budget without %s', async key => {
    env[key] = undefined;
    expect((await api('weread/budget', {})).status).toBe(503);
  });
  it.each(['https://evil.test/api/v3', 'http://ark.cn-beijing.volces.com/api/v3',
    'https://ark.cn-beijing.volces.com@evil.test/api/v3', 'https://user:password@ark.cn-beijing.volces.com/api/v3',
    'https://ark.cn-beijing.volces.com/api/v3?key=synthetic-key', 'https://ark.cn-beijing.volces.com/api/v3#fragment',
    'https://ark.cn-beijing.volces.com/api/v4', 'not-a-url',
  ])('matches model URL validation without leaking configuration: %s', async base => {
    expect(() => arkResponsesUrl(base)).toThrow();
    env.ARK_BASE_URL = base;
    const response = await api('weread/budget', {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'AI 连接配置无效' });
  });
  it.each([null, [], 0, 'budget', { spaceId: 'other-space' }, { remaining: 100 }, { model: 'other-model' }])('rejects body %j', async body => {
    expect((await api('weread/budget', body)).status).toBe(400);
  });
  it('rejects missing origin, duplicate/revoked cookies and a cookie from another space', async () => {
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    expect((await onRequest({ env, request: new Request(`${origin}/api/weread/budget`, { method: 'POST', headers, body: '{}' }) })).status).toBe(403);
    expect((await onRequest({ env, request: new Request(`${origin}/api/weread/budget`, { method: 'POST', headers: { ...headers, Origin: origin, Cookie: `${cookie}; ${cookie}` }, body: '{}' }) })).status).toBe(401);
    env.RECALL_SPACE_ID = 'other-space';
    expect((await api('weread/budget', {})).status).toBe(401);
    env.RECALL_SPACE_ID = 'synthetic-budget-space';
    db.sqlite.prepare('UPDATE trusted_devices SET revoked_at = ?').run(now);
    expect((await api('weread/budget', {})).status).toBe(401);
  });
  it.each(['GET', 'HEAD', 'OPTIONS'])('does not expose the budget through %s', async method => {
    const response = await onRequest({ env, request: new Request(`${origin}/api/weread/budget`, { method, headers: { Cookie: cookie } }) });
    expect(response.status).toBe(404);
  });
  it.each([
    ['{}', 'text/plain', 415],
    ['{', 'application/json', 400],
    [`{"extra":"${'a'.repeat(1024)}"}`, 'application/json', 413],
  ])('enforces bounded JSON parsing', async (body, contentType, status) => {
    const response = await onRequest({ env, request: new Request(`${origin}/api/weread/budget`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': contentType as string }, body: body as string }) });
    expect(response.status).toBe(status);
  });
  it('hides storage failure details and performs no upstream requests on every budget path', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    db.beforeFirst = async query => { if (query.includes('import_request_limits')) throw new Error('synthetic-key private-storage-detail'); };
    const response = await api('weread/budget', {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Service unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
