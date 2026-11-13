import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRecallRequest } from '../shared/server-router';
import { validateMedia } from '../shared/media';
import { sha256 } from '../shared/server';
import type { ServerEnv } from '../shared/server';
import { ObjectMediaRepository } from '../server/object-media';
import type { ObjectStorage } from '../server/object-media';
import { PostgresDatabase, postgresParameters } from '../server/postgres';
import { postgresFixture } from './postgres-fixture';

const origin = 'https://recall.test';
const bootstrap = 'synthetic-postgres-owner-code-not-a-production-secret';
const at = '2026-11-11T00:00:00.000Z';
const imageBytes = Uint8Array.from(readFileSync(new URL('../e2e/fixtures/source-screenshot.png', import.meta.url))).buffer;
const deck = { id: 'deck-1', name: 'Deck', description: '', color: 'slate', parentId: null, createdAt: at, updatedAt: at };

describe('PostgreSQL parameter boundary', () => {
  it('numbers only parameters, preserving quoted strings, identifiers and line comments', () => {
    expect(postgresParameters(`SELECT ?, '?' AS "?", 'it''s ?' -- ?\n, ?`)).toBe(`SELECT $1, '?' AS "?", 'it''s ?' -- ?\n, $2`);
    for (const sql of ["SELECT 'unfinished", 'SELECT $1', 'SELECT /* comment */ ?', 'SELECT \\']) {
      expect(() => postgresParameters(sql)).toThrow();
    }
  });

  it('rolls back and discards a connection when rollback itself fails', async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql === 'SELECT $1' || sql === 'ROLLBACK') throw new Error(sql);
      return { rows: [], rowCount: 0 };
    });
    const db = new PostgresDatabase({ connect: async () => ({ query, release }) });
    await expect(db.prepare('SELECT ?').bind('value').all()).rejects.toThrow('SELECT $1');
    expect(release).toHaveBeenCalledWith(expect.any(Error));
    expect(query.mock.calls.map(([sql]) => sql)).not.toContain('COMMIT');
  });

  it('rejects unsafe BIGINT values rather than corrupting revisions', async () => {
    const db = new PostgresDatabase({ connect: async () => ({
      query: async sql => ({ rows: sql.startsWith('SELECT') ? [{ revision: '9007199254740992' }] : [], rowCount: 1,
        fields: [{ name: 'revision', dataTypeID: 20 }] }), release() {},
    }) });
    await expect(db.prepare('SELECT revision').first()).rejects.toThrow('safe range');
  });

  it('retries PostgreSQL serialization failures on a newly leased transaction', async () => {
    let attempts = 0;
    const release = vi.fn();
    const connect = vi.fn(async () => {
      attempts += 1;
      return {
        async query(sql: string) {
          if (sql === 'SELECT 1' && attempts === 1) throw Object.assign(new Error('serialization'), { code: '40001' });
          return { rows: sql === 'SELECT 1' ? [{ value: 1 }] : [], rowCount: 1 };
        }, release,
      };
    });
    expect(await new PostgresDatabase({ connect }).prepare('SELECT 1').first()).toEqual({ value: 1 });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('bounds contention retries and rejects foreign statements before leasing a connection', async () => {
    const connect = vi.fn(async () => ({
      async query(sql: string) {
        if (sql === 'SELECT 1') throw Object.assign(new Error('deadlock'), { code: '40P01' });
        return { rows: [], rowCount: 0 };
      }, release() {},
    }));
    const db = new PostgresDatabase({ connect });
    await expect(db.prepare('SELECT 1').all()).rejects.toThrow('deadlock');
    expect(connect).toHaveBeenCalledTimes(3);
    await expect(db.batch([new PostgresDatabase({ connect }).prepare('SELECT 1')])).rejects.toThrow('Foreign database');
    expect(connect).toHaveBeenCalledTimes(3);
  });
});

