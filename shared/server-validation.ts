import { cloudSettingKeys, entityKey } from './cloud';
import type { CloudEntity, CloudMutation, EntityKind } from './cloud';
import { ApiError, MAX_PAYLOAD_BYTES, isRecord, validId } from './server';
import { MERGE_MAX_CHARS, MERGE_MAX_MEMBERS, validateMergeBatch, wereadRangeStart } from './weread-merge';

const kinds: EntityKind[] = ['deck', 'card', 'reviewLog', 'studySession', 'setting'];
const ratings = ['again', 'hard', 'good', 'easy'];
const states = ['new', 'learning', 'review', 'relearning'];
const cardTypes = ['basic', 'cloze', 'image-occlusion'];
const deckColors = ['blue', 'green', 'amber', 'rose', 'violet', 'slate'];

function invalid(): never {
  throw new ApiError(400, 'Invalid request');
}

function record(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!isRecord(value) || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
  return value;
}

function text(value: unknown, maximum: number, nonempty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (nonempty && !value.trim())) invalid();
  return value;
}

function identifier(value: unknown): string {
  if (!validId(value)) invalid();
  return value;
}

function number(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum
    || (integer && !Number.isSafeInteger(value))) invalid();
  return value;
}

function choice(value: unknown, allowed: string[]): string {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid();
  return value;
}

function validateWereadMembers(source: Record<string, unknown>, back: unknown): void {
  if (!Array.isArray(source.highlights) || !source.highlights.length || source.highlights.length > MERGE_MAX_MEMBERS) invalid();
  const members = source.highlights.map(value => record(value, ['bookmarkId', 'markText', 'chapterUid', 'chapterIdx', 'range']));
  const head = members[0];
  if (head.bookmarkId !== source.bookmarkId || head.chapterUid !== source.chapterUid
    || (source.chapterIdx !== undefined && source.chapterIdx !== head.chapterIdx) || (source.range !== undefined && source.range !== head.range)
    || members.some(member => member.chapterUid !== source.chapterUid || member.chapterIdx !== head.chapterIdx)) invalid();
  try {
    const batch = validateMergeBatch({ bookId: source.bookId, chapterUid: source.chapterUid, chapterIdx: head.chapterIdx,
      highlights: members.map(member => ({ id: member.bookmarkId, markText: member.markText, range: member.range })),
    });
    const original = batch.highlights.map(highlight => highlight.markText).join('\n\n');
    if (original !== back || original.length > MERGE_MAX_CHARS) invalid();
  } catch { invalid(); }
}

function date(value: unknown, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length > 40
    || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)
    || !Number.isFinite(Date.parse(value))) invalid();
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) invalid();
}

function optionalDates(value: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) if (Object.hasOwn(value, key)) date(value[key]);
}

function schedule(value: Record<string, unknown>): void {
  for (const key of ['stability', 'elapsedDays', 'scheduledDays']) number(value[key]);
  number(value.difficulty, 0, 10);
}

function validateSetting(id: string, value: unknown): void {
  if (!(cloudSettingKeys as readonly string[]).includes(id)) invalid();
  if (value === null) {
    if (id !== 'fsrsWeights' && id !== 'reviewPlan') invalid();
    return;
  }
  switch (id) {
    case 'reviewPlan': {
      const plan = record(value, ['mode', 'intervals']);
      choice(plan.mode, ['smart', 'fixed']);
      const intervals = record(plan.intervals, ratings);
      let previous = 0;
      for (const rating of ratings) {
        const interval = number(intervals[rating], 60_000, 365 * 24 * 60 * 60 * 1000, true);
        if (interval <= previous) invalid();
        previous = interval;
      }
      break;
    }
    case 'desiredRetention': number(value, 0.7, 0.99); break;
    case 'fsrsWeights':
      if (!Array.isArray(value) || ![17, 19, 21].includes(value.length)) invalid();
      for (const weight of value) number(weight, -100, 100);
      break;
    case 'dailyNewCardLimit':
    case 'leechThreshold':
    case 'dailyGoal': number(value, 0, 100_000, true); break;
    case 'xp': number(value, 0, Number.MAX_SAFE_INTEGER, true); break;
    case 'achievements': {
      if (!Array.isArray(value) || value.length > 1000) invalid();
      const ids = new Set<string>();
      for (const entry of value) {
        const achievement = record(entry, ['id', 'title', 'description', 'icon', 'unlockedAt']);
        const achievementId = identifier(achievement.id);
        if (ids.has(achievementId)) invalid();
        ids.add(achievementId);
        text(achievement.title, 1000);
        text(achievement.description, 10_000);
        text(achievement.icon, 100);
        date(achievement.unlockedAt, true);
      }
      break;
    }
    default: invalid();
  }
}

