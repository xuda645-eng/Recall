import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { newMemoryCard } from '@/lib/memory-folders';
import { organizeWereadFolders, wereadBookFolder, WEREAD_FOLDER_ID } from './memory-weread-folders';
import type { Deck, RecallStateSnapshot } from '@/types';

const at = '2026-11-01T00:00:00.000Z';
const migratedAt = '2026-11-05T00:00:00.000Z';
const deck = (id: string, name: string, parentId: string | null = null, description = ''): Deck => ({ id, name, parentId, description, color: 'slate', createdAt: at, updatedAt: at, importedAt: at });
function fixture(): RecallStateSnapshot {
  const initial = createSeedSnapshot(new Date(at));
  return { ...initial, decks: [], cards: [], reviewLogs: [], studySessions: [], settings: { ...initial.settings, desiredRetention: .87 } };
}
function sourceCard(id: string, deckId: string, bookId = 'book-one', title = '原书名') {
  return newMemoryCard({ id, deckId, front: '原问题', back: '  原文\n保持。  ', sourceRef: { provider: 'weread', bookId, bookmarkId: id }, bookTitle: title, archivedAt: at, reps: 8, state: 'review', stability: 25, difficulty: 4, lastReviewDate: at, importedAt: at }, at);
}

describe('WeRead library organization', () => {
  it('does not create empty demo folders in a new library', () => {
    const original = fixture();
    expect(organizeWereadFolders(original, migratedAt)).toBe(original);
  });
  it('reparents an owned book and preserves its descendants, card identities, history and schedules', () => {
    const original = fixture();
    original.decks = [deck('weread-book:book-one', '原书名', null, 'weread-book:book-one'), deck('child', '保留层级', 'weread-book:book-one'), deck('manual', '手工卡组')];
    original.cards = [sourceCard('old', 'child'), newMemoryCard({ id: 'manual-card', deckId: 'manual', front: '手工问题', back: '手工答案' }, at)];
    original.reviewLogs = [{ id: 'log', cardId: 'old', rating: 'good', reviewDate: at, stability: 25, difficulty: 4, elapsedDays: 5, scheduledDays: 25 }];
    original.studySessions = [{ id: 'session', deckId: 'weread-book:book-one', startedAt: at, endedAt: at, cardsStudied: 1 }];
    const result = organizeWereadFolders(original, migratedAt);
    expect(result.decks.find(item => item.id === 'weread-book:book-one')).toMatchObject({ parentId: WEREAD_FOLDER_ID, importedAt: at, createdAt: at });
    expect(result.decks.find(item => item.id === 'child')).toEqual(original.decks[1]);
    expect(result.decks.find(item => item.id === 'manual')).toEqual(original.decks[2]);
    expect(result.cards).toEqual(original.cards);
    expect(result.reviewLogs).toBe(original.reviewLogs);
    expect(result.studySessions).toBe(original.studySessions);
    expect(result.settings).toBe(original.settings);
    expect(organizeWereadFolders(result, migratedAt)).toBe(result);
    expect(original.decks[0].parentId).toBeNull();
  });
  it('reuses the existing named root and keeps renamed book IDs', () => {
    const original = fixture();
    original.decks = [deck('custom-root', '微信读书'), deck('renamed-book', '我改过的书名')];
    original.cards = [sourceCard('source', 'renamed-book')];
    const result = organizeWereadFolders(original, migratedAt);
    expect(result.decks).toHaveLength(2);
    expect(result.decks[1]).toMatchObject({ id: 'renamed-book', name: '我改过的书名', parentId: 'custom-root' });
    expect(result.cards).toEqual(original.cards);
  });
  it('continues using an owned library after its user changes the name', () => {
    const initial = organizeWereadFolders(fixture(), migratedAt, [{ bookId: 'one', title: '第一本书' }]);
    const renamed = { ...initial, decks: initial.decks.map(item => item.id === WEREAD_FOLDER_ID ? { ...item, name: '我的阅读库' } : item) };
    const result = organizeWereadFolders(renamed, migratedAt, [{ bookId: 'two', title: '第二本书' }]);
    expect(wereadBookFolder(result, 'two')?.parentId).toBe(WEREAD_FOLDER_ID);
    expect(result.decks.find(item => item.id === WEREAD_FOLDER_ID)?.name).toBe('我的阅读库');
  });
  it('moves only proven WeRead cards out of a mixed stable book folder', () => {
    const original = fixture();
    original.decks = [deck(WEREAD_FOLDER_ID, '微信读书'), deck('weread-book:book-one', '混合卡组', WEREAD_FOLDER_ID, 'weread-book:book-one')];
    original.cards = [sourceCard('source', 'weread-book:book-one'), newMemoryCard({ id: 'manual-card', deckId: 'weread-book:book-one', front: '手工', back: '手工' }, at)];
    const result = organizeWereadFolders(original, migratedAt);
    const destination = wereadBookFolder(result, 'book-one');
    expect(destination?.id).toBe('weread-book:book-one:library');
    expect(result.cards[0]).toEqual({ ...original.cards[0], deckId: destination!.id });
    expect(result.cards[1]).toEqual(original.cards[1]);
    expect(result.decks[1]).toEqual(original.decks[1]);
    expect(organizeWereadFolders(result, migratedAt)).toBe(result);
  });
  it('separates different source books without guessing from ordinary bookTitle fields', () => {
    const original = fixture();
    original.decks = [deck('mixed', '阅读资料')];
    original.cards = [sourceCard('first', 'mixed'), sourceCard('second', 'mixed', 'book-two', '另一本书'), newMemoryCard({ id: 'unproven', deckId: 'mixed', front: '问题', back: '答案', bookTitle: '原书名', source: '微信读书' }, at)];
    const result = organizeWereadFolders(original, migratedAt);
    expect(result.cards[0].deckId).toBe('weread-book:book-one');
    expect(result.cards[1].deckId).toBe('weread-book:book-two');
    expect(result.cards[2]).toEqual(original.cards[2]);
    expect(result.cards.map(item => item.id)).toEqual(original.cards.map(item => item.id));
  });
  it('stays idempotent when a mixed owned parent contains another book subtree', () => {
    const original = fixture();
    original.decks = [deck('weread-book:book-one', '混合旧书籍', null, 'weread-book:book-one'), deck('second-book', '第二本书', 'weread-book:book-one')];
    original.cards = [sourceCard('first', 'weread-book:book-one'), sourceCard('second', 'second-book', 'book-two', '第二本书')];
    const result = organizeWereadFolders(original, migratedAt);
    expect(wereadBookFolder(result, 'book-one')?.id).toBe('weread-book:book-one:library');
    expect(wereadBookFolder(result, 'book-two')?.id).toBe('second-book');
    expect(organizeWereadFolders(result, migratedAt)).toBe(result);
    expect(result.cards.map(item => item.id)).toEqual(['first', 'second']);
  });
  it('resolves same-name sibling books without touching names outside the library', () => {
    const original = fixture();
    original.decks = [deck('manual', '同名书')];
    const result = organizeWereadFolders(original, migratedAt, [{ bookId: 'one', title: '同名书' }, { bookId: 'two', title: '同名书' }]);
    expect(result.decks.find(item => item.id === 'manual')).toEqual(original.decks[0]);
    expect(wereadBookFolder(result, 'one')?.name).toBe('同名书');
    expect(wereadBookFolder(result, 'two')?.name).toBe('同名书 (微信读书 1)');
  });
  it('keeps empty owned archived book folders rather than deleting them', () => {
    const original = fixture();
    original.decks = [deck('weread-book:book-one', '空书籍卡组', null, 'weread-book:book-one')];
    const result = organizeWereadFolders(original, migratedAt);
    expect(result.decks.find(item => item.id === original.decks[0].id)?.parentId).toBe(WEREAD_FOLDER_ID);
  });
  it('rejects an unrelated reserved root collision without altering the input', () => {
    const original = fixture();
    original.decks = [deck(WEREAD_FOLDER_ID, '其他卡组')];
    const before = structuredClone(original);
    expect(() => organizeWereadFolders(original, migratedAt, [{ bookId: 'one', title: '书籍' }])).toThrow('根卡组编号');
    expect(original).toEqual(before);
  });
});
