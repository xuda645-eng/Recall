import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { archiveMemoryCard, archiveMemoryFolder, deleteArchivedMemoryCard, deleteArchivedMemoryFolder, memoryArchiveFolderState, restoreMemoryCard, restoreMemoryCards, restoreMemoryFolder } from './memory-archive';
import { pendingChanges, type CloudJournal } from '@/services/cloud-cache';
import { snapshotEntities } from '../../shared/cloud';
import { isCardDue, isCardDueToday } from './stats';
import { getDueCards } from '@/services/fsrs-engine';

describe('memory archive lifecycle', () => {
  it('archives without changing content, review fields or history', () => {
    const snapshot = createSeedSnapshot();
    const card = snapshot.cards[0];
    const archived = archiveMemoryCard(snapshot, card.id, '2026-10-31T00:00:00.000Z');
    expect(archived.cards[0]).toEqual({ ...card, archivedAt: '2026-10-31T00:00:00.000Z' });
    expect(archived.reviewLogs).toBe(snapshot.reviewLogs);
    expect(archived.studySessions).toBe(snapshot.studySessions);
    expect(snapshot.cards[0].archivedAt).toBeUndefined();
    expect(restoreMemoryCard(archived, card.id).cards[0]).toEqual(card);
  });
  it('excludes archived overdue cards from due queues', () => {
    const snapshot = createSeedSnapshot();
    const card = { ...snapshot.cards[0], nextReviewDate: '2020-01-01T00:00:00.000Z', archivedAt: '2026-10-31T00:00:00.000Z' };
    expect(isCardDue(card)).toBe(false);
    expect(isCardDueToday(card)).toBe(false);
    expect(getDueCards([card])).toEqual([]);
    const restored = restoreMemoryCard({ ...snapshot, cards: [card] }, card.id).cards[0];
    expect(isCardDue(restored)).toBe(true);
    expect(restored.nextReviewDate).toBe(card.nextReviewDate);
  });
  it('prevents stale undo from undoing a newer archive', () => {
    const snapshot = createSeedSnapshot();
    const first = archiveMemoryCard(snapshot, snapshot.cards[0].id, '2026-10-31T00:00:00.000Z');
    const restored = restoreMemoryCard(first, snapshot.cards[0].id);
    const second = archiveMemoryCard(restored, snapshot.cards[0].id, '2026-10-31T01:00:00.000Z');
    expect(() => restoreMemoryCard(second, snapshot.cards[0].id, first.cards[0].archivedAt)).toThrow('状态已变化');
  });
});

