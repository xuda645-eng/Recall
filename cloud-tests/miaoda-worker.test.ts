import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

interface Event {
  request?: { method: string; mode: string; url: string };
  data?: { type: string };
  waitUntil?: (value: Promise<unknown>) => void;
  respondWith?: (value: Promise<Response>) => void;
}

const scope = 'https://synthetic.invalid/app/test/recall/';
const script = readFileSync(new URL('../miaoda/worker/sw.js', import.meta.url), 'utf8');

function worker(entries = [{ url: 'miaoda-client.html', revision: 'synthetic' }, { url: 'recall-pwa.js', revision: 'synthetic' }]) {
  const handlers = new Map<string, (event: Event) => void>();
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(new Response('Static offline shell')) };
  const storage = { open: vi.fn().mockResolvedValue(cache), keys: vi.fn().mockResolvedValue([]), delete: vi.fn().mockResolvedValue(true) };
  const fetcher = vi.fn().mockResolvedValue(new Response('Live identity HTML'));
  const claim = vi.fn().mockResolvedValue(undefined);
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const navigator = { onLine: true };
  runInNewContext(script, { URL, Response, caches: storage, fetch: fetcher, self: {
    __WB_MANIFEST: entries, registration: { scope }, clients: { claim }, skipWaiting, navigator,
    addEventListener(name: string, handler: (event: Event) => void) { handlers.set(name, handler); },
  } });
  return { handlers, cache, storage, fetcher, claim, skipWaiting, navigator };
}

describe('scoped static-only Miaoda service worker', () => {
  it('precaches only the generated manifest and rejects entries outside its scope', async () => {
    const runtime = worker();
    let pending: Promise<unknown> | undefined;
    runtime.handlers.get('install')!({ waitUntil(value) { pending = value; } });
    await pending;
    expect(runtime.cache.addAll).toHaveBeenCalledWith([`${scope}miaoda-client.html`, `${scope}recall-pwa.js`]);
    expect(() => worker([{ url: '../../api/session', revision: 'synthetic' }])).toThrow('within the Recall client scope');
  });
  it.each([200, 401, 403])('does not cache live identity HTML or bypass HTTP %s', async status => {
    const runtime = worker();
    runtime.fetcher.mockResolvedValue(new Response('Live identity HTML', { status }));
    let pending: Promise<Response> | undefined;
    runtime.handlers.get('fetch')!({ request: { method: 'GET', mode: 'navigate', url: scope },
      respondWith(value) { pending = value; } });
    expect((await pending)?.status).toBe(status);
    expect(runtime.storage.open).not.toHaveBeenCalled();
  });
  it('returns only the static shell when navigation is offline', async () => {
    const runtime = worker();
    runtime.fetcher.mockRejectedValue(new Error('Synthetic offline'));
    let pending: Promise<Response> | undefined;
    runtime.handlers.get('fetch')!({ request: { method: 'GET', mode: 'navigate', url: scope },
      respondWith(value) { pending = value; } });
    expect(await (await pending)?.text()).toBe('Static offline shell');
    expect(runtime.cache.match).toHaveBeenCalledWith(`${scope}miaoda-client.html`);
  });
  it('avoids a navigation network request when the worker knows it is offline', async () => {
    const runtime = worker();
    runtime.navigator.onLine = false;
    let pending: Promise<Response> | undefined;
    runtime.handlers.get('fetch')!({ request: { method: 'GET', mode: 'navigate', url: scope },
      respondWith(value) { pending = value; } });
    expect(await (await pending)?.text()).toBe('Static offline shell');
    expect(runtime.fetcher).not.toHaveBeenCalled();
  });
  it('ignores APIs, unknown objects and non-GET requests', () => {
    const runtime = worker();
    const respondWith = vi.fn();
    for (const request of [
      { method: 'POST', mode: 'cors', url: `${scope}recall-pwa.js` },
      { method: 'GET', mode: 'cors', url: 'https://synthetic.invalid/app/test/api/sync' },
      { method: 'GET', mode: 'cors', url: `${scope}private-image` },
    ]) runtime.handlers.get('fetch')!({ request, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    expect(runtime.storage.open).not.toHaveBeenCalled();
  });
  it('cleans only obsolete caches belonging to its own scoped namespace', async () => {
    const runtime = worker();
    runtime.storage.keys.mockResolvedValue(['owner-media', `recall-miaoda-static:${scope}:old`, 'another-app-cache']);
    let pending: Promise<unknown> | undefined;
    runtime.handlers.get('activate')!({ waitUntil(value) { pending = value; } });
    await pending;
    expect(runtime.storage.delete).toHaveBeenCalledWith(`recall-miaoda-static:${scope}:old`);
    expect(runtime.storage.delete).toHaveBeenCalledOnce();
    expect(runtime.claim).toHaveBeenCalledOnce();
  });
});
