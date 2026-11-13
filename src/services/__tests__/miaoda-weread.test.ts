import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backendFetch, installBackendTransport, type BackendTransport } from '../../../shared/client-http';
import { fetchWeread, forwardMiaodaWeread, installMiaodaWeread, useMiaodaWeread } from '../miaoda-weread';
import { generateWereadMerge, generateWereadQuestion, loadOnlineBooks } from '../weread-online';
import { checkWereadBudget } from '../weread-job-storage';
import type { MergeBatch } from '../../../shared/weread-merge';
import type { WereadCapabilityStatus } from '../../../shared/weread-api';

const accountKey = 'a'.repeat(64);
const status: WereadCapabilityStatus = { available: true, aiAvailable: true, accountKey };
const mergeBatch: MergeBatch = { bookId: 'synthetic-book', chapterUid: 'chapter-1', chapterIdx: 1, highlights: [
  { id: 'mark-1', markText: '  Synthetic first original.\n  ', range: '0-20' },
  { id: 'mark-2', markText: 'Synthetic second original.', range: '30-20' },
] };
const mergeCards = [{ highlightIds: ['mark-1', 'mark-2'], question: 'Which original observations support this conclusion?' }];
let stop: (() => void) | undefined;
let remove: (() => void) | undefined;

function start(peer: BackendTransport): void {
  remove = installBackendTransport((endpoint, options) => forwardMiaodaWeread(endpoint, options, peer)
    || Promise.resolve(Response.json({ error: 'Isolated' }, { status: 503 })));
  stop = installMiaodaWeread();
}
async function ready(): Promise<void> {
  await vi.waitFor(() => expect(useMiaodaWeread.getState().phase).toBe('ready'));
}
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(finish => { resolve = finish; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubEnv('VITE_RECALL_MIAODA_LEARNING', '1');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No real API allowed')));
});
afterEach(() => { stop?.(); remove?.(); stop = undefined; remove = undefined; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('mounted Miaoda WeRead capability', () => {
  it('loads an uncached owner capability without reading or changing personal storage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const peer = vi.fn().mockResolvedValue(Response.json(status));
    start(peer);
    expect(useMiaodaWeread.getState().phase).toBe('loading');
    await ready();
    expect(peer).toHaveBeenCalledWith('/api/recall/weread/status', expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }));
    expect(useMiaodaWeread.getState()).toMatchObject(status);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    stop?.();
    expect(useMiaodaWeread.getState()).toMatchObject({ phase: 'disabled', available: false, accountKey: null });
  });

  it.each([
    { available: false, aiAvailable: false, accountKey: null },
    { available: false, aiAvailable: true, accountKey: null },
    { available: false, aiAvailable: false, accountKey },
    { ...status, accountKey: null }, { ...status, accountKey: 'bad' }, { ...status, accountKey: 'A'.repeat(64) },
    { ...status, aiAvailable: 'true' }, null,
  ])('denies unavailable or invalid status %j before reading any book', async value => {
    const peer = vi.fn().mockResolvedValue(Response.json(value));
    start(peer);
    await vi.waitFor(() => expect(useMiaodaWeread.getState().phase).toBe('unavailable'));
    await expect(loadOnlineBooks(null, new AbortController().signal)).rejects.toThrow('当前飞书账号');
    expect(useMiaodaWeread.getState().accountKey).toBeNull();
    expect(peer).toHaveBeenCalledTimes(1);
  });

  it('keeps loading isolated and ignores a late status response after unmount and remount', async () => {
    const pending = deferred<Response>();
    const peer = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(Response.json(status));
    start(peer);
    await expect(loadOnlineBooks(null, new AbortController().signal)).rejects.toThrow('正在检查');
    stop?.();
    stop = installMiaodaWeread();
    await ready();
    pending.resolve(Response.json({ ...status, accountKey: 'b'.repeat(64) }));
    await pending.promise;
    await Promise.resolve();
    expect(useMiaodaWeread.getState().accountKey).toBe(accountKey);
  });

  it('rechecks on focus, denies changed owners, and never adopts a new account into storage', async () => {
    const peer = vi.fn().mockResolvedValueOnce(Response.json(status)).mockResolvedValue(Response.json({ ...status, accountKey: 'b'.repeat(64) }));
    start(peer);
    await ready();
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(useMiaodaWeread.getState().phase).toBe('unavailable'));
    expect(useMiaodaWeread.getState().error).toContain('登录账号发生变化');
    expect(useMiaodaWeread.getState().accountKey).toBeNull();
  });

  it.each([401, 403, 409])('revokes capability on owner/auth failure %i without exposing server errors', async code => {
    const peer = vi.fn().mockResolvedValueOnce(Response.json(status)).mockResolvedValue(Response.json({ error: 'Synthetic private detail' }, { status: code }));
    start(peer);
    await ready();
    await expect(loadOnlineBooks(null, new AbortController().signal)).rejects.toThrow('登录账号发生变化');
    expect(useMiaodaWeread.getState()).toMatchObject({ available: false, accountKey: null });
    expect(useMiaodaWeread.getState().error).not.toContain('Synthetic private');
  });

  it('rejects late private responses from a stopped mount', async () => {
    const pending = deferred<Response>();
    const peer = vi.fn().mockResolvedValueOnce(Response.json(status)).mockReturnValueOnce(pending.promise);
    start(peer);
    await ready();
    const request = loadOnlineBooks(null, new AbortController().signal);
    const rejected = expect(request).rejects.toThrow('登录账号发生变化');
    stop?.();
    pending.resolve(Response.json({ books: [], cursor: null }));
    await rejected;
  });

  it('rejects an optional response account header belonging to another owner', async () => {
    const peer = vi.fn().mockResolvedValueOnce(Response.json(status)).mockResolvedValue(Response.json({ books: [], cursor: null }, { headers: { 'X-Recall-Account-Key': 'b'.repeat(64) } }));
    start(peer);
    await ready();
    await expect(loadOnlineBooks(null, new AbortController().signal)).rejects.toThrow('登录账号发生变化');
    expect(useMiaodaWeread.getState().available).toBe(false);
  });

  it('does not bootstrap or bypass guards in a local synthetic preview', async () => {
    vi.stubEnv('VITE_RECALL_MIAODA_LEARNING', '0');
    vi.stubEnv('VITE_RECALL_LOCAL_PREVIEW', '1');
    const peer = vi.fn();
    start(peer);
    await expect(loadOnlineBooks(null, new AbortController().signal)).rejects.toThrow('本地隔离预览');
    await expect(checkWereadBudget(1, new AbortController().signal)).rejects.toThrow('本地隔离预览');
    expect(peer).not.toHaveBeenCalled();
  });
});

