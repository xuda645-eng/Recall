import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { snapshotEntities, type CloudMutation, type CloudState } from '../../../shared/cloud';
import type { RecallStateSnapshot } from '@/types';

function fixture(): RecallStateSnapshot {
  const seed = createSeedSnapshot();
  return { ...seed, decks: [seed.decks[0]], cards: [{ ...seed.cards[0], deckId: seed.decks[0].id, front: 'existing local', back: 'answer', reps: 12 }], reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true } };
}
let snapshot: RecallStateSnapshot;
let remote: CloudState;
let receipts: Map<string, number>;
let offline = false;
let unauthorized = false;
let loseResponse = false;
let posted: CloudMutation[];
let client: typeof import('@/services/cloud-sync');
let cache: typeof import('@/services/cloud-cache');
let store: typeof import('@/stores/recall-store').useRecallStore;
let commit: typeof import('@/services/memory-actions').commitMemory;

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  snapshot = fixture();
  localStorage.setItem('recall.snapshot.v1', JSON.stringify(snapshot));
  remote = { revision: 0, entities: [] };
  receipts = new Map();
  posted = [];
  offline = unauthorized = loseResponse = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    if (offline) throw new TypeError('Network unavailable');
    if (url.endsWith('auth/pair')) return response({ spaceId: 'personal', device: { id: 'device-a', label: 'iPhone' } });
    if (unauthorized) return response({ error: 'Unauthorized' }, 401);
    if (options.method === 'POST') {
      const mutation = JSON.parse(String(options.body)) as CloudMutation;
      posted.push(mutation);
      const receipt = receipts.get(mutation.id);
      if (receipt !== undefined) return response({ revision: receipt });
      if (mutation.baseRevision !== remote.revision) return response({ error: 'Conflict' }, 409);
      remote.revision++;
      for (const change of mutation.changes) {
        const index = remote.entities.findIndex(entity => entity.kind === change.kind && entity.id === change.id);
        const entity = { kind: change.kind, id: change.id, value: change.value, revision: remote.revision };
        if (index >= 0) remote.entities[index] = entity;
        else remote.entities.push(entity);
      }
      receipts.set(mutation.id, remote.revision);
      if (loseResponse) { loseResponse = false; throw new TypeError('Response lost after commit'); }
      return response({ revision: remote.revision });
    }
    const since = Number(new URL(url, 'https://recall.test').searchParams.get('since'));
    return response({ revision: remote.revision, entities: remote.entities.filter(entity => entity.revision > since) });
  }));
  ({ useRecallStore: store } = await import('@/stores/recall-store'));
  store.setState({ ...snapshot, isInitialized: true, isLoading: false, error: null });
  cache = await import('@/services/cloud-cache');
  ({ commitMemory: commit } = await import('@/services/memory-actions'));
  client = await import('@/services/cloud-sync');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('automatic cloud sync durability', () => {
  it('migrates the first library with a sanitized backup and unchanged review progress', async () => {
    await client.pairDevice('strong-code', 'iPhone');
    expect(client.useCloudSync.getState().phase).toBe('synced');
    expect(remote.entities.find(entity => entity.kind === 'card')?.value).toEqual(snapshot.cards[0]);
    expect(JSON.parse(localStorage.getItem(cache.backupKey)!).cards[0].reps).toBe(12);
    expect(cache.readJournal()?.pending).toBeNull();
  });

  it('downloads the existing library to a fresh second device without a destructive upload', async () => {
    remote = { revision: 5, entities: snapshotEntities(snapshot).map(entity => ({ ...entity, revision: 5 })) };
    const empty = { ...snapshot, cards: [], decks: [] };
    localStorage.setItem('recall.snapshot.v1', JSON.stringify(empty));
    store.setState(empty);
    await client.pairDevice('one-use-code', 'iPad');
    expect(store.getState().cards).toEqual(snapshot.cards);
    expect(posted).toEqual([]);
    expect(client.useCloudSync.getState().phase).toBe('synced');
  });

  it('keeps offline edits across reload and safely replays a committed mutation whose response was lost', async () => {
    await client.pairDevice('strong-code', 'iPhone');
    offline = true;
    await commit(current => ({ ...current, cards: current.cards.map(card => ({ ...card, front: 'offline edit', archivedAt: '2026-10-31T00:00:00Z' })) }));
    await client.synchronizeCloud();
    expect(store.getState().cards[0].front).toBe('offline edit');
    expect(client.useCloudSync.getState().pending).toBe(1);
    offline = false;
    loseResponse = true;
    await client.synchronizeCloud();
    const pendingId = cache.readJournal()?.pending?.id;
    expect(pendingId).toBeTruthy();
    const committedRevision = remote.revision;
    const reload = JSON.parse(localStorage.getItem('recall.snapshot.v1')!);
    store.setState(reload);
    await client.synchronizeCloud();
    expect(remote.revision).toBe(committedRevision);
    expect(posted.slice(-2).map(mutation => mutation.id)).toEqual([pendingId, pendingId]);
    expect(client.useCloudSync.getState().phase).toBe('synced');
    expect(store.getState().cards[0].archivedAt).toBe('2026-10-31T00:00:00Z');
  });

  it('protects simultaneous edits until an explicit conflict decision', async () => {
    await client.pairDevice('strong-code', 'iPhone');
    await commit(current => ({ ...current, cards: current.cards.map(card => ({ ...card, front: 'local version' })) }));
    remote.revision++;
    const entity = remote.entities.find(entity => entity.kind === 'card')!;
    entity.revision = remote.revision;
    entity.value = { ...snapshot.cards[0], front: 'remote version' };
    await client.synchronizeCloud();
    expect(client.useCloudSync.getState().phase).toBe('conflict');
    expect(store.getState().cards[0].front).toBe('local version');
    expect(cache.readJournal()?.conflicts[0].remote.value).toEqual(entity.value);
    await client.resolveCloudConflicts('remote');
    expect(store.getState().cards[0].front).toBe('remote version');
    expect(client.useCloudSync.getState().phase).toBe('synced');
  });

  it('retains pending data after revocation and never serializes the session into card exports', async () => {
    await client.pairDevice('strong-code', 'iPhone');
    await commit(current => ({ ...current, cards: current.cards.map(card => ({ ...card, back: 'unsent answer' })) }));
    unauthorized = true;
    await client.synchronizeCloud();
    expect(client.useCloudSync.getState().phase).toBe('unauthorized');
    expect(store.getState().cards[0].back).toBe('unsent answer');
    expect(client.useCloudSync.getState().pending).toBe(1);
    expect(localStorage.getItem('recall.snapshot.v1')).not.toContain('strong-code');
  });

  it('exposes structural conflicts when a remote folder deletion meets a new offline card', async () => {
    await client.pairDevice('strong-code', 'iPhone');
    await commit(current => ({ ...current, cards: [...current.cards, { ...current.cards[0], id: 'new-offline-card' }] }));
    remote.revision++;
    for (const entity of remote.entities.filter(entity => entity.kind === 'deck' || entity.kind === 'card')) {
      entity.value = null;
      entity.revision = remote.revision;
    }
    await client.synchronizeCloud();
    expect(client.useCloudSync.getState().phase).toBe('conflict');
    expect(store.getState().cards).toHaveLength(2);
    expect(cache.readJournal()?.conflicts.some(conflict => conflict.key === 'card:new-offline-card')).toBe(true);
    await client.resolveCloudConflicts('remote');
    expect(store.getState().cards).toEqual([]);
    expect(store.getState().decks).toEqual([]);
    expect(client.useCloudSync.getState().phase).toBe('synced');
  });
});
