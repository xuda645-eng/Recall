import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PersonalMediaEngine, PersonalSyncEngine } from '../server/personal-sync';
import { validateMedia, MAX_IMAGE_BYTES } from '../shared/media';
import { createSeedSnapshot } from '../src/data/seed';
import type { PersonalRow } from '../shared/personal-sync';

const bytes = Uint8Array.from(readFileSync(new URL('../e2e/fixtures/source-screenshot.png', import.meta.url))).buffer;
function fixture() {
  const rows = new Map<string, PersonalRow>();
  const objects = new Map<string, ArrayBuffer>();
  const sync = new PersonalSyncEngine({
    async read(owner, library) { return rows.get(`${owner}:${library}`) ?? null; },
    async compareSwap(owner, library, expected, next) {
      const key = `${owner}:${library}`;
      if ((rows.get(key)?.revision ?? 0) !== expected) return false;
      rows.set(key, next); return true;
    },
  });
  let failUpload = false;
  const media = new PersonalMediaEngine(sync, {
    async get(path) { return objects.get(path) ?? null; },
    async putIfAbsent(path, value) { if (failUpload) throw new Error('Synthetic upload failure'); if (!objects.has(path)) objects.set(path, value); },
  });
  return { sync, media, rows, objects, fail: (value: boolean) => { failUpload = value; } };
}
describe('encrypted personal source images', () => {
  it('stores ciphertext, keeps the key out of snapshots, returns exact bytes and deduplicates retries', async () => {
    const current = fixture(); const asset = await validateMedia(bytes);
    await current.media.put('123', 'personal', asset.id, asset.mime, bytes);
    const envelope = [...current.objects.values()][0];
    expect(envelope.byteLength).toBe(bytes.byteLength + 29);
    expect(new Uint8Array(envelope).slice(0, 8)).not.toEqual(new Uint8Array(bytes).slice(0, 8));
    expect((await current.media.get('123', 'personal', asset.id, true)).bytes).toEqual(bytes);
    expect(await current.media.get('123', 'personal', asset.id, false)).toEqual({ mime: asset.mime, size: bytes.byteLength });
    expect(await current.sync.read('123', 'personal')).toEqual({ revision: 2, entities: [] });
    await current.media.put('123', 'personal', asset.id, asset.mime, bytes);
    expect((await current.sync.read('123', 'personal')).revision).toBe(2);
    expect(current.objects.size).toBe(1);
    await expect(current.media.get('456', 'personal', asset.id, true)).rejects.toMatchObject({ status: 404 });
  });
  it('keeps failed uploads pending and makes an exact retry ready without double reservation', async () => {
    const current = fixture(); const asset = await validateMedia(bytes);
    current.fail(true);
    await expect(current.media.put('123', 'personal', asset.id, asset.mime, bytes)).rejects.toThrow('Synthetic');
    expect((await current.sync.media('123', 'personal', asset.id)).asset.status).toBe('pending');
    await expect(current.media.get('123', 'personal', asset.id, true)).rejects.toMatchObject({ status: 404 });
    current.fail(false);
    await current.media.put('123', 'personal', asset.id, asset.mime, bytes);
    expect((await current.sync.read('123', 'personal')).revision).toBe(2);
  });
  it('refuses tampered ciphertext without modifying or discarding the original metadata', async () => {
    const current = fixture(); const asset = await validateMedia(bytes);
    await current.media.put('123', 'personal', asset.id, asset.mime, bytes);
    const path = [...current.objects.keys()][0];
    new Uint8Array(current.objects.get(path)!)[20] ^= 1;
    await expect(current.media.get('123', 'personal', asset.id, true)).rejects.toMatchObject({ status: 503 });
    await expect(current.media.put('123', 'personal', asset.id, asset.mime, bytes)).rejects.toMatchObject({ status: 503 });
    expect((await current.sync.read('123', 'personal')).revision).toBe(2);
  });
  it('handles simultaneous identical image uploads with one reservation and ready transition', async () => {
    const current = fixture(); const asset = await validateMedia(bytes);
    await Promise.all([current.media.put('123', 'personal', asset.id, asset.mime, bytes), current.media.put('123', 'personal', asset.id, asset.mime, bytes)]);
    expect((await current.sync.read('123', 'personal')).revision).toBe(2);
    expect((await current.media.get('123', 'personal', asset.id, true)).bytes).toEqual(bytes);
  });
  it('rejects cards referencing images before they are ready, then commits without losing private fields', async () => {
    const current = fixture(); const asset = await validateMedia(bytes); const seed = createSeedSnapshot();
    const deck = { ...seed.decks[0], parentId: null };
    const card = { ...seed.cards[0], deckId: deck.id, back: `![Source](recall://${asset.id})` };
    const input = { id: 'image-card', baseRevision: 0, changes: [
      { kind: 'deck', id: deck.id, value: deck, expectedRevision: 0 },
      { kind: 'card', id: card.id, value: card, expectedRevision: 0 },
    ] };
    await expect(current.sync.mutate('123', 'personal', input)).rejects.toMatchObject({ status: 422 });
    expect(current.rows.size).toBe(0);
    await current.media.put('123', 'personal', asset.id, asset.mime, bytes);
    await current.sync.mutate('123', 'personal', { ...input, baseRevision: 2 });
    expect((await current.media.get('123', 'personal', asset.id, true)).bytes).toEqual(bytes);
    expect(JSON.parse(current.rows.get('123:personal')!.stateJson).receipts).toHaveLength(3);
  });
  it('counts encrypted envelope overhead toward quota and preserves pending reservations', async () => {
    const current = fixture();
    for (let index = 0; index < 127; index++) await current.sync.transitionMedia('123', 'personal', {
      id: `${index.toString(16).padStart(64, '0')}.png`, mime: 'image/png', size: MAX_IMAGE_BYTES, status: 'pending',
    });
    await expect(current.sync.transitionMedia('123', 'personal', { id: `${'f'.repeat(64)}.png`, mime: 'image/png', size: MAX_IMAGE_BYTES, status: 'pending' })).rejects.toMatchObject({ status: 413 });
    expect((await current.sync.read('123', 'personal')).revision).toBe(127);
  });
});
