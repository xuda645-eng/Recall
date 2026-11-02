import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';
import { validateMedia } from '../shared/media';
import { SqliteD1 } from './sqlite-d1';
import type { ServerEnv } from '../shared/server';

const origin = 'https://recall.test';
const bootstrap = 'synthetic-media-test-owner-recovery-code-not-production';
const bytes = Uint8Array.from(readFileSync(new URL('../e2e/fixtures/source-screenshot.png', import.meta.url))).buffer;
describe('authenticated independent D1 image storage', () => {
  let db: SqliteD1;
  let env: ServerEnv;
  let cookie: string;
  let id: string;
  async function api(method: string, identity: string, body?: ArrayBuffer, auth = cookie, headers: Record<string, string> = {}) {
    return onRequest({ env, request: new Request(`${origin}/api/media/${identity}`, { method, headers: { Origin: origin, Cookie: auth, 'Content-Type': 'image/png', ...headers }, body }) });
  }
  beforeEach(async () => {
    db = new SqliteD1();
    db.sqlite.exec(readFileSync(new URL('../migrations/20261101_recall_media.sql', import.meta.url), 'utf8'));
    env = { DB: db, RECALL_BOOTSTRAP_CODE: bootstrap };
    const paired = await onRequest({ env, request: new Request(`${origin}/api/auth/pair`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: bootstrap, label: 'Synthetic device' }) }) });
    cookie = paired.headers.get('Set-Cookie')!.split(';')[0];
    id = (await validateMedia(bytes)).id;
  });
  afterEach(() => db.close());
  it('uploads once, replays idempotently and downloads the exact private binary without state revision changes', async () => {
    expect((await api('HEAD', id)).status).toBe(404);
    expect((await api('PUT', id, bytes)).status).toBe(200);
    expect((await api('PUT', id, bytes)).status).toBe(200);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM media_assets').get()?.count).toBe(1);
    expect(db.sqlite.prepare('SELECT used_bytes FROM media_usage').get()?.used_bytes).toBe(bytes.byteLength);
    expect(db.sqlite.prepare('SELECT revision FROM spaces').get()?.revision).toBe(0);
    const download = await api('GET', id);
    expect(download.status).toBe(200);
    expect(download.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await download.arrayBuffer()).toEqual(bytes);
    const head = await api('HEAD', id);
    expect(head.headers.get('Content-Length')).toBe(String(bytes.byteLength));
    expect(await head.text()).toBe('');
  });
  it('rejects anonymous, cross-origin, revoked devices, malformed IDs, hash mismatch and fake MIME', async () => {
    expect((await api('GET', id, undefined, '')).status).toBe(401);
    expect((await api('PUT', id, bytes, cookie, { Origin: 'https://evil.test' })).status).toBe(403);
    expect((await api('PUT', 'a'.repeat(64) + '.png', bytes)).status).toBe(400);
    expect((await api('PUT', id, bytes, cookie, { 'Content-Type': 'image/svg+xml' })).status).toBe(415);
    expect((await api('GET', '../../secret')).status).toBe(404);
    db.sqlite.prepare('UPDATE trusted_devices SET revoked_at = 1').run();
    expect((await api('GET', id)).status).toBe(401);
  });
  it('enforces byte limits and atomic space quota without partially writing an image', async () => {
    expect((await api('PUT', id, new ArrayBuffer(524289))).status).toBe(413);
    db.sqlite.prepare('INSERT INTO media_usage (space_id, used_bytes) VALUES (?, ?)').run('personal', 67108864);
    expect((await api('PUT', id, bytes)).status).toBe(413);
    expect(db.sqlite.prepare('SELECT count(*) AS count FROM media_assets').get()?.count).toBe(0);
    expect(db.sqlite.prepare('SELECT used_bytes FROM media_usage').get()?.used_bytes).toBe(67108864);
  });
});
