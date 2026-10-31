import { selectMemoryStudyCards } from '@/services/memory-study';
import type { Card, MemoryStudyPreferences, RecallSettings } from '@/types';

export function replanMemoryStudyQueue(
  queue: string[],
  currentId: string | null,
  completedIds: string[],
  cards: Card[],
  preferences: MemoryStudyPreferences,
  at = new Date(),
  settings?: Pick<RecallSettings, 'desiredRetention' | 'fsrsWeights'>,
): string[] {
  const available = new Set(cards.filter(card => !card.archivedAt).map(card => card.id));
  const completed = new Set(completedIds);
  const history = [...new Set(queue)].filter(id => completed.has(id) && available.has(id));
  const pinned = currentId && available.has(currentId) && !completed.has(currentId) ? [currentId] : [];
  if (currentId && completed.has(currentId) && available.has(currentId)) {
    const position = history.indexOf(currentId);
    if (position >= 0) history.splice(position, 1);
    history.push(currentId);
  }
  const occupied = new Set([...completedIds, ...pinned]);
  const remaining = Math.max(0, preferences.batchSize - history.length - pinned.length);
  const next = remaining ? selectMemoryStudyCards(
    cards.filter(card => !occupied.has(card.id)),
    { ...preferences, batchSize: remaining },
    at,
    settings,
  ).cards.map(card => card.id) : [];
  return [...history, ...pinned, ...next];
}
