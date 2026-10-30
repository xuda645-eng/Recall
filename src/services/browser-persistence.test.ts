import { describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import type { ReviewLog } from '@/types';
vi.mock('@/db/client', () => ({ getTauriSqlExecutor: async () => null, isTauriRuntime: () => false }));
import { getRecallRepository } from './repository';

describe('browser review persistence', () => {
  it('writes scheduling and review history before leaving the card, without duplicates', async () => {
    localStorage.clear();
    const repository = await getRecallRepository();
    const seed = createSeedSnapshot();
    await repository.saveSnapshot(seed);
    const card = { ...seed.cards[0], reps: seed.cards[0].reps + 1, nextReviewDate: '2026-11-01T00:00:00.000Z' };
    const review: ReviewLog = { id: 'browser-review', cardId: card.id, rating: 'good', reviewDate: '2026-10-30T00:00:00.000Z', stability: 2, difficulty: 4, elapsedDays: 1, scheduledDays: 2 };
    await repository.recordReview(card, review, null);
    const saved = await repository.loadAppData();
    expect(saved.cards.find(item => item.id === card.id)?.reps).toBe(card.reps);
    expect(saved.cards.find(item => item.id === card.id)?.nextReviewDate).toBe(card.nextReviewDate);
    expect(saved.reviewLogs.filter(log => log.id === review.id)).toHaveLength(1);
    await repository.recordReview(card, review, null);
    expect((await repository.loadAppData()).reviewLogs.filter(log => log.id === review.id)).toHaveLength(1);
  });
});
