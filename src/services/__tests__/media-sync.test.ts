import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { useRecallStore } from '@/stores/recall-store';
import { useMediaSync, synchronizeMedia, pauseMediaSync } from '../media-sync';
import type { MediaAsset } from '../../../shared/media';

const storage = vi.hoisted(() => ({ records: new Map<string, MediaAsset & { uploadedSpace?: string }>() }));
vi.mock('../media-storage', () => ({
  localMedia: vi.fn(async (id: string) => storage.records.get(id)),
  saveMedia: vi.fn(async (assets: MediaAsset[], uploadedSpace?: string) => { for (const asset of assets) storage.records.set(asset.id, { ...asset, uploadedSpace }); }),
  downloadMedia: vi.fn(async (id: string) => ({ id, bytes: new ArrayBuffer(8), mime: 'image/png', width: 1, height: 1 })),
}));
const id = 'a'.repeat(64) + '.png';
beforeEach(() => {
  pauseMediaSync(); storage.records.clear();
  const seed = createSeedSnapshot();
  useRecallStore.setState({ ...seed, cards: [{ ...seed.cards[0], back: `Answer\n\n![Source](recall://${id})` }, { ...seed.cards[0], id: 'other', back: `![Source](recall://${id})` }] });
  useMediaSync.setState({ pending: 0, running: false, error: '', completed: 0 });
});
afterEach(() => { pauseMediaSync(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('media background queue', () => {
  it('shares a single upload and does not reupload on later reviews', async () => {
    storage.records.set(id, { id, bytes: new ArrayBuffer(8), mime: 'image/png', width: 1, height: 1 });
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => new Response(null, { status: options.method === 'HEAD' ? 404 : 200 }));
    vi.stubGlobal('fetch', fetcher);
    await synchronizeMedia('personal');
    expect(fetcher.mock.calls.map(call => call[1].method)).toEqual(['HEAD', 'PUT']);
    await synchronizeMedia('personal');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(useMediaSync.getState().pending).toBe(0);
  });
  it('rescans newer references requested while an upload is still active', async () => {
    const other = 'b'.repeat(64) + '.png';
    const asset = { id, bytes: new ArrayBuffer(8), mime: 'image/png', width: 1, height: 1 };
    storage.records.set(id, asset);
    let release!: (response: Response) => void;
    const first = new Promise<Response>(resolve => { release = resolve; });
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    fetcher.mockImplementationOnce(() => first);
    vi.stubGlobal('fetch', fetcher);
    const pending = synchronizeMedia('personal');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    storage.records.set(other, { ...asset, id: other });
    useRecallStore.setState(state => ({ cards: [...state.cards, { ...state.cards[0], id: 'new-image-card', back: `![Source](recall://${other})` }] }));
    const rescan = synchronizeMedia('personal');
    release(new Response(null, { status: 200 }));
    await Promise.all([pending, rescan]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(storage.records.get(other)?.uploadedSpace).toBe('personal');
    expect(useMediaSync.getState().pending).toBe(0);
  });
  it('retains failed media for retry and does not throw into card sync', async () => {
    storage.records.set(id, { id, bytes: new ArrayBuffer(8), mime: 'image/png', width: 1, height: 1 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    await expect(synchronizeMedia('personal')).resolves.toBeUndefined();
    expect(useMediaSync.getState().pending).toBe(1);
    expect(useMediaSync.getState().error).toContain('503');
    expect(storage.records.get(id)?.uploadedSpace).toBeUndefined();
  });
  it('does not strand a request arriving in the previous runner finalization microtask', async () => {
    const other = 'b'.repeat(64) + '.png';
    const asset = { id, bytes: new ArrayBuffer(8), mime: 'image/png', width: 1, height: 1 };
    storage.records.set(id, asset);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    const followup = new Promise<void>(resolve => {
      const unsubscribe = useMediaSync.subscribe((state, previous) => {
        if (previous.running && !state.running) {
          unsubscribe();
          queueMicrotask(() => queueMicrotask(() => {
            storage.records.set(other, { ...asset, id: other });
            useRecallStore.setState(state => ({ cards: [...state.cards, { ...state.cards[0], id: 'last-minute-image', back: `![Source](recall://${other})` }] }));
            void synchronizeMedia('personal').then(resolve);
          }));
        }
      });
    });
    await synchronizeMedia('personal');
    await followup;
    expect(storage.records.get(other)?.uploadedSpace).toBe('personal');
    expect(useMediaSync.getState().pending).toBe(0);
  });
  it('downloads missing images independently on a fresh device', async () => {
    await synchronizeMedia('personal');
    expect(storage.records.get(id)?.uploadedSpace).toBe('personal');
    expect(useMediaSync.getState().completed).toBe(1);
  });
  it('stops scheduling new requests after authorization fails and keeps local images for retry', async () => {
    const identities = ['a', 'b', 'c'].map(character => character.repeat(64) + '.png');
    const seed = createSeedSnapshot();
    useRecallStore.setState({ cards: identities.map(identity => ({ ...seed.cards[0], id: identity, back: `![Source](recall://${identity})` })) });
    for (const identity of identities) storage.records.set(identity, { id: identity, bytes: new ArrayBuffer(8), mime: 'image/png', width: 1, height: 1 });
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    await synchronizeMedia('personal');
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
    expect(useMediaSync.getState().pending).toBe(3);
    expect(useMediaSync.getState().running).toBe(false);
    expect(useMediaSync.getState().error).toContain('授权');
    expect(storage.records.size).toBe(3);
    fetcher.mockImplementation(async () => new Response(null, { status: 200 }));
    await synchronizeMedia('personal');
    expect(useMediaSync.getState().pending).toBe(0);
  });
});
