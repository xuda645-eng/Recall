import { fsrs, State, type Card as FSRSCard } from 'ts-fsrs';
import type { Card, MemoryStudyPreferences, RecallSettings } from '@/types';

export function normalizeMemoryStudyPreferences(value: unknown): MemoryStudyPreferences {
  const source = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const { newCardRatio, batchSize, sessionMinutes } = source;
  return {
    newCardRatio: typeof newCardRatio === 'number' && Number.isFinite(newCardRatio)
      && newCardRatio >= 0 && newCardRatio <= 1 ? newCardRatio : 0.3,
    batchSize: typeof batchSize === 'number' && Number.isInteger(batchSize)
      && batchSize >= 1 && batchSize <= 100 ? batchSize : 10,
    sessionMinutes: typeof sessionMinutes === 'number' && Number.isInteger(sessionMinutes)
      && sessionMinutes >= 5 && sessionMinutes <= 120 ? sessionMinutes : 30,
  };
}

export function isMemoryNewCard(card: Card): boolean {
  return card.reps === 0 && card.lastReviewDate === null;
}

export function getMemoryStudyPools(
  cards: Card[],
  at = new Date(),
): { oldCards: Card[]; newCards: Card[] } {
  const oldCards: Card[] = [];
  const newCards: Card[] = [];
  const seen = new Set<string>();
  const now = at.getTime();
  for (const card of cards) {
    if (card.archivedAt || seen.has(card.id)) continue;
    if (isMemoryNewCard(card)) {
      newCards.push(card);
    } else {
      const due = Date.parse(card.nextReviewDate);
      if (!Number.isFinite(due) || due > now || !Number.isFinite(now)) continue;
      oldCards.push(card);
    }
    seen.add(card.id);
  }
  return { oldCards, newCards };
}

function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function compareCreated(first: Card, second: Card): number {
  return compareText(first.createdAt, second.createdAt) || compareText(first.id, second.id);
}

function rankingScheduler(settings?: Pick<RecallSettings, 'desiredRetention' | 'fsrsWeights'>): ReturnType<typeof fsrs> {
  const retention = settings?.desiredRetention;
  const desiredRetention = typeof retention === 'number' && Number.isFinite(retention)
    && retention >= 0.7 && retention <= 0.99 ? retention : 0.9;
  const weights = settings?.fsrsWeights;
  const validWeights = Array.isArray(weights) && [17, 19, 21].includes(weights.length)
    && weights.every(weight => typeof weight === 'number' && Number.isFinite(weight));
  try { return fsrs({ request_retention: desiredRetention, w: validWeights ? weights : undefined }); }
  catch { return fsrs({ request_retention: desiredRetention }); }
}

function recallScore(scheduler: ReturnType<typeof fsrs>, card: FSRSCard, at: Date): number | null {
  try {
    const probability = scheduler.get_retrievability(card, at, false);
    return Number.isFinite(probability) && probability >= 0 && probability <= 1 ? probability : null;
  } catch { return null; }
}

function sharesContext(first: Card | undefined, second: Card): boolean {
  return !!first && (first.deckId === second.deckId
    || (!!first.bookTitle && first.bookTitle === second.bookTitle && first.chapter === second.chapter));
}

function interleave(oldCards: Card[], newCards: Card[], ratio: number): Card[] {
  const oldQueue = [...oldCards];
  const newQueue = [...newCards];
  const cards: Card[] = [];
  const total = oldQueue.length + newQueue.length;
  let emittedNew = 0;
  while (oldQueue.length || newQueue.length) {
    const previous = cards[cards.length - 1];
    const newIndex = Math.max(0, newQueue.findIndex(card => !sharesContext(previous, card)));
    let preferNew = ratio === 1 || (ratio !== 0
      && Math.round((cards.length + 1) * newCards.length / total) > emittedNew);
    if (!newQueue.length) preferNew = false;
    else if (!oldQueue.length) preferNew = true;
    else if (ratio > 0 && ratio < 1) {
      const preferred = preferNew ? newQueue[newIndex] : oldQueue[0];
      const alternative = preferNew ? oldQueue[0] : newQueue[newIndex];
      if (sharesContext(previous, preferred) && !sharesContext(previous, alternative)) {
        preferNew = !preferNew;
      }
    }
    if (preferNew) {
      cards.push(newQueue.splice(newIndex, 1)[0]);
      emittedNew += 1;
    } else {
      cards.push(oldQueue.shift()!);
    }
  }
  return cards;
}

export function selectMemoryStudyCards(
  cards: Card[],
  preferences: MemoryStudyPreferences,
  at = new Date(),
  settings?: Pick<RecallSettings, 'desiredRetention' | 'fsrsWeights'>,
): { cards: Card[]; oldCount: number; newCount: number; totalOld: number; totalNew: number } {
  const { newCardRatio, batchSize } = normalizeMemoryStudyPreferences(preferences);
  const { oldCards, newCards } = getMemoryStudyPools(cards, at);
  const scheduler = rankingScheduler(settings);
  let fallbackScheduler: ReturnType<typeof fsrs> | undefined;
  const rankedOld = oldCards.map(card => {
    let probability = 0;
    if (card.lastReviewDate !== null && Number.isFinite(Date.parse(card.lastReviewDate))
      && Number.isFinite(card.stability) && card.stability > 0) {
      const schedulingCard: FSRSCard = {
        due: new Date(card.nextReviewDate),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsedDays,
        scheduled_days: card.scheduledDays,
        reps: card.reps,
        lapses: card.lapses,
        learning_steps: card.learningSteps,
        state: card.state === 'learning' ? State.Learning
          : card.state === 'relearning' ? State.Relearning : State.Review,
        last_review: new Date(card.lastReviewDate),
      };
      const score = recallScore(scheduler, schedulingCard, at);
      if (score === null) {
        fallbackScheduler ??= fsrs();
        probability = recallScore(fallbackScheduler, schedulingCard, at) ?? 0;
      } else probability = score;
    }
    return { card, probability: Number.isFinite(probability) ? probability : 0 };
  }).sort((first, second) => first.probability - second.probability
    || Date.parse(first.card.nextReviewDate) - Date.parse(second.card.nextReviewDate)
    || compareCreated(first.card, second.card));
  const sortedNew = [...newCards].sort(compareCreated);
  const newQuota = Math.round(batchSize * newCardRatio);
  let newCount = Math.min(newQuota, newCards.length);
  let oldCount = Math.min(batchSize - newQuota, oldCards.length);
  oldCount += Math.min(batchSize - oldCount - newCount, oldCards.length - oldCount);
  newCount += Math.min(batchSize - oldCount - newCount, newCards.length - newCount);
  return {
    cards: interleave(rankedOld.slice(0, oldCount).map(entry => entry.card), sortedNew.slice(0, newCount), newCardRatio),
    oldCount,
    newCount,
    totalOld: oldCards.length,
    totalNew: newCards.length,
  };
}
