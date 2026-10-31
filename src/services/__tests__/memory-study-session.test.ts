import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { replanMemoryStudyQueue } from '@/services/memory-study-session';
import type { Card } from '@/types';

const at = new Date('2026-11-01T00:00:00Z');
const preferences = { newCardRatio: 1, batchSize: 3, sessionMinutes: 30 };
function card(id: string, fresh = false): Card {
  return {
    ...createSeedSnapshot(at).cards[0], id, archivedAt: undefined,
    nextReviewDate: at.toISOString(), state: fresh ? 'new' : 'review',
    lastReviewDate: fresh ? null : '2026-10-20T00:00:00Z', reps: fresh ? 0 : 4,
    stability: fresh ? 0 : 4, difficulty: 4,
  };
}

describe('replanMemoryStudyQueue', () => {
  it('keeps completed history and the current old card when switching to new priority', () => {
    const cards = [card('done'), card('current'), card('old'), card('new-1', true), card('new-2', true)];
    const original = structuredClone(cards);
    expect(replanMemoryStudyQueue(['done', 'current', 'old'], 'current', ['done'], cards, preferences, at))
      .toEqual(['done', 'current', 'new-1']);
    expect(cards).toEqual(original);
  });

  it('never reintroduces a completed due card and can reduce the batch without losing the current card', () => {
    const cards = [card('done'), card('current'), card('next', true)];
    expect(replanMemoryStudyQueue(['done', 'current'], 'current', ['done'], cards, { ...preferences, batchSize: 1 }, at))
      .toEqual(['done', 'current']);
  });

  it('preserves a currently displayed rated card as the last history item', () => {
    const cards = [card('first'), card('second'), card('next', true)];
    const result = replanMemoryStudyQueue(['first', 'second'], 'first', ['first', 'second'], cards, preferences, at);
    expect(result).toEqual(['second', 'first', 'next']);
    expect(new Set(result).size).toBe(result.length);
  });

  it('excludes archived and future old cards while retaining eligible cards in the given scope', () => {
    const cards = [card('archived'), card('future'), card('fresh', true)];
    cards[0].archivedAt = at.toISOString();
    cards[1].nextReviewDate = '2026-12-01T00:00:00Z';
    expect(replanMemoryStudyQueue(['archived'], null, [], cards, preferences, at)).toEqual(['fresh']);
  });
});
