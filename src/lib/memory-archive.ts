import type { Card, Deck, RecallStateSnapshot } from '@/types';
import { subtreeIds } from '@/lib/memory-folders';

export function memoryArchiveFolderState(decks: Deck[], cards: Card[]): { ids: Set<string>; times: Map<string, string> } {
  const parents = new Map(decks.map(deck => [deck.id, deck.parentId ?? null]));
  const active = new Set<string>();
  const times = new Map<string, string>();
  for (const card of cards) {
    let folderId: string | null = card.deckId;
    if (card.archivedAt) {
      const timestamp = Date.parse(card.archivedAt) || 0;
      while (folderId) {
        const previous = times.get(folderId);
        if (previous && (Date.parse(previous) || 0) >= timestamp) break;
        times.set(folderId, card.archivedAt);
        folderId = parents.get(folderId) ?? null;
      }
    } else {
      while (folderId && !active.has(folderId)) {
        active.add(folderId);
        folderId = parents.get(folderId) ?? null;
      }
    }
  }
  const ids = new Set(decks.filter(deck => times.has(deck.id) && !active.has(deck.id)).map(deck => deck.id));
  for (const deck of decks) {
    if (ids.has(deck.id) || active.has(deck.id)) continue;
    let parentId = parents.get(deck.id);
    const seen = new Set([deck.id]);
    while (parentId && !seen.has(parentId)) {
      if (ids.has(parentId)) {
        ids.add(deck.id);
        times.set(deck.id, times.get(parentId)!);
        break;
      }
      seen.add(parentId);
      parentId = parents.get(parentId);
    }
  }
  const marked = new Set<string>();
  for (const deck of decks) {
    if (deck.archivedAt && Number.isFinite(Date.parse(deck.archivedAt))) {
      marked.add(deck.id);
      let folderId: string | null = deck.id;
      const seen = new Set<string>();
      while (folderId && !seen.has(folderId)) {
        seen.add(folderId);
        const previous = times.get(folderId);
        if (!previous || Date.parse(previous) < Date.parse(deck.archivedAt)) times.set(folderId, deck.archivedAt);
        folderId = parents.get(folderId) ?? null;
      }
    } else if (!ids.has(deck.id)) {
      let folderId: string | null = deck.id;
      while (folderId && !active.has(folderId)) {
        active.add(folderId);
        folderId = parents.get(folderId) ?? null;
      }
    }
  }
  for (const id of marked) ids.add(id);
  for (const id of active) ids.delete(id);
  return { ids, times };
}

export function archiveMemoryCard(snapshot: RecallStateSnapshot, id: string, archivedAt = new Date().toISOString()): RecallStateSnapshot {
  const card = snapshot.cards.find(candidate => candidate.id === id);
  if (!card) throw new Error('卡片不存在');
  if (card.archivedAt) throw new Error('卡片已归档');
  if (!Number.isFinite(Date.parse(archivedAt))) throw new Error('归档时间无效');
  return { ...snapshot, cards: snapshot.cards.map(candidate => candidate.id === id ? { ...candidate, archivedAt } : candidate) };
}

export function restoreMemoryCard(snapshot: RecallStateSnapshot, id: string, expectedArchivedAt?: string): RecallStateSnapshot {
  const card = snapshot.cards.find(candidate => candidate.id === id);
  if (!card?.archivedAt) throw new Error('这张卡片已不在归档中');
  if (expectedArchivedAt && card.archivedAt !== expectedArchivedAt) throw new Error('归档状态已变化，请从已归档列表恢复');
  return { ...snapshot, cards: snapshot.cards.map(candidate => {
    if (candidate.id !== id) return candidate;
    const restored = { ...candidate };
    delete restored.archivedAt;
    return restored;
  }) };
}

export function archiveMemoryFolder(snapshot: RecallStateSnapshot, id: string, archivedAt = new Date().toISOString()): { snapshot: RecallStateSnapshot; ids: string[]; deckIds: string[] } {
  if (!snapshot.decks.some(deck => deck.id === id)) throw new Error('卡组不存在');
  if (!Number.isFinite(Date.parse(archivedAt))) throw new Error('归档时间无效');
  const folders = subtreeIds(snapshot.decks, id);
  const cards = snapshot.cards.filter(card => folders.has(card.deckId));
  const ids = cards.filter(card => !card.archivedAt).map(card => card.id);
  if (!cards.length && !memoryArchiveFolderState(snapshot.decks, snapshot.cards).ids.has(id)) {
    const deckIds = snapshot.decks.filter(deck => folders.has(deck.id) && !deck.archivedAt).map(deck => deck.id);
    const affected = new Set(deckIds);
    return { ids, deckIds, snapshot: { ...snapshot, decks: snapshot.decks.map(deck => affected.has(deck.id) ? { ...deck, archivedAt } : deck) } };
  }
  if (!ids.length) throw new Error('这个卡组及子卡组没有在学卡片');
  const affected = new Set(ids);
  return { ids, deckIds: [], snapshot: { ...snapshot, cards: snapshot.cards.map(card => affected.has(card.id) ? { ...card, archivedAt } : card) } };
}