describe('exact mounted route and budget mapping', () => {
  it.each(['books', 'book', 'progress', 'question', 'merge', 'budget'] as const)('forwards only the account-bound POST %s route', async route => {
    const peer = vi.fn().mockImplementation(async endpoint => Response.json(endpoint.endsWith('/status') ? status : { synthetic: true }));
    start(peer);
    await ready();
    const input = { synthetic: 'unchanged JSON' };
    await fetchWeread(route, input, new AbortController().signal);
    expect(peer).toHaveBeenLastCalledWith(`/api/recall/weread/${route}`, expect.objectContaining({ method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json', 'X-Recall-Account-Key': accountKey } }));
    const count = peer.mock.calls.length;
    for (const endpoint of [`/api/recall/weread/${route}?extra=1`, `/api/recall/weread/${route}/`, '/api/weread/books', '/api/recall/weread/gateway', '/api/sync']) {
      expect((await backendFetch(endpoint, { method: 'POST' })).status).toBe(503);
    }
    expect((await backendFetch(`/api/recall/weread/${route}`, { method: 'GET' })).status).toBe(503);
    expect((await backendFetch(`/api/recall/weread/${route}`, { method: 'POST', headers: { 'X-Recall-Account-Key': 'b'.repeat(64) } })).status).toBe(403);
    expect(peer).toHaveBeenCalledTimes(count);
  });

  it('allows text reads but blocks all model/budget routes when AI is unavailable', async () => {
    const peer = vi.fn().mockImplementation(async endpoint => Response.json(endpoint.endsWith('/status') ? { ...status, aiAvailable: false } : { books: [], cursor: null }));
    start(peer);
    await ready();
    await expect(loadOnlineBooks(null, new AbortController().signal)).resolves.toEqual({ books: [], cursor: null });
    await expect(generateWereadQuestion('Synthetic text', false, new AbortController().signal)).rejects.toThrow('AI 尚未配置');
    await expect(fetchWeread('merge', {}, new AbortController().signal)).rejects.toThrow('AI 尚未配置');
    await expect(generateWereadMerge(mergeBatch, new AbortController().signal)).rejects.toThrow('AI 尚未配置');
    await expect(checkWereadBudget(1, new AbortController().signal)).rejects.toThrow('AI 尚未配置');
    expect(peer).toHaveBeenCalledTimes(2);
  });

  it('checks the same 300-attempt budget on the native route before model calls', async () => {
    const peer = vi.fn().mockImplementation(async endpoint => Response.json(endpoint.endsWith('/status') ? status : { remaining: 300 }));
    start(peer);
    await ready();
    await checkWereadBudget(300, new AbortController().signal);
    expect(peer).toHaveBeenLastCalledWith('/api/recall/weread/budget', expect.objectContaining({ body: '{}', method: 'POST' }));
    await expect(checkWereadBudget(301, new AbortController().signal)).rejects.toThrow('今日最多还可尝试 300');
  });
});

describe('native merge capability and original preservation', () => {
  it('sends a validated ordered batch through the native account-bound route and validates the complete partition', async () => {
    const peer = vi.fn().mockImplementation(async endpoint => Response.json(endpoint.endsWith('/status') ? status : { cards: mergeCards, cached: false }));
    start(peer);
    await ready();
    const input = structuredClone(mergeBatch);
    await expect(generateWereadMerge(input, new AbortController().signal)).resolves.toEqual(mergeCards);
    expect(input).toEqual(mergeBatch);
    expect(peer).toHaveBeenLastCalledWith('/api/recall/weread/merge', expect.objectContaining({
      method: 'POST', body: JSON.stringify(mergeBatch), headers: { 'Content-Type': 'application/json', 'X-Recall-Account-Key': accountKey },
    }));
    expect(peer).toHaveBeenCalledTimes(2);
  });

  it.each([
    { cards: [{ highlightIds: ['mark-1'], question: mergeCards[0].question }] },
    { cards: [{ highlightIds: ['mark-2', 'mark-1'], question: mergeCards[0].question }] },
    { cards: mergeCards, answer: 'Synthetic rewritten answer is forbidden' },
  ])('rejects incomplete, reordered or rewritten native merge response %j', async value => {
    const peer = vi.fn().mockImplementation(async endpoint => Response.json(endpoint.endsWith('/status') ? status : value));
    start(peer);
    await ready();
    await expect(generateWereadMerge(mergeBatch, new AbortController().signal)).rejects.toThrow();
    expect(peer).toHaveBeenCalledTimes(2);
  });

  it('denies merge after owner authorization is revoked without retaining upstream error details', async () => {
    const peer = vi.fn().mockResolvedValueOnce(Response.json(status)).mockResolvedValue(Response.json({ error: 'Synthetic upstream private detail' }, { status: 403 }));
    start(peer);
    await ready();
    await expect(generateWereadMerge(mergeBatch, new AbortController().signal)).rejects.toThrow('登录账号发生变化');
    await expect(generateWereadMerge(mergeBatch, new AbortController().signal)).rejects.toThrow('登录账号发生变化');
    expect(peer).toHaveBeenCalledTimes(2);
  });

  it('leaves text capability ready and points to manual import after a model-only configuration failure', async () => {
    const peer = vi.fn().mockResolvedValueOnce(Response.json(status)).mockResolvedValue(Response.json({ error: 'Synthetic model configuration failure' }, { status: 503 }));
    start(peer);
    await ready();
    await expect(generateWereadMerge(mergeBatch, new AbortController().signal)).rejects.toThrow('请手动整理问题或保留摘录');
    expect(useMiaodaWeread.getState().available).toBe(true);
    expect(useMiaodaWeread.getState().accountKey).toBe(accountKey);
  });
});