export function validateEntity(entity: Pick<CloudEntity, 'kind' | 'id' | 'value'>): void {
  identifier(entity.id);
  if (!kinds.includes(entity.kind)) invalid();
  if (entity.kind === 'setting') {
    validateSetting(entity.id, entity.value);
    return;
  }
  if (entity.value === null) return;
  let value: Record<string, unknown>;
  switch (entity.kind) {
    case 'deck':
      value = record(entity.value, ['id', 'name', 'description', 'color', 'createdAt', 'updatedAt'],
        ['parentId', 'examDeadline', 'importedAt']);
      text(value.name, 80, true);
      text(value.description, 20_000);
      choice(value.color, deckColors);
      if (Object.hasOwn(value, 'parentId') && value.parentId !== null) identifier(value.parentId);
      optionalDates(value, ['examDeadline', 'importedAt']);
      break;
    case 'card':
      value = record(entity.value, ['id', 'deckId', 'front', 'back', 'hint', 'source', 'tags', 'cardType',
        'state', 'lastReviewDate', 'nextReviewDate', 'stability', 'difficulty', 'elapsedDays', 'scheduledDays',
        'reps', 'lapses', 'learningSteps', 'createdAt', 'updatedAt'],
      ['contentKind', 'bookTitle', 'chapter', 'importedAt', 'lastImportedAt', 'archivedAt', 'sourceRef', 'recallKind', 'aiSummary']);
      identifier(value.deckId);
      text(value.front, 10_000, value.contentKind !== 'excerpt');
      text(value.back, value.contentKind ? 20_000 : 10_000,
        !/\{\{c\d+::[^}]+\}\}/.test(value.front as string) && value.cardType !== 'image-occlusion');
      text(value.hint, 10_000);
      text(value.source, 20_000);
      if (!Array.isArray(value.tags) || value.tags.length > 50) invalid();
      for (const tag of value.tags) text(tag, 1000);
      choice(value.cardType, cardTypes);
      choice(value.state, states);
      if (Object.hasOwn(value, 'contentKind')) choice(value.contentKind, ['qa', 'excerpt']);
      if (Object.hasOwn(value, 'recallKind')) choice(value.recallKind, ['question', 'task']);
      for (const key of ['bookTitle', 'chapter', 'aiSummary']) {
        if (Object.hasOwn(value, key)) text(value[key], 20_000);
      }
      if (Object.hasOwn(value, 'sourceRef')) {
        const source = record(value.sourceRef, ['provider', 'bookId', 'bookmarkId'], ['chapterUid', 'chapterIdx', 'range', 'highlights']);
        choice(source.provider, ['weread']);
        text(source.bookId, 256, true);
        text(source.bookmarkId, 256, true);
        if (Object.hasOwn(source, 'chapterUid')) text(source.chapterUid, 256, true);
        if (Object.hasOwn(source, 'chapterIdx')) number(source.chapterIdx, 0, Number.MAX_SAFE_INTEGER, true);
        if (Object.hasOwn(source, 'range') && wereadRangeStart(source.range) === null) invalid();
        if (Object.hasOwn(source, 'highlights')) validateWereadMembers(source, value.back);
      }
      schedule(value);
      for (const key of ['reps', 'lapses', 'learningSteps']) number(value[key], 0, Number.MAX_SAFE_INTEGER, true);
      date(value.lastReviewDate, true);
      date(value.nextReviewDate);
      optionalDates(value, ['importedAt', 'lastImportedAt', 'archivedAt']);
      break;
    case 'reviewLog':
      value = record(entity.value, ['id', 'cardId', 'rating', 'reviewDate', 'stability', 'difficulty', 'elapsedDays', 'scheduledDays']);
      identifier(value.cardId);
      choice(value.rating, ratings);
      date(value.reviewDate);
      schedule(value);
      break;
    case 'studySession':
      value = record(entity.value, ['id', 'deckId', 'startedAt', 'endedAt', 'cardsStudied']);
      if (value.deckId !== null) identifier(value.deckId);
      date(value.startedAt);
      date(value.endedAt);
      if (Date.parse(value.endedAt as string) < Date.parse(value.startedAt as string)) invalid();
      number(value.cardsStudied, 0, Number.MAX_SAFE_INTEGER, true);
      break;
    default: invalid();
  }
  if (value.id !== entity.id) invalid();
  if (entity.kind === 'card' || entity.kind === 'deck') {
    date(value.createdAt);
    date(value.updatedAt);
  }
}

