import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { memoryDueForecast, memoryProgressCounts } from '@/services/memory-statistics';
import { getMemoryStudyPools } from '@/services/memory-study';
import type { Card } from '@/types';

const at = new Date('2026-11-04T12:00:00');
const base = createSeedSnapshot(at).cards[0];
function card(id: string, changes: Partial<Card> = {}): Card {
  return { ...base, id, archivedAt: undefined, state: 'review', reps: 2, lastReviewDate: at.toISOString(), nextReviewDate: at.toISOString(), ...changes };
}

describe('memory statistics use the same definitions as study queues', () => {
  it('separates never-rated, learning/relearning and long-term review cards', () => {
    const cards = [card('new', { state: 'review', reps: 0, lastReviewDate: null }), card('learning', { state: 'learning' }), card('relearning', { state: 'relearning' }), card('review'), card('archived', { archivedAt: at.toISOString() })];
    expect(memoryProgressCounts(cards)).toEqual({ total: 4, fresh: 1, learning: 2, review: 1 });
    expect(memoryProgressCounts(cards).fresh).toBe(getMemoryStudyPools(cards, at).newCards.length);
  });

  it('counts actual overdue old cards, excluding new, archived, invalid and later-today cards', () => {
    const tomorrow = new Date(at); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
    const cards = [card('now'), card('overdue', { nextReviewDate: new Date(at.getTime() - 86400000).toISOString() }), card('later', { nextReviewDate: new Date(at.getTime() + 3600000).toISOString() }), card('tomorrow', { nextReviewDate: tomorrow.toISOString() }), card('new', { reps: 0, lastReviewDate: null }), card('archived', { archivedAt: at.toISOString() }), card('invalid', { nextReviewDate: 'invalid' })];
    expect(memoryDueForecast(cards, at).map(entry => entry.count)).toEqual([2, 1, 0, 0, 0, 0, 0]);
    expect(memoryDueForecast(cards, at)[0].count).toBe(getMemoryStudyPools(cards, at).oldCards.length);
  });

  it('counts the start of each future local day once and leaves the input unchanged', () => {
    const tomorrow = new Date(at); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
    const following = new Date(tomorrow); following.setDate(following.getDate() + 1);
    const cards = [card('tomorrow', { nextReviewDate: tomorrow.toISOString() }), card('following', { nextReviewDate: following.toISOString() })];
    const before = JSON.stringify(cards);
    expect(memoryDueForecast(cards, at, 3).map(entry => entry.count)).toEqual([0, 1, 1]);
    expect(JSON.stringify(cards)).toBe(before);
  });
});
