import { afterEach, describe, expect, it, vi } from 'vitest';
import { default_w, fsrs, State } from 'ts-fsrs';
import { getCustomWeights, setCustomWeights } from '@/services/fsrs-engine';
import {
  getMemoryStudyPools,
  isMemoryNewCard,
  normalizeMemoryStudyPreferences,
  selectMemoryStudyCards,
} from '@/services/memory-study';
import type { Card, MemoryStudyPreferences } from '@/types';

const at = new Date('2026-11-01T04:00:00.000Z');
const DAY = 86_400_000;
const defaults: MemoryStudyPreferences = { newCardRatio: 0.3, batchSize: 10, sessionMinutes: 30 };

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id, deckId: 'deck-1', front: 'Question', back: 'Answer', hint: '', source: '', tags: [],
    cardType: 'basic', state: 'review', stability: 5, difficulty: 4, elapsedDays: 5,
    scheduledDays: 5, reps: 3, lapses: 0, learningSteps: 0,
    lastReviewDate: new Date(at.getTime() - 5 * DAY).toISOString(), nextReviewDate: at.toISOString(),
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-27T04:00:00.000Z',
    ...overrides,
  };
}

function library(oldCount: number, newCount: number): Card[] {
  return [
    ...Array.from({ length: oldCount }, (_, index) => makeCard(`old-${String(index).padStart(3, '0')}`)),
    ...Array.from({ length: newCount }, (_, index) => makeCard(`new-${String(index).padStart(3, '0')}`, {
      state: 'new', reps: 0, lastReviewDate: null, stability: 0, difficulty: 0,
    })),
  ];
}

function recallProbability(card: Card, weights?: number[]): number {
  return fsrs({ w: weights }).get_retrievability({
    due: new Date(card.nextReviewDate), stability: card.stability, difficulty: card.difficulty,
    elapsed_days: card.elapsedDays, scheduled_days: card.scheduledDays, reps: card.reps,
    lapses: card.lapses, learning_steps: card.learningSteps, state: State.Review,
    last_review: new Date(card.lastReviewDate!),
  }, at, false);
}

afterEach(() => { setCustomWeights(null); vi.useRealTimers(); });

describe('normalizeMemoryStudyPreferences', () => {
  it.each([undefined, null, [], true, 1, 'preferences', {}])('uses safe defaults for %j', value => {
    expect(normalizeMemoryStudyPreferences(value)).toEqual(defaults);
  });

  it.each([
    { newCardRatio: 0, batchSize: 1, sessionMinutes: 5 },
    { newCardRatio: 1, batchSize: 100, sessionMinutes: 120 },
    { newCardRatio: 0.125, batchSize: 17, sessionMinutes: 46 },
  ])('accepts validated bounds and intermediate values %j', value => {
    expect(normalizeMemoryStudyPreferences(value)).toEqual(value);
    expect(normalizeMemoryStudyPreferences(value)).not.toBe(value);
  });

  it.each([NaN, Infinity, -Infinity, -0.01, 1.01, '0.3', null])('rejects ratio %j independently', newCardRatio => {
    expect(normalizeMemoryStudyPreferences({ newCardRatio, batchSize: 22, sessionMinutes: 45 }))
      .toEqual({ newCardRatio: 0.3, batchSize: 22, sessionMinutes: 45 });
  });

  it.each([NaN, Infinity, 0, -1, 101, 10.5, '10', null])('rejects batch size %j', batchSize => {
    expect(normalizeMemoryStudyPreferences({ batchSize }).batchSize).toBe(10);
  });

  it.each([NaN, Infinity, 4, -1, 121, 30.5, '30', null])('rejects session minutes %j', sessionMinutes => {
    expect(normalizeMemoryStudyPreferences({ sessionMinutes }).sessionMinutes).toBe(30);
  });

  it('returns independent default values', () => {
    normalizeMemoryStudyPreferences(undefined).batchSize = 1;
    expect(normalizeMemoryStudyPreferences(undefined)).toEqual(defaults);
  });
});

