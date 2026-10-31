import { applyReview, getCustomWeights, setCustomWeights } from '@/services/fsrs-engine';
import type { Card, MemoryReviewPlan, RecallSettings, ReviewRating } from '@/types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_INTERVAL = 365 * DAY;
const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

export const DEFAULT_FIXED_INTERVALS: Record<ReviewRating, number> = Object.freeze({
  again: MINUTE,
  hard: DAY,
  good: 30 * DAY,
  easy: 180 * DAY,
});

export interface MemoryReviewPreview {
  cardId: string;
  reviewedAt: string;
  fingerprint: string;
  choices: Record<ReviewRating, { card: Card; label: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeMemoryReviewPlan(plan: unknown): MemoryReviewPlan {
  const mode = isRecord(plan) && plan.mode === 'fixed' ? 'fixed' : 'smart';
  const source = isRecord(plan) && isRecord(plan.intervals) ? plan.intervals : null;
  let previous = 0;
  const valid = source !== null && RATINGS.every(rating => {
    const interval = source[rating];
    if (typeof interval !== 'number' || !Number.isInteger(interval)
      || interval < MINUTE || interval > MAX_INTERVAL || interval <= previous
      || ((rating === 'good' || rating === 'easy') && interval < DAY)) {
      return false;
    }
    previous = interval;
    return true;
  });

  return {
    mode,
    intervals: valid && source ? {
      again: source.again as number,
      hard: source.hard as number,
      good: source.good as number,
      easy: source.easy as number,
    } : { ...DEFAULT_FIXED_INTERVALS },
  };
}

export function reviewFingerprint(card: Card, settings: RecallSettings): string {
  return JSON.stringify({
    cardId: card.id,
    updatedAt: card.updatedAt,
    state: card.state,
    lastReviewDate: card.lastReviewDate,
    nextReviewDate: card.nextReviewDate,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learningSteps,
    reviewPlan: normalizeMemoryReviewPlan(settings.reviewPlan),
    desiredRetention: settings.desiredRetention,
    fsrsWeights: settings.fsrsWeights,
  });
}

function intervalLabel(interval: number): string {
  if (interval <= 0) return '立即复习';
  if (interval < MINUTE) return '不足 1 分钟';
  const unit = interval >= DAY ? DAY : interval >= HOUR ? HOUR : MINUTE;
  const label = unit === DAY ? '天' : unit === HOUR ? '小时' : '分钟';
  return `${Number((interval / unit).toFixed(2))} ${label}`;
}

export function previewMemoryReview(
  card: Card,
  settings: RecallSettings,
  at: Date,
): MemoryReviewPreview {
  const reviewedAt = at.toISOString();
  const fingerprint = reviewFingerprint(card, settings);
  const plan = normalizeMemoryReviewPlan(settings.reviewPlan);
  const previousWeights = getCustomWeights();
  setCustomWeights(settings.fsrsWeights);
  try {
    const choice = (rating: ReviewRating): { card: Card; label: string } => {
      const reviewed = applyReview(card, rating, at, settings.desiredRetention);
      let next = plan.mode === 'fixed' ? {
        ...reviewed,
        nextReviewDate: new Date(at.getTime() + plan.intervals[rating]).toISOString(),
        scheduledDays: plan.intervals[rating] / DAY,
      } : reviewed;
      const minimumDue = at.getTime() + DAY;
      if ((rating === 'good' || rating === 'easy')
        && new Date(next.nextReviewDate).getTime() < minimumDue) {
        next = { ...next, nextReviewDate: new Date(minimumDue).toISOString(), scheduledDays: 1 };
      }
      return {
        card: next,
        label: intervalLabel(new Date(next.nextReviewDate).getTime() - at.getTime()),
      };
    };
    return {
      cardId: card.id,
      reviewedAt,
      fingerprint,
      choices: {
        again: choice('again'),
        hard: choice('hard'),
        good: choice('good'),
        easy: choice('easy'),
      },
    };
  } finally {
    setCustomWeights(previousWeights);
  }
}
