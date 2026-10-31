import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { buildExportPayload } from '@/services/import-export';
import { acknowledgeMutation, pendingChanges, readJournal, reconcileCloud, writeCachedSnapshot, type CloudJournal } from '@/services/cloud-cache';
import { canonical, snapshotEntities } from '../../../shared/cloud';

function fixture() {
  const seed = createSeedSnapshot();
  return { ...seed, decks: [seed.decks[0]], cards: [{ ...seed.cards[0], deckId: seed.decks[0].id, archivedAt: '2026-10-31T00:00:00Z', reps: 17 }], reviewLogs: [], studySessions: [] };
}
function journal(snapshot = fixture()): CloudJournal {
  return { version: 1, spaceId: 'personal', base: { revision: 1, entities: snapshotEntities(snapshot).map(entity => ({ ...entity, revision: 1 })) }, pending: null, conflicts: [], migrating: false };
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('cloud cache and three-way reconciliation', () => {
  it('does not upload an empty fresh library as deletion of an existing cloud library', () => {
    const existing = fixture();
    const empty = { ...existing, cards: [], decks: [] };
    const meta: CloudJournal = { ...journal(empty), base: { revision: 0, entities: [] }, migrating: true };
    const result = reconcileCloud(empty, meta, journal(existing).base);
    expect(result.snapshot.cards).toEqual(existing.cards);
    expect(result.snapshot.cards[0].reps).toBe(17);
    expect(result.snapshot.cards[0].archivedAt).toBe(existing.cards[0].archivedAt);
    expect(pendingChanges(result.snapshot, result.journal)).toEqual([]);
  });

  it('uploads an existing local library without changing stable identities or progress', () => {
    const existing = fixture();
    const meta: CloudJournal = { ...journal(), base: { revision: 0, entities: [] }, migrating: true };
    const result = reconcileCloud(existing, meta, { revision: 0, entities: [] });
    const changes = pendingChanges(result.snapshot, result.journal);
    expect(changes.find(change => change.kind === 'card')?.value).toEqual(existing.cards[0]);
    expect(changes.every(change => change.expectedRevision === 0)).toBe(true);
  });

  it('merges independently created same-name folders without changing IDs or dropping cards', () => {
    const current = fixture();
    const remoteDeck = { ...current.decks[0], id: 'another-deck' };
    const meta: CloudJournal = { ...journal(), base: { revision: 0, entities: [] }, migrating: true };
    const result = reconcileCloud(current, meta, { revision: 1, entities: [{ kind: 'deck', id: remoteDeck.id, value: remoteDeck, revision: 1 }] });
    expect(result.snapshot.decks).toHaveLength(2);
    expect(result.snapshot.cards).toEqual(current.cards);
    expect(result.snapshot.decks.find(deck => deck.id === current.decks[0].id)?.name).toMatch(/本机/);
    expect(result.snapshot.decks.find(deck => deck.id === remoteDeck.id)).toEqual(remoteDeck);
  });

  it('persists the pending stable mutation in the same atomic localStorage write as the cache', () => {
    const current = fixture();
    const meta = journal();
    meta.pending = { id: 'stable-mutation', baseRevision: 1, changes: [{ kind: 'card', id: current.cards[0].id, value: current.cards[0], expectedRevision: 1 }] };
    writeCachedSnapshot(current, meta);
    expect(readJournal()?.pending?.id).toBe('stable-mutation');
    const before = localStorage.getItem('recall.snapshot.v1');
    const storage = localStorage;
    vi.stubGlobal('localStorage', { getItem: storage.getItem.bind(storage), setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); } });
    expect(() => writeCachedSnapshot({ ...current, cards: [] }, meta)).toThrow();
    expect(localStorage.getItem('recall.snapshot.v1')).toBe(before);
  });

  it('detects conflicting edits and leaves both versions available without partially applying a delete', () => {
    const current = fixture();
    const meta = journal(current);
    const local = { ...current, cards: [{ ...current.cards[0], front: '本机修改' }] };
    const result = reconcileCloud(local, meta, { revision: 2, entities: [
      { kind: 'deck', id: current.decks[0].id, value: null, revision: 2 },
      { kind: 'card', id: current.cards[0].id, value: null, revision: 2 },
    ] });
    expect(result.snapshot).toBe(local);
    expect(result.journal.conflicts).toHaveLength(2);
    expect(result.journal.conflicts.find(conflict => conflict.remote.kind === 'card')?.local.value).toEqual(local.cards[0]);
    expect(result.journal.conflicts.every(conflict => conflict.remote.value === null)).toBe(true);
  });

  it('acknowledges only delivered changes, keeping edits made while a request was in flight pending', () => {
    const initial = fixture();
    const meta = journal(initial);
    const uploaded = { ...initial, cards: [{ ...initial.cards[0], front: 'first edit' }] };
    meta.pending = { id: 'once', baseRevision: 1, changes: pendingChanges(uploaded, meta) };
    const latest = { ...uploaded, cards: [{ ...uploaded.cards[0], front: 'second edit' }] };
    const ack = acknowledgeMutation(meta, 2);
    expect(ack.pending).toBeNull();
    expect(pendingChanges(latest, ack)).toEqual([{ kind: 'card', id: initial.cards[0].id, value: latest.cards[0], expectedRevision: 2 }]);
  });

  it('uses per-entity revisions for deletion and restore, not wall-clock timestamps', () => {
    const current = fixture();
    const meta = journal(current);
    const deletion = pendingChanges({ ...current, cards: [] }, meta);
    expect(deletion).toEqual([{ kind: 'card', id: current.cards[0].id, value: null, expectedRevision: 1 }]);
    const restored = { ...current, cards: current.cards.map(card => ({ ...card, archivedAt: undefined })) };
    expect(pendingChanges(restored, meta)[0].expectedRevision).toBe(1);
    expect(canonical(restored)).not.toContain('undefined');
  });

  it('keeps device credentials, local preferences, queues and cookies out of cloud entities and exports', () => {
    const current = fixture();
    current.settings.syncCode = 'private-e2e-material';
    current.settings.syncRelayUrl = 'https://private-relay.example';
    current.settings.syncEnabled = true;
    const entities = snapshotEntities(current);
    expect(JSON.stringify(entities)).not.toMatch(/private-e2e|private-relay|backupFolder|syncCode|theme/);
    writeCachedSnapshot(current, journal(current));
    const exported = JSON.stringify(buildExportPayload(current));
    expect(exported).not.toMatch(/private-e2e|private-relay|cloudJournal|recall_device/);
  });

  it('refuses a corrupt queue rather than silently dropping pending work', () => {
    localStorage.setItem('recall.snapshot.v1', JSON.stringify({ ...fixture(), cloudJournal: { version: 2 } }));
    expect(() => readJournal()).toThrow(/保留本机数据/);
    expect(localStorage.getItem('recall.snapshot.v1')).toContain('cloudJournal');
  });
});
