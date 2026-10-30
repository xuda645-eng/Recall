import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { migrateFolders } from '@/lib/memory-folders';
import { dataState } from '@/stores/store-helpers';
import type { RecallStateSnapshot } from '@/types';

type StoreState = RecallStateSnapshot & { error: string | null; view: 'settings' };
const mocks = vi.hoisted(() => ({
  getState: vi.fn<() => StoreState>(),
  setState: vi.fn<(snapshot: RecallStateSnapshot & { error: null }) => void>(),
  saveSnapshot: vi.fn<(snapshot: RecallStateSnapshot) => Promise<void>>(),
}));

vi.mock('@/stores/recall-store', () => ({
  useRecallStore: { getState: mocks.getState, setState: mocks.setState },
}));
vi.mock('@/services/repository', () => ({
  getRecallRepository: vi.fn(async () => ({ saveSnapshot: mocks.saveSnapshot })),
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let store: StoreState;
let persisted: RecallStateSnapshot;
let commitMemory: typeof import('@/services/memory-actions')['commitMemory'];

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  const snapshot = migrateFolders(createSeedSnapshot(new Date('2026-10-31T04:00:00.000Z')));
  store = { ...snapshot, error: 'previous error', view: 'settings' };
  persisted = structuredClone(snapshot);
  mocks.getState.mockReset().mockImplementation(() => store);
  mocks.setState.mockReset().mockImplementation(snapshot => { store = { ...store, ...snapshot }; });
  mocks.saveSnapshot.mockReset().mockImplementation(async snapshot => { persisted = structuredClone(snapshot); });
  ({ commitMemory } = await import('@/services/memory-actions'));
});

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('commitMemory queued persistence', () => {
  it('does not mutate or publish store state when a save fails', async () => {
    const originalStore = store;
    const before = structuredClone(store);
    const beforeDisk = structuredClone(persisted);
    const started = deferred(), save = deferred();
    const error = new Error('disk write failed');
    mocks.saveSnapshot.mockImplementationOnce(() => {
      started.resolve();
      return save.promise;
    });

    const work = commitMemory(current => ({
      ...current,
      settings: { ...current.settings, dailyGoal: current.settings.dailyGoal + 1 },
      cards: current.cards.map((card, index) => index === 0 ? {
        ...card, reps: card.reps + 1, nextReviewDate: '2026-11-01T04:00:00.000Z',
      } : card),
    }));
    const rejected = expect(work).rejects.toBe(error);
    await started.promise;
    expect(mocks.saveSnapshot).toHaveBeenCalledOnce();
    expect(mocks.saveSnapshot.mock.calls[0][0].settings.dailyGoal).toBe(before.settings.dailyGoal + 1);
    expect(mocks.setState).not.toHaveBeenCalled();
    expect(store).toBe(originalStore);
    expect(store).toEqual(before);

    save.reject(error);
    await rejected;
    expect(mocks.setState).not.toHaveBeenCalled();
    expect(store).toBe(originalStore);
    expect(store).toEqual(before);
    expect(persisted).toEqual(beforeDisk);
  });

  it('does not let a failed write poison the next already queued commit', async () => {
    const before = structuredClone(persisted);
    const started = deferred(), save = deferred();
    const error = new Error('first write failed');
    mocks.saveSnapshot.mockImplementationOnce(() => {
      started.resolve();
      return save.promise;
    });
    const failed = commitMemory(current => ({
      ...current, settings: { ...current.settings, dailyGoal: current.settings.dailyGoal + 100 },
    }));
    const rejected = expect(failed).rejects.toBe(error);
    const recovery = vi.fn((current: RecallStateSnapshot): RecallStateSnapshot => ({
      ...current, settings: { ...current.settings, dailyGoal: current.settings.dailyGoal + 1 },
    }));
    const next = commitMemory(recovery);
    await started.promise;
    expect(recovery).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).toHaveBeenCalledOnce();
    expect(mocks.setState).not.toHaveBeenCalled();

    save.reject(error);
    await rejected;
    await next;
    expect(recovery).toHaveBeenCalledOnce();
    expect(recovery.mock.calls[0][0]).toEqual(before);
    expect(mocks.saveSnapshot).toHaveBeenCalledTimes(2);
    expect(mocks.setState).toHaveBeenCalledOnce();
    const expected = { ...before, settings: { ...before.settings, dailyGoal: before.settings.dailyGoal + 1 } };
    expect(persisted).toEqual(expected);
    expect(dataState(store)).toEqual(expected);
    expect(store.error).toBeNull();
    expect(store.view).toBe('settings');
  });

  it('runs two queued updates against the latest persisted snapshot and publishes only after each save', async () => {
    const before = structuredClone(persisted);
    const firstStarted = deferred(), firstSave = deferred();
    const secondStarted = deferred(), secondSave = deferred();
    mocks.saveSnapshot.mockImplementationOnce(async snapshot => {
      firstStarted.resolve();
      await firstSave.promise;
      persisted = structuredClone(snapshot);
    }).mockImplementationOnce(async snapshot => {
      secondStarted.resolve();
      await secondSave.promise;
      persisted = structuredClone(snapshot);
    });
    const increment = (current: RecallStateSnapshot): RecallStateSnapshot => ({
      ...current,
      settings: { ...current.settings, dailyGoal: current.settings.dailyGoal + 1 },
      cards: current.cards.map((card, index) => index === 0 ? { ...card, reps: card.reps + 1 } : card),
    });
    const firstUpdate = vi.fn(increment);
    const secondUpdate = vi.fn((current: RecallStateSnapshot): RecallStateSnapshot => {
      expect(current).toEqual(persisted);
      return increment(current);
    });
    const first = commitMemory(firstUpdate);
    const second = commitMemory(secondUpdate);
    await firstStarted.promise;
    expect(firstUpdate).toHaveBeenCalledOnce();
    expect(secondUpdate).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).toHaveBeenCalledOnce();
    expect(mocks.setState).not.toHaveBeenCalled();
    expect(dataState(store)).toEqual(before);
    expect(persisted).toEqual(before);

    firstSave.resolve();
    await first;
    await secondStarted.promise;
    const afterFirst = increment(before);
    expect(secondUpdate).toHaveBeenCalledOnce();
    expect(secondUpdate.mock.calls[0][0]).toEqual(afterFirst);
    expect(mocks.saveSnapshot).toHaveBeenCalledTimes(2);
    expect(mocks.saveSnapshot.mock.calls[0][0]).toEqual(afterFirst);
    expect(mocks.saveSnapshot.mock.calls[1][0]).toEqual(increment(afterFirst));
    expect(mocks.setState).toHaveBeenCalledOnce();
    expect(persisted).toEqual(afterFirst);
    expect(dataState(store)).toEqual(afterFirst);

    secondSave.resolve();
    await second;
    const expected = increment(afterFirst);
    expect(persisted).toEqual(expected);
    expect(dataState(store)).toEqual(expected);
    expect(store.settings.dailyGoal).toBe(before.settings.dailyGoal + 2);
    expect(store.cards[0].reps).toBe(before.cards[0].reps + 2);
    expect(mocks.setState).toHaveBeenCalledTimes(2);
    expect(mocks.setState.mock.calls[0][0]).toEqual({ ...afterFirst, error: null });
    expect(mocks.setState.mock.calls[1][0]).toEqual({ ...expected, error: null });
    expect(store.view).toBe('settings');
  });
});