describe('folder archive lifecycle', () => {
  const archivedAt = '2026-11-01T00:00:00.000Z';
  function fixture() {
    const seed = createSeedSnapshot();
    const decks = [
      { ...seed.decks[0], id: 'root', parentId: null },
      { ...seed.decks[0], id: 'child', parentId: 'root' },
      { ...seed.decks[0], id: 'deep', parentId: 'child' },
      { ...seed.decks[0], id: 'outside', parentId: null },
    ];
    const cards = [
      ...decks.map(deck => ({ ...seed.cards[0], id: deck.id, deckId: deck.id, nextReviewDate: '2020-01-01T00:00:00.000Z' })),
      { ...seed.cards[0], id: 'previous', deckId: 'child', archivedAt: '2026-10-31T00:00:00.000Z' },
    ];
    return { ...seed, decks, cards };
  }
  it('archives every active descendant once, preserving folders, history and previous archives', () => {
    const before = fixture();
    const result = archiveMemoryFolder(before, 'root', archivedAt);
    expect(result.ids).toEqual(['root', 'child', 'deep']);
    expect(result.snapshot.decks).toBe(before.decks);
    expect(result.snapshot.reviewLogs).toBe(before.reviewLogs);
    expect(result.snapshot.studySessions).toBe(before.studySessions);
    expect(result.snapshot.settings).toBe(before.settings);
    result.snapshot.cards.forEach((card, index) => {
      expect(card).toEqual(index < 3 ? { ...before.cards[index], archivedAt } : before.cards[index]);
    });
    expect(getDueCards(result.snapshot.cards).map(card => card.id)).toEqual(['outside']);
    expect(before.cards[0].archivedAt).toBeUndefined();
    expect(restoreMemoryCards(result.snapshot, result.ids, archivedAt)).toEqual(before);
  });
  it('archiving a child does not include parents or siblings', () => {
    const result = archiveMemoryFolder(fixture(), 'child', archivedAt);
    expect(result.ids).toEqual(['child', 'deep']);
    expect(result.snapshot.cards[0].archivedAt).toBeUndefined();
    expect(result.snapshot.cards[3].archivedAt).toBeUndefined();
  });
  it('classifies existing fully archived subtrees without changing data or hiding empty folders', () => {
    const before = fixture();
    before.decks.push({ ...before.decks[0], id: 'empty', parentId: null });
    const result = archiveMemoryFolder(before, 'root', archivedAt).snapshot;
    const unchanged = structuredClone(result);
    const state = memoryArchiveFolderState(result.decks, result.cards);
    expect([...state.ids].sort()).toEqual(['child', 'deep', 'root']);
    expect(state.ids.has('empty')).toBe(false);
    expect(state.ids.has('outside')).toBe(false);
    expect(state.times.get('root')).toBe(archivedAt);
    expect(result).toEqual(unchanged);
  });
  it('keeps mixed parents visible and returns restored ancestors to the active directory', () => {
    const before = fixture();
    const archived = archiveMemoryFolder(before, 'child', archivedAt).snapshot;
    expect([...memoryArchiveFolderState(archived.decks, archived.cards).ids].sort()).toEqual(['child', 'deep']);
    const restored = restoreMemoryCard(archived, 'child');
    expect([...memoryArchiveFolderState(restored.decks, restored.cards).ids]).toEqual(['deep']);
  });
  it('keeps empty descendants inside their archived subtree and returns them with restored ancestors', () => {
    const before = fixture();
    before.decks.push({ ...before.decks[0], id: 'empty-deep', parentId: 'empty-child' },
                      { ...before.decks[0], id: 'empty-child', parentId: 'root' },
                      { ...before.decks[0], id: 'empty-outside', parentId: 'outside' });
    const archived = archiveMemoryFolder(before, 'root', archivedAt).snapshot;
    const state = memoryArchiveFolderState(archived.decks, archived.cards);
    expect([...state.ids].sort()).toEqual(['child', 'deep', 'empty-child', 'empty-deep', 'root']);
    expect(state.times.get('empty-deep')).toBe(archivedAt);
    expect(state.ids.has('empty-outside')).toBe(false);
    const restored = restoreMemoryFolder(archived, 'root').snapshot;
    expect(memoryArchiveFolderState(restored.decks, restored.cards).ids.size).toBe(0);
    expect(restored.decks).toEqual(before.decks);
  });
  it('uses most recent archive time rather than import or card modification time', () => {
    const before = fixture();
    const cards = before.cards.map(card => ({ ...card, archivedAt: card.id === 'deep' ? '2026-11-02T00:00:00.000Z' : archivedAt,
                                             importedAt: '2027-01-01T00:00:00.000Z', updatedAt: '2028-01-01T00:00:00.000Z' }));
    const state = memoryArchiveFolderState(before.decks, cards);
    expect(state.times.get('root')).toBe('2026-11-02T00:00:00.000Z');
    expect(state.times.get('child')).toBe('2026-11-02T00:00:00.000Z');
    expect(state.times.get('outside')).toBe(archivedAt);
  });
  it('restores an entire archived folder including previous archives without rewriting progress', () => {
    const before = fixture();
    const archived = archiveMemoryFolder(before, 'root', archivedAt).snapshot;
    const result = restoreMemoryFolder(archived, 'root');
    expect(result.ids).toEqual(['root', 'child', 'deep', 'previous']);
    for (const card of result.snapshot.cards) {
      const expected = { ...before.cards.find(candidate => candidate.id === card.id)! };
      if (card.deckId !== 'outside') delete expected.archivedAt;
      expect(card).toEqual(expected);
    }
    expect(result.snapshot.decks).toBe(before.decks);
    expect(result.snapshot.reviewLogs).toBe(before.reviewLogs);
    expect(result.snapshot.studySessions).toBe(before.studySessions);
    expect(memoryArchiveFolderState(result.snapshot.decks, result.snapshot.cards).ids.size).toBe(0);
    expect(archived.cards[0].archivedAt).toBe(archivedAt);
  });
  it('restores only the selected subtree and preserves other archives and active cards', () => {
    const before = fixture();
    const archived = archiveMemoryFolder(before, 'root', archivedAt).snapshot;
    const result = restoreMemoryFolder(archived, 'child');
    expect(result.ids).toEqual(['child', 'deep', 'previous']);
    expect(result.snapshot.cards[0]).toBe(archived.cards[0]);
    expect(result.snapshot.cards[3]).toBe(archived.cards[3]);
    expect(() => restoreMemoryFolder(result.snapshot, 'child')).toThrow('没有归档卡片');
    expect(() => restoreMemoryFolder(result.snapshot, 'missing')).toThrow('卡组不存在');
  });
  it('rejects missing folders, invalid timestamps and folders without active cards', () => {
    const before = fixture();
    expect(() => archiveMemoryFolder(before, 'missing', archivedAt)).toThrow('卡组不存在');
    expect(() => archiveMemoryFolder(before, 'root', 'invalid')).toThrow('归档时间无效');
    const result = archiveMemoryFolder(before, 'root', archivedAt);
    expect(() => archiveMemoryFolder(result.snapshot, 'root', archivedAt)).toThrow('没有在学卡片');
    expect(() => archiveMemoryFolder({ ...before, cards: [] }, 'root', archivedAt)).toThrow('没有在学卡片');
  });
  it('undo preserves edits and review updates made after the operation', () => {
    const before = fixture();
    const result = archiveMemoryFolder(before, 'root', archivedAt);
    const current = { ...result.snapshot, cards: result.snapshot.cards.map(card => card.id === 'child' ? { ...card, back: 'Edited content', reps: 9 } : card) };
    const restored = restoreMemoryCards(current, result.ids, archivedAt);
    expect(restored.cards[1]).toEqual({ ...before.cards[1], back: 'Edited content', reps: 9 });
    expect(restored.cards[4]).toBe(current.cards[4]);
    expect(restored.reviewLogs).toBe(current.reviewLogs);
  });
  it('rejects stale batch undo atomically when any affected card has changed', () => {
    const result = archiveMemoryFolder(fixture(), 'root', archivedAt);
    for (const replacement of [undefined, '2026-11-01T01:00:00.000Z']) {
      const changed = { ...result.snapshot, cards: result.snapshot.cards.map(card => card.id === 'child' ? { ...card, archivedAt: replacement } : card) };
      const before = structuredClone(changed);
      expect(() => restoreMemoryCards(changed, result.ids, archivedAt)).toThrow('状态已变化');
      expect(changed).toEqual(before);
    }
    expect(() => restoreMemoryCards(result.snapshot, [...result.ids, 'missing'], archivedAt)).toThrow('状态已变化');
  });
});

