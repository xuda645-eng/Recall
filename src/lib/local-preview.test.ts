import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { buildExportPayload } from '@/services/import-export';
import { isLocalPreview, isMiaodaLearningPreview, localPreviewSnapshot } from './local-preview';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('local paper preview', () => {
  it('keeps a flagged HTTPS learning build local-first but does not permit arbitrary HTTP', () => {
    vi.stubEnv('VITE_RECALL_MIAODA_LEARNING', '1');
    vi.stubGlobal('window', { location: { hostname: 'synthetic.invalid', protocol: 'https:' } });
    expect(isMiaodaLearningPreview()).toBe(true);
    expect(isLocalPreview()).toBe(true);
    vi.stubGlobal('window', { location: { hostname: 'synthetic.invalid', protocol: 'http:' } });
    expect(isMiaodaLearningPreview()).toBe(false);
    expect(isLocalPreview()).toBe(false);
  });
  it('requires both an explicit build flag and a loopback origin', () => {
    for (const enabled of ['0', '1']) for (const hostname of ['127.0.0.1', 'localhost', '[::1]', 'recall-memory.pages.dev']) {
      vi.stubEnv('VITE_RECALL_LOCAL_PREVIEW', enabled);
      vi.stubGlobal('window', { location: { hostname } });
      expect(isLocalPreview()).toBe(enabled === '1' && hostname !== 'recall-memory.pages.dev');
    }
  });

  it('copies all identities, duplicates and progress without copying device credentials', () => {
    vi.stubEnv('VITE_RECALL_LOCAL_PREVIEW', '1');
    vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } });
    const seed = createSeedSnapshot();
    const incoming = buildExportPayload(seed);
    incoming.cards.push({ ...incoming.cards[0], id: 'duplicate-front', archivedAt: '2026-10-01T00:00:00Z' });
    incoming.settings.syncCode = 'synthetic-secret'; incoming.settings.syncEnabled = true; incoming.settings.syncRelayUrl = 'https://example.com';
    const before = JSON.stringify(incoming);
    const empty = { ...seed, decks: [], cards: [], reviewLogs: [], studySessions: [] };
    const result = localPreviewSnapshot(empty, incoming);
    expect(result.cards).toEqual(incoming.cards);
    expect(result.decks).toEqual(incoming.decks);
    expect(result.reviewLogs).toEqual(incoming.reviewLogs);
    expect(result.studySessions).toEqual(incoming.studySessions);
    expect(result.settings).toMatchObject({ syncCode: null, syncEnabled: false, syncRelayUrl: '', syncFolder: null, syncAutoInterval: 0, backupFolder: null, backupSchedule: 'never', desiredRetention: seed.settings.desiredRetention });
    expect(JSON.stringify(incoming)).toBe(before);
    expect(() => localPreviewSnapshot(seed, incoming)).toThrow('不覆盖已有内容');
    vi.stubGlobal('window', { location: { hostname: 'recall-memory.pages.dev' } });
    expect(() => localPreviewSnapshot(empty, incoming)).toThrow('只可载入本地');
  });
});
