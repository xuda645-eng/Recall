import { isMemoryNewCard } from '@/services/memory-study';
import type { Card } from '@/types';

export function memoryProgressCounts(cards: Card[]) {
  const active = cards.filter(card => !card.archivedAt);
  const fresh = active.filter(isMemoryNewCard).length;
  const review = active.filter(card => !isMemoryNewCard(card) && card.state === 'review').length;
  return { total: active.length, fresh, review, learning: active.length - fresh - review };
}

export function memoryDueForecast(cards: Card[], at = new Date(), days = 7) {
  const oldCards = cards.filter(card => !card.archivedAt && !isMemoryNewCard(card));
  return Array.from({ length: days }, (_, index) => {
    const start = new Date(at);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + index);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const count = oldCards.filter(card => {
      const due = Date.parse(card.nextReviewDate);
      return Number.isFinite(due) && (index === 0 ? due <= at.getTime() : due >= start.getTime() && due < end.getTime());
    }).length;
    return { date: start, count };
  });
}
