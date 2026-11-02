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

export function archiveMemoryFolder(snapshot: RecallStateSnapshot, id: string, archivedAt = new Date().toISOString()): { snapshot: RecallStateSnapshot; ids: string[] } {
  if (!snapshot.decks.some(deck => deck.id === id)) throw new Error('卡组不存在');
  if (!Number.isFinite(Date.parse(archivedAt))) throw new Error('归档时间无效');
  const folders = subtreeIds(snapshot.decks, id);
  const ids = snapshot.cards.filter(card => folders.has(card.deckId) && !card.archivedAt).map(card => card.id);
  if (!ids.length) throw new Error('这个卡组及子卡组没有在学卡片');
  const affected = new Set(ids);
  return { ids, snapshot: { ...snapshot, cards: snapshot.cards.map(card => affected.has(card.id) ? { ...card, archivedAt } : card) } };
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

export function restoreMemoryFolder(snapshot: RecallStateSnapshot, id: string): { snapshot: RecallStateSnapshot; ids: string[] } {
  if (!snapshot.decks.some(deck => deck.id === id)) throw new Error('卡组不存在');
  const folders = subtreeIds(snapshot.decks, id);
  const ids = snapshot.cards.filter(card => folders.has(card.deckId) && card.archivedAt).map(card => card.id);
  if (!ids.length) throw new Error('这个卡组及子卡组没有归档卡片');
  const affected = new Set(ids);
  return { ids, snapshot: { ...snapshot, cards: snapshot.cards.map(card => {
    if (!affected.has(card.id)) return card;
    const restored = { ...card };
    delete restored.archivedAt;
    return restored;
  }) } };
}