export function validateMutation(input: unknown): CloudMutation {
  const mutation = record(input, ['id', 'baseRevision', 'changes']);
  identifier(mutation.id);
  number(mutation.baseRevision, 0, Number.MAX_SAFE_INTEGER - 1, true);
  if (!Array.isArray(mutation.changes) || mutation.changes.length < 1 || mutation.changes.length > 10_000) invalid();
  const keys = new Set<string>();
  for (const candidate of mutation.changes) {
    const change = record(candidate, ['kind', 'id', 'value', 'expectedRevision']);
    choice(change.kind, kinds);
    identifier(change.id);
    number(change.expectedRevision, 0, mutation.baseRevision as number, true);
    const typed = change as unknown as CloudEntity;
    const key = entityKey(typed);
    if (keys.has(key)) invalid();
    keys.add(key);
    validateEntity(typed);
  }
  return mutation as unknown as CloudMutation;
}

export function assembleState(current: CloudEntity[], mutation: CloudMutation): CloudEntity[] {
  const entities = new Map(current.map(entity => [entityKey(entity), entity]));
  for (const change of mutation.changes) {
    const previous = entities.get(entityKey(change));
    if ((previous?.revision ?? 0) !== change.expectedRevision) {
      throw new ApiError(409, 'Conflict', mutation.baseRevision);
    }
    entities.set(entityKey(change), { kind: change.kind, id: change.id, value: change.value, revision: mutation.baseRevision + 1 });
  }
  const assembled = [...entities.values()];
  if (new TextEncoder().encode(JSON.stringify({ revision: mutation.baseRevision + 1, entities: assembled })).byteLength > MAX_PAYLOAD_BYTES) {
    throw new ApiError(413, 'Payload too large');
  }
  const decks = new Map<string, Record<string, unknown>>();
  const names = new Set<string>();
  for (const entity of assembled) {
    validateEntity(entity);
    if (entity.kind !== 'deck' || entity.value === null) continue;
    const deck = entity.value as Record<string, unknown>;
    decks.set(entity.id, deck);
    const name = JSON.stringify([deck.parentId ?? null, (deck.name as string).trim().replace(/\s+/g, ' ').toLowerCase()]);
    if (names.has(name)) invalid();
    names.add(name);
  }
  const complete = new Set<string>();
  for (const id of decks.keys()) {
    const visiting = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null && !complete.has(cursor)) {
      if (visiting.has(cursor)) invalid();
      const deck = decks.get(cursor);
      if (!deck) invalid();
      visiting.add(cursor);
      cursor = (deck.parentId ?? null) as string | null;
    }
    for (const visited of visiting) complete.add(visited);
  }
  const cards = new Set(assembled.filter(entity => entity.kind === 'card' && entity.value !== null).map(entity => entity.id));
  for (const entity of assembled) {
    if (entity.value === null) continue;
    const value = entity.value as Record<string, unknown>;
    if (entity.kind === 'card' || entity.kind === 'studySession') {
      if (value.deckId !== null && !decks.has(value.deckId as string)) invalid();
    }
    if (entity.kind === 'reviewLog' && !cards.has(value.cardId as string)) invalid();
  }
  return assembled;
}