export function restoreMemoryCards(snapshot: RecallStateSnapshot, ids: string[], expectedArchivedAt: string): RecallStateSnapshot {
  const affected = new Set(ids);
  const cards = new Map(snapshot.cards.map(card => [card.id, card]));
  for (const id of affected) {
    const card = cards.get(id);
    if (!card?.archivedAt || card.archivedAt !== expectedArchivedAt) throw new Error('归档状态已变化，请从已归档列表恢复');
  }
  return { ...snapshot, cards: snapshot.cards.map(card => {
    if (!affected.has(card.id)) return card;
    const restored = { ...card };
    delete restored.archivedAt;
    return restored;
  }) };
}

export function undoMemoryFolderArchive(snapshot: RecallStateSnapshot, ids: string[], deckIds: string[], expectedArchivedAt: string): RecallStateSnapshot {
  const affected = new Set(deckIds);
  const decks = new Map(snapshot.decks.map(deck => [deck.id, deck]));
  for (const id of affected) {
    const deck = decks.get(id);
    if (!deck?.archivedAt || deck.archivedAt !== expectedArchivedAt) throw new Error('归档状态已变化，请从已归档列表恢复');
  }
  const restored = restoreMemoryCards(snapshot, ids, expectedArchivedAt);
  if (!affected.size) return restored;
  return { ...restored, decks: snapshot.decks.map(deck => {
    if (!affected.has(deck.id)) return deck;
    const restoredDeck = { ...deck };
    delete restoredDeck.archivedAt;
    return restoredDeck;
  }) };
}

export function restoreMemoryFolder(snapshot: RecallStateSnapshot, id: string): { snapshot: RecallStateSnapshot; ids: string[]; deckIds: string[] } {
  if (!snapshot.decks.some(deck => deck.id === id)) throw new Error('卡组不存在');
  const folders = subtreeIds(snapshot.decks, id);
  const ids = snapshot.cards.filter(card => folders.has(card.deckId) && card.archivedAt).map(card => card.id);
  const deckIds = snapshot.decks.filter(deck => folders.has(deck.id) && deck.archivedAt).map(deck => deck.id);
  if (!ids.length && !deckIds.length) throw new Error('这个卡组及子卡组没有归档卡片');
  const affected = new Set(ids);
  const affectedDecks = new Set(deckIds);
  return { ids, deckIds, snapshot: { ...snapshot, decks: affectedDecks.size ? snapshot.decks.map(deck => {
    if (!affectedDecks.has(deck.id)) return deck;
    const restored = { ...deck };
    delete restored.archivedAt;
    return restored;
  }) : snapshot.decks, cards: snapshot.cards.map(card => {
    if (!affected.has(card.id)) return card;
    const restored = { ...card };
    delete restored.archivedAt;
    return restored;
  }) } };
}

export function deleteArchivedMemoryCard(snapshot: RecallStateSnapshot, id: string, expectedArchivedAt: string): RecallStateSnapshot {
  const card = snapshot.cards.find(candidate => candidate.id === id);
  if (!card?.archivedAt || card.archivedAt !== expectedArchivedAt) throw new Error('归档状态已变化，请重新确认删除');
  return { ...snapshot, cards: snapshot.cards.filter(candidate => candidate.id !== id), reviewLogs: snapshot.reviewLogs.filter(log => log.cardId !== id) };
}

export function deleteArchivedMemoryFolder(snapshot: RecallStateSnapshot, id: string, expected: { deckIds: string[]; cardIds: string[] }): RecallStateSnapshot {
  if (!memoryArchiveFolderState(snapshot.decks, snapshot.cards).ids.has(id)) throw new Error('卡组已不在归档中，请重新确认');
  const folders = subtreeIds(snapshot.decks, id);
  const cards = snapshot.cards.filter(card => folders.has(card.deckId));
  const expectedDecks = new Set(expected.deckIds);
  const expectedCards = new Set(expected.cardIds);
  if (cards.some(card => !card.archivedAt) || folders.size !== expectedDecks.size || [...folders].some(folder => !expectedDecks.has(folder)) || cards.length !== expectedCards.size || cards.some(card => !expectedCards.has(card.id))) {
    throw new Error('卡组内容已变化，请重新确认删除范围');
  }
  const affected = new Set(cards.map(card => card.id));
  return {
    ...snapshot,
    decks: snapshot.decks.filter(deck => !folders.has(deck.id)),
    cards: snapshot.cards.filter(card => !affected.has(card.id)),
    reviewLogs: snapshot.reviewLogs.filter(log => !affected.has(log.cardId)),
    studySessions: snapshot.studySessions.filter(session => !session.deckId || !folders.has(session.deckId)),
  };
}
