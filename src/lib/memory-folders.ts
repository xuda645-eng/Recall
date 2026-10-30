import type { Card, Deck, RecallStateSnapshot } from '@/types';
import { createId, normalizeName } from '@/lib/utils';

export function folderPath(decks: Deck[], id: string | null): Deck[] {
  const result: Deck[] = [], seen = new Set<string>();
  while (id) { if (seen.has(id)) throw new Error('卡组不能循环嵌套'); seen.add(id); const d = decks.find(x => x.id === id); if (!d) throw new Error('上级卡组不存在'); result.unshift(d); id = d.parentId ?? null; }
  return result;
}
export function subtreeIds(decks: Deck[], root: string | null): Set<string> {
  const found = new Set<string>(), queue = root ? [root] : decks.filter(d => !d.parentId).map(d => d.id);
  while (queue.length) { const id = queue.shift()!; if (found.has(id)) continue; found.add(id); queue.push(...decks.filter(d => d.parentId === id).map(d => d.id)); }
  return found;
}
export function validateTree(decks: Deck[]): void {
  const ids = new Set(decks.map(d => d.id)), names = new Set<string>();
  for (const d of decks) { if (d.parentId && !ids.has(d.parentId)) throw new Error('上级卡组不存在'); folderPath(decks, d.id); const key = JSON.stringify([d.parentId ?? null, normalizeName(d.name).toLowerCase()]); if (names.has(key)) throw new Error('同一位置已有同名卡组'); names.add(key); }
}
export function migrateFolders(snapshot: RecallStateSnapshot): RecallStateSnapshot {
  const decks = snapshot.decks.map(d => ({ ...d, parentId: d.parentId ?? null }));
  validateTree(decks);
  // Legacy createdAt is creation, not evidence of first import. Never invent it.
  return { ...snapshot, decks };
}
export function createFolder(snapshot: RecallStateSnapshot, name: string, parentId: string | null, at = new Date().toISOString()): RecallStateSnapshot {
  name = normalizeName(name); if (!name || name.length > 80) throw new Error('卡组名须为 1–80 个字符');
  const deck: Deck = { id: createId('deck'), name, parentId, description: '', color: 'slate', createdAt: at, updatedAt: at, importedAt: at };
  const decks = [...snapshot.decks, deck]; validateTree(decks); return { ...snapshot, decks };
}
export function changeFolder(snapshot: RecallStateSnapshot, id: string, name: string, parentId: string | null): RecallStateSnapshot {
  name = normalizeName(name); if (!name || name.length > 80) throw new Error('卡组名须为 1–80 个字符');
  if (!snapshot.decks.some(d => d.id === id)) throw new Error('卡组不存在');
  const decks = snapshot.decks.map(d => d.id === id ? { ...d, name, parentId, updatedAt: new Date().toISOString() } : d);
  validateTree(decks); return { ...snapshot, decks };
}
export function moveMemoryCard(snapshot: RecallStateSnapshot, id: string, deckId: string): RecallStateSnapshot {
  if (!snapshot.decks.some(d => d.id === deckId)) throw new Error('目标卡组不存在');
  if (!snapshot.cards.some(c => c.id === id)) throw new Error('卡片不存在');
  return { ...snapshot, cards: snapshot.cards.map(c => c.id === id ? { ...c, deckId, updatedAt: new Date().toISOString() } : c) };
}
export function newMemoryCard(input: Pick<Card, 'front' | 'back' | 'deckId'> & Partial<Card>, at: string): Card {
  return { id: createId('card'), hint: '', source: '', tags: [], cardType: 'basic', state: 'new', lastReviewDate: null, nextReviewDate: at, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, learningSteps: 0, createdAt: at, importedAt: at, updatedAt: at, ...input };
}
