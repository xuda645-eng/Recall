import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { archiveMemoryCard, archiveMemoryFolder, restoreMemoryCard, restoreMemoryCards } from './memory-archive';
import { isCardDue, isCardDueToday } from './stats';
import { getDueCards } from '@/services/fsrs-engine';

describe('memory archive lifecycle', () => {
  it('archives without changing content, review fields or history', () => {
    const snapshot = createSeedSnapshot();
    const card = snapshot.cards[0];
    const archived = archiveMemoryCard(snapshot, card.id, '2026-10-31T00:00:00.000Z');
    expect(archived.cards[0]).toEqual({ ...card, archivedAt: '2026-10-31T00:00:00.000Z' });
    expect(archived.reviewLogs).toBe(snapshot.reviewLogs);
    expect(archived.studySessions).toBe(snapshot.studySessions);
    expect(snapshot.cards[0].archivedAt).toBeUndefined();
    expect(restoreMemoryCard(archived, card.id).cards[0]).toEqual(card);
  });
  it('excludes archived overdue cards from due queues', () => {
    const snapshot = createSeedSnapshot();
    const card = { ...snapshot.cards[0], nextReviewDate: '2020-01-01T00:00:00.000Z', archivedAt: '2026-10-31T00:00:00.000Z' };
    expect(isCardDue(card)).toBe(false);
    expect(isCardDueToday(card)).toBe(false);
    expect(getDueCards([card])).toEqual([]);
    const restored = restoreMemoryCard({ ...snapshot, cards: [card] }, card.id).cards[0];
    expect(isCardDue(restored)).toBe(true);
    expect(restored.nextReviewDate).toBe(card.nextReviewDate);
  });
  it('prevents stale undo from undoing a newer archive', () => {
    const snapshot = createSeedSnapshot();
    const first = archiveMemoryCard(snapshot, snapshot.cards[0].id, '2026-10-31T00:00:00.000Z');
    const restored = restoreMemoryCard(first, snapshot.cards[0].id);
    const second = archiveMemoryCard(restored, snapshot.cards[0].id, '2026-10-31T01:00:00.000Z');
    expect(() => restoreMemoryCard(second, snapshot.cards[0].id, first.cards[0].archivedAt)).toThrow('状态已变化');
  });
});

describe('folder archive lifecycle', () => {
  const archivedAt = '2026-11-01T00:00:00.000Z';
  function fixture() {
    const seed = createSeedSnapshot();
    const decks = [
      { ...seed.decks[0], id: 'root', parentId: null },
      { ...seed.decks[0], id: 'child', parentId: 'root' },
      { ...seed.decks[0], id: 'deep', parentId: 'child' },
      { ...seed.decks[0], id: 'outside', parentId: null },
    ];
    const cards = [
      ...decks.map(deck => ({ ...seed.cards[0], id: deck.id, deckId: deck.id, nextReviewDate: '2020-01-01T00:00:00.000Z' })),
      { ...seed.cards[0], id: 'previous', deckId: 'child', archivedAt: '2026-10-31T00:00:00.000Z' },
    ];
    return { ...seed, decks, cards };
  }
  it('archives every active descendant once, preserving folders, history and previous archives', () => {
    const before = fixture();
    const result = archiveMemoryFolder(before, 'root', archivedAt);
    expect(result.ids).toEqual(['root', 'child', 'deep']);
    expect(result.snapshot.decks).toBe(before.decks);
    expect(result.snapshot.reviewLogs).toBe(before.reviewLogs);
    expect(result.snapshot.studySessions).toBe(before.studySessions);
    expect(result.snapshot.settings).toBe(before.settings);
    result.snapshot.cards.forEach((card, index) => {
      expect(card).toEqual(index < 3 ? { ...before.cards[index], archivedAt } : before.cards[index]);
    });
    expect(getDueCards(result.snapshot.cards).map(card => card.id)).toEqual(['outside']);
    expect(before.cards[0].archivedAt).toBeUndefined();
    expect(restoreMemoryCards(result.snapshot, result.ids, archivedAt)).toEqual(before);
  });
  it('archiving a child does not include parents or siblings', () => {
    const result = archiveMemoryFolder(fixture(), 'child', archivedAt);
    expect(result.ids).toEqual(['child', 'deep']);
    expect(result.snapshot.cards[0].archivedAt).toBeUndefined();
    expect(result.snapshot.cards[3].archivedAt).toBeUndefined();
  });
  it('rejects missing folders, invalid timestamps and folders without active cards', () => {
    const before = fixture();
    expect(() => archiveMemoryFolder(before, 'missing', archivedAt)).toThrow('卡组不存在');
    expect(() => archiveMemoryFolder(before, 'root', 'invalid')).toThrow('归档时间无效');
    const result = archiveMemoryFolder(before, 'root', archivedAt);
    expect(() => archiveMemoryFolder(result.snapshot, 'root', archivedAt)).toThrow('没有在学卡片');
    expect(() => archiveMemoryFolder({ ...before, cards: [] }, 'root', archivedAt)).toThrow('没有在学卡片');
  });
  it('undo preserves edits and review updates made after the operation', () => {
    const before = fixture();
    const result = archiveMemoryFolder(before, 'root', archivedAt);
    const current = { ...result.snapshot, cards: result.snapshot.cards.map(card => card.id === 'child' ? { ...card, back: 'Edited content', reps: 9 } : card) };
    const restored = restoreMemoryCards(current, result.ids, archivedAt);
    expect(restored.cards[1]).toEqual({ ...before.cards[1], back: 'Edited content', reps: 9 });
    expect(restored.cards[4]).toBe(current.cards[4]);
    expect(restored.reviewLogs).toBe(current.reviewLogs);
  });
  it('rejects stale batch undo atomically when any affected card has changed', () => {
    const result = archiveMemoryFolder(fixture(), 'root', archivedAt);
    for (const replacement of [undefined, '2026-11-01T01:00:00.000Z']) {
      const changed = { ...result.snapshot, cards: result.snapshot.cards.map(card => card.id === 'child' ? { ...card, archivedAt: replacement } : card) };
      const before = structuredClone(changed);
      expect(() => restoreMemoryCards(changed, result.ids, archivedAt)).toThrow('状态已变化');
      expect(changed).toEqual(before);
    }
    expect(() => restoreMemoryCards(result.snapshot, [...result.ids, 'missing'], archivedAt)).toThrow('状态已变化');
  });
});
