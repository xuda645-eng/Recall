import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { decodeReaderResume, decodeWorkspaceContext, editorBase, editorDraftFields, loadEditorDraft, loadWorkspaceContext, memoryHashRoute, memoryLocation, saveEditorDraft, saveWorkspaceContext, workspaceContextKey, workspaceDraftKey } from '@/services/memory-workspace-state';

const snapshot = createSeedSnapshot();
beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('workspace context', () => {
  it.each(['home', 'folders', 'cards', 'archived', 'stats', 'import', 'settings', 'advanced', 'compat', 'weread', 'read'])('recognizes %s without inventing routes', route => {
    expect(memoryHashRoute(`#${route}`)).toBe(route);
  });
  it('handles old and unknown hashes', () => {
    expect(memoryHashRoute('#decks')).toBe('folders');
    expect(memoryHashRoute('#constructor')).toBe('home');
    expect(memoryHashRoute('#unknown')).toBe('home');
  });
  it('restores only the explicitly requested route and validates folders', () => {
    saveWorkspaceContext({ ...memoryLocation('folders'), folder: snapshot.decks[0].id, query: 'saved search', scroll: 183 });
    expect(loadWorkspaceContext(snapshot, '#folders')).toMatchObject({ folder: snapshot.decks[0].id, query: 'saved search', scroll: 183 });
    expect(loadWorkspaceContext(snapshot, '#settings')).toEqual(memoryLocation('settings'));
    expect(loadWorkspaceContext({ ...snapshot, decks: [] }, '#folders').folder).toBeNull();
  });
  it.each(['{', 'null', '[]', '{"route":"constructor"}'])('ignores corrupt storage %s', raw => {
    localStorage.setItem(workspaceContextKey, raw);
    expect(loadWorkspaceContext(snapshot, '#home')).toEqual(memoryLocation());
  });
  it('validates offsets, filters and credential-free fields', () => {
    const result = decodeWorkspaceContext({ ...memoryLocation('cards'), scroll: -1, status: 'invalid', sort: 'invalid', syncCode: 'must-not-survive', settings: snapshot.settings }, snapshot);
    expect(result).toEqual(memoryLocation('cards'));
    expect(JSON.stringify(result)).not.toContain('syncCode');
  });
  it('drops vanished/archived reader cards and falls back to a valid origin', () => {
    const origin = memoryLocation('cards');
    const context = { ...memoryLocation('read'), reader: { ids: [snapshot.cards[0].id], scopeIds: [snapshot.cards[0].id], reviewMode: true, origin, state: null } };
    expect(decodeWorkspaceContext(context, snapshot)?.reader?.ids).toEqual([snapshot.cards[0].id]);
    expect(decodeWorkspaceContext(context, { ...snapshot, cards: [] })).toEqual(origin);
    expect(decodeWorkspaceContext(context, { ...snapshot, cards: snapshot.cards.map(card => ({ ...card, archivedAt: '2026-11-06T00:00:00Z' })) })).toEqual(origin);
    saveWorkspaceContext(context);
    expect(loadWorkspaceContext({ ...snapshot, cards: [] }, '#read')).toEqual(origin);
  });
  it('does not pretend a failed context write succeeded', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota'); } });
    expect(saveWorkspaceContext(memoryLocation())).toBe(false);
  });
  it('retains only verified review references and minimal scheduling fields', () => {
    const card = snapshot.cards[0];
    const log = { ...snapshot.reviewLogs[0], id: 'verified-log', cardId: card.id, rating: 'good' as const };
    const resume = { index: 0, session: { id: 'session', startedAt: '2026-11-06T00:00:00Z' }, views: { [card.id]: { revealed: true, scroll: 155 } }, undo: [{ card: { ...card, syncCode: 'excluded', front: 'excluded' }, index: 0, rating: 'good', logId: log.id }] };
    const result = decodeReaderResume(resume, { ...snapshot, reviewLogs: [log] });
    expect(result?.views[card.id]).toEqual({ revealed: true, scroll: 155 });
    expect(result?.undo).toHaveLength(1);
    expect(JSON.stringify(result?.undo)).not.toContain('front');
    expect(JSON.stringify(result)).not.toContain('syncCode');
    expect(decodeReaderResume(resume, { ...snapshot, reviewLogs: [] })?.undo).toEqual([]);
  });
});

describe('local editor drafts', () => {
  it('round trips whitelisted fields, excluding extra credentials', () => {
    localStorage.setItem(workspaceDraftKey, JSON.stringify({ kind: 'card', fields: { front: 'draft', back: 'answer', syncCode: 'excluded' }, base: '', settings: snapshot.settings }));
    expect(loadEditorDraft()).toEqual({ kind: 'card', fields: { front: 'draft', back: 'answer' }, base: '' });
    expect(saveEditorDraft(null)).toBe(true);
    expect(loadEditorDraft()).toBeNull();
  });
  it.each(['{', '[]', '{"kind":"cloud","fields":{},"base":""}', '{"kind":"card","fields":{"back":12},"base":""}'])('rejects malformed draft %s', raw => {
    localStorage.setItem(workspaceDraftKey, raw);
    expect(loadEditorDraft()).toBeNull();
  });
  it('reports quota failures without changing the stored draft', () => {
    const draft = { kind: 'card' as const, fields: { front: 'original' }, base: '' };
    saveEditorDraft(draft);
    const storage = localStorage;
    vi.stubGlobal('localStorage', { getItem: storage.getItem.bind(storage), setItem: () => { throw new Error('quota'); } });
    expect(saveEditorDraft({ ...draft, fields: { front: 'new' } })).toBe(false);
    expect(loadEditorDraft()).toEqual(draft);
  });
  it('captures text and target, never file input payloads', () => {
    const form = document.createElement('form');
    form.innerHTML = '<textarea name="front">draft question</textarea><textarea name="back">answer</textarea><input name="parent" value="target"><input name="syncCode" value="excluded"><input type="file" name="attachment">';
    expect(editorDraftFields(form)).toEqual({ front: 'draft question', back: 'answer', parent: 'target' });
  });
  it('reports an oversized draft instead of claiming it can be restored', () => {
    expect(saveEditorDraft({ kind: 'card', fields: { source: 'source'.repeat(20000) }, base: '' })).toBe(false);
    expect(loadEditorDraft()).toBeNull();
  });
  it('fingerprints editable content without coupling to review changes', () => {
    const card = snapshot.cards[0];
    const original = editorBase('card', card.id, snapshot);
    expect(editorBase('card', card.id, { ...snapshot, cards: snapshot.cards.map(item => ({ ...item, reps: 99 })) })).toBe(original);
    expect(editorBase('card', card.id, { ...snapshot, cards: snapshot.cards.map(item => ({ ...item, front: 'updated' })) })).not.toBe(original);
  });
});
