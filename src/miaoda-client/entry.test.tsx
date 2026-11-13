import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { backendFetch } from '../../shared/client-http';
import { useMiaodaWeread } from '@/services/miaoda-weread';
import { mountRecallPwa } from './entry';

const runtime = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn(), stopPersonal: vi.fn(), installPersonal: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: runtime.render, unmount: runtime.unmount }) }));
vi.mock('@/App', () => ({ App: () => null }));
vi.mock('@/services/personal-sync', () => ({ installPersonalSync: runtime.installPersonal }));

let cleanups: (() => void)[] = [];
const accountKey = 'a'.repeat(64);

beforeEach(() => {
  vi.stubEnv('VITE_RECALL_MIAODA_LEARNING', '1');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ synthetic: true })));
  runtime.render.mockReset();
  runtime.unmount.mockReset();
  runtime.stopPersonal.mockReset();
  runtime.installPersonal.mockReset().mockReturnValue(runtime.stopPersonal);
});
afterEach(() => { cleanups.forEach(stop => stop()); cleanups = []; vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('bootstraps once per active mount and keeps capability until the final owner releases it', async () => {
  const element = document.createElement('div');
  const peer = vi.fn().mockResolvedValue(Response.json({ available: true, aiAvailable: true, accountKey }));
  const first = mountRecallPwa(element, peer);
  const second = mountRecallPwa(element, peer);
  cleanups.push(first, second);
  await vi.waitFor(() => expect(useMiaodaWeread.getState().available).toBe(true));
  expect(peer).toHaveBeenCalledTimes(1);
  expect(runtime.render).toHaveBeenCalledTimes(1);
  first(); first();
  expect(useMiaodaWeread.getState().available).toBe(true);
  expect(runtime.unmount).not.toHaveBeenCalled();
  second();
  expect(useMiaodaWeread.getState()).toMatchObject({ phase: 'disabled', accountKey: null });
  expect(runtime.unmount).toHaveBeenCalledTimes(1);
  expect(runtime.stopPersonal).toHaveBeenCalledTimes(1);
});

it('forwards exact native WeRead routes without enabling any unrelated preview paths', async () => {
  const peer = vi.fn().mockImplementation(async (endpoint: string) => Response.json(endpoint.endsWith('/status') ? { available: true, aiAvailable: true, accountKey } : { books: [], cursor: null }));
  cleanups.push(mountRecallPwa(document.createElement('div'), peer));
  await vi.waitFor(() => expect(useMiaodaWeread.getState().available).toBe(true));
  const options = { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'X-Recall-Account-Key': accountKey } };
  expect((await backendFetch('/api/recall/weread/books', options)).ok).toBe(true);
  expect(peer).toHaveBeenLastCalledWith('/api/recall/weread/books', options);
  for (const path of ['/api/weread/books', '/api/recall/weread/books?extra=1', '/api/recall/weread/status?extra=1', '/api/auth/session', '/api/sync', '/api/model']) {
    expect((await backendFetch(path)).status).toBe(503);
  }
  expect(peer).toHaveBeenCalledTimes(2);
});

it('never bootstraps a capability for an offline mount or local synthetic build', async () => {
  vi.stubEnv('VITE_RECALL_MIAODA_LEARNING', '0');
  cleanups.push(mountRecallPwa(document.createElement('div')));
  expect(useMiaodaWeread.getState().phase).toBe('disabled');
  expect((await backendFetch('/api/recall/weread/status')).status).toBe(503);
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(runtime.installPersonal).not.toHaveBeenCalled();
});

it('cleans capability and transport if root rendering fails, and permits a fresh mount', async () => {
  runtime.render.mockImplementationOnce(() => { throw new Error('Synthetic render failure'); });
  const peer = vi.fn().mockImplementation(async () => Response.json({ available: true, aiAvailable: true, accountKey }));
  expect(() => mountRecallPwa(document.createElement('div'), peer)).toThrow('Synthetic render failure');
  await Promise.resolve();
  expect(useMiaodaWeread.getState().phase).toBe('disabled');
  await backendFetch('/api/synthetic');
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  cleanups.push(mountRecallPwa(document.createElement('div'), peer));
  await vi.waitFor(() => expect(useMiaodaWeread.getState().available).toBe(true));
});
