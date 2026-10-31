import type { RecallStateSnapshot } from '../src/types';

export const cloudSettingKeys = ['reviewPlan', 'desiredRetention', 'fsrsWeights', 'dailyNewCardLimit', 'leechThreshold', 'dailyGoal', 'xp', 'achievements'] as const;
export type EntityKind = 'deck' | 'card' | 'reviewLog' | 'studySession' | 'setting';
export interface CloudEntity { kind: EntityKind; id: string; value: unknown | null; revision: number; }
export interface CloudState { revision: number; entities: CloudEntity[]; }
export interface CloudChange { kind: EntityKind; id: string; value: unknown | null; expectedRevision: number; }
export interface CloudMutation { id: string; baseRevision: number; changes: CloudChange[]; }
export interface DeviceSession { spaceId: string; device: { id: string; label: string }; }
export interface TrustedDevice { id: string; label: string; createdAt: number; lastSeenAt: number; revokedAt: number | null; }

export function entityKey(entity: Pick<CloudEntity, 'kind' | 'id'>): string {
  return `${entity.kind}:${entity.id}`;
}

export function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

export function snapshotEntities(snapshot: RecallStateSnapshot): CloudEntity[] {
  const entities: CloudEntity[] = [];
  const collections = [['deck', snapshot.decks], ['card', snapshot.cards], ['reviewLog', snapshot.reviewLogs], ['studySession', snapshot.studySessions]] as const;
  for (const [kind, values] of collections) {
    for (const value of values) entities.push({ kind, id: value.id, value, revision: 0 });
  }
  for (const id of cloudSettingKeys) {
    const value = snapshot.settings[id];
    if (value !== undefined) entities.push({ kind: 'setting', id, value, revision: 0 });
  }
  return entities;
}

export function applyEntities(snapshot: RecallStateSnapshot, entities: CloudEntity[]): RecallStateSnapshot {
  const next = { ...snapshot, settings: { ...snapshot.settings } };
  const collections = { deck: 'decks', card: 'cards', reviewLog: 'reviewLogs', studySession: 'studySessions' } as const;
  for (const [kind, collection] of Object.entries(collections)) {
    const values = new Map<string, unknown>(snapshot[collection].map(value => [value.id, value]));
    for (const entity of entities.filter(candidate => candidate.kind === kind)) {
      if (entity.value === null) values.delete(entity.id);
      else values.set(entity.id, entity.value);
    }
    Object.assign(next, { [collection]: [...values.values()] });
  }
  for (const entity of entities.filter(candidate => candidate.kind === 'setting')) {
    if (!(cloudSettingKeys as readonly string[]).includes(entity.id)) throw new Error('Invalid cloud setting');
    if (entity.value !== null || entity.id === 'fsrsWeights') Object.assign(next.settings, { [entity.id]: entity.value });
    else if (entity.id === 'reviewPlan') delete next.settings.reviewPlan;
  }
  return next;
}
