import { describe, expect, it } from 'vitest';
import { PersonalSyncEngine } from '../server/personal-sync';
import type { PersonalRepository, PersonalRow } from '../shared/personal-sync';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

function repository(): PersonalRepository {
  const rows = new Map<string, PersonalRow>();
  return {
    async read(owner, library) { return rows.get(`${owner}:${library}`) ?? null; },
    async compareSwap(owner, library, expected, next) {
      const key = `${owner}:${library}`;
      if ((rows.get(key)?.revision ?? 0) !== expected) return false;
      rows.set(key, next);
      return true;
    },
  };
}
const change = { kind: 'setting', id: 'dailyGoal', value: 20, expectedRevision: 0 };
const mutation = { id: 'personal-test-1', baseRevision: 0, changes: [change] };

describe('personal aggregate synchronization', () => {
  it('preserves, restores and deletes an explicit empty-folder archive through normal entity sync', async () => {
    const store = repository();
    const engine = new PersonalSyncEngine(store);
    const timestamp = '2026-11-13T00:00:00Z';
    const deck = { id: 'empty-archive', name: 'Empty archive', description: '', color: 'slate', parentId: null, createdAt: timestamp, updatedAt: timestamp, archivedAt: timestamp };
    const change = { kind: 'deck', id: deck.id, value: deck, expectedRevision: 0 };
    await engine.mutate('123', 'personal', { id: 'archive-empty', baseRevision: 0, changes: [change] });
    expect((await engine.read('123', 'personal')).entities[0].value).toEqual(deck);
    await expect(engine.mutate('123', 'personal', { id: 'invalid-archive', baseRevision: 1, changes: [{ ...change, expectedRevision: 1, value: { ...deck, archivedAt: 'invalid' } }] })).rejects.toMatchObject({ status: 400 });
    const { archivedAt: removed, ...restored } = deck;
    expect(removed).toBe(timestamp);
    await engine.mutate('123', 'personal', { id: 'restore-empty', baseRevision: 1, changes: [{ ...change, expectedRevision: 1, value: restored }] });
    expect((await engine.read('123', 'personal')).entities[0].value).toEqual(restored);
    await engine.mutate('123', 'personal', { id: 'delete-empty', baseRevision: 2, changes: [{ ...change, expectedRevision: 2, value: null }] });
    expect((await engine.read('123', 'personal')).entities[0].value).toBeNull();
  });
  it('commits entities, revision and durable replay receipt together', async () => {
    const store = repository();
    const engine = new PersonalSyncEngine(store);
    expect(await engine.read('123', 'personal')).toEqual({ revision: 0, entities: [] });
    expect(await engine.mutate('123', 'personal', mutation)).toEqual({ revision: 1 });
    expect(await engine.mutate('123', 'personal', mutation)).toEqual({ revision: 1 });
    expect((await engine.read('123', 'personal')).entities[0].value).toBe(20);
    const row = await store.read('123', 'personal');
    expect(JSON.parse(row!.stateJson).receipts).toHaveLength(1);
  });
  it('rejects a reused mutation ID with changed bytes', async () => {
    const engine = new PersonalSyncEngine(repository());
    await engine.mutate('123', 'personal', mutation);
    await expect(engine.mutate('123', 'personal', { ...mutation, changes: [{ ...change, value: 30 }] })).rejects.toMatchObject({ status: 409 });
  });
  it('does not lose either writer silently under concurrent CAS', async () => {
    const engine = new PersonalSyncEngine(repository());
    const results = await Promise.allSettled([engine.mutate('123', 'personal', mutation), engine.mutate('123', 'personal', { ...mutation, id: 'personal-test-2' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await engine.read('123', 'personal')).revision).toBe(1);
  });
  it('acknowledges a simultaneous exact retry only once', async () => {
    const engine = new PersonalSyncEngine(repository());
    expect(await Promise.all([engine.mutate('123', 'personal', mutation), engine.mutate('123', 'personal', mutation)])).toEqual([{ revision: 1 }, { revision: 1 }]);
  });
  it('preserves historical receipts and tombstones after newer commits', async () => {
    const engine = new PersonalSyncEngine(repository());
    await engine.mutate('123', 'personal', mutation);
    await engine.mutate('123', 'personal', { id: 'second', baseRevision: 1, changes: [{ kind: 'setting', id: 'reviewPlan', value: null, expectedRevision: 0 }] });
    expect(await engine.mutate('123', 'personal', mutation)).toEqual({ revision: 1 });
    expect(await engine.read('123', 'personal', 1)).toMatchObject({ revision: 2, entities: [{ id: 'reviewPlan', value: null, revision: 2 }] });
  });
  it('rejects credentials, incorrect per-entity revisions and invalid identity', async () => {
    const engine = new PersonalSyncEngine(repository());
    await expect(engine.mutate('123', 'personal', { ...mutation, changes: [{ ...change, id: 'syncCode', value: 'private' }] })).rejects.toMatchObject({ status: 400 });
    await engine.mutate('123', 'personal', mutation);
    await expect(engine.mutate('123', 'personal', { id: 'second', baseRevision: 1, changes: [{ ...change, value: 30 }] })).rejects.toMatchObject({ status: 409 });
    await expect(engine.read('', 'personal')).rejects.toMatchObject({ status: 401 });
    await expect(engine.read('123', 'personal', 2)).rejects.toMatchObject({ status: 409 });
  });
  it('fails closed on corrupt persistence instead of treating it as an empty library', async () => {
    const store = repository();
    await store.compareSwap('123', 'personal', 0, { revision: 1, stateJson: '{}' });
    const engine = new PersonalSyncEngine(store);
    await expect(engine.read('123', 'personal')).rejects.toMatchObject({ status: 503 });
    await expect(engine.mutate('123', 'personal', mutation)).rejects.toMatchObject({ status: 503 });
  });
  it('creates private schema and rejects anonymous or foreign-owner rows locally', async () => {
    const engine = new PGlite();
    try {
      await engine.exec('CREATE TYPE user_profile AS (user_id TEXT); CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;');
      await engine.exec(await readFile(new URL('../miaoda/database/001-personal-library.sql', import.meta.url), 'utf8'));
      await engine.exec("GRANT SELECT, INSERT, UPDATE ON recall_personal_libraries TO authenticated, anon; SET ROLE authenticated; SELECT set_config('app.user_id', '123', false);");
      await engine.exec("INSERT INTO recall_personal_libraries (owner_id) VALUES ('123');");
      await expect(engine.exec("INSERT INTO recall_personal_libraries (owner_id) VALUES ('456');")).rejects.toMatchObject({ code: '42501' });
      await engine.exec("SELECT set_config('app.user_id', '456', false);");
      expect((await engine.query('SELECT * FROM recall_personal_libraries')).rows).toHaveLength(0);
      await engine.exec("SET ROLE anon; SELECT set_config('app.user_id', '123', false);");
      expect((await engine.query('SELECT * FROM recall_personal_libraries')).rows).toHaveLength(0);
    } finally { await engine.close(); }
  });
});
