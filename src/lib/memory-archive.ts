import type { RecallStateSnapshot } from '@/types';
import { subtreeIds } from '@/lib/memory-folders';

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
