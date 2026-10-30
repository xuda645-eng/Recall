import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { archiveMemoryCard, restoreMemoryCard } from './memory-archive';
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
