import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { newMemoryCard } from '@/lib/memory-folders';
import type { RecallStateSnapshot } from '@/types';

const runtime = vi.hoisted(() => ({ snapshot: null as RecallStateSnapshot | null, fail: false, commit: vi.fn() }));
vi.mock('@/stores/recall-store', () => ({ useRecallStore: { getState: () => runtime.snapshot } }));
vi.mock('@/stores/store-helpers', () => ({ dataState: (state: RecallStateSnapshot) => state }));
vi.mock('@/services/memory-actions', () => ({ commitMemory: runtime.commit }));
import { organizeExistingWereadFolders, WEREAD_ORGANIZATION_BACKUP_KEY, WEREAD_ORGANIZATION_KEY } from './weread-folder-organization';

beforeEach(() => {
  localStorage.clear();
  runtime.fail = false;
  const at = '2026-11-01T00:00:00.000Z';
  const seed = createSeedSnapshot(new Date(at));
  runtime.snapshot = { ...seed, decks: [{ id: 'book', name: '原卡组', description: '', parentId: null, color: 'slate', createdAt: at, updatedAt: at }], cards: [newMemoryCard({ id: 'source', deckId: 'book', front: '问题', back: '原文', sourceRef: { provider: 'weread', bookId: 'one', bookmarkId: 'first' }, bookTitle: '原书名', reps: 9 }, at)], reviewLogs: [], studySessions: [], settings: { ...seed.settings, syncCode: 'PRIVATE-DO-NOT-EXPORT' } };
  runtime.commit.mockReset().mockImplementation(async (change: (state: RecallStateSnapshot) => RecallStateSnapshot) => {
    const next = change(runtime.snapshot!);
    if (runtime.fail) throw new Error('模拟保存失败');
    runtime.snapshot = next;
  });
});

describe('one-time WeRead hierarchy correction', () => {
  it('preserves a credential-free backup before saving and marks success afterward', async () => {
    const before = structuredClone(runtime.snapshot!);
    await organizeExistingWereadFolders();
    const backup = localStorage.getItem(WEREAD_ORGANIZATION_BACKUP_KEY)!;
    expect(backup).not.toContain('PRIVATE-DO-NOT-EXPORT');
    const parsed = JSON.parse(backup);
    expect(parsed.decks).toEqual(before.decks);
    expect(parsed.cards).toEqual(before.cards);
    expect(localStorage.getItem(WEREAD_ORGANIZATION_KEY)).toBe('1');
    await organizeExistingWereadFolders();
    expect(runtime.commit).toHaveBeenCalledTimes(1);
  });
  it('does not mark failed persistence complete and can retry safely', async () => {
    const before = structuredClone(runtime.snapshot!);
    runtime.fail = true;
    await expect(organizeExistingWereadFolders()).rejects.toThrow('保存失败');
    expect(runtime.snapshot).toEqual(before);
    expect(localStorage.getItem(WEREAD_ORGANIZATION_KEY)).toBeNull();
    const backup = localStorage.getItem(WEREAD_ORGANIZATION_BACKUP_KEY);
    runtime.fail = false;
    await organizeExistingWereadFolders();
    expect(localStorage.getItem(WEREAD_ORGANIZATION_BACKUP_KEY)).toBe(backup);
    expect(localStorage.getItem(WEREAD_ORGANIZATION_KEY)).toBe('1');
  });
  it('does not write or mark an empty new library', async () => {
    runtime.snapshot!.cards = [];
    runtime.snapshot!.decks = [];
    await organizeExistingWereadFolders();
    expect(runtime.commit).not.toHaveBeenCalled();
    expect(localStorage.getItem(WEREAD_ORGANIZATION_KEY)).toBeNull();
  });
  it('blocks migration if the safety backup cannot be stored', async () => {
    const before = structuredClone(runtime.snapshot!);
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    try {
      await expect(organizeExistingWereadFolders()).rejects.toThrow('Quota');
      expect(runtime.snapshot).toEqual(before);
    } finally { write.mockRestore(); }
    expect(localStorage.getItem(WEREAD_ORGANIZATION_KEY)).toBeNull();
  });
});