describe('isMemoryNewCard and getMemoryStudyPools', () => {
  it.each(['new', 'learning', 'review', 'relearning'] as const)('classifies never-graded cards as new regardless of %s state', state => {
    expect(isMemoryNewCard(makeCard('new', { state, reps: 0, lastReviewDate: null }))).toBe(true);
    expect(isMemoryNewCard(makeCard('graded', { state, reps: 1, lastReviewDate: null }))).toBe(false);
    expect(isMemoryNewCard(makeCard('reviewed', { state, reps: 0 }))).toBe(false);
  });

  it('only returns due, valid, non-archived old cards and never-graded new cards without duplicate ids', () => {
    const due = makeCard('due');
    const reset = makeCard('reset', { state: 'new' });
    const newCard = makeCard('new', { reps: 0, lastReviewDate: null, nextReviewDate: 'invalid' });
    const cards = [
      due, { ...due }, reset, newCard, { ...newCard },
      makeCard('future', { nextReviewDate: new Date(at.getTime() + 1).toISOString() }),
      makeCard('invalid', { nextReviewDate: 'invalid' }), makeCard('empty', { nextReviewDate: '' }),
      makeCard('archived-old', { archivedAt: at.toISOString() }),
      makeCard('archived-new', { archivedAt: at.toISOString(), reps: 0, lastReviewDate: null }),
      { ...newCard, reps: 1, lastReviewDate: at.toISOString() },
    ];
    const original = structuredClone(cards);
    expect(getMemoryStudyPools(cards, at)).toEqual({ oldCards: [due, reset], newCards: [newCard] });
    expect(cards).toEqual(original);
  });

  it('excludes old cards when the supplied clock is invalid', () => {
    expect(getMemoryStudyPools(library(2, 2), new Date(NaN)).oldCards).toEqual([]);
  });

  it('uses the current clock when at is omitted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(at);
    const cards = [makeCard('due'), makeCard('future', { nextReviewDate: new Date(at.getTime() + 1).toISOString() })];
    expect(getMemoryStudyPools(cards).oldCards.map(card => card.id)).toEqual(['due']);
    expect(selectMemoryStudyCards(cards, defaults).cards.map(card => card.id)).toEqual(['due']);
  });
});

