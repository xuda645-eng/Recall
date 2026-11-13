import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createSeedSnapshot } from '@/data/seed';
import { useRecallStore } from '@/stores/recall-store';
import { dataState } from '@/stores/store-helpers';
import { readJournal, snapshotKey } from '@/services/cloud-cache';
import { backendFetch } from '../../../shared/client-http';
import { PersonalSyncEngine, PersonalSyncError } from '../../../server/personal-sync';
import type { PersonalRow } from '../../../shared/personal-sync';
import { enablePersonalSync, installPersonalSync, pausePersonalSync, resolvePersonalConflicts, synchronizePersonal, usePersonalSync } from '@/services/personal-sync';
import { synchronizeMedia, useMediaSync } from '@/services/media-sync';

vi.mock('../../../shared/client-http', () => ({ backendFetch: vi.fn() }));
vi.mock('@/services/media-sync', () => ({ pauseMediaSync: vi.fn(), synchronizeMedia: vi.fn(), useMediaSync: { getState: vi.fn() } }));
vi.mock('@/services/memory-actions', async () => {
  const store = await import('@/stores/recall-store');
  const helpers = await import('@/stores/store-helpers');
  const cache = await import('@/services/cloud-cache');
  return { commitMemory: vi.fn(async (change, cloud) => {
    const current = helpers.dataState(store.useRecallStore.getState());
    const result = cloud?.(current, cache.readJournal());
    const snapshot = result?.snapshot ?? change(current);
    cache.writeCachedSnapshot(snapshot, result?.journal);
    store.useRecallStore.setState(snapshot);
  }) };
});

let stop: (() => void) | undefined;
let engine: PersonalSyncEngine;
const account = 'a'.repeat(64);
let dropResponse = false;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  useRecallStore.setState({ ...createSeedSnapshot(), decks: [], cards: [], reviewLogs: [], studySessions: [], isInitialized: true, isLoading: false, error: null });
  usePersonalSync.setState({ available: false, enabled: false, running: false, phase: 'local', error: '', lastSyncedAt: null });
  let row: PersonalRow | null = null;
  engine = new PersonalSyncEngine({
    async read() { return row; },
    async compareSwap(_owner, _library, expected, next) { if ((row?.revision ?? 0) !== expected) return false; row = next; return true; },
  });
  dropResponse = false;
  vi.mocked(synchronizeMedia).mockResolvedValue();
  vi.mocked(useMediaSync.getState).mockReturnValue({ error: '', pending: 0, running: false, completed: 0 });
  vi.mocked(backendFetch).mockImplementation(async (endpoint, options) => {
    const headers = { 'X-Recall-Account-Key': account };
    try {
      if (options?.method === 'POST') {
        if (new Headers(options.headers).get('X-Recall-Account-Key') !== account) return Response.json({ error: 'Account changed' }, { status: 401 });
        const result = await engine.mutate('123', 'synthetic-unit', JSON.parse(String(options.body)));
        if (dropResponse) { dropResponse = false; throw new TypeError('Synthetic lost response'); }
        return Response.json(result, { headers });
      }
      const since = Number(new URL(endpoint, 'https://synthetic.invalid').searchParams.get('since') ?? '0');
      return Response.json(await engine.read('123', 'synthetic-unit', since), { headers });
    } catch (error) {
      if (error instanceof PersonalSyncError) return Response.json({ error: error.message, revision: error.revision }, { status: error.status });
      throw error;
    }
  });
});
afterEach(() => { stop?.(); stop = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.mocked(backendFetch).mockClear(); localStorage.clear(); });

