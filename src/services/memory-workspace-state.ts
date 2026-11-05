import type { Card, RecallStateSnapshot, ReviewRating } from '@/types';

export const workspaceContextKey = 'recall.workspace.context.v1';
export const workspaceDraftKey = 'recall.workspace.draft.v1';
export const memoryRoutes = ['home', 'folders', 'cards', 'archived', 'stats', 'import', 'weread', 'settings', 'advanced', 'compat', 'read'] as const;
export type MemoryRoute = typeof memoryRoutes[number];
export interface MemoryLocation {
  route: MemoryRoute;
  folder: string | null;
  archivedFolder: string | null;
  contentType: string;
  status: string;
  query: string;
  sort: string;
  scroll: number;
  cardId?: string;
  label: string;
}
export type MemoryUndoCard = Pick<Card, 'id' | 'state' | 'lastReviewDate' | 'nextReviewDate' | 'stability' | 'difficulty' | 'elapsedDays' | 'scheduledDays' | 'reps' | 'lapses' | 'learningSteps'>;
export interface MemoryReaderUndo { card: MemoryUndoCard; logId: string; index: number; rating: ReviewRating }
export interface MemoryReaderResume {
  index: number;
  views: Record<string, { revealed: boolean; scroll: number }>;
  undo: MemoryReaderUndo[];
  session: { id: string; startedAt: string };
}
export interface MemoryWorkspaceContext extends MemoryLocation {
  reader?: { ids: string[]; scopeIds: string[]; reviewMode: boolean; origin: MemoryLocation; state: MemoryReaderResume | null };
}
export type MemoryDraftKind = 'card' | 'folder' | 'move';
export interface MemoryEditorDraft { kind: MemoryDraftKind; id?: string; fields: Record<string, string>; base: string }
const draftFields = ['name', 'parent', 'front', 'back', 'bookTitle', 'chapter', 'source'] as const;
const ratings = ['again', 'hard', 'good', 'easy'];
const schedulingFields = ['stability', 'difficulty', 'elapsedDays', 'scheduledDays', 'reps', 'lapses', 'learningSteps'] as const;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit = 512): value is string => typeof value === 'string' && value.length <= limit;
const offset = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const identifier = (value: unknown): value is string => text(value) && value.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(value);