describe('selectMemoryStudyCards', () => {
  it.each([
    { ratio: 0.3, batch: 10, old: 20, fresh: 20, expectedOld: 7, expectedNew: 3 },
    { ratio: 0.5, batch: 5, old: 20, fresh: 20, expectedOld: 2, expectedNew: 3 },
    { ratio: 0.3, batch: 10, old: 20, fresh: 1, expectedOld: 9, expectedNew: 1 },
    { ratio: 0.3, batch: 10, old: 2, fresh: 20, expectedOld: 2, expectedNew: 8 },
    { ratio: 0.3, batch: 10, old: 1, fresh: 2, expectedOld: 1, expectedNew: 2 },
    { ratio: 0, batch: 10, old: 20, fresh: 20, expectedOld: 10, expectedNew: 0 },
    { ratio: 1, batch: 10, old: 20, fresh: 20, expectedOld: 0, expectedNew: 10 },
    { ratio: 0, batch: 10, old: 2, fresh: 20, expectedOld: 2, expectedNew: 8 },
    { ratio: 1, batch: 10, old: 20, fresh: 2, expectedOld: 8, expectedNew: 2 },
    { ratio: 0.3, batch: 10, old: 0, fresh: 0, expectedOld: 0, expectedNew: 0 },
  ])('reserves a rounded count quota and fills shortages: %j', scenario => {
    const cards = library(scenario.old, scenario.fresh);
    const result = selectMemoryStudyCards(cards, { ...defaults, newCardRatio: scenario.ratio, batchSize: scenario.batch }, at);
    expect(result).toMatchObject({
      oldCount: scenario.expectedOld, newCount: scenario.expectedNew, totalOld: scenario.old, totalNew: scenario.fresh,
    });
    expect(result.cards).toHaveLength(scenario.expectedOld + scenario.expectedNew);
    expect(result.cards.filter(isMemoryNewCard)).toHaveLength(scenario.expectedNew);
    expect(new Set(result.cards.map(card => card.id)).size).toBe(result.cards.length);
    if (scenario.ratio === 0) {
      expect(result.cards.slice(0, result.oldCount).every(card => !isMemoryNewCard(card))).toBe(true);
    } else if (scenario.ratio === 1) {
      expect(result.cards.slice(0, result.newCount).every(isMemoryNewCard)).toBe(true);
    }
  });

  it('sorts due old cards by installed FSRS numeric retrievability, not simply due date', () => {
    const strong = makeCard('strong', { stability: 100, nextReviewDate: '2026-10-01T00:00:00.000Z' });
    const weak = makeCard('weak', { stability: 1, nextReviewDate: at.toISOString() });
    const middle = makeCard('middle', { stability: 5 });
    const future = makeCard('future', { stability: 0.1, nextReviewDate: new Date(at.getTime() + 1).toISOString() });
    const result = selectMemoryStudyCards([strong, future, middle, weak], { ...defaults, newCardRatio: 0 }, at);
    expect(result.cards.map(card => card.id)).toEqual(['weak', 'middle', 'strong']);
    expect(result.totalOld).toBe(3);
    const probabilities = result.cards.map(card => recallProbability(card));
    expect(probabilities).toEqual([...probabilities].sort((first, second) => first - second));
  });

  it('ranks graded State.New cards using their actual history and safely prioritizes unknown histories', () => {
    const reset = makeCard('reset', { state: 'new', stability: 100 });
    const weak = makeCard('weak', { stability: 1 });
    const missing = makeCard('missing', { lastReviewDate: null });
    const invalid = makeCard('invalid', { lastReviewDate: 'invalid', nextReviewDate: '2026-10-31T00:00:00.000Z' });
    const zero = makeCard('zero', { stability: 0, nextReviewDate: '2026-10-30T00:00:00.000Z' });
    expect(selectMemoryStudyCards([reset, weak, missing, invalid, zero], { ...defaults, newCardRatio: 0 }, at).cards.map(card => card.id))
      .toEqual(['zero', 'invalid', 'missing', 'weak', 'reset']);
  });

  it('estimates recall using the real last-review timestamp rather than stale elapsed/scheduled counters', () => {
    const recent = makeCard('recent', {
      lastReviewDate: new Date(at.getTime() - DAY).toISOString(), elapsedDays: 100, scheduledDays: 100,
    });
    const older = makeCard('older', {
      lastReviewDate: new Date(at.getTime() - 20 * DAY).toISOString(), elapsedDays: 0, scheduledDays: 0,
    });
    expect(selectMemoryStudyCards([recent, older], { ...defaults, newCardRatio: 0 }, at).cards)
      .toEqual([older, recent]);
  });

  it('uses supplied FSRS weights without reading or changing global scheduling weights', () => {
    const weights = [...default_w];
    weights[20] = 0.8;
    const cards = [makeCard('older', { stability: 10 }), makeCard('weaker', { stability: 0.5 })];
    const globalWeights = [...default_w];
    setCustomWeights(globalWeights);
    const original = structuredClone({ cards, weights, globalWeights });
    const result = selectMemoryStudyCards(cards, { ...defaults, newCardRatio: 0 }, at, {
      desiredRetention: 0.95, fsrsWeights: weights,
    });
    expect(result.cards).toEqual([...cards].sort((first, second) => recallProbability(first, weights) - recallProbability(second, weights)));
    expect(getCustomWeights()).toBe(globalWeights);
    expect({ cards, weights, globalWeights }).toEqual(original);
  });

  it.each([17, 19, 21])('supports finite legacy %i-weight formats for ranking', length => {
    const weights = default_w.slice(0, length);
    const cards = [makeCard('strong', { stability: 100 }), makeCard('weak', { stability: 1 })];
    const result = selectMemoryStudyCards(cards, { ...defaults, newCardRatio: 0 }, at, { desiredRetention: 0.9, fsrsWeights: weights });
    expect(result.cards.map(card => card.id)).toEqual(['weak', 'strong']);
  });

  it.each(['bad', NaN, Infinity, { valueOf: 0, toString: 0 }])('uses default ranking for malformed weights without overwriting them: %j', invalid => {
    const weights = [...default_w];
    weights[20] = invalid as unknown as number;
    const settings = { desiredRetention: 0.9, fsrsWeights: weights };
    const cards = [makeCard('strong', { stability: 100, nextReviewDate: '2026-10-01T00:00:00Z' }), makeCard('weak', { stability: 1 })];
    const result = selectMemoryStudyCards(cards, { ...defaults, newCardRatio: 0 }, at, settings);
    expect(result.cards.map(card => card.id)).toEqual(['weak', 'strong']);
    expect(settings.fsrsWeights).toBe(weights);
    expect(settings.fsrsWeights[20]).toEqual(invalid);
    expect(() => selectMemoryStudyCards([], defaults, at, settings)).not.toThrow();
  });

  it.each([2, -0.5, Infinity, NaN])('uses valid ranking retention without rewriting raw invalid retention %s', desiredRetention => {
    const settings = { desiredRetention, fsrsWeights: null };
    const cards = [makeCard('strong', { stability: 100 }), makeCard('weak', { stability: 1 })];
    expect(selectMemoryStudyCards(cards, { ...defaults, newCardRatio: 0 }, at, settings).cards.map(card => card.id))
      .toEqual(['weak', 'strong']);
    expect(settings.desiredRetention).toBe(desiredRetention);
  });

  it('breaks probability ties by due date, creation date, then id independently of input order', () => {
    const cards = [
      makeCard('z'), makeCard('a'),
      makeCard('created-first', { createdAt: '2026-09-01T00:00:00.000Z' }),
      makeCard('due-first', { nextReviewDate: '2026-10-31T00:00:00.000Z' }),
    ];
    const expected = ['due-first', 'created-first', 'a', 'z'];
    for (const input of [cards, [...cards].reverse()]) {
      expect(selectMemoryStudyCards(input, { ...defaults, newCardRatio: 0 }, at).cards.map(card => card.id)).toEqual(expected);
    }
  });

  it('interleaves categories and decks while preserving sorted old-card priority', () => {
    const oldCards = library(4, 0).map(card => ({ ...card, deckId: 'old-deck' }));
    const newCards = library(0, 4).map(card => ({ ...card, deckId: 'new-deck' }));
    const result = selectMemoryStudyCards([...newCards, ...oldCards], { ...defaults, batchSize: 8, newCardRatio: 0.5 }, at);
    expect(result.cards.map(isMemoryNewCard)).toEqual([true, false, true, false, true, false, true, false]);
    expect(result.cards.filter(card => !isMemoryNewCard(card))).toEqual(oldCards);
    expect(result.cards.every((card, index) => index === 0 || card.deckId !== result.cards[index - 1].deckId)).toBe(true);
  });

  it('avoids same new-card deck/context blocks where another selected context is available', () => {
    const cards = library(0, 4).map((card, index) => ({ ...card, deckId: index < 2 ? 'a' : 'b' }));
    const result = selectMemoryStudyCards(cards, { ...defaults, newCardRatio: 1 }, at);
    expect(result.cards.map(card => card.deckId)).toEqual(['a', 'b', 'a', 'b']);
    const contextCards = cards.map((card, index) => ({
      ...card, deckId: card.id, bookTitle: index < 2 ? 'Book A' : 'Book B', chapter: 'Chapter',
    }));
    expect(selectMemoryStudyCards(contextCards, { ...defaults, newCardRatio: 1 }, at).cards.map(card => card.bookTitle))
      .toEqual(['Book A', 'Book B', 'Book A', 'Book B']);
  });

  it('normalizes caller preferences, removes duplicates, is deterministic, and never mutates frozen inputs', () => {
    const cards = library(12, 12);
    cards.push({ ...cards[0] });
    cards.forEach(card => { Object.freeze(card.tags); Object.freeze(card); });
    Object.freeze(cards);
    const preferences = Object.freeze({ newCardRatio: NaN, batchSize: 101, sessionMinutes: 2 });
    const first = selectMemoryStudyCards(cards, preferences, at);
    expect(first).toEqual(selectMemoryStudyCards([...cards].reverse(), preferences, at));
    expect(first).toMatchObject({ oldCount: 7, newCount: 3, totalOld: 12, totalNew: 12 });
  });
});
