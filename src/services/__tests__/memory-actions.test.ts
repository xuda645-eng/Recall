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

afterEach(() => { localStorage.clear(); });

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
