import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshMemoryPWA } from '../pwa-refresh';

const version = '1.0-20261101-0200';
class InstallingWorker extends EventTarget {
  state: ServiceWorkerState = 'installing';
}

describe('manual PWA refresh', () => {
  const applyUpdate = vi.fn();
  const getRegistration = vi.fn();
  const fetchVersion = vi.fn();
  let reload: ReturnType<typeof vi.spyOn>;
  const registration = { update: vi.fn(), installing: null as InstallingWorker | null, waiting: null as InstallingWorker | null };
  const saved = JSON.stringify({ cards: [{ id: 'original', reps: 9 }], reviewLogs: [{ id: 'review' }] });

  beforeEach(() => {
    applyUpdate.mockReset().mockImplementation(async () => {
      if (registration.waiting) { registration.waiting.state = 'activated'; registration.waiting.dispatchEvent(new Event('statechange')); }
    });
    registration.update.mockReset().mockResolvedValue(registration);
    registration.installing = null;
    registration.waiting = null;
    getRegistration.mockReset().mockResolvedValue(registration);
    fetchVersion.mockReset().mockResolvedValue(new Response(JSON.stringify({ version }), { status: 200 }));
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration } });
    vi.stubGlobal('fetch', fetchVersion);
    reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    localStorage.setItem('recall.snapshot.v1', saved);
  });
  afterEach(() => {
    expect(localStorage.getItem('recall.snapshot.v1')).toBe(saved);
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  it('checks uncached anonymous metadata and the worker before a normal reload', async () => {
    await refreshMemoryPWA(applyUpdate, version);
    expect(fetchVersion).toHaveBeenCalledWith('/version.json', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
    expect(registration.update).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(applyUpdate).not.toHaveBeenCalled();
  });
  it('activates a waiting update even if its notification was dismissed', async () => {
    registration.waiting = new InstallingWorker();
    await refreshMemoryPWA(applyUpdate, version);
    expect(applyUpdate).toHaveBeenCalledExactlyOnceWith(true);
    expect(reload).toHaveBeenCalledOnce();
  });
  it('waits for a newly discovered worker to finish downloading before applying it', async () => {
    const worker = new InstallingWorker();
    registration.installing = worker;
    const listener = vi.spyOn(worker, 'addEventListener');
    const pending = refreshMemoryPWA(applyUpdate, version);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('statechange', expect.any(Function)));
    expect(applyUpdate).not.toHaveBeenCalled();
    worker.state = 'installed';
    registration.waiting = worker;
    worker.dispatchEvent(new Event('statechange'));
    await pending;
    expect(applyUpdate).toHaveBeenCalledExactlyOnceWith(true);
    expect(reload).toHaveBeenCalledOnce();
  });
  it('does not reload an old cached bundle when a newer version is not yet ready', async () => {
    fetchVersion.mockResolvedValue(new Response(JSON.stringify({ version: '1.0-20261101-0201' }), { status: 200 }));
    await expect(refreshMemoryPWA(applyUpdate, version)).rejects.toThrow('新版尚未就绪');
    expect(reload).not.toHaveBeenCalled();
    expect(applyUpdate).not.toHaveBeenCalled();
  });
  it('reloads directly when the browser has no worker registration', async () => {
    getRegistration.mockResolvedValue(undefined);
    await refreshMemoryPWA(applyUpdate, version);
    expect(reload).toHaveBeenCalledOnce();
  });
  it.each([undefined, { version: 'invalid' }, { version: 1 }])('rejects missing or malformed public metadata', async metadata => {
    fetchVersion.mockResolvedValue(new Response(JSON.stringify(metadata ?? null), { status: 200 }));
    await expect(refreshMemoryPWA(applyUpdate, version)).rejects.toThrow('版本信息无效');
    expect(reload).not.toHaveBeenCalled();
  });
  it('preserves the current page and data on offline or server errors', async () => {
    fetchVersion.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(refreshMemoryPWA(applyUpdate, version)).rejects.toThrow('Failed to fetch');
    fetchVersion.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(refreshMemoryPWA(applyUpdate, version)).rejects.toThrow('无法检查最新版本');
    expect(reload).not.toHaveBeenCalled();
  });
  it('times out a stalled worker check without reloading or clearing storage', async () => {
    vi.useFakeTimers();
    registration.update.mockReturnValue(new Promise(() => {}));
    const rejected = expect(refreshMemoryPWA(applyUpdate, version)).rejects.toThrow('更新检查超时');
    await vi.advanceTimersByTimeAsync(20001);
    await rejected;
    expect(reload).not.toHaveBeenCalled();
  });
  it('reports failed installation and removes its temporary observer', async () => {
    const worker = new InstallingWorker();
    registration.installing = worker;
    const listener = vi.spyOn(worker, 'addEventListener');
    const remove = vi.spyOn(worker, 'removeEventListener');
    const rejected = expect(refreshMemoryPWA(applyUpdate, version)).rejects.toThrow('新版下载失败');
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    worker.state = 'redundant';
    worker.dispatchEvent(new Event('statechange'));
    await rejected;
    expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function));
    expect(reload).not.toHaveBeenCalled();
  });
});
