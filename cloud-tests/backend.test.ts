// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';
import type { CloudChange, CloudMutation, CloudState, DeviceSession, TrustedDevice } from '../shared/cloud';
import { CODE_LIFETIME, COOKIE_MAX_AGE, LAST_SEEN_INTERVAL, MAX_PAYLOAD_BYTES, PAIR_ATTEMPTS, PAIR_WINDOW, ROTATION_GRACE, ROTATION_INTERVAL, sha256 } from '../shared/server';
import type { ServerEnv } from '../shared/server';
import { assembleState, validateEntity } from '../shared/server-validation';
import { barrier, SqliteD1 } from './sqlite-d1';

const origin = 'https://recall.test';
const bootstrap = 'synthetic-test-only-owner-recovery-code-with-strong-entropy';
const at = '2026-10-31T02:00:00.000Z';

function deck(id = 'deck-1', parentId: string | null = null) {
  return { id, name: id, description: '', color: 'slate', parentId, createdAt: at, updatedAt: at };
}

function card(id = 'card-1', deckId = 'deck-1') {
  return {
    id, deckId, front: 'Question', back: 'Answer', hint: '', source: '', tags: [], cardType: 'basic',
    state: 'new', lastReviewDate: null, nextReviewDate: at, stability: 0, difficulty: 0,
    elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, learningSteps: 0, createdAt: at, updatedAt: at,
  };
}

function mergedCard(count = 2) {
  const id = `weread-group:${'a'.repeat(64)}`;
  const highlights = Array.from({ length: count }, (_, index) => ({ bookmarkId: `mark-${index + 1}`,
    markText: `  Original observation ${index + 1}.\nKeep whitespace.  `, chapterUid: 'chapter-1', chapterIdx: 0, range: `${index * 10}-100` }));
  return { ...card(id), contentKind: 'qa', recallKind: 'question', back: highlights.map(highlight => highlight.markText).join('\n\n'),
    sourceRef: { provider: 'weread', bookId: 'book-1', bookmarkId: 'mark-1', chapterUid: 'chapter-1', highlights } };
}

function change(kind: CloudChange['kind'], id: string, value: unknown, expectedRevision = 0): CloudChange {
  return { kind, id, value, expectedRevision };
}

function mutation(changes: CloudChange[], baseRevision = 0, id: string = crypto.randomUUID()): CloudMutation {
  return { id, baseRevision, changes };
}

