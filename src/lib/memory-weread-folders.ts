import type { Deck, RecallStateSnapshot } from '@/types';
import { normalizeName } from '@/lib/utils';
import { subtreeIds, validateTree } from '@/lib/memory-folders';

export const WEREAD_FOLDER_ID = 'weread-library';
export const WEREAD_FOLDER_NAME = '微信读书';
interface BookIdentity { bookId: string; title: string }

function libraryRoot(decks: Deck[]): Deck | undefined {
  return decks.find(deck => deck.id === WEREAD_FOLDER_ID && deck.description === 'weread-library-v1')
    ?? decks.find(deck => !deck.parentId && normalizeName(deck.name) === WEREAD_FOLDER_NAME);
}

function uniqueName(decks: Deck[], parentId: string, title: string, exclude?: string): string {
  const used = new Set(decks.filter(deck => deck.parentId === parentId && deck.id !== exclude).map(deck => normalizeName(deck.name).toLowerCase()));
  const base = normalizeName(title).slice(0, 80) || '未命名书籍';
  if (!used.has(base.toLowerCase())) return base;
  for (let index = 1; ; index++) {
    const suffix = ` (微信读书 ${index})`;
    const name = base.slice(0, 80 - suffix.length).trimEnd() + suffix;
    if (!used.has(name.toLowerCase())) return name;
  }
}

export function wereadBookFolder(snapshot: RecallStateSnapshot, bookId: string): Deck | undefined {
  const root = libraryRoot(snapshot.decks);
  if (!root) return undefined;
  const identity = `weread-book:${encodeURIComponent(bookId)}`;
  const populated = new Set<string>();
  const candidates = snapshot.decks.filter(deck => {
    if (deck.parentId !== root.id) return false;
    const inside = subtreeIds(snapshot.decks, deck.id);
    const members = snapshot.cards.filter(card => inside.has(card.deckId));
    const owned = deck.description === identity || members.some(card => card.sourceRef?.provider === 'weread' && card.sourceRef.bookId === bookId);
    const matches = owned && members.every(card => card.sourceRef?.provider === 'weread' && card.sourceRef.bookId === bookId);
    if (matches && members.length) populated.add(deck.id);
    return matches;
  });
  return candidates.find(deck => populated.has(deck.id)) ?? candidates[0];
}

export function organizeWereadFolders(snapshot: RecallStateSnapshot, at = new Date().toISOString(), requested?: BookIdentity[]): RecallStateSnapshot {
  validateTree(snapshot.decks);
  const books = new Map<string, BookIdentity>();
  if (requested) {
    for (const book of requested) books.set(book.bookId, book);
  } else {
    for (const card of snapshot.cards) {
      if (card.sourceRef?.provider === 'weread') books.set(card.sourceRef.bookId, { bookId: card.sourceRef.bookId, title: card.bookTitle || snapshot.decks.find(deck => deck.id === card.deckId)?.name || card.sourceRef.bookId });
    }
    for (const deck of snapshot.decks) {
      if (deck.id.startsWith('weread-book:') && deck.description === deck.id) {
        try {
          const bookId = decodeURIComponent(deck.id.slice('weread-book:'.length));
          if (!books.has(bookId)) books.set(bookId, { bookId, title: deck.name });
        } catch { throw new Error('微信读书书籍卡组编号无效，未改动卡片库'); }
      }
    }
  }
  if (!books.size) return snapshot;
  let decks = [...snapshot.decks];
  let cards = snapshot.cards;
  let changed = false;
  let root = libraryRoot(decks);
  if (!root) {
    if (decks.some(deck => deck.id === WEREAD_FOLDER_ID)) throw new Error('微信读书根卡组编号被其他卡组占用，未改动卡片库');
    root = { id: WEREAD_FOLDER_ID, name: WEREAD_FOLDER_NAME, description: 'weread-library-v1', parentId: null, color: 'slate', createdAt: at, updatedAt: at, importedAt: at };
    decks.push(root);
    changed = true;
  }
  const rootId = root.id;
  for (const book of books.values()) {
    const identity = `weread-book:${encodeURIComponent(book.bookId)}`;
    const sourceDecks = new Set(cards.filter(card => card.sourceRef?.provider === 'weread' && card.sourceRef.bookId === book.bookId).map(card => card.deckId));
    const populated = new Set<string>();
    const candidates = decks.filter(deck => {
      if (deck.id === rootId) return false;
      if (deck.description !== identity && !sourceDecks.has(deck.id)) return false;
      const descendants = subtreeIds(decks, deck.id);
      const members = cards.filter(card => descendants.has(card.deckId));
      const matches = members.every(card => card.sourceRef?.provider === 'weread' && card.sourceRef.bookId === book.bookId);
      if (matches && members.length) populated.add(deck.id);
      return matches;
    });
    const canonical = candidates.filter(deck => deck.parentId === rootId);
    let destination = canonical.find(deck => populated.has(deck.id)) ?? canonical[0] ?? candidates.find(deck => deck.id === identity) ?? candidates[0];
    if (!destination) {
      const id = decks.some(deck => deck.id === identity) ? `${identity}:library` : identity;
      if (decks.some(deck => deck.id === id)) throw new Error('微信读书书籍卡组编号冲突，未改动卡片库');
      destination = { id, name: uniqueName(decks, rootId, book.title), description: identity, parentId: rootId, color: 'slate', createdAt: at, updatedAt: at, importedAt: at };
      decks.push(destination);
      changed = true;
    } else {
      const name = uniqueName(decks, rootId, destination.name, destination.id);
      if (destination.parentId !== rootId || destination.name !== name) {
        const moved = { ...destination, parentId: rootId, name, updatedAt: at };
        decks = decks.map(deck => deck.id === moved.id ? moved : deck);
        destination = moved;
        changed = true;
      }
    }
    const destinationId = destination.id;
    const inside = subtreeIds(decks, destinationId);
    cards = cards.map(card => {
      if (card.sourceRef?.provider !== 'weread' || card.sourceRef.bookId !== book.bookId || inside.has(card.deckId)) return card;
      changed = true;
      return { ...card, deckId: destinationId };
    });
  }
  if (!changed) return snapshot;
  validateTree(decks);
  return { ...snapshot, decks, cards };
}
