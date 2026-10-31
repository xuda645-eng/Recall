import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { settingsFromRows, settingsToRows } from '@/db/mappers';
import { buildExportPayload, parseImportPayload } from '@/services/import-export';
import { normalizeMemoryStudyPreferences } from '@/services/memory-study';
import { getRecallRepository } from '@/services/repository';
import type { MemoryStudyPreferences } from '@/types';

vi.mock('@/db/client', () => ({ getTauriSqlExecutor: async () => null, isTauriRuntime: () => false }));

const at = new Date('2026-11-01T04:00:00.000Z');
const storageKey = 'recall.snapshot.v1';
const defaults: MemoryStudyPreferences = { newCardRatio: 0.3, batchSize: 10, sessionMinutes: 30 };

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('memory study settings persistence', () => {
  it.each([
    { newCardRatio: 0.45, batchSize: 22, sessionMinutes: 45 },
    { newCardRatio: 0, batchSize: 1, sessionMinutes: 5 },
    { newCardRatio: 1, batchSize: 100, sessionMinutes: 120 },
  ])('preserves preferences across browser save/reload and backup export/replacement: %j', async studyPreferences => {
    const repository = await getRecallRepository();
    const snapshot = createSeedSnapshot(at);
    snapshot.settings = { ...snapshot.settings, studyPreferences, dailyGoal: 45 };
    const original = structuredClone(snapshot);
    await repository.saveSettings(snapshot.settings, snapshot);
    expect(JSON.parse(localStorage.getItem(storageKey)!).settings.studyPreferences).toEqual(studyPreferences);
    const reloaded = await repository.loadAppData();
    expect(reloaded.settings.studyPreferences).toEqual(studyPreferences);
    expect(reloaded.settings.dailyGoal).toBe(45);
    expect(reloaded.cards).toEqual(original.cards);
    expect(reloaded.reviewLogs).toEqual(original.reviewLogs);
    const backup = parseImportPayload(JSON.stringify(buildExportPayload(reloaded, at)));
    expect(backup.settings.studyPreferences).toEqual(studyPreferences);
    const restored = await repository.replaceDataFromImport(backup);
    expect(restored.settings.studyPreferences).toEqual(studyPreferences);
    expect(restored.cards).toEqual(reloaded.cards);
    expect(restored.reviewLogs).toEqual(reloaded.reviewLogs);
    expect((await repository.loadAppData()).settings.studyPreferences).toEqual(studyPreferences);
    expect(snapshot).toEqual(original);
  });

  it('loads legacy browser snapshots with defaults without rescheduling any cards', async () => {
    const snapshot = createSeedSnapshot(at);
    delete snapshot.settings.studyPreferences;
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
    const repository = await getRecallRepository();
    const loaded = await repository.loadAppData();
    expect(loaded.settings.studyPreferences).toEqual(defaults);
    expect(loaded.cards).toEqual(snapshot.cards);
    expect(loaded.reviewLogs).toEqual(snapshot.reviewLogs);
    expect(JSON.parse(localStorage.getItem(storageKey)!).settings.studyPreferences).toBeUndefined();
  });

  it('accepts legacy seed/export literals without the optional field and defaults on replacement restore', async () => {
    const seed = createSeedSnapshot(at);
    expect(normalizeMemoryStudyPreferences(seed.settings.studyPreferences)).toEqual(defaults);
    const backup = parseImportPayload(JSON.stringify(buildExportPayload(seed, at)));
    delete backup.settings.studyPreferences;
    const repository = await getRecallRepository();
    const restored = await repository.replaceDataFromImport(backup);
    expect(restored.settings.studyPreferences).toEqual(defaults);
    expect(restored.cards).toEqual(seed.cards);
  });

  it.each([
    { value: null, expected: defaults },
    { value: [], expected: defaults },
    { value: 'invalid', expected: defaults },
    { value: { newCardRatio: 2, batchSize: 0, sessionMinutes: 121 }, expected: defaults },
    { value: { newCardRatio: '0.2', batchSize: 23, sessionMinutes: 60 }, expected: { ...defaults, batchSize: 23, sessionMinutes: 60 } },
    { value: { newCardRatio: 0.2, batchSize: 2.5, sessionMinutes: 4 }, expected: { ...defaults, newCardRatio: 0.2 } },
  ])('normalizes malformed browser and imported preferences independently: %j', async ({ value, expected }) => {
    const snapshot = createSeedSnapshot(at);
    const raw = { ...snapshot, settings: { ...snapshot.settings, studyPreferences: value } };
    localStorage.setItem(storageKey, JSON.stringify(raw));
    const repository = await getRecallRepository();
    expect((await repository.loadAppData()).settings.studyPreferences).toEqual(expected);
    const exported = { ...buildExportPayload(snapshot, at), settings: raw.settings };
    const backup = parseImportPayload(JSON.stringify(exported));
    expect((await repository.replaceDataFromImport(backup)).settings.studyPreferences).toEqual(expected);
    expect((await repository.loadAppData()).settings.studyPreferences).toEqual(expected);
  });

  it('keeps local preferences when merging a backup instead of clobbering settings', async () => {
    const current = createSeedSnapshot(at);
    const incoming = createSeedSnapshot(at);
    const localPreferences = { newCardRatio: 0, batchSize: 7, sessionMinutes: 15 };
    current.settings.studyPreferences = localPreferences;
    incoming.settings.studyPreferences = { newCardRatio: 1, batchSize: 99, sessionMinutes: 100 };
    const repository = await getRecallRepository();
    const merged = await repository.mergeDataFromImport(current, buildExportPayload(incoming, at));
    expect(merged.settings.studyPreferences).toEqual(localPreferences);
    expect((await repository.loadAppData()).settings.studyPreferences).toEqual(localPreferences);
  });
});

describe('memory study settings row adapter', () => {
  it('round-trips validated preferences without mutating settings', () => {
    const settings = {
      ...createSeedSnapshot(at).settings,
      studyPreferences: { newCardRatio: 0.65, batchSize: 33, sessionMinutes: 90 },
    };
    const original = structuredClone(settings);
    const rows = settingsToRows(settings);
    expect(rows.find(row => row.key === 'study_preferences')?.value).toBe(JSON.stringify(settings.studyPreferences));
    expect(settingsFromRows(rows).studyPreferences).toEqual(settings.studyPreferences);
    expect(settings).toEqual(original);
  });

  it.each([undefined, '', '{invalid', 'null', '[]', '{"newCardRatio":2,"batchSize":0,"sessionMinutes":4}'])('defaults safely for missing or malformed row %j', raw => {
      const rows = raw === undefined ? [] : [{ key: 'study_preferences', value: raw }];
      expect(settingsFromRows(rows).studyPreferences).toEqual(defaults);
    });

  it('normalizes invalid row fields independently on read and write', () => {
    const settings = {
      ...createSeedSnapshot(at).settings,
      studyPreferences: { newCardRatio: 0.7, batchSize: NaN, sessionMinutes: 25 },
    };
    expect(settingsFromRows(settingsToRows(settings)).studyPreferences)
      .toEqual({ newCardRatio: 0.7, batchSize: 10, sessionMinutes: 25 });
    expect(settingsFromRows([{ key: 'study_preferences', value: '{"newCardRatio":0.7,"batchSize":101,"sessionMinutes":25}' }]).studyPreferences)
      .toEqual({ newCardRatio: 0.7, batchSize: 10, sessionMinutes: 25 });
  });
});