export function memoryLocation(route: MemoryRoute = 'home'): MemoryLocation {
  return { route, folder: null, archivedFolder: null, contentType: '全部', status: '全部', query: '', sort: 'new', scroll: 0, label: '' };
}
export function memoryHashRoute(hash: string): MemoryRoute {
  const route = hash.replace(/^#/, '');
  return route === 'decks' ? 'folders' : memoryRoutes.includes(route as MemoryRoute) ? route as MemoryRoute : 'home';
}
function decodeLocation(value: unknown, snapshot: RecallStateSnapshot): MemoryLocation | null {
  if (!record(value) || !memoryRoutes.includes(value.route as MemoryRoute)) return null;
  const base = memoryLocation(value.route as MemoryRoute);
  return {
    ...base,
    folder: text(value.folder) && snapshot.decks.some(deck => deck.id === value.folder) ? value.folder : null,
    archivedFolder: text(value.archivedFolder) && snapshot.decks.some(deck => deck.id === value.archivedFolder) ? value.archivedFolder : null,
    contentType: ['全部', '仅卡组', '仅卡片'].includes(String(value.contentType)) ? String(value.contentType) : base.contentType,
    status: ['全部', '待复习', '待学习', '学习中', '长期复习'].includes(String(value.status)) ? String(value.status) : base.status,
    query: text(value.query, 10000) ? value.query : '',
    sort: ['new', 'old', 'name', 'updated'].includes(String(value.sort)) ? String(value.sort) : 'new',
    scroll: offset(value.scroll) ? value.scroll : 0,
    cardId: identifier(value.cardId) ? value.cardId : undefined,
    label: text(value.label, 10000) ? value.label : '',
  };
}
export function decodeReaderResume(value: unknown, snapshot: RecallStateSnapshot): MemoryReaderResume | null {
  if (!record(value) || !record(value.session) || !identifier(value.session.id) || !text(value.session.startedAt) || !Number.isFinite(Date.parse(value.session.startedAt)) || !offset(value.index) || !Number.isInteger(value.index)) return null;
  const views = Object.fromEntries(record(value.views) ? Object.entries(value.views).filter(([id, position]) => identifier(id) && record(position) && typeof position.revealed === 'boolean' && offset(position.scroll)).map(([id, position]) => [id, { revealed: (position as Record<string, unknown>).revealed as boolean, scroll: (position as Record<string, unknown>).scroll as number }]) : []);
  const undo: MemoryReaderUndo[] = [];
  for (const entry of Array.isArray(value.undo) ? value.undo.slice(0, 10000) : []) {
    if (!record(entry) || !record(entry.card) || !identifier(entry.card.id) || !identifier(entry.logId) || !offset(entry.index) || !ratings.includes(String(entry.rating))) continue;
    const before = entry.card;
    if (!['new', 'learning', 'review', 'relearning'].includes(String(before.state)) || !(before.lastReviewDate === null || text(before.lastReviewDate)) || !text(before.nextReviewDate) || !schedulingFields.every(field => offset(before[field]))) continue;
    if (!snapshot.cards.some(card => card.id === before.id) || !snapshot.reviewLogs.some(log => log.id === entry.logId && log.cardId === before.id && log.rating === entry.rating)) continue;
    const card = { id: before.id, state: before.state, lastReviewDate: before.lastReviewDate, nextReviewDate: before.nextReviewDate, ...Object.fromEntries(schedulingFields.map(field => [field, before[field]])) } as MemoryUndoCard;
    undo.push({ card, logId: entry.logId, index: entry.index, rating: entry.rating as ReviewRating });
  }
  return { index: value.index, views, undo, session: { id: value.session.id, startedAt: value.session.startedAt } };
}
export function decodeWorkspaceContext(value: unknown, snapshot: RecallStateSnapshot): MemoryWorkspaceContext | null {
  const location = decodeLocation(value, snapshot);
  if (!location || !record(value)) return null;
  if (location.route !== 'read') return location;
  if (!record(value.reader)) return memoryLocation();
  const reader = value.reader;
  const ids = Array.isArray(reader.ids) ? reader.ids.filter((id): id is string => identifier(id) && snapshot.cards.some(card => card.id === id && !card.archivedAt)).slice(0, 10000) : [];
  const origin = decodeLocation(reader.origin, snapshot) || memoryLocation();
  if (origin.route === 'read') origin.route = 'home';
  if (!ids.length) return origin;
  const originalIds = Array.isArray(reader.ids) ? reader.ids : [];
  const state = decodeReaderResume(reader.state, snapshot);
  if (state) state.index = state.index >= originalIds.length ? ids.length : Math.max(0, ids.indexOf(originalIds[state.index] as string));
  return { ...location, reader: { ids: [...new Set(ids)], scopeIds: Array.isArray(reader.scopeIds) ? reader.scopeIds.filter((id): id is string => identifier(id) && snapshot.cards.some(card => card.id === id)).slice(0, 10000) : ids, reviewMode: reader.reviewMode === true, origin, state } };
}
function stored(key: string, limit: number): unknown {
  try { const raw = localStorage.getItem(key); return raw && raw.length <= limit ? JSON.parse(raw) : null; } catch { return null; }
}
export function loadWorkspaceContext(snapshot: RecallStateSnapshot, hash: string): MemoryWorkspaceContext {
  const route = memoryHashRoute(hash);
  const raw = stored(workspaceContextKey, 1024 * 1024);
  const saved = decodeWorkspaceContext(raw, snapshot);
  return saved && (saved.route === route || route === 'read' && record(raw) && raw.route === 'read') ? saved : memoryLocation(route === 'read' ? 'home' : route);
}
export function saveWorkspaceContext(context: MemoryWorkspaceContext): boolean {
  try { const raw = JSON.stringify(context); if (raw.length > 1024 * 1024) return false; localStorage.setItem(workspaceContextKey, raw); return true; } catch { return false; }
}
export function loadEditorDraft(): MemoryEditorDraft | null {
  const value = stored(workspaceDraftKey, 100000);
  if (!record(value) || !['card', 'folder', 'move'].includes(String(value.kind)) || !(value.id === undefined || identifier(value.id)) || !record(value.fields) || !text(value.base, 100000)) return null;
  if (!draftFields.every(field => value.fields && record(value.fields) && (value.fields[field] === undefined || text(value.fields[field], field === 'back' ? 20000 : field === 'front' ? 10000 : 100000)))) return null;
  return { kind: value.kind as MemoryDraftKind, id: value.id, fields: Object.fromEntries(draftFields.filter(field => (value.fields as Record<string, unknown>)[field] !== undefined).map(field => [field, (value.fields as Record<string, string>)[field]])), base: value.base };
}
export function saveEditorDraft(draft: MemoryEditorDraft | null): boolean {
  try { if (draft) { const raw = JSON.stringify(draft); if (raw.length > 100000) return false; localStorage.setItem(workspaceDraftKey, raw); } else localStorage.removeItem(workspaceDraftKey); return true; } catch { return false; }
}
export function editorDraftFields(form: HTMLFormElement): Record<string, string> {
  const values = new FormData(form);
  return Object.fromEntries(draftFields.filter(field => values.has(field)).map(field => [field, String(values.get(field) || '')]));
}
export function editorBase(kind: MemoryDraftKind, id: string | undefined, snapshot: RecallStateSnapshot): string {
  if (!id) return '';
  const card = snapshot.cards.find(item => item.id === id);
  const deck = snapshot.decks.find(item => item.id === id);
  return JSON.stringify(kind === 'folder' ? deck ? { name: deck.name, parent: deck.parentId || '' } : null : card ? { parent: card.deckId, front: card.front, back: card.back, bookTitle: card.bookTitle || '', chapter: card.chapter || '', source: card.source || '' } : null);
}
