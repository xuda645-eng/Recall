import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { archiveMemoryFolder, deleteArchivedMemoryFolder } from '@/lib/memory-archive';
import { applyMemoryImport, memoryImportTargetAvailable, parseMemoryMarkdown, planMemoryImport } from '@/lib/memory-markdown';
import type { RecallStateSnapshot } from '@/types';

const timestamp = '2026-11-13T12:00:00+08:00';
const document = parseMemoryMarkdown('# 新知识\n<!-- recall:card {"id":"synthetic-import-target"} -->\n问题：合成问题？\n\n合成答案。\n<!-- recall:end -->', timestamp);

function fixture(empty = false): RecallStateSnapshot {
  const seed = createSeedSnapshot();
  return { ...seed, decks: [
    { ...seed.decks[0], id: 'active', name: '有效卡组', parentId: null },
    { ...seed.decks[0], id: 'parent', name: '归档测试', parentId: null },
    { ...seed.decks[0], id: 'child', name: '子卡组', parentId: 'parent' },
  ], cards: empty ? [] : [{ ...seed.cards[0], id: 'synthetic-existing', deckId: 'child', archivedAt: undefined }], reviewLogs: [], studySessions: [] };
}

describe('active import destinations', () => {
  it.each([false, true])('rejects archived folders and their descendants, including empty=%s folders', empty => {
    const snapshot = fixture(empty);
    const archived = archiveMemoryFolder(snapshot, 'parent', timestamp).snapshot;
    const before = JSON.stringify(archived);
    for (const parentId of ['parent', 'child']) {
      expect(memoryImportTargetAvailable(archived, parentId)).toBe(false);
      expect(() => planMemoryImport(archived, document, parentId)).toThrow('已归档或删除');
    }
    expect(memoryImportTargetAvailable(archived, null)).toBe(true);
    expect(planMemoryImport(archived, document, 'active').parentId).toBe('active');
    expect(JSON.stringify(archived)).toBe(before);
  });

  it('rejects a preview target archived or deleted after planning without changing the snapshot', () => {
    const snapshot = fixture();
    const plan = planMemoryImport(snapshot, document, 'child');
    const archived = archiveMemoryFolder(snapshot, 'parent', timestamp).snapshot;
    const deleted = deleteArchivedMemoryFolder(archived, 'parent', { deckIds: ['parent', 'child'], cardIds: ['synthetic-existing'] });
    for (const current of [archived, deleted]) {
      const before = JSON.stringify(current);
      expect(() => applyMemoryImport(current, plan, new Set())).toThrow('已归档或删除');
      expect(() => planMemoryImport(current, document, 'child')).toThrow('已归档或删除');
      expect(JSON.stringify(current)).toBe(before);
    }
  });

  it('allows active empty folders, a mixed active/archive branch and explicitly selected root', () => {
    const snapshot = fixture();
    const mixed = { ...snapshot, cards: [
      ...snapshot.cards,
      { ...snapshot.cards[0], id: 'synthetic-archived', archivedAt: timestamp },
    ] };
    expect(memoryImportTargetAvailable(mixed, 'child')).toBe(true);
    const imported = applyMemoryImport(mixed, planMemoryImport(mixed, document, 'child'), new Set());
    expect(imported.added).toBe(1);
    expect(imported.snapshot.cards.filter(card => card.id !== 'synthetic-import-target')).toEqual(mixed.cards);
    expect(applyMemoryImport(snapshot, planMemoryImport(snapshot, document, null), new Set()).added).toBe(1);
  });
});