describe('Recall PostgreSQL and private object storage', () => {
  let fixture: Awaited<ReturnType<typeof postgresFixture>>;
  let env: ServerEnv;
  let objects: Map<string, ArrayBuffer>;
  let storage: ObjectStorage;

  beforeAll(async () => { fixture = await postgresFixture(); }, 30000);
  afterAll(async () => { await fixture.engine.close(); });
  beforeEach(async () => {
    await fixture.engine.exec('TRUNCATE spaces, trusted_devices, pairing_codes, pair_rate_limits, cloud_entities, mutation_receipts, import_request_limits, import_question_cache, media_usage, media_assets CASCADE');
    objects = new Map();
    storage = {
      async putIfAbsent(key, bytes) { if (!objects.has(key)) objects.set(key, bytes.slice(0)); },
      async get(key) { const bytes = objects.get(key); if (!bytes) throw new Error('Missing synthetic object'); return bytes.slice(0); },
    };
    env = { DB: fixture.database, MEDIA: new ObjectMediaRepository(fixture.database, storage), RECALL_BOOTSTRAP_CODE: bootstrap };
  });

  async function api(path: string, options: { method?: string; cookie?: string; body?: unknown; image?: ArrayBuffer; origin?: string } = {}) {
    const method = options.method ?? 'GET';
    return handleRecallRequest({ env, request: new Request(`${origin}${path}`, { method,
      headers: { Origin: options.origin ?? origin, Cookie: options.cookie ?? '', 'Content-Type': options.image ? 'image/png' : 'application/json' },
      body: options.image ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    }) });
  }

  async function pair(code = bootstrap) {
    const response = await api('/api/auth/pair', { method: 'POST', body: { code, label: 'Synthetic iPhone' } });
    expect(response.status).toBe(200);
    return { cookie: response.headers.get('Set-Cookie')!.split(';')[0], session: await response.json() };
  }

  function mutation(id = crypto.randomUUID(), baseRevision = 0, value: unknown = deck) {
    return { id, baseRevision, changes: [{ kind: 'deck', id: deck.id, value, expectedRevision: baseRevision }] };
  }

  it('preserves cookie authentication, BIGINT timestamps and camelCase API fields', async () => {
    const owner = await pair();
    expect(await (await api('/api/auth/session', { cookie: owner.cookie })).json()).toEqual(owner.session);
    const response = await api('/api/auth/devices', { cookie: owner.cookie });
    const { devices } = await response.json();
    expect(devices[0]).toMatchObject({ id: owner.session.device.id, label: 'Synthetic iPhone', revokedAt: null });
    expect(typeof devices[0].createdAt).toBe('number');
    expect(typeof devices[0].lastSeenAt).toBe('number');
    expect(await fixture.database.prepare('SELECT token_hash FROM trusted_devices').first()).toEqual({ token_hash: await sha256(owner.cookie.split('=')[1]) });
  });

  it('atomically saves JSON text entities, revisions and receipts and replays mutations', async () => {
    const owner = await pair();
    const payload = mutation();
    const write = () => api('/api/sync', { method: 'POST', cookie: owner.cookie, body: payload });
    expect(await (await write()).json()).toEqual({ revision: 1 });
    expect(await (await write()).json()).toEqual({ revision: 1 });
    const state = await (await api('/api/sync?since=0', { cookie: owner.cookie })).json();
    expect(state.revision).toBe(1);
    expect(state.entities[0].value).toEqual(deck);
    expect(await fixture.database.prepare('SELECT count(*) AS count FROM mutation_receipts').first()).toEqual({ count: 1 });
    expect((await api('/api/sync', { method: 'POST', cookie: owner.cookie, body: mutation() })).status).toBe(409);
    expect((await api('/api/sync', { method: 'POST', cookie: owner.cookie, body: mutation(payload.id, 0, { ...deck, name: 'Other' }) })).status).toBe(409);
  });

  it('rolls back the revision guard and receipt when an entity statement fails', async () => {
    const owner = await pair();
    await expect(fixture.database.batch([
      fixture.database.prepare(`INSERT INTO mutation_receipts (space_id, id, payload_hash, base_revision, revision, device_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind('personal', 'failed', 'hash', 0, 1, owner.session.device.id, Date.now()),
      fixture.database.prepare('INSERT INTO cloud_entities (space_id, kind, id, value_json, revision) VALUES (?, ?, ?, ?, ?)')
        .bind('personal', 'invalid-kind', 'deck-1', '{}', 1),
    ])).rejects.toThrow();
    expect(await fixture.database.prepare('SELECT revision FROM spaces').first()).toEqual({ revision: 0 });
    expect(await fixture.database.prepare('SELECT count(*) AS count FROM mutation_receipts').first()).toEqual({ count: 0 });
  });

  it('retains one-use pairing and revocation semantics', async () => {
    const owner = await pair();
    const { code } = await (await api('/api/auth/codes', { method: 'POST', cookie: owner.cookie })).json();
    const second = await pair(code);
    expect((await api('/api/auth/pair', { method: 'POST', body: { code, label: 'Again' } })).status).toBe(401);
    expect((await api(`/api/auth/devices/${second.session.device.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(200);
    expect((await api('/api/auth/session', { cookie: second.cookie })).status).toBe(401);
  });

  it('retains PostgreSQL request counters and platform-independent pairing IP input', async () => {
    env.CLIENT_IP = '203.0.113.42';
    for (let index = 0; index < 10; index += 1) {
      expect((await api('/api/auth/pair', { method: 'POST', body: { code: 'invalid', label: 'Test' } })).status).toBe(401);
    }
    expect((await api('/api/auth/pair', { method: 'POST', body: { code: bootstrap, label: 'Test' } })).status).toBe(429);
    env.CLIENT_IP = '203.0.113.43';
    await pair();
  });

  it('uploads idempotently, serves private exact bytes and HEAD metadata without reading storage', async () => {
    const owner = await pair();
    const id = (await validateMedia(imageBytes)).id;
    const upload = () => api(`/api/media/${id}`, { method: 'PUT', cookie: owner.cookie, image: imageBytes });
    expect((await upload()).status).toBe(200);
    expect((await upload()).status).toBe(200);
    expect(objects.size).toBe(1);
    expect(await fixture.database.prepare('SELECT used_bytes FROM media_usage').first()).toEqual({ used_bytes: imageBytes.byteLength });
    const get = vi.spyOn(storage, 'get');
    const head = await api(`/api/media/${id}`, { method: 'HEAD', cookie: owner.cookie });
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe(String(imageBytes.byteLength));
    expect(await head.text()).toBe('');
    expect(get).not.toHaveBeenCalled();
    const download = await api(`/api/media/${id}`, { cookie: owner.cookie });
    expect(download.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await download.arrayBuffer()).toEqual(imageBytes);
  });

  it('reserves quota before storing objects and rejects a full space without uploading bytes', async () => {
    const owner = await pair();
    const id = (await validateMedia(imageBytes)).id;
    await fixture.database.prepare('INSERT INTO media_usage (space_id, used_bytes) VALUES (?, ?)').bind('personal', 67108864).run();
    const upload = () => api(`/api/media/${id}`, { method: 'PUT', cookie: owner.cookie, image: imageBytes });
    expect((await upload()).status).toBe(413);
    expect(await fixture.database.prepare('SELECT count(*) AS count FROM media_assets').first()).toEqual({ count: 0 });
    expect((await api(`/api/media/${id}`, { method: 'HEAD', cookie: owner.cookie })).status).toBe(404);
    expect(objects.size).toBe(0);
    await fixture.database.prepare('UPDATE media_usage SET used_bytes = 0').run();
    expect((await upload()).status).toBe(200);
    expect(objects.size).toBe(1);
  });

  it('keeps failed uploads pending and retryable, without advertising unavailable images', async () => {
    const owner = await pair();
    const id = (await validateMedia(imageBytes)).id;
    vi.spyOn(storage, 'putIfAbsent').mockRejectedValueOnce(new Error('Synthetic storage outage'));
    expect((await api(`/api/media/${id}`, { method: 'PUT', cookie: owner.cookie, image: imageBytes })).status).toBe(503);
    expect((await api(`/api/media/${id}`, { method: 'HEAD', cookie: owner.cookie })).status).toBe(404);
    expect(await fixture.database.prepare('SELECT status FROM media_assets').first()).toEqual({ status: 'pending' });
    expect((await api(`/api/media/${id}`, { method: 'PUT', cookie: owner.cookie, image: imageBytes })).status).toBe(200);
    expect(await fixture.database.prepare('SELECT used_bytes FROM media_usage').first()).toEqual({ used_bytes: imageBytes.byteLength });
  });

  it('does not publish an image when the device is revoked mid-upload', async () => {
    const owner = await pair();
    const id = (await validateMedia(imageBytes)).id;
    vi.spyOn(storage, 'putIfAbsent').mockImplementationOnce(async () => {
      await fixture.database.prepare('UPDATE trusted_devices SET revoked_at = 1').run();
    });
    expect((await api(`/api/media/${id}`, { method: 'PUT', cookie: owner.cookie, image: imageBytes })).status).toBe(401);
    expect(await fixture.database.prepare('SELECT status FROM media_assets').first()).toEqual({ status: 'pending' });
  });

  it('fails closed on corrupted object bytes and cross-origin writes', async () => {
    const owner = await pair();
    const id = (await validateMedia(imageBytes)).id;
    expect((await api(`/api/media/${id}`, { method: 'PUT', cookie: owner.cookie, image: imageBytes, origin: 'https://evil.test' })).status).toBe(403);
    await api(`/api/media/${id}`, { method: 'PUT', cookie: owner.cookie, image: imageBytes });
    objects.set([...objects.keys()][0], new ArrayBuffer(imageBytes.byteLength));
    expect((await api(`/api/media/${id}`, { cookie: owner.cookie })).status).toBe(503);
  });

  it('keeps device and sync tables inaccessible to anon and authenticated database roles', async () => {
    await pair();
    for (const role of ['anon', 'authenticated']) {
      await fixture.engine.exec(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}; SET ROLE ${role}`);
      try {
        expect((await fixture.engine.query('SELECT * FROM trusted_devices')).rows).toEqual([]);
        expect((await fixture.engine.query('SELECT * FROM spaces')).rows).toEqual([]);
      } finally { await fixture.engine.exec('RESET ROLE'); }
    }
  });
});
