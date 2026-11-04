import type { Card, Deck } from '@/types';
import { memoryArchiveFolderState } from '@/lib/memory-archive';
import { subtreeIds } from '@/lib/memory-folders';
import { getMemoryStudyPools } from '@/services/memory-study';

export function memoryStudyDecks(decks: Deck[], cards: Card[], at = new Date()) {
  const archived = memoryArchiveFolderState(decks, cards).ids;
  const activeDecks = decks.filter(deck => !archived.has(deck.id));
  const activeIds = new Set(activeDecks.map(deck => deck.id));
  const activeCards = cards.filter(card => !card.archivedAt && activeIds.has(card.deckId));
  const summarize = (scope: Card[]) => {
    const { oldCards, newCards } = getMemoryStudyPools(scope, at);
    return { cards: scope, due: oldCards.length, fresh: newCards.length, total: scope.length };
  };
  return {
    decks: activeDecks.map(deck => {
      const ids = subtreeIds(activeDecks, deck.id);
      return { deck, ...summarize(activeCards.filter(card => ids.has(card.deckId))) };
    }),
    all: summarize(activeCards),
  };
}
