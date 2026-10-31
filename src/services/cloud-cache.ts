import { applyEntities, canonical, entityKey, snapshotEntities, type CloudChange, type CloudEntity, type CloudMutation, type CloudState } from '../../shared/cloud';
import type { RecallStateSnapshot } from '@/types';
import { normalizeName } from '@/lib/utils';

export interface CloudConflict { key: string; local: CloudEntity; remote: CloudEntity; }
export interface CloudJournal {
  version: 1;
  spaceId: string;
  base: CloudState;
  pending: CloudMutation | null;
  conflicts: CloudConflict[];
  migrating: boolean;
}
export const snapshotKey = 'recall.snapshot.v1';
export const backupKey = 'recall.snapshot.pre-cloud.v1';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function entity(value: unknown, field = 'revision'): boolean {
  return record(value) && ['deck', 'card', 'reviewLog', 'studySession', 'setting'].includes(String(value.kind))
    && typeof value.id === 'string' && !!value.id && 'value' in value && revision(value[field]);
}
function validJournal(value: unknown): value is CloudJournal {
  if (!record(value) || value.version !== 1 || typeof value.spaceId !== 'string' || !value.spaceId
    || typeof value.migrating !== 'boolean' || !record(value.base) || !revision(value.base.revision)
    || !Array.isArray(value.base.entities) || !value.base.entities.every(item => entity(item) && item.revision <= (value.base as { revision: number }).revision)
    || !Array.isArray(value.conflicts) || !value.conflicts.every(item => record(item) && entity(item.local) && entity(item.remote)
      && item.key === entityKey(item.local as unknown as CloudEntity) && item.key === entityKey(item.remote as unknown as CloudEntity))) return false;
  if (value.pending === null) return true;
  return record(value.pending) && typeof value.pending.id === 'string' && !!value.pending.id
    && revision(value.pending.baseRevision) && value.pending.baseRevision === value.base.revision
    && Array.isArray(value.pending.changes) && value.pending.changes.length > 0
    && value.pending.changes.every(item => entity(item, 'expectedRevision'));
}

export function readJournal(): CloudJournal | null {
  const raw = localStorage.getItem(snapshotKey);
  if (!raw) return null;
  const journal = (JSON.parse(raw) as { cloudJournal?: CloudJournal }).cloudJournal;
  if (!journal) return null;
  if (!validJournal(journal)) {
    throw new Error('云同步队列无法读取，已保留本机数据，请先备份。');
  }
  return journal;
}

export function writeCachedSnapshot(disk: RecallStateSnapshot, journal = readJournal()): void {
  localStorage.setItem(snapshotKey, JSON.stringify(journal ? { ...disk, cloudJournal: journal } : disk));
  window.dispatchEvent(new Event('recall-cache-saved'));
}

export function pendingChanges(snapshot: RecallStateSnapshot, journal: CloudJournal): CloudChange[] {
  const local = new Map(snapshotEntities(snapshot).map(entity => [entityKey(entity), entity]));
  const base = new Map(journal.base.entities.map(entity => [entityKey(entity), entity]));
  const keys = new Set([...local.keys(), ...base.keys()]);
  return [...keys].flatMap(key => {
    const before = base.get(key);
    const after = local.get(key);
    const value = after?.value ?? null;
    if (canonical(before?.value ?? null) === canonical(value)) return [];
    const entity = after ?? before!;
    return [{ kind: entity.kind, id: entity.id, value, expectedRevision: before?.revision ?? 0 }];
  });
}

export function reconcileCloud(snapshot: RecallStateSnapshot, journal: CloudJournal, incoming: CloudState, validate?: (snapshot: RecallStateSnapshot) => unknown): { snapshot: RecallStateSnapshot; journal: CloudJournal } {
  if (incoming.revision < journal.base.revision) throw new Error('云端修订倒退，已停止同步并保留本机数据。');
  const local = new Map(snapshotEntities(snapshot).map(entity => [entityKey(entity), entity]));
  const base = new Map(journal.base.entities.map(entity => [entityKey(entity), entity]));
  const changes: CloudEntity[] = [];
  const conflicts = new Map(journal.conflicts.map(conflict => [conflict.key, conflict]));
  for (const remote of incoming.entities) {
    const key = entityKey(remote);
    const before = base.get(key);
    const after = local.get(key) ?? { ...remote, value: null };
    const localChanged = canonical(after.value) !== canonical(before?.value ?? null);
    const remoteChanged = canonical(remote.value) !== canonical(before?.value ?? null);
    const same = canonical(after.value) === canonical(remote.value);
    const newDeviceSetting = journal.migrating && !snapshot.cards.length && !snapshot.decks.length && remote.kind === 'setting';
    if ((!localChanged || same || newDeviceSetting) && !conflicts.has(key)) {
      changes.push(remote);
    } else if (remoteChanged && !same) {
      conflicts.set(key, { key, local: after, remote });
    } else if (conflicts.has(key)) {
      conflicts.set(key, { key, local: after, remote });
    }
    base.set(key, remote);
  }
  if (conflicts.size) {
    for (const remote of changes) {
      const key = entityKey(remote);
      const after = local.get(key) ?? { ...remote, value: null };
      if (canonical(after.value) !== canonical(remote.value)) conflicts.set(key, { key, local: after, remote });
    }
  }
  let merged = conflicts.size ? snapshot : applyEntities(snapshot, changes);
  if (!conflicts.size) {
    const existingCloudDecks = new Set([...base.values()].filter(entity => entity.kind === 'deck' && entity.value !== null).map(entity => entity.id));
    const names = new Set(merged.decks.filter(deck => existingCloudDecks.has(deck.id)).map(deck => JSON.stringify([deck.parentId ?? null, normalizeName(deck.name).toLowerCase()])));
    merged = { ...merged, decks: merged.decks.map(deck => {
      if (existingCloudDecks.has(deck.id)) return deck;
      let name = deck.name;
      let suffix = 1;
      while (names.has(JSON.stringify([deck.parentId ?? null, normalizeName(name).toLowerCase()]))) {
        name = `${deck.name.slice(0, 60)} (本机 ${suffix++})`;
      }
      names.add(JSON.stringify([deck.parentId ?? null, normalizeName(name).toLowerCase()]));
      return name === deck.name ? deck : { ...deck, name, updatedAt: new Date().toISOString() };
    }) };
    try { validate?.(merged); }
    catch {
      const keys = new Set([...local.keys(), ...base.keys()]);
      for (const key of keys) {
        const remote = base.get(key) ?? { ...local.get(key)!, value: null, revision: 0 };
        const after = local.get(key) ?? { ...remote, value: null };
        if (canonical(after.value) !== canonical(remote.value)) conflicts.set(key, { key, local: after, remote });
      }
      if (!conflicts.size) throw new Error('云端数据结构无效，已保留本机数据。');
      merged = snapshot;
    }
  }
  return {
    snapshot: merged,
    journal: { ...journal, base: { revision: incoming.revision, entities: [...base.values()] }, conflicts: [...conflicts.values()], migrating: false },
  };
}

export function acknowledgeMutation(journal: CloudJournal, revision: number): CloudJournal {
  if (!journal.pending) throw new Error('Missing pending mutation');
  const base = new Map(journal.base.entities.map(entity => [entityKey(entity), entity]));
  for (const change of journal.pending.changes) base.set(entityKey(change), { kind: change.kind, id: change.id, value: change.value, revision });
  return { ...journal, pending: null, base: { revision, entities: [...base.values()] } };
}
