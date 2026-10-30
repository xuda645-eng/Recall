import type { RecallStateSnapshot } from '@/types';

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