describe('permanent archived deletion', () => {
  const archivedAt = '2026-11-04T00:00:00.000Z';
  function fixture() {
    const seed = createSeedSnapshot();
    const decks = ['root', 'child', 'empty', 'outside'].map(id => ({ ...seed.decks[0], id, name: id, parentId: id === 'child' || id === 'empty' ? 'root' : null }));
    const cards = ['root', 'child', 'outside'].map(id => ({ ...seed.cards[0], id, deckId: id, archivedAt }));
    const reviewLogs = cards.map(card => ({ id: `log-${card.id}`, cardId: card.id, rating: 'good' as const, reviewDate: archivedAt, stability: 1, difficulty: 1, elapsedDays: 1, scheduledDays: 1 }));
    const studySessions = decks.map(deck => ({ id: `session-${deck.id}`, deckId: deck.id, startedAt: archivedAt, endedAt: archivedAt, cardsStudied: 1 }));
    return { ...seed, decks, cards, reviewLogs, studySessions };
  }
  const scope = { deckIds: ['root', 'child', 'empty'], cardIds: ['root', 'child'] };
  it('deletes only the selected archived card and its logs, without mutating the input', () => {
    const before = fixture();
    const original = structuredClone(before);
    const after = deleteArchivedMemoryCard(before, 'child', archivedAt);
    expect(after.cards.map(card => card.id)).toEqual(['root', 'outside']);
    expect(after.reviewLogs.map(log => log.cardId)).toEqual(['root', 'outside']);
    expect(after.decks).toBe(before.decks);
    expect(after.studySessions).toBe(before.studySessions);
    expect(after.settings).toBe(before.settings);
    expect(before).toEqual(original);
    expect(() => deleteArchivedMemoryCard(after, 'child', archivedAt)).toThrow('状态已变化');
  });
  it('rejects a missing, restored or re-archived card', () => {
    const before = fixture();
    expect(() => deleteArchivedMemoryCard(before, 'missing', archivedAt)).toThrow('状态已变化');
    expect(() => deleteArchivedMemoryCard(restoreMemoryCard(before, 'child'), 'child', archivedAt)).toThrow('状态已变化');
    expect(() => deleteArchivedMemoryCard(before, 'child', '2020-01-01T00:00:00.000Z')).toThrow('状态已变化');
  });
  it('deletes the entire archived subtree, its logs and sessions while preserving outside data', () => {
    const before = fixture();
    const original = structuredClone(before);
    const after = deleteArchivedMemoryFolder(before, 'root', scope);
    expect(after.decks).toEqual([before.decks[3]]);
    expect(after.cards).toEqual([before.cards[2]]);
    expect(after.reviewLogs).toEqual([before.reviewLogs[2]]);
    expect(after.studySessions).toEqual([before.studySessions[3]]);
    expect(after.settings).toBe(before.settings);
    expect(before).toEqual(original);
    const journal: CloudJournal = { version: 1, spaceId: 'synthetic-unit-test', base: { revision: 1, entities: snapshotEntities(before).map(entity => ({ ...entity, revision: 1 })) }, pending: null, conflicts: [], migrating: false };
    const changes = pendingChanges(after, journal);
    expect(changes).toHaveLength(10);
    expect(changes.every(change => change.value === null && change.expectedRevision === 1)).toBe(true);
    expect(changes.some(change => change.id === 'outside' || change.kind === 'setting')).toBe(false);
  });
  it('rejects restored cards, added descendants, changed card membership and missing roots atomically', () => {
    const before = fixture();
    const original = structuredClone(before);
    expect(() => deleteArchivedMemoryFolder(restoreMemoryCard(before, 'child'), 'root', scope)).toThrow('不在归档中');
    const added = { ...before, decks: [...before.decks, { ...before.decks[1], id: 'added', name: 'added' }] };
    expect(() => deleteArchivedMemoryFolder(added, 'root', scope)).toThrow('内容已变化');
    const extra = { ...before, cards: [...before.cards, { ...before.cards[1], id: 'added-card' }] };
    expect(() => deleteArchivedMemoryFolder(extra, 'root', scope)).toThrow('内容已变化');
    expect(() => deleteArchivedMemoryFolder(before, 'root', { ...scope, cardIds: ['root', 'replacement'] })).toThrow('内容已变化');
    expect(() => deleteArchivedMemoryFolder(before, 'missing', scope)).toThrow('不在归档中');
    expect(before).toEqual(original);
  });
  it('allows deleting an inherited empty archived child without deleting its parent or cards', () => {
    const before = fixture();
    const after = deleteArchivedMemoryFolder(before, 'empty', { deckIds: ['empty'], cardIds: [] });
    expect(after.decks.map(deck => deck.id)).toEqual(['root', 'child', 'outside']);
    expect(after.cards).toEqual(before.cards);
    expect(after.reviewLogs).toEqual(before.reviewLogs);
  });
});