describe('Recall Pages auth and D1 sync', () => {
  let db: SqliteD1;
  let env: ServerEnv;

  beforeEach(() => {
    db = new SqliteD1();
    env = { DB: db, RECALL_BOOTSTRAP_CODE: bootstrap };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  async function api(path: string, options: {
    method?: string; cookie?: string; body?: unknown; headers?: Record<string, string>; env?: ServerEnv; origin?: string;
  } = {}): Promise<Response> {
    const method = options.method ?? 'GET';
    const headers = new Headers({ 'CF-Connecting-IP': '203.0.113.1' });
    if (method !== 'GET') headers.set('Origin', options.origin ?? origin);
    if (options.cookie) headers.set('Cookie', options.cookie);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      if (value === '') headers.delete(key);
      else headers.set(key, value);
    }
    return onRequest({
      request: new Request(`${origin}${path}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }),
      env: options.env ?? env,
    });
  }

  async function paired(target = env, code = bootstrap, label = 'iPhone') {
    const response = await api('/api/auth/pair', { method: 'POST', body: { code, label }, env: target });
    expect(response.status).toBe(200);
    return { session: await response.json() as DeviceSession, cookie: response.headers.get('Set-Cookie')!.split(';')[0], response };
  }

  async function sync(cookie: string, payload: CloudMutation, target = env) {
    return api('/api/sync', { method: 'POST', cookie, body: payload, env: target });
  }

  async function seed(cookie: string) {
    const response = await sync(cookie, mutation([change('deck', 'deck-1', deck()), change('card', 'card-1', card())]));
    expect(response.status).toBe(200);
    return response;
  }

  it('accepts empty runtime request streams for device revocation without a JSON content type', async () => {
    const owner = await paired();
    const second = await paired();
    const response = await onRequest({ env, request: new Request(`${origin}/api/auth/devices/${second.session.device.id}`, {
      method: 'DELETE', headers: { Origin: origin, Cookie: owner.cookie }, body: '',
    }) });
    expect(response.status).toBe(200);
    expect((await api('/api/auth/session', { cookie: second.cookie })).status).toBe(401);
  });

  it('pairs reusable owner codes into the same space, with independent hashed tokens and secure decade cookies', async () => {
    const first = await paired();
    const second = await paired(env, bootstrap, 'Mac');
    expect(first.session.spaceId).toBe('personal');
    expect(second.session.spaceId).toBe(first.session.spaceId);
    expect(second.session.device.id).not.toBe(first.session.device.id);
    expect(first.response.headers.get('Set-Cookie')).toBe(`${first.cookie}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`);
    const rows = db.sqlite.prepare('SELECT token_hash FROM trusted_devices').all() as { token_hash: string }[];
    expect(rows.map(row => row.token_hash)).toContain(await sha256(first.cookie.split('=')[1]));
    expect(JSON.stringify(rows)).not.toContain(first.cookie.split('=')[1]);
    const session = await api('/api/auth/session', { cookie: first.cookie });
    expect(await session.json()).toEqual(first.session);
    expect(session.headers.get('Cache-Control')).toBe('no-store');
    expect(session.headers.get('Set-Cookie')).toBeNull();
  });

  it('requires a strong configured owner recovery code', async () => {
    for (const code of [undefined, 'short', ' '.repeat(40)]) {
      const response = await api('/api/auth/pair', { method: 'POST', body: { code: bootstrap, label: 'Phone' }, env: { DB: db, RECALL_BOOTSTRAP_CODE: code } });
      expect(response.status).toBe(503);
      expect(response.headers.get('Set-Cookie')).toBeNull();
    }
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM trusted_devices').get()).toMatchObject({ count: 0 });
  });

  it('rejects malformed pairing labels, credential-bearing input, and invalid space configuration', async () => {
    for (const body of [
      { code: bootstrap, label: '' }, { code: bootstrap, label: 'x'.repeat(81) },
      { code: bootstrap, label: 'Line\nBreak' }, { code: bootstrap, label: 'Phone', token: 'secret' },
      { code: 123, label: 'Phone' },
    ]) {
      const response = await api('/api/auth/pair', { method: 'POST', body });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid request' });
    }
    const invalidSpace = await api('/api/auth/pair', { method: 'POST', env: { ...env, RECALL_SPACE_ID: '../invalid' }, body: { code: bootstrap, label: 'Phone' } });
    expect(invalidSpace.status).toBe(503);
  });

  it.each(['/api/auth/pair', '/api/auth/codes', '/api/auth/logout', '/api/sync', '/api/auth/devices/device-1'])('requires exact mandatory same-origin CSRF checks on %s', async path => {
    const method = path.includes('/devices/') ? 'DELETE' : 'POST';
    for (const supplied of ['', 'null', 'https://evil.test', `${origin}/`, `${origin}.evil.test`]) {
      const response = await api(path, { method, headers: { Origin: supplied }, body: {} });
      expect(response.status).toBe(403);
    }
  });

  it('allows exact local loopback origins for isolated HTTP tests, but not remote HTTP', async () => {
    for (const local of ['http://127.0.0.1:8788', 'http://localhost:8788', 'http://[::1]:8788']) {
      const response = await onRequest({ env, request: new Request(`${local}/api/auth/pair`, {
        method: 'POST', headers: { Origin: local, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: bootstrap, label: 'Local' }),
      }) });
      expect(response.status).toBe(200);
    }
    const response = await onRequest({ env, request: new Request('http://recall.test/api/auth/pair', { method: 'POST', headers: { Origin: 'http://recall.test' } }) });
    expect(response.status).toBe(403);
  });

  it('returns generic pairing failures and limits hashed IP regardless of changed user agents', async () => {
    for (let index = 0; index < PAIR_ATTEMPTS; index += 1) {
      const response = await api('/api/auth/pair', { method: 'POST', body: { code: `wrong-${index}`, label: 'Phone' }, headers: { 'User-Agent': `ua-${index}` } });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    }
    const blocked = await api('/api/auth/pair', { method: 'POST', body: { code: bootstrap, label: 'Phone' }, headers: { 'User-Agent': 'changed-again' } });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Set-Cookie')).toBeNull();
    const stored = db.sqlite.prepare('SELECT * FROM pair_rate_limits').all();
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain('203.0.113.1');
    expect(JSON.stringify(stored)).not.toContain('ua-');
    expect((await api('/api/auth/pair', { method: 'POST', body: { code: bootstrap, label: 'Other IP' }, headers: { 'CF-Connecting-IP': '203.0.113.2' } })).status).toBe(200);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + PAIR_WINDOW + 1);
    expect((await api('/api/auth/pair', { method: 'POST', body: { code: bootstrap, label: 'Later' } })).status).toBe(200);
  });

  it('applies pairing rate limits atomically under concurrent attempts', async () => {
    const responses = await Promise.all(Array.from({ length: 16 }, (_, index) => api('/api/auth/pair', {
      method: 'POST', body: { code: 'wrong', label: 'Phone' }, headers: { 'User-Agent': `agent-${index}` },
    })));
    expect(responses.filter(response => response.status === 401)).toHaveLength(PAIR_ATTEMPTS);
    expect(responses.filter(response => response.status === 429)).toHaveLength(6);
    const rateWrites = db.executedStatements.filter(statement => statement.query.includes('INSERT INTO pair_rate_limits'));
    expect(rateWrites.filter(statement => statement.changes === 1)).toHaveLength(PAIR_ATTEMPTS);
    expect(rateWrites.filter(statement => statement.changes === 0)).toHaveLength(6);
  });

  it('creates hashed random one-use codes with a 15 minute expiry and pairs in the issuer space', async () => {
    const owner = await paired();
    const issued = await api('/api/auth/codes', { method: 'POST', cookie: owner.cookie });
    const payload = await issued.json() as { code: string; expiresAt: number };
    expect(payload.code).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.expiresAt - Date.now()).toBeGreaterThan(CODE_LIFETIME - 1000);
    const row = db.sqlite.prepare('SELECT code_hash FROM pairing_codes').get();
    expect(row).toMatchObject({ code_hash: await sha256(payload.code) });
    expect(JSON.stringify(row)).not.toContain(payload.code);
    const second = await paired(env, payload.code, 'Second device');
    expect(second.session.spaceId).toBe(owner.session.spaceId);
    expect((await api('/api/auth/pair', { method: 'POST', body: { code: payload.code, label: 'Third' } })).status).toBe(401);
  });

  it('allows only one winner when a one-use code is redeemed concurrently', async () => {
    const owner = await paired();
    const issued = await (await api('/api/auth/codes', { method: 'POST', cookie: owner.cookie })).json() as { code: string };
    const responses = await Promise.all(['First', 'Second'].map(label => api('/api/auth/pair', { method: 'POST', body: { code: issued.code, label } })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 401]);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM trusted_devices').get()).toMatchObject({ count: 2 });
  });

  it('rejects expired codes and codes issued by revoked devices', async () => {
    const owner = await paired();
    const code = await (await api('/api/auth/codes', { method: 'POST', cookie: owner.cookie })).json() as { code: string };
    db.sqlite.prepare('UPDATE pairing_codes SET expires_at = ?').run(Date.now() - 1);
    expect((await api('/api/auth/pair', { method: 'POST', body: { code: code.code, label: 'Expired' } })).status).toBe(401);
    db.sqlite.prepare('UPDATE pairing_codes SET expires_at = ?').run(Date.now() + CODE_LIFETIME);
    await api('/api/auth/logout', { method: 'POST', cookie: owner.cookie });
    expect((await api('/api/auth/pair', { method: 'POST', body: { code: code.code, label: 'Revoked issuer' } })).status).toBe(401);
  });

  it('lists and revokes scoped devices, and logout revokes server access and clears the cookie', async () => {
    const owner = await paired();
    const second = await paired(env, bootstrap, 'Mac');
    const listing = await (await api('/api/auth/devices', { cookie: owner.cookie })).json() as { devices: TrustedDevice[] };
    expect(listing.devices).toHaveLength(2);
    expect(Object.keys(listing.devices[0]).sort()).toEqual(['createdAt', 'id', 'label', 'lastSeenAt', 'revokedAt']);
    expect(listing.devices[0].createdAt).toBeGreaterThan(1_000_000_000_000);
    expect(listing.devices[0].lastSeenAt).toBeGreaterThanOrEqual(listing.devices[0].createdAt);
    expect((await api(`/api/auth/devices/${second.session.device.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(200);
    expect((await api('/api/auth/session', { cookie: second.cookie })).status).toBe(401);
    const logout = await api('/api/auth/logout', { method: 'POST', cookie: owner.cookie });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('Set-Cookie')).toBe('recall_device=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    expect((await api('/api/sync', { cookie: owner.cookie })).status).toBe(401);
  });

  it('has no annual or idle server logout and rotates old tokens with a two-minute grace', async () => {
    const owner = await paired();
    const future = Date.now() + 4 * 365 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(future);
    const rotated = await api('/api/auth/session', { cookie: owner.cookie });
    expect(rotated.status).toBe(200);
    const nextCookie = rotated.headers.get('Set-Cookie')!.split(';')[0];
    expect(nextCookie).not.toBe(owner.cookie);
    expect((await api('/api/auth/session', { cookie: owner.cookie })).status).toBe(200);
    expect((await api('/api/auth/session', { cookie: owner.cookie })).headers.get('Set-Cookie')).toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(future + ROTATION_GRACE);
    expect((await api('/api/auth/session', { cookie: owner.cookie })).status).toBe(401);
    expect((await api('/api/auth/session', { cookie: nextCookie })).status).toBe(200);
  });

  it('does not issue lastSeen writes until 24 hours and throttles concurrent touches at the boundary', async () => {
    const startedAt = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
    const owner = await paired();
    const run = vi.fn(async () => {});
    db.beforeRun = run;
    clock.mockReturnValue(startedAt + LAST_SEEN_INTERVAL - 1);
    for (let index = 0; index < 5; index += 1) {
      expect((await api('/api/auth/session', { cookie: owner.cookie })).status).toBe(200);
    }
    expect(run).not.toHaveBeenCalled();
    expect(db.sqlite.prepare('SELECT last_seen_at FROM trusted_devices').get()).toMatchObject({ last_seen_at: startedAt });
    const ready = barrier(2);
    db.afterFirst = async query => { if (query.includes('SELECT id, space_id, label')) await ready(); };
    clock.mockReturnValue(startedAt + LAST_SEEN_INTERVAL);
    const responses = await Promise.all([api('/api/auth/session', { cookie: owner.cookie }), api('/api/auth/session', { cookie: owner.cookie })]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    const touches = db.executedStatements.filter(statement => statement.query.includes('SET last_seen_at = ?'));
    expect(touches).toHaveLength(2);
    expect(touches.map(statement => statement.changes).sort()).toEqual([0, 1]);
    expect(db.sqlite.prepare('SELECT last_seen_at FROM trusted_devices').get()).toMatchObject({ last_seen_at: startedAt + LAST_SEEN_INTERVAL });
    db.afterFirst = undefined;
    run.mockClear();
    clock.mockReturnValue(startedAt + 2 * LAST_SEEN_INTERVAL - 1);
    expect((await api('/api/auth/session', { cookie: owner.cookie })).status).toBe(200);
    expect(run).not.toHaveBeenCalled();
    clock.mockReturnValue(startedAt + 2 * LAST_SEEN_INTERVAL);
    expect((await api('/api/auth/session', { cookie: owner.cookie })).status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rotates without advancing a recent lastSeen value and does not touch it for grace-token requests', async () => {
    const startedAt = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
    const owner = await paired();
    db.sqlite.prepare('UPDATE trusted_devices SET rotated_at = ?').run(startedAt - ROTATION_INTERVAL);
    clock.mockReturnValue(startedAt + 1000);
    const rotated = await api('/api/auth/session', { cookie: owner.cookie });
    expect(rotated.status).toBe(200);
    expect(rotated.headers.has('Set-Cookie')).toBe(true);
    expect(db.sqlite.prepare('SELECT last_seen_at FROM trusted_devices').get()).toMatchObject({ last_seen_at: startedAt });
    const beforeRun = vi.fn(async () => {});
    db.beforeRun = beforeRun;
    expect((await api('/api/auth/session', { cookie: owner.cookie })).status).toBe(200);
    expect(beforeRun).not.toHaveBeenCalled();
  });

  it('only the concurrent rotation CAS winner sends a new cookie', async () => {
    const owner = await paired();
    db.sqlite.prepare('UPDATE trusted_devices SET rotated_at = ?').run(Date.now() - ROTATION_INTERVAL - 1);
    const ready = barrier(2);
    db.afterFirst = async query => { if (query.includes('SELECT id, space_id, label')) await ready(); };
    const responses = await Promise.all([api('/api/auth/session', { cookie: owner.cookie }), api('/api/auth/session', { cookie: owner.cookie })]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(responses.filter(response => response.headers.has('Set-Cookie'))).toHaveLength(1);
    db.afterFirst = undefined;
    const winner = responses.find(response => response.headers.has('Set-Cookie'))!;
    expect((await api('/api/auth/session', { cookie: winner.headers.get('Set-Cookie')!.split(';')[0] })).status).toBe(200);
  });

  it('does not revive a device revoked during rotation', async () => {
    const owner = await paired();
    db.sqlite.prepare('UPDATE trusted_devices SET rotated_at = ?').run(Date.now() - ROTATION_INTERVAL - 1);
    db.beforeRun = async query => {
      if (query.includes('previous_token_hash = token_hash')) db.sqlite.prepare('UPDATE trusted_devices SET revoked_at = ?').run(Date.now());
    };
    const response = await api('/api/auth/session', { cookie: owner.cookie });
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it.each(['/api/auth/session', '/api/auth/devices', '/api/sync'])('authenticates %s and rejects duplicate or malformed cookies', async path => {
    const owner = await paired();
    for (const cookie of ['', 'recall_device=garbage', `${owner.cookie}; ${owner.cookie}`]) {
      expect((await api(path, { cookie })).status).toBe(401);
    }
  });

  it('isolates sessions, codes, devices, data, and receipts between spaces', async () => {
    const aliceEnv = { ...env, RECALL_SPACE_ID: 'alice' };
    const bobEnv = { ...env, RECALL_SPACE_ID: 'bob' };
    const alice = await paired(aliceEnv);
    const bob = await paired(bobEnv);
    expect((await api('/api/auth/session', { cookie: alice.cookie, env: bobEnv })).status).toBe(401);
    expect((await api(`/api/auth/devices/${alice.session.device.id}`, { method: 'DELETE', cookie: bob.cookie, env: bobEnv })).status).toBe(404);
    const code = await (await api('/api/auth/codes', { method: 'POST', cookie: alice.cookie, env: aliceEnv })).json() as { code: string };
    expect((await api('/api/auth/pair', { method: 'POST', env: bobEnv, body: { code: code.code, label: 'Wrong space' } })).status).toBe(401);
    const payload = mutation([change('deck', 'deck-1', deck())], 0, 'same-mutation-id');
    expect((await sync(alice.cookie, payload, aliceEnv)).status).toBe(200);
    expect(await (await api('/api/sync', { cookie: bob.cookie, env: bobEnv })).json()).toEqual({ revision: 0, entities: [] });
    expect((await sync(bob.cookie, payload, bobEnv)).status).toBe(200);
    const devices = await (await api('/api/auth/devices', { cookie: bob.cookie, env: bobEnv })).json() as { devices: TrustedDevice[] };
    expect(devices.devices.map(device => device.id)).toEqual([bob.session.device.id]);
  });

  it('downloads existing cloud data for a newly paired device without replacing the library', async () => {
    const first = await paired();
    await seed(first.cookie);
    const second = await paired(env, bootstrap, 'Second');
    const initial = await (await api('/api/sync?since=0', { cookie: second.cookie })).json() as CloudState;
    expect(initial.revision).toBe(1);
    expect(initial.entities.map(entity => entity.kind).sort()).toEqual(['card', 'deck']);
    const empty = await sync(second.cookie, mutation([], 1));
    expect(empty.status).toBe(400);
    expect(await (await api('/api/sync?since=1', { cookie: first.cookie })).json()).toEqual({ revision: 1, entities: [] });
  });

  it('retains archive state and finite schedules, and requires atomic log deletion with card tombstones', async () => {
    const owner = await paired();
    await seed(owner.cookie);
    const archived = { ...card(), archivedAt: at, importedAt: at, stability: 12.4, scheduledDays: 0.0006944444444444445, reps: 4 };
    const log = { id: 'log-1', cardId: 'card-1', rating: 'good', reviewDate: at, stability: 12.4, difficulty: 4, elapsedDays: 1, scheduledDays: 30 };
    const response = await sync(owner.cookie, mutation([change('card', 'card-1', archived, 1), change('reviewLog', 'log-1', log)], 1));
    expect(response.status).toBe(200);
    const archivedState = await (await api('/api/sync?since=1', { cookie: owner.cookie })).json() as CloudState;
    expect(archivedState.entities.find(entity => entity.kind === 'card')?.value).toEqual(archived);
    expect((await sync(owner.cookie, mutation([change('card', 'card-1', null, 2)], 2))).status).toBe(400);
    expect(db.sqlite.prepare("SELECT value_json FROM cloud_entities WHERE kind = 'reviewLog'").get()).toMatchObject({ value_json: JSON.stringify(log) });
    expect((await sync(owner.cookie, mutation([change('card', 'card-1', null, 2), change('reviewLog', 'log-1', null, 2)], 2))).status).toBe(200);
    const deleted = await (await api('/api/sync?since=2', { cookie: owner.cookie })).json() as CloudState;
    expect(deleted).toEqual({ revision: 3, entities: [{ kind: 'card', id: 'card-1', value: null, revision: 3 }, { kind: 'reviewLog', id: 'log-1', value: null, revision: 3 }] });
    const orphan = { ...log, id: 'log-2', cardId: 'already-deleted-card' };
    expect((await sync(owner.cookie, mutation([change('reviewLog', 'log-2', orphan)], 3))).status).toBe(400);
  });

  it('replays exactly once by canonical payload hash, including stale retries after later commits', async () => {
    const owner = await paired();
    const first = mutation([change('deck', 'deck-1', deck())]);
    expect(await (await sync(owner.cookie, first)).json()).toEqual({ revision: 1 });
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-2', deck('deck-2'))], 1))).status).toBe(200);
    const reordered = { changes: first.changes.map(entry => ({ value: entry.value, expectedRevision: entry.expectedRevision, id: entry.id, kind: entry.kind })), baseRevision: first.baseRevision, id: first.id };
    expect(await (await sync(owner.cookie, reordered)).json()).toEqual({ revision: 1 });
    expect((await sync(owner.cookie, { ...first, changes: [change('deck', 'deck-1', { ...deck(), description: 'Different' })] })).status).toBe(409);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 2 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM mutation_receipts').get()).toMatchObject({ count: 2 });
  });

  it('handles concurrent duplicate delivery without double revision increments', async () => {
    const owner = await paired();
    const ready = barrier(2);
    db.beforeBatch = async statements => { if (statements[0].query.includes('INSERT INTO mutation_receipts')) await ready(); };
    const payload = mutation([change('deck', 'deck-1', deck())]);
    const responses = await Promise.all([sync(owner.cookie, payload), sync(owner.cookie, payload)]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(await Promise.all(responses.map(response => response.json()))).toEqual([{ revision: 1 }, { revision: 1 }]);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 1 });
  });

  it('rejects concurrent reuse of one mutation ID with a different payload', async () => {
    const owner = await paired();
    const ready = barrier(2);
    db.beforeBatch = async statements => { if (statements[0].query.includes('INSERT INTO mutation_receipts')) await ready(); };
    const responses = await Promise.all([
      sync(owner.cookie, mutation([change('deck', 'deck-1', deck())], 0, 'shared-id')),
      sync(owner.cookie, mutation([change('deck', 'deck-2', deck('deck-2'))], 0, 'shared-id')),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 1 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM cloud_entities').get()).toMatchObject({ count: 1 });
  });

  it.each([false, true])('rechecks receipts when a commit occurs between receipt lookup and snapshot (different payload: %s)', async differentPayload => {
    const owner = await paired();
    const committed = mutation([change('deck', 'deck-1', deck())], 0, 'receipt-race');
    db.afterFirst = async query => {
      if (query.includes('SELECT payload_hash, revision')) {
        db.afterFirst = undefined;
        expect((await sync(owner.cookie, committed)).status).toBe(200);
      }
    };
    const payload = differentPayload ? { ...committed, changes: [change('deck', 'deck-2', deck('deck-2'))] } : committed;
    const response = await sync(owner.cookie, payload);
    expect(response.status).toBe(differentPayload ? 409 : 200);
    expect(await response.json()).toEqual(differentPayload ? { error: 'Conflict', revision: 1 } : { revision: 1 });
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 1 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM mutation_receipts').get()).toMatchObject({ count: 1 });
  });

  it('rejects stale space and entity revisions without any writes', async () => {
    const owner = await paired();
    await seed(owner.cookie);
    const stale = await sync(owner.cookie, mutation([change('deck', 'deck-2', deck('deck-2'))]));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'Conflict', revision: 1 });
    const entityConflict = await sync(owner.cookie, mutation([change('card', 'card-1', { ...card(), back: 'Updated' }, 0)], 1));
    expect(entityConflict.status).toBe(409);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM mutation_receipts').get()).toMatchObject({ count: 1 });
    expect((await api('/api/sync?since=2', { cookie: owner.cookie })).status).toBe(409);
  });

  it('guards validated-state races with a transactional global revision CAS', async () => {
    const owner = await paired();
    await seed(owner.cookie);
    const ready = barrier(2);
    db.beforeBatch = async statements => { if (statements[0].query.includes('INSERT INTO mutation_receipts')) await ready(); };
    const deleteAll = mutation([change('card', 'card-1', null, 1), change('deck', 'deck-1', null, 1)], 1);
    const addCard = mutation([change('card', 'card-2', card('card-2'))], 1);
    const responses = await Promise.all([sync(owner.cookie, deleteAll), sync(owner.cookie, addCard)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    db.beforeBatch = undefined;
    const snapshot = await (await api('/api/sync', { cookie: owner.cookie })).json() as CloudState;
    expect(snapshot.revision).toBe(2);
    expect(() => assembleState(snapshot.entities, mutation([change('setting', 'xp', 1)], 2))).not.toThrow();
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM mutation_receipts').get()).toMatchObject({ count: 2 });
  });

  it('rolls receipt, revision, and entity writes back if any batch statement fails', async () => {
    const owner = await paired();
    db.failQuery = 'INSERT INTO cloud_entities';
    const response = await sync(owner.cookie, mutation([change('deck', 'deck-1', deck())]));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Service unavailable' });
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 0 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM mutation_receipts').get()).toMatchObject({ count: 0 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM cloud_entities').get()).toMatchObject({ count: 0 });
  });

  it('rolls back earlier json_each chunks when a later chunk fails, then retries atomically', async () => {
    const owner = await paired();
    const payload = mutation(Array.from({ length: 7000 }, (_, index) => change('deck', `deck-${index}`, deck(`deck-${index}`))));
    db.failAtStatement = 2;
    expect((await sync(owner.cookie, payload)).status).toBe(503);
    expect(db.batchSizes.at(-1)).toBeGreaterThan(2);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 0 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM cloud_entities').get()).toMatchObject({ count: 0 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM mutation_receipts').get()).toMatchObject({ count: 0 });
    db.failAtStatement = undefined;
    expect((await sync(owner.cookie, payload)).status).toBe(200);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM cloud_entities').get()).toMatchObject({ count: 7000 });
  });

  it('blocks a mutation when its device is revoked between authentication and commit', async () => {
    const owner = await paired();
    db.beforeBatch = async statements => {
      if (statements[0].query.includes('INSERT INTO mutation_receipts')) {
        db.sqlite.prepare('UPDATE trusted_devices SET revoked_at = ?').run(Date.now());
      }
    };
    const response = await sync(owner.cookie, mutation([change('deck', 'deck-1', deck())]));
    expect(response.status).toBe(401);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 0 });
  });

  it('checks revocation within the transactional sync snapshot and does not expose data', async () => {
    const owner = await paired();
    await seed(owner.cookie);
    db.beforeBatch = async statements => {
      if (statements[0].query.includes('SELECT revision FROM spaces')) {
        expect(statements).toHaveLength(2);
        expect(statements[1].query).toContain('SELECT kind, id, value_json, revision');
        db.sqlite.prepare('UPDATE trusted_devices SET revoked_at = ?').run(Date.now());
      }
    };
    const response = await api('/api/sync', { cookie: owner.cookie });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('does not list devices after revocation between authentication and the list query', async () => {
    const owner = await paired();
    db.beforeAll = async query => {
      if (query.includes('created_at AS createdAt')) db.sqlite.prepare('UPDATE trusted_devices SET revoked_at = ?').run(Date.now());
    };
    const response = await api('/api/auth/devices', { cookie: owner.cookie });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('does not replay a committed receipt after revocation between authentication and receipt lookup', async () => {
    const owner = await paired();
    const payload = mutation([change('deck', 'deck-1', deck())]);
    expect((await sync(owner.cookie, payload)).status).toBe(200);
    db.beforeFirst = async query => {
      if (query.includes('SELECT payload_hash, revision')) db.sqlite.prepare('UPDATE trusted_devices SET revoked_at = ?').run(Date.now());
    };
    const response = await sync(owner.cookie, payload);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 1 });
  });

  it('validates assembled tree, sibling names, and references before deletion or upsert', async () => {
    const owner = await paired();
    await seed(owner.cookie);
    const invalidChanges = [
      [change('deck', 'deck-1', null, 1)],
      [change('deck', 'deck-1', { ...deck(), parentId: 'deck-1' }, 1)],
      [change('deck', 'deck-2', deck('deck-2', 'missing'))],
      [change('deck', 'deck-2', { ...deck('deck-2'), name: ' DECK-1 ' })],
      [change('card', 'card-2', card('card-2', 'missing'))],
      [change('studySession', 'session-1', { id: 'session-1', deckId: 'missing', startedAt: at, endedAt: at, cardsStudied: 1 })],
      [change('deck', 'deck-1', deck('deck-1', 'deck-2'), 1), change('deck', 'deck-2', deck('deck-2', 'deck-1'))],
    ];
    for (const changes of invalidChanges) expect((await sync(owner.cookie, mutation(changes, 1))).status).toBe(400);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 1 });
    expect((await sync(owner.cookie, mutation([change('card', 'card-1', null, 1), change('deck', 'deck-1', null, 1)], 1))).status).toBe(200);
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', deck(), 0)], 2))).status).toBe(409);
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', deck(), 2)], 2))).status).toBe(200);
  });

  it('requires atomic session deletion or deckId reassignment when deleting a referenced deck', async () => {
    const owner = await paired();
    const session = { id: 'session-1', deckId: 'deck-1', startedAt: at, endedAt: at, cardsStudied: 1 };
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', deck()), change('studySession', 'session-1', session)]))).status).toBe(200);
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', null, 1)], 1))).status).toBe(400);
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', null, 1), change('studySession', 'session-1', { ...session, deckId: null }, 1)], 1))).status).toBe(200);
  });

  it('accepts credential-free allowed settings and rejects nested secrets and unknown props', async () => {
    const owner = await paired();
    const plan = { mode: 'fixed', intervals: { again: 60_000, hard: 86_400_000, good: 30 * 86_400_000, easy: 180 * 86_400_000 } };
    const settings = [change('setting', 'reviewPlan', plan), change('setting', 'desiredRetention', 0.9), change('setting', 'fsrsWeights', Array(21).fill(0.1)), change('setting', 'dailyNewCardLimit', 20), change('setting', 'leechThreshold', 8), change('setting', 'dailyGoal', 10), change('setting', 'xp', 1), change('setting', 'achievements', [])];
    expect((await sync(owner.cookie, mutation(settings))).status).toBe(200);
    for (const entry of [
      change('setting', 'syncCode', 'secret'), change('setting', 'authToken', null),
      change('setting', 'reviewPlan', { ...plan, token: 'secret' }, 1),
      change('setting', 'reviewPlan', { ...plan, intervals: { ...plan.intervals, token: 'secret' } }, 1),
      change('setting', 'desiredRetention', 0.999, 1),
      change('setting', 'reviewPlan', { ...plan, intervals: { ...plan.intervals, hard: 60_000 } }, 1),
      change('deck', 'deck-1', { ...deck(), syncCode: 'secret' }),
      change('card', 'card-1', { ...card(), sourceRef: { provider: 'weread', bookId: 'book', bookmarkId: 'mark', cookie: 'secret' } }),
    ]) expect((await sync(owner.cookie, mutation([entry], 1))).status).toBe(400);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 1 });
  });

  it.each([1, 2, 4])('syncs and reopens %i exact ordered WeRead sources with a compact group card ID', async count => {
    const owner = await paired();
    const value = mergedCard(count);
    expect(value.id.length).toBeLessThanOrEqual(128);
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', deck()), change('card', value.id, value)]))).status).toBe(200);
    const saved = await (await api('/api/sync', { cookie: owner.cookie })).json() as CloudState;
    expect(saved.entities.find(entity => entity.kind === 'card')?.value).toEqual(value);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 1 });
  });

  it('accepts ascending starts without interpreting the second range component or rewriting originals', () => {
    const value = mergedCard();
    value.sourceRef.highlights[0].range = '0002-9999';
    value.sourceRef.highlights[1].range = '10-0';
    const original = structuredClone(value);
    expect(() => validateEntity({ kind: 'card', id: value.id, value })).not.toThrow();
    expect(value).toEqual(original);
  });

  it.each([null, [], {}, [null], mergedCard(5).sourceRef.highlights].map(highlights => ({ highlights })))('rejects empty, malformed or oversized grouped provenance: %j', async ({ highlights }) => {
    const owner = await paired();
    const value = mergedCard();
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', deck()),
      change('card', value.id, { ...value, sourceRef: { ...value.sourceRef, highlights } })]))).status).toBe(400);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_entities').get()).toEqual({ count: 0 });
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 0 });
  });

  it.each(['first-id', 'source-chapter', 'member-chapter', 'chapter-index', 'duplicate', 'reorder', 'equal-start',
    'range', 'missing-field', 'extra-field', 'credential', 'unsafe-original', 'unsafe-id', 'long-id', 'negative-index',
    'fractional-index', 'string-index', 'joined-back', 'trimmed-back', 'too-long',
  ])('rejects inconsistent grouped provenance (%s) before any library or receipt changes', async fault => {
    const owner = await paired();
    const value = mergedCard();
    const source = value.sourceRef, first = source.highlights[0], second = source.highlights[1];
    if (fault === 'first-id') source.bookmarkId = 'another-mark';
    if (fault === 'source-chapter') source.chapterUid = 'another-chapter';
    if (fault === 'member-chapter') second.chapterUid = 'another-chapter';
    if (fault === 'chapter-index') second.chapterIdx = 1;
    if (fault === 'duplicate') second.bookmarkId = first.bookmarkId;
    if (fault === 'reorder') source.highlights.reverse();
    if (fault === 'equal-start') second.range = '0000-1';
    if (fault === 'range') second.range = '1-9007199254740992';
    if (fault === 'missing-field') delete (second as Partial<typeof second>).range;
    if (fault === 'extra-field') Object.assign(second, { answer: 'not allowed' });
    if (fault === 'credential') Object.assign(second, { cookie: 'synthetic-only' });
    if (fault === 'unsafe-original') second.markText = 'java\nscript:run';
    if (fault === 'unsafe-id') second.bookmarkId = 'mark\n2';
    if (fault === 'long-id') second.bookmarkId = 'x'.repeat(201);
    if (fault === 'negative-index') first.chapterIdx = second.chapterIdx = -1;
    if (fault === 'fractional-index') first.chapterIdx = second.chapterIdx = 0.5;
    if (fault === 'string-index') Object.assign(first, { chapterIdx: '0' });
    if (fault === 'too-long') first.markText = second.markText = 'x'.repeat(3000);
    value.back = source.highlights.map(highlight => highlight.markText).join('\n\n');
    if (fault === 'joined-back') value.back = source.highlights.map(highlight => highlight.markText).join('\n');
    if (fault === 'trimmed-back') value.back = value.back.trim();
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', deck()), change('card', value.id, value)]))).status).toBe(400);
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM cloud_entities').get()).toEqual({ count: 0 });
    expect(db.sqlite.prepare('SELECT COUNT(*) AS count FROM mutation_receipts').get()).toEqual({ count: 0 });
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 0 });
  });

  it('preserves an already synced group and revision when its source or answer is tampered', async () => {
    const owner = await paired();
    const value = mergedCard();
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', deck()), change('card', value.id, value)]))).status).toBe(200);
    const modified = structuredClone(value);
    modified.sourceRef.highlights[1].markText += ' Changed original.';
    expect((await sync(owner.cookie, mutation([change('card', value.id, modified, 1)], 1))).status).toBe(400);
    const saved = await (await api('/api/sync', { cookie: owner.cookie })).json() as CloudState;
    expect(saved.entities.find(entity => entity.kind === 'card')?.value).toEqual(value);
    expect(saved.revision).toBe(1);
  });

  it.each([
    ['desiredRetention', 0.9], ['dailyNewCardLimit', 20], ['leechThreshold', 8],
    ['dailyGoal', 10], ['xp', 1], ['achievements', []],
  ])('rejects null for required setting %s without committing any part of the mutation', async (id, value) => {
    const owner = await paired();
    const settingId = id as string;
    const absent = await sync(owner.cookie, mutation([change('setting', settingId, null)]));
    expect(absent.status).toBe(400);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 0 });
    expect((await sync(owner.cookie, mutation([change('setting', settingId, value)]))).status).toBe(200);
    const response = await sync(owner.cookie, mutation([change('deck', 'deck-1', deck()), change('setting', settingId, null, 1)], 1));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request' });
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 1 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM mutation_receipts').get()).toMatchObject({ count: 1 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM cloud_entities').get()).toMatchObject({ count: 1 });
    const snapshot = await (await api('/api/sync', { cookie: owner.cookie })).json() as CloudState;
    expect(snapshot.entities).toEqual([{ kind: 'setting', id: settingId, value, revision: 1 }]);
  });

  it.each(['fsrsWeights', 'reviewPlan'])('allows nullable setting %s to reset, replay, and restore with tombstone revisions', async id => {
    const owner = await paired();
    const value = id === 'fsrsWeights' ? Array(21).fill(0.1)
      : { mode: 'fixed', intervals: { again: 60_000, hard: 86_400_000, good: 30 * 86_400_000, easy: 180 * 86_400_000 } };
    expect((await sync(owner.cookie, mutation([change('setting', id, value)]))).status).toBe(200);
    const reset = mutation([change('setting', id, null, 1)], 1);
    expect(await (await sync(owner.cookie, reset)).json()).toEqual({ revision: 2 });
    expect(await (await sync(owner.cookie, reset)).json()).toEqual({ revision: 2 });
    const snapshot = await (await api('/api/sync?since=1', { cookie: owner.cookie })).json() as CloudState;
    expect(snapshot).toEqual({ revision: 2, entities: [{ kind: 'setting', id, value: null, revision: 2 }] });
    expect((await sync(owner.cookie, mutation([change('setting', id, value, 2)], 2))).status).toBe(200);
  });

  it('validates legitimate optional entity fields and achievement schemas', async () => {
    const owner = await paired();
    const richCard = { ...card(), contentKind: 'qa', recallKind: 'question', bookTitle: 'Book', chapter: 'Chapter', aiSummary: 'Summary', importedAt: at, lastImportedAt: at, sourceRef: { provider: 'weread', bookId: 'book', bookmarkId: 'mark', chapterUid: 'chapter' } };
    const achievement = { id: 'first_steps', title: 'First Steps', description: 'A review', icon: '*', unlockedAt: at };
    expect((await sync(owner.cookie, mutation([change('deck', 'deck-1', { ...deck(), examDeadline: '2026-12-31', importedAt: at }), change('card', 'card-1', richCard), change('setting', 'achievements', [achievement])]))).status).toBe(200);
    for (const value of [[achievement, achievement], [{ ...achievement, token: 'secret' }], [{ ...achievement, unlockedAt: 'not-a-date' }]]) {
      expect((await sync(owner.cookie, mutation([change('setting', 'achievements', value, 1)], 1))).status).toBe(400);
    }
    expect((await sync(owner.cookie, mutation([change('setting', 'fsrsWeights', null)], 1))).status).toBe(200);
  });

  it('rejects invalid IDs, mismatched IDs, unknown kinds, duplicate changes, invalid counters, and malformed dates', async () => {
    const owner = await paired();
    for (const payload of [
      mutation([change('deck', 'deck-1', deck())], 0, '../bad'),
      mutation([change('deck', 'deck-1', deck('different'))]),
      mutation([change('deck', 'deck-1', deck()), change('deck', 'deck-1', deck())]),
      mutation([change('card', 'card-1', { ...card(), reps: -1 })]),
      mutation([change('card', 'card-1', { ...card(), learningSteps: 0.5 })]),
      mutation([change('card', 'card-1', { ...card(), nextReviewDate: '2026-02-30T00:00:00Z' })]),
      mutation([change('card', 'card-1', { ...card(), stability: Infinity })]),
      { ...mutation([change('deck', 'deck-1', deck())]), secret: 'unknown' },
      { ...mutation([change('deck', 'deck-1', deck())]), baseRevision: -1 },
      mutation([change('deck', '../bad', null)]),
      mutation([{ ...change('deck', 'deck-1', null), kind: 'credential' } as unknown as CloudChange]),
    ]) expect((await sync(owner.cookie, payload as CloudMutation)).status).toBe(400);
    for (const field of ['stability', 'difficulty', 'elapsedDays', 'scheduledDays', 'reps', 'lapses', 'learningSteps']) {
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(() => validateEntity({ kind: 'card', id: 'card-1', value: { ...card(), [field]: value } })).toThrow();
      }
    }
  });

  it('handles 10,000 changes via bounded json_each statements, not one statement per change', async () => {
    const owner = await paired();
    const changes = Array.from({ length: 10_000 }, (_, index) => change('deck', `deck-${index}`, deck(`deck-${index}`)));
    const response = await sync(owner.cookie, mutation(changes));
    expect(response.status).toBe(200);
    expect(db.batchSizes.at(-1)).toBeLessThan(10);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM cloud_entities').get()).toMatchObject({ count: 10_000 });
    expect((await sync(owner.cookie, mutation([...changes, change('deck', 'extra', deck('extra'))], 1))).status).toBe(400);
    for (const values of db.bindings) {
      for (const value of values) if (typeof value === 'string') expect(new TextEncoder().encode(value).byteLength).toBeLessThan(1024 * 1024);
    }
  });

  it('rejects a schema-valid single value too large for a bounded D1 json_each parameter before any commit', async () => {
    const owner = await paired();
    const achievements = Array.from({ length: 110 }, (_, index) => ({
      id: `achievement-${index}`, title: 'Title', description: 'x'.repeat(10_000), icon: '*', unlockedAt: at,
    }));
    const payload = mutation([change('setting', 'achievements', achievements)]);
    expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeLessThan(MAX_PAYLOAD_BYTES);
    const response = await sync(owner.cookie, payload);
    expect(response.status).toBe(413);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 0 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM mutation_receipts').get()).toMatchObject({ count: 0 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM cloud_entities').get()).toMatchObject({ count: 0 });
  });

  it('enforces request byte limits even without Content-Length, and assembled state limits', async () => {
    const owner = await paired();
    const tooLong = await api('/api/sync', { method: 'POST', cookie: owner.cookie, body: {}, headers: { 'Content-Length': String(MAX_PAYLOAD_BYTES + 1) } });
    expect(tooLong.status).toBe(413);
    const large = await api('/api/sync', { method: 'POST', cookie: owner.cookie, body: { text: '\u4e2d'.repeat(Math.ceil(MAX_PAYLOAD_BYTES / 3)) } });
    expect(large.status).toBe(413);
    const current = Array.from({ length: 600 }, (_, index) => ({ kind: 'deck' as const, id: `deck-${index}`, value: { ...deck(`deck-${index}`), description: 'x'.repeat(20_000) }, revision: 1 }));
    expect(() => assembleState(current, mutation([change('setting', 'xp', 1)], 1))).toThrow('Payload too large');
  });

  it('rejects malformed bodies/content types without leaking internal errors', async () => {
    const owner = await paired();
    const response = await onRequest({ env, request: new Request(`${origin}/api/sync`, {
      method: 'POST', headers: { Origin: origin, Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: '{broken',
    }) });
    expect(response.status).toBe(400);
    expect((await api('/api/sync', { method: 'POST', cookie: owner.cookie, body: {}, headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
    for (const query of ['since=-1', 'since=1.5', 'since=0&since=1', 'since=9007199254740992', 'secret=true']) {
      expect((await api(`/api/sync?${query}`, { cookie: owner.cookie })).status).toBe(400);
    }
    expect((await api('/api/auth/codes', { method: 'POST', cookie: owner.cookie, body: {} })).status).toBe(200);
    expect((await api('/api/auth/codes', { method: 'POST', cookie: owner.cookie, body: { token: 'secret' } })).status).toBe(400);
    expect((await api('/api/auth/codes', { method: 'POST', cookie: owner.cookie, body: {}, headers: { 'Content-Length': String(MAX_PAYLOAD_BYTES + 1) } })).status).toBe(413);
    expect((await api('/api/unknown', { cookie: owner.cookie })).status).toBe(404);
    expect((await api('/api/auth/devices/../invalid', { method: 'DELETE', cookie: owner.cookie })).status).toBe(404);
  });

  it('keeps migrations incremental and safely repeatable without clearing data', async () => {
    const owner = await paired();
    await seed(owner.cookie);
    db.migrate();
    db.migrate();
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()).toMatchObject({ revision: 1 });
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM cloud_entities').get()).toMatchObject({ count: 2 });
    expect((await api('/api/auth/session', { cookie: owner.cookie })).status).toBe(200);
  });
});
