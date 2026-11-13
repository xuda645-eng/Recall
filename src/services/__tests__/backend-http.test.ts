// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backendFetch, installBackendTransport } from '../../../shared/client-http';

let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });

describe('portable backend HTTP transport', () => {
  it('preserves native Cloudflare requests without a platform adapter', async () => {
    const response = Response.json({ revision: 1 });
    const native = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', native);
    const options = { credentials: 'same-origin' as const, cache: 'no-store' as const };
    expect(await backendFetch('/api/sync?since=0', options)).toBe(response);
    expect(native).toHaveBeenCalledWith('/api/sync?since=0', options);
  });

  it('delegates JSON, binary bodies and cancellation signals without rewriting them', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    cleanup = installBackendTransport(request);
    const signal = new AbortController().signal;
    const bytes = new Uint8Array([0, 255, 1]);
    const options = { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: bytes, signal };
    expect((await backendFetch('/api/media/synthetic', options)).status).toBe(204);
    expect(request).toHaveBeenCalledWith('/api/media/synthetic', options);
  });

  it('does not fall back to native fetch after a platform transport failure', async () => {
    const native = vi.fn();
    vi.stubGlobal('fetch', native);
    cleanup = installBackendTransport(vi.fn().mockRejectedValue(new Error('Synthetic platform failure')));
    await expect(backendFetch('/api/sync')).rejects.toThrow('Synthetic platform failure');
    expect(native).not.toHaveBeenCalled();
  });

  it('preserves unauthorized and conflict responses for the existing callers', async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: 'Conflict' }, { status: 409 }));
    cleanup = installBackendTransport(request);
    expect((await backendFetch('/api/auth/session')).status).toBe(401);
    expect((await backendFetch('/api/sync')).status).toBe(409);
  });

  it('rejects aborted requests before touching either transport', async () => {
    const request = vi.fn();
    cleanup = installBackendTransport(request);
    const controller = new AbortController();
    const reason = new Error('Synthetic cancellation');
    controller.abort(reason);
    await expect(backendFetch('/api/weread/books', { signal: controller.signal })).rejects.toBe(reason);
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['https://external.invalid/api/sync', '//external.invalid/api/sync', '/api/../other',
    '/api/%2e%2e/other', '/api/%2E/other', '/api/\\other', '/api/sync#other', '/api/sync\n'])(
    'rejects unsafe paths before requesting: %s', async endpoint => {
    const native = vi.fn();
    vi.stubGlobal('fetch', native);
    await expect(backendFetch(endpoint)).rejects.toThrow();
    expect(native).not.toHaveBeenCalled();
    });

  it('prevents duplicate installation and stale cleanup from removing a newer adapter', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({}));
    const previousCleanup = installBackendTransport(request);
    cleanup = previousCleanup;
    expect(() => installBackendTransport(request)).toThrow('already installed');
    previousCleanup();
    cleanup = installBackendTransport(request);
    previousCleanup();
    await backendFetch('/api/sync');
    expect(request).toHaveBeenCalledOnce();
  });
});