describe('personal browser synchronization', () => {
  it('restores the last successful timestamp only for the same account', async () => {
    stop = installPersonalSync();
    await enablePersonalSync();
    const timestamp = usePersonalSync.getState().lastSyncedAt;
    expect(timestamp).toBeTruthy();
    pausePersonalSync();
    stop();
    stop = installPersonalSync();
    expect(usePersonalSync.getState().lastSyncedAt).toBe(timestamp);
    stop();
    localStorage.setItem('recall.miaoda.personal.account.v1', 'b'.repeat(64));
    stop = installPersonalSync();
    expect(usePersonalSync.getState().lastSyncedAt).toBeNull();
  });
  it('ignores malformed timestamp metadata without preventing local use', () => {
    localStorage.setItem('recall.miaoda.personal.synced.v1', '{invalid');
    stop = installPersonalSync();
    expect(usePersonalSync.getState().lastSyncedAt).toBeNull();
    expect(backendFetch).not.toHaveBeenCalled();
  });
  it('does not contact the backend until explicitly connected', () => {
    stop = installPersonalSync();
    expect(backendFetch).not.toHaveBeenCalled();
    expect(usePersonalSync.getState().enabled).toBe(false);
  });
  it('backs up first, syncs allowed settings, and never serializes device secrets', async () => {
    useRecallStore.setState({ settings: { ...useRecallStore.getState().settings, syncCode: 'synthetic-private-key', syncEnabled: true } });
    stop = installPersonalSync();
    await enablePersonalSync();
    expect(usePersonalSync.getState().phase).toBe('synced');
    expect(localStorage.getItem('recall.snapshot.pre-cloud.v1')).not.toContain('synthetic-private-key');
    expect(vi.mocked(backendFetch).mock.calls.filter(([, options]) => options?.method === 'POST').map(([, options]) => options?.body).join('')).not.toContain('synthetic-private-key');
    expect(useRecallStore.getState().settings.syncCode).toBe('synthetic-private-key');
    expect(readJournal()?.spaceId).toBe(`miaoda-personal-${account}`);
  });
  it('retains a mutation after a lost response and replays without a duplicate commit', async () => {
    stop = installPersonalSync();
    dropResponse = true;
    await enablePersonalSync();
    const pendingId = readJournal()?.pending?.id;
    expect(pendingId).toBeTruthy();
    const committed = await engine.read('123', 'synthetic-unit');
    await synchronizePersonal();
    expect((await engine.read('123', 'synthetic-unit')).revision).toBe(committed.revision);
    expect(readJournal()?.pending).toBeNull();
    expect(usePersonalSync.getState().phase).toBe('synced');
  });
  it('refuses to upload when the saved account binding changed', async () => {
    localStorage.setItem('recall.miaoda.personal.account.v1', 'b'.repeat(64));
    stop = installPersonalSync();
    const before = dataState(useRecallStore.getState());
    await enablePersonalSync();
    expect(usePersonalSync.getState().phase).toBe('error');
    expect(vi.mocked(backendFetch).mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    expect(dataState(useRecallStore.getState())).toEqual(before);
  });
  it('blocks entity upload after a media failure without removing its content', async () => {
    const seed = createSeedSnapshot();
    const card = { ...seed.cards[0], front: `![synthetic](recall://${'a'.repeat(64)}.png)` };
    useRecallStore.setState({ decks: seed.decks, cards: [card] });
    vi.mocked(useMediaSync.getState).mockReturnValue({ error: '图片上传失败', pending: 1, running: false, completed: 0 });
    stop = installPersonalSync();
    await enablePersonalSync();
    expect(vi.mocked(backendFetch).mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    expect(synchronizeMedia).toHaveBeenCalledWith(`miaoda-personal-${account}`);
    expect(usePersonalSync.getState().error).toContain('图片');
    expect(useRecallStore.getState().cards[0]).toEqual(card);
  });
  it('does not synchronize an uninitialized or failed local store', async () => {
    useRecallStore.setState({ isInitialized: false });
    stop = installPersonalSync();
    await enablePersonalSync();
    expect(backendFetch).not.toHaveBeenCalled();
    expect(usePersonalSync.getState().error).toContain('尚未成功载入');
  });
  it('retains both conflicting versions and resolves only by explicit choice', async () => {
    stop = installPersonalSync();
    await enablePersonalSync();
    const current = await engine.read('123', 'synthetic-unit');
    const goal = current.entities.find(entity => entity.id === 'dailyGoal')!;
    await engine.mutate('123', 'synthetic-unit', { id: 'remote-edit', baseRevision: current.revision, changes: [{ kind: 'setting', id: 'dailyGoal', value: 35, expectedRevision: goal.revision }] });
    useRecallStore.setState({ settings: { ...useRecallStore.getState().settings, dailyGoal: 70 } });
    await synchronizePersonal();
    expect(usePersonalSync.getState().phase).toBe('conflict');
    expect(readJournal()?.conflicts).toHaveLength(1);
    await resolvePersonalConflicts('remote');
    expect(useRecallStore.getState().settings.dailyGoal).toBe(35);
    expect(readJournal()?.conflicts).toHaveLength(0);
    expect(usePersonalSync.getState().phase).toBe('synced');
  });
  it('pause preserves the persisted queue and local snapshot', async () => {
    stop = installPersonalSync();
    dropResponse = true;
    await enablePersonalSync();
    const cached = localStorage.getItem(snapshotKey);
    pausePersonalSync();
    expect(localStorage.getItem(snapshotKey)).toBe(cached);
    expect(usePersonalSync.getState().enabled).toBe(false);
  });
});
