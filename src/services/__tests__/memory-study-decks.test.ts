import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { memoryStudyDecks } from '@/services/memory-study-decks';
import type { Card } from '@/types';

const at = new Date('2026-11-04T12:00:00Z');
const seed = createSeedSnapshot(at);
const decks = ['root', 'child', 'empty', 'archived', 'archived-empty'].map(id => ({ ...seed.decks[0], id, parentId: id === 'child' ? 'root' : id === 'archived-empty' ? 'archived' : null }));
function card(id: string, deckId: string, changes: Partial<Card> = {}): Card {
  return { ...seed.cards[0], id, deckId, archivedAt: undefined, reps: 2, lastReviewDate: at.toISOString(), nextReviewDate: at.toISOString(), ...changes };
}

describe('review deck scope', () => {
  it('includes empty active decks, excludes archived branches and never sums nested totals', () => {
    const cards = [card('parent', 'root'), card('due', 'child'), card('new', 'child', { reps: 0, lastReviewDate: null }), card('future', 'child', { nextReviewDate: '2099-01-01T00:00:00Z' }), card('invalid', 'child', { nextReviewDate: 'invalid' }), card('gone', 'child', { archivedAt: at.toISOString() }), card('archive', 'archived', { archivedAt: at.toISOString() })];
    const before = JSON.stringify({ decks, cards });
    const result = memoryStudyDecks(decks, cards, at);
    expect(result.decks.map(item => item.deck.id)).toEqual(['root', 'child', 'empty']);
    expect(result.decks.map(({ due, fresh, total }) => ({ due, fresh, total }))).toEqual([{ due: 2, fresh: 1, total: 5 }, { due: 1, fresh: 1, total: 4 }, { due: 0, fresh: 0, total: 0 }]);
    expect(result.all.total).toBe(5);
    expect(result.all.due).toBe(2);
    expect(result.all.fresh).toBe(1);
    expect(JSON.stringify({ decks, cards })).toBe(before);
  });
});