describe('pre-folders backup credential safety', () => {
  function rawSnapshot() {
    return {
      ...structuredClone(persisted),
      decks: [
        { ...persisted.decks[0], id: 'legacy-root', extraDeckData: { ordered: [3, 1, 2] } },
        { ...persisted.decks[1], id: 'legacy-child', parentId: 'legacy-root', unknownChapterData: 'keep' },
      ],
      cards: [{ ...persisted.cards[0], deckId: 'legacy-child', back: '  Exact original.\r\n\t第二行。  ', archivedAt: '2026-10-01T00:00:00Z', extraCardData: { enabled: false, empty: '', missing: null } }],
      settings: {
        ...structuredClone(persisted.settings),
        syncCode: 'SYNTHETIC-ONLY-PLAINTEXT',
        syncEnabled: true,
        syncRelayUrl: 'https://synthetic-only.invalid/relay',
        syncFolder: '/synthetic/keep-folder',
        syncLastAt: '2026-10-01T00:00:00Z',
        syncAutoInterval: 23,
        unknownSettings: { nested: ['keep', null, false, 0], text: '  spaces\n' },
      },
      unknownRoot: { version: 17, nested: [{ nullable: null, value: 1.25 }] },
      originalTree: { root: 'legacy-root', children: ['legacy-child'] },
    };
  }

  function safeSnapshot(raw: ReturnType<typeof rawSnapshot>) {
    return { ...raw, settings: { ...raw.settings, syncCode: null, syncEnabled: false, syncRelayUrl: '' } };
  }

  it('creates a sanitized backup from raw plaintext without losing unknown fields, original text, tree or history', async () => {
    const raw = rawSnapshot();
    Reflect.deleteProperty(raw.decks[0], 'parentId');
    const source = JSON.stringify(raw, null, 2);
    localStorage.setItem('recall.snapshot.v1', source);
    const write = vi.spyOn(localStorage, 'setItem');
    const before = structuredClone(store);
    await commitMemory(current => ({ ...current, cards: current.cards.map((card, index) => index === 0 ? { ...card, reps: card.reps + 1 } : card) }));
    const stored = localStorage.getItem('recall.snapshot.pre-folders.v1')!;
    expect(JSON.parse(stored)).toEqual(safeSnapshot(raw));
    expect(JSON.parse(stored).decks[0]).not.toHaveProperty('parentId');
    expect(JSON.parse(stored).cards[0].back).toBe(raw.cards[0].back);
    expect(JSON.parse(stored).reviewLogs).toEqual(raw.reviewLogs);
    expect(JSON.parse(stored).studySessions).toEqual(raw.studySessions);
    expect(stored).not.toContain(raw.settings.syncCode);
    expect(stored).not.toContain(raw.settings.syncRelayUrl);
    expect(localStorage.getItem('recall.snapshot.v1')).toBe(source);
    expect(write).toHaveBeenCalledExactlyOnceWith('recall.snapshot.pre-folders.v1', JSON.stringify(safeSnapshot(raw)));
    expect(mocks.saveSnapshot.mock.calls[0][0].settings).toEqual(before.settings);
    expect(store.settings).toEqual(before.settings);
    expect(store.cards[0].reps).toBe(before.cards[0].reps + 1);
    write.mockRestore();
  });

  it('sanitizes an existing legacy backup in place without replacing its original data with the current snapshot', async () => {
    const legacy = rawSnapshot();
    Reflect.deleteProperty(legacy.decks[0], 'parentId');
    const source = JSON.stringify({ ...rawSnapshot(), unknownRoot: { currentOnly: true } });
    localStorage.setItem('recall.snapshot.v1', source);
    localStorage.setItem('recall.snapshot.pre-folders.v1', JSON.stringify(legacy));
    const write = vi.spyOn(localStorage, 'setItem');
    await commitMemory(current => current);
    const safe = JSON.stringify(safeSnapshot(legacy));
    expect(localStorage.getItem('recall.snapshot.pre-folders.v1')).toBe(safe);
    expect(JSON.parse(safe).unknownRoot).toEqual(legacy.unknownRoot);
    expect(JSON.parse(safe).decks[0]).not.toHaveProperty('parentId');
    expect(localStorage.getItem('recall.snapshot.v1')).toBe(source);
    expect(write).toHaveBeenCalledExactlyOnceWith('recall.snapshot.pre-folders.v1', safe);
    await commitMemory(current => current);
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  it('removes credentials from an existing backup even when the primary snapshot key is absent', async () => {
    const legacy = rawSnapshot();
    localStorage.setItem('recall.snapshot.pre-folders.v1', JSON.stringify(legacy));
    await commitMemory(current => current);
    expect(JSON.parse(localStorage.getItem('recall.snapshot.pre-folders.v1')!)).toEqual(safeSnapshot(legacy));
    expect(localStorage.getItem('recall.snapshot.v1')).toBeNull();
  });

  it('sanitizes the backup even if the subsequent repository save fails, without publishing failed state', async () => {
    const legacy = rawSnapshot(), before = structuredClone(store);
    localStorage.setItem('recall.snapshot.pre-folders.v1', JSON.stringify(legacy));
    mocks.saveSnapshot.mockRejectedValueOnce(new Error('disk write failed'));
    await expect(commitMemory(current => current)).rejects.toThrow('disk write failed');
    expect(JSON.parse(localStorage.getItem('recall.snapshot.pre-folders.v1')!)).toEqual(safeSnapshot(legacy));
    expect(store).toEqual(before);
    expect(mocks.setState).not.toHaveBeenCalled();
  });

  it.each(['source', 'backup'] as const)('preserves malformed %s JSON, aborts persistence and lets the queue recover after repair', async location => {
    const raw = rawSnapshot(), before = structuredClone(store), beforeDisk = structuredClone(persisted);
    const valid = JSON.stringify(raw), malformed = '{"settings":{"syncCode":"SYNTHETIC-ONLY-PLAINTEXT"';
    localStorage.setItem('recall.snapshot.v1', location === 'source' ? malformed : valid);
    if (location === 'backup') localStorage.setItem('recall.snapshot.pre-folders.v1', malformed);
    const write = vi.spyOn(localStorage, 'setItem');
    const remove = vi.spyOn(localStorage, 'removeItem');
    const clear = vi.spyOn(localStorage, 'clear');
    await expect(commitMemory(current => current)).rejects.toThrow('迁移备份不是有效 JSON，已保留原始数据');
    expect(localStorage.getItem('recall.snapshot.v1')).toBe(location === 'source' ? malformed : valid);
    expect(localStorage.getItem('recall.snapshot.pre-folders.v1')).toBe(location === 'backup' ? malformed : null);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(mocks.saveSnapshot).not.toHaveBeenCalled();
    expect(mocks.setState).not.toHaveBeenCalled();
    expect(store).toEqual(before);
    expect(persisted).toEqual(beforeDisk);
    write.mockRestore(); remove.mockRestore(); clear.mockRestore();
    const key = location === 'source' ? 'recall.snapshot.v1' : 'recall.snapshot.pre-folders.v1';
    localStorage.setItem(key, JSON.stringify(safeSnapshot(raw)));
    await commitMemory(current => current);
    expect(mocks.saveSnapshot).toHaveBeenCalledOnce();
    expect(mocks.setState).toHaveBeenCalledOnce();
  });

  it.each([null, [], { settings: null }, { settings: [] }, { settings: 'invalid' }, {}])('preserves invalid backup structure rather than silently replacing it: %j', value => {
    const source = JSON.stringify(value);
    localStorage.setItem('recall.snapshot.pre-folders.v1', source);
    return expect(commitMemory(current => current)).rejects.toThrow('已保留原始数据').then(() => {
      expect(localStorage.getItem('recall.snapshot.pre-folders.v1')).toBe(source);
      expect(mocks.saveSnapshot).not.toHaveBeenCalled();
      expect(mocks.setState).not.toHaveBeenCalled();
    });
  });
});
