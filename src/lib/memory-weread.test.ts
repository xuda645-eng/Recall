import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import { newMemoryCard } from '@/lib/memory-folders';
import { snapshotFingerprint } from '@/lib/memory-markdown';
import type { RecallStateSnapshot } from '@/types';
import { MemoryWereadManualImport as MemoryWereadImport } from '@/components/memory-weread-import';
import { applyWereadImport, buildWereadDrafts, parseWereadExport, planWereadImport, wereadSourceId, WEREAD_MAX_BYTES, type WereadBook } from './memory-weread';

const runtime = vi.hoisted(() => ({ snapshot: null as RecallStateSnapshot | null, commit: vi.fn() }));
vi.mock('@/stores/recall-store', () => ({ useRecallStore: { getState: () => runtime.snapshot } }));
vi.mock('@/services/memory-actions', () => ({ commitMemory: runtime.commit }));
const at = '2026-10-31T00:00:00.000Z';
const original = '\uFEFF  First line.\r\n\t第二行。\n  ';
function emptySnapshot(): RecallStateSnapshot {
  return { ...createSeedSnapshot(new Date(at)), decks: [], cards: [], reviewLogs: [], studySessions: [] };
}
function book(bookId = 'book:one'): WereadBook {
  return { bookId, title: 'Original test book', author: 'Original author', highlights: [{ bookmarkId: 'mark:one', markText: original, chapterUid: 'chapter-1', chapterTitle: 'A chapter', question: 'What is the point?', recallKind: 'qa', aiSummary: 'Auxiliary summary only.' }] };
}
function text(books: unknown = [book()]): string {
  return JSON.stringify({ format: 'recall-weread-export-v1', books });
}
function drafts(snapshot: RecallStateSnapshot, books = [book()]) {
  return buildWereadDrafts(snapshot, books, new Set(books.map(book => book.bookId)));
}
function importBooks(snapshot = emptySnapshot(), books = [book()]) {
  return applyWereadImport(snapshot, planWereadImport(snapshot, drafts(snapshot, books)), new Set());
}
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function localFile(contents: string | Promise<string>, name = 'export.json'): File {
  const file = new File([], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: vi.fn(() => Promise.resolve(contents)) });
  return file;
}
function fileInput(): HTMLInputElement {
  return screen.getByLabelText('载入本地 Skill 导出文件') as HTMLInputElement;
}
async function loadLocal(books = [book()]): Promise<void> {
  await act(async () => { fireEvent.change(fileInput(), { target: { files: [localFile(text(books))] } }); });
}
function selectAndPreview(): void {
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByRole('button', { name: '预览并编辑回忆卡' }));
  fireEvent.click(screen.getByRole('button', { name: '检查导入变化' }));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('strict local WeRead export parsing', () => {
  it('keeps the original highlight byte-for-byte and accepts a file BOM', () => {
    const parsed = parseWereadExport('\uFEFF' + text());
    expect(parsed.books[0].highlights[0].markText).toBe(original);
    expect(parsed.books[0].highlights[0].chapterUid).toBe('chapter-1');
    expect(parseWereadExport(text([{ ...book(), highlights: [] }])).books[0].highlights).toEqual([]);
    const optional = book(); optional.highlights[0].chapterUid = '';
    expect(parseWereadExport(text([optional])).books[0].highlights[0].chapterUid).toBe('');
  });
  it.each([null, [], {}, { format: 'other', books: [book()] }, { format: 'recall-weread-export-v1', books: [] }, { format: 'recall-weread-export-v1', books: [book()], unknown: true }])('rejects an invalid root: %j', value => {
    expect(() => parseWereadExport(JSON.stringify(value))).toThrow();
  });
  it('rejects broken JSON and non-string input', () => {
    expect(() => parseWereadExport('{')).toThrow('JSON');
    expect(() => parseWereadExport(null as unknown as string)).toThrow('文本');
  });
  it.each(['api_key', 'access-token', 'Authorization', 'Cookie', 'password', 'clientSecret', 'session_id', 'credential', 'syncCode', '密钥'])('rejects nested credential-bearing field %s before unknown-field errors', name => {
    const value = { format: 'recall-weread-export-v1', books: [book()], extras: [{ nested: { [name]: 'never-a-real-key' } }] };
    expect(() => parseWereadExport(JSON.stringify(value))).toThrow('凭证字段');
  });
  it('does not mistake quoted credential names in the original text for fields', () => {
    const value = book(); value.highlights[0].markText = 'Literal sample: "token": "redacted"';
    expect(parseWereadExport(text([value])).books[0].highlights[0].markText).toBe(value.highlights[0].markText);
  });
  it.each([
    { bookId: 12 }, { bookId: ' ' }, { bookId: 'a'.repeat(201) }, { title: ' ' }, { title: 'a'.repeat(81) },
    { author: null }, { highlights: null }, { extra: 'ignored?' },
  ])('strictly rejects invalid book fields: %j', fields => {
    expect(() => parseWereadExport(text([{ ...book(), ...fields }]))).toThrow();
  });
  it.each([
    { bookmarkId: null }, { bookmarkId: '' }, { bookmarkId: '\ud800' }, { bookmarkId: 'a\nb' },
    { markText: ' \t\n' }, { markText: 1 }, { markText: 'a'.repeat(20001) }, { question: 'a'.repeat(10001) },
    { question: null }, { chapterUid: 1 }, { chapterTitle: [] }, { recallKind: 'question' }, { recallKind: null },
    { aiSummary: 'a'.repeat(2001) }, { unrecognized: true },
  ])('strictly rejects invalid highlight fields: %j', fields => {
    const value = book(); value.highlights = [{ ...value.highlights[0], ...fields }] as WereadBook['highlights'];
    expect(() => parseWereadExport(text([value]))).toThrow();
  });
  it.each(['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<svg onload=alert(1)>', '<iframe srcdoc="bad">', '[run](javascript:alert)', '[run](java\nscript:alert)', 'data:text/html,unsafe'])('rejects executable/HTML content without rewriting it: %s', markText => {
    const value = book(); value.highlights[0].markText = markText;
    expect(() => parseWereadExport(text([value]))).toThrow('HTML');
  });
  it('checks all display fields for executable content', () => {
    expect(() => parseWereadExport(text([{ ...book(), title: '<script>' }]))).toThrow('HTML');
    const value = book(); value.highlights[0].question = '<script>';
    expect(() => parseWereadExport(text([value]))).toThrow('HTML');
    value.highlights[0].question = 'A safe question'; value.highlights[0].aiSummary = '<iframe>';
    expect(() => parseWereadExport(text([value]))).toThrow('HTML');
  });
  it('rejects duplicate books and duplicate source identities but scopes bookmark IDs to books', () => {
    expect(() => parseWereadExport(text([book(), book()]))).toThrow('重复书籍');
    const value = book(); value.highlights.push({ ...value.highlights[0] });
    expect(() => parseWereadExport(text([value]))).toThrow('重复划线');
    expect(parseWereadExport(text([book('one'), book('two')])).books).toHaveLength(2);
    expect(wereadSourceId('a:b', 'c')).not.toBe(wereadSourceId('a', 'b:c'));
    expect(wereadSourceId('a%3Ab', 'c')).not.toBe(wereadSourceId('a:b', 'c'));
  });
  it('enforces byte, book, highlight and content limits, including boundary values', () => {
    expect(() => parseWereadExport(' '.repeat(WEREAD_MAX_BYTES + 1))).toThrow('5 MB');
    expect(() => parseWereadExport('中'.repeat(Math.ceil(WEREAD_MAX_BYTES / 3)))).toThrow('5 MB');
    const boundary = text();
    expect(parseWereadExport(boundary.padEnd(boundary.length + WEREAD_MAX_BYTES - new TextEncoder().encode(boundary).length, ' ')).books).toHaveLength(1);
    expect(() => parseWereadExport(text(Array.from({ length: 201 }, (_, index) => book(String(index)))))).toThrow('200');
    expect(parseWereadExport(text(Array.from({ length: 200 }, (_, index) => book(String(index))))).books).toHaveLength(200);
    const value = book(); value.highlights = Array.from({ length: 1001 }, (_, index) => ({ bookmarkId: String(index), markText: 'Original.' }));
    expect(() => parseWereadExport(text([value]))).toThrow('1000');
    value.highlights.pop(); expect(parseWereadExport(text([value])).books[0].highlights).toHaveLength(1000);
    value.highlights = [{ bookmarkId: 'max', markText: 'a'.repeat(20000), question: 'b'.repeat(10000) }];
    expect(parseWereadExport(text([value])).books[0].highlights[0].markText).toHaveLength(20000);
  });
});

describe('bounded incremental WeRead imports', () => {
  it('keeps a 1000-highlight preview linear in size and applies it without carrying whole books per row', () => {
    const snapshot = emptySnapshot(), value = book();
    value.highlights = Array.from({ length: 1000 }, (_, index) => ({ bookmarkId: String(index), markText: 'Original highlight '.repeat(20) }));
    const selected = drafts(snapshot, parseWereadExport(text([value])).books);
    expect(Object.hasOwn(selected[0].book, 'highlights')).toBe(false);
    const plan = planWereadImport(snapshot, selected);
    expect(JSON.stringify(plan).length).toBeLessThan(2000000);
    const result = applyWereadImport(snapshot, plan, new Set());
    expect(result.added).toBe(1000);
    expect(result.snapshot.decks).toHaveLength(1);
    expect(importBooks(result.snapshot, [value])).toMatchObject({ added: 0, skipped: 1000 });
  });
  it('imports selected books into one root each, never chapter subgroups; summaries do not replace originals', () => {
    const snapshot = emptySnapshot(), first = book(), second = book('second');
    first.highlights.push({ bookmarkId: 'another', markText: 'A second chapter.', chapterUid: 'chapter-2', chapterTitle: 'Second chapter' });
    const selected = buildWereadDrafts(snapshot, [first, second], [first.bookId]);
    const result = applyWereadImport(snapshot, planWereadImport(snapshot, selected), new Set());
    expect(result).toMatchObject({ added: 2, updated: 0, skipped: 0 });
    expect(result.snapshot.decks).toHaveLength(1);
    expect(result.snapshot.decks[0].parentId).toBeNull();
    expect(new Set(result.snapshot.cards.map(card => card.deckId)).size).toBe(1);
    expect(result.snapshot.cards[0]).toMatchObject({ back: original, sourceRef: { provider: 'weread', bookId: first.bookId, bookmarkId: 'mark:one', chapterUid: 'chapter-1' }, source: '微信读书 · Original test book · A chapter', aiSummary: 'Auxiliary summary only.', contentKind: 'qa', recallKind: 'question' });
    expect(snapshot.cards).toEqual([]);
    expect(snapshot.decks).toEqual([]);
    expect(result.deckIds).toEqual([result.snapshot.decks[0].id]);
  });
  it('keeps stable IDs and skips repeated imports without resetting any existing fields', () => {
    const initial = importBooks(), old = initial.snapshot.cards[0];
    const snapshot = { ...initial.snapshot, cards: [{ ...old, reps: 7, state: 'review' as const, stability: 12, archivedAt: at }] };
    const next = importBooks(snapshot);
    expect(next).toMatchObject({ added: 0, updated: 0, skipped: 1 });
    expect(next.snapshot.cards).toEqual(snapshot.cards);
    expect(next.snapshot.decks).toEqual(snapshot.decks);
    expect(next.deckIds).toEqual([old.deckId]);
    expect(old.id).toBe(wereadSourceId('book:one', 'mark:one'));
  });
  it.each(['qa', 'task', 'excerpt'] as const)('preserves the user-authored %s prompt/type/summary when the original is unchanged', kind => {
    const initial = importBooks(), old = initial.snapshot.cards[0];
    const snapshot = { ...initial.snapshot, cards: [{ ...old, front: '  My own prompt or excerpt title.  ', contentKind: kind === 'excerpt' ? 'excerpt' as const : 'qa' as const, recallKind: kind === 'excerpt' ? undefined : kind === 'task' ? 'task' as const : 'question' as const, aiSummary: 'My preserved summary', archivedAt: at }] };
    const value = book(); value.highlights[0].question = 'Do not regenerate'; value.highlights[0].recallKind = 'task'; value.highlights[0].aiSummary = 'Do not regenerate summary';
    const built = drafts(snapshot, [value]);
    expect(built[0]).toMatchObject({ kind, question: snapshot.cards[0].front, aiSummary: 'My preserved summary', originalUnchanged: true });
    expect(planWereadImport(snapshot, built).rows[0].status).toBe('duplicate');
    expect(importBooks(snapshot, [value]).snapshot.cards[0]).toEqual(snapshot.cards[0]);
  });
  it('matches sourceRef even after the card ID and root group were changed', () => {
    const initial = importBooks(), old = initial.snapshot.cards[0], deck = initial.snapshot.decks[0];
    const snapshot = { ...initial.snapshot, decks: [{ ...deck, id: 'user-root' }], cards: [{ ...old, id: 'user-card', deckId: 'user-root' }] };
    const value = book(); value.highlights.push({ bookmarkId: 'fresh', markText: 'Fresh original.' });
    const result = importBooks(snapshot, [value]);
    expect(result).toMatchObject({ added: 1, skipped: 1 });
    expect(result.snapshot.cards[0].id).toBe('user-card');
    expect(result.snapshot.decks).toHaveLength(1);
    expect(result.snapshot.cards[1].deckId).toBe('user-root');
  });
  it('only applies explicit updates to content/source; IDs, all dates, scheduling, archive and unrelated fields stay intact', () => {
    const initial = importBooks(), old = initial.snapshot.cards[0];
    const preserved = { ...old, id: 'my-card', reps: 8, lapses: 2, learningSteps: 3, state: 'review' as const, stability: 18, difficulty: 4, elapsedDays: 5, scheduledDays: 30, nextReviewDate: '2027-02-01T00:00:00Z', lastReviewDate: at, archivedAt: at, lastImportedAt: '2020-01-01T00:00:00Z', hint: 'My hint', tags: ['mine'] };
    const snapshot = { ...initial.snapshot, cards: [preserved] }, before = structuredClone(snapshot);
    const value = book(); value.highlights[0] = { ...value.highlights[0], markText: '  New original.\r\n ', question: 'New task?', recallKind: 'task', chapterUid: 'new-chapter', aiSummary: 'New auxiliary summary' };
    const plan = planWereadImport(snapshot, drafts(snapshot, [value]));
    expect(plan.rows[0].status).toBe('change');
    expect(applyWereadImport(snapshot, plan, new Set()).snapshot.cards[0]).toEqual(preserved);
    const result = applyWereadImport(snapshot, plan, new Set([wereadSourceId(value.bookId, value.highlights[0].bookmarkId)]));
    expect(result).toMatchObject({ added: 0, updated: 1, skipped: 0 });
    const updated = result.snapshot.cards[0];
    expect(updated).toMatchObject({ front: 'New task?', back: value.highlights[0].markText, recallKind: 'task', sourceRef: { chapterUid: 'new-chapter' }, aiSummary: 'New auxiliary summary' });
    const { front: _front, back: _back, source: _source, sourceRef: _ref, contentKind: _kind, recallKind: _recall, aiSummary: _summary, chapter: _chapter, bookTitle: _title, ...rest } = updated;
    const { front: _oldFront, back: _oldBack, source: _oldSource, sourceRef: _oldRef, contentKind: _oldKind, recallKind: _oldRecall, aiSummary: _oldSummary, chapter: _oldChapter, bookTitle: _oldTitle, ...oldRest } = preserved;
    expect(rest).toEqual(oldRest);
    expect(snapshot).toEqual(before);
    expect(result.snapshot.settings).toBe(snapshot.settings);
    expect(result.snapshot.reviewLogs).toBe(snapshot.reviewLogs);
    expect(result.snapshot.studySessions).toBe(snapshot.studySessions);
  });
  it('keeps excluded/missing lines and requires valid editable prompts or excerpt fallback', () => {
    const snapshot = emptySnapshot(), value = book();
    value.highlights.push({ bookmarkId: 'excluded', markText: 'Do not include.' });
    const selected = drafts(snapshot, [value]); selected[1].include = false;
    selected[0].question = ' ';
    expect(() => planWereadImport(snapshot, selected)).toThrow('问题或回忆任务');
    selected[0].kind = 'excerpt'; selected[0].question = '';
    const initial = applyWereadImport(snapshot, planWereadImport(snapshot, selected), new Set());
    expect(initial.added).toBe(1);
    expect(initial.snapshot.cards[0]).toMatchObject({ front: '', back: original, contentKind: 'excerpt', recallKind: undefined });
    const second = importBooks(initial.snapshot, [book('different')]);
    expect(second.snapshot.cards).toHaveLength(2);
    expect(second.snapshot.cards[0]).toEqual(initial.snapshot.cards[0]);
  });
  it('uses an explicitly editable generic task when a new highlight has no suggestion', () => {
    const value = book(); delete value.highlights[0].question;
    expect(drafts(emptySnapshot(), [value])[0]).toMatchObject({ kind: 'task', question: '回忆这段划线的核心观点。' });
    expect(() => buildWereadDrafts(emptySnapshot(), [value], ['absent'])).toThrow('不存在');
    expect(() => planWereadImport(emptySnapshot(), [])).toThrow('请选择');
  });
  it('rejects duplicate sources in drafts or the existing library and unrelated stable card/deck collisions', () => {
    const snapshot = emptySnapshot(), selected = drafts(snapshot);
    expect(() => planWereadImport(snapshot, [...selected, ...selected])).toThrow('重复划线');
    const initial = importBooks(); initial.snapshot.cards.push({ ...initial.snapshot.cards[0], id: 'other' });
    expect(() => drafts(initial.snapshot)).toThrow('来源冲突');
    snapshot.cards.push(newMemoryCard({ id: selected[0].id, deckId: 'unrelated', front: 'Unrelated', back: 'Unrelated' }, at));
    expect(() => planWereadImport(snapshot, selected)).toThrow('无关卡片冲突');
    snapshot.cards = [];
    snapshot.decks.push({ id: 'weread-book:book%3Aone', name: 'Unrelated', description: '', color: 'slate', parentId: null, createdAt: at, updatedAt: at });
    expect(() => planWereadImport(snapshot, selected)).toThrow('卡组冲突');
  });
  it('never merges unrelated same-title books/groups', () => {
    const snapshot = emptySnapshot();
    snapshot.decks.push({ id: 'unrelated', name: book().title, description: 'Keep me', color: 'slate', parentId: null, createdAt: at, updatedAt: at });
    const next = importBooks(snapshot, [book('one'), book('two')]);
    expect(next.snapshot.decks).toHaveLength(3);
    expect(next.snapshot.decks[0]).toEqual(snapshot.decks[0]);
    expect(new Set(next.snapshot.decks.map(deck => deck.name)).size).toBe(3);
    expect(next.deckIds).not.toContain('unrelated');
  });
  it.each(['cards', 'decks', 'reviewLogs', 'studySessions'] as const)('uses the shared fingerprint to reject stale %s previews', field => {
    const snapshot = emptySnapshot(), plan = planWereadImport(snapshot, drafts(snapshot));
    expect(plan.fingerprint).toBe(snapshotFingerprint(snapshot));
    const changed = { ...snapshot, [field]: [{ stale: true }] } as unknown as RecallStateSnapshot;
    expect(() => applyWereadImport(changed, plan, new Set())).toThrow('数据已变化');
  });
  it('rejects altered preview fields and invalid explicit-update IDs', () => {
    const snapshot = emptySnapshot(), plan = planWereadImport(snapshot, drafts(snapshot));
    expect(() => applyWereadImport(snapshot, plan, new Set(['unknown']))).toThrow('更新选择');
    plan.rows[0].content.back = 'Tampered';
    expect(() => applyWereadImport(snapshot, plan, new Set())).toThrow('预览已变化');
  });
});

describe('local importer interaction and pending/cancellation guards', () => {
  beforeEach(() => {
    runtime.snapshot = emptySnapshot();
    runtime.commit.mockReset();
    runtime.commit.mockImplementation(async (change: (current: RecallStateSnapshot) => RecallStateSnapshot) => { runtime.snapshot = change(runtime.snapshot!); });
  });
  it('loads a local file, edits the question, keeps exact original text, commits and reports deck IDs', async () => {
    const complete = vi.fn();
    render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: complete }));
    await loadLocal();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: '预览并编辑回忆卡' }));
    expect(document.querySelector('.m-original-highlight p')?.textContent).toBe(original);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My edited question?' } });
    fireEvent.click(screen.getByRole('button', { name: '检查导入变化' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(runtime.commit).toHaveBeenCalledTimes(1);
    expect(runtime.snapshot?.cards[0]).toMatchObject({ front: 'My edited question?', back: original });
    expect(screen.getByRole('heading', { name: '导入完成' })).toBeTruthy();
    expect(complete).toHaveBeenCalledWith([runtime.snapshot?.decks[0].id]);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('shows original sample provenance and question/task/excerpt interaction, never calls a model/network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: /体验原创示例书架/ }));
    expect(screen.getByText(/原创预置书架和问题/).textContent).toContain('不是你的微信读书数据');
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: '预览并编辑回忆卡' }));
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'task' } });
    expect(screen.getByText('正面 · 回忆任务')).toBeTruthy();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'excerpt' } });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runtime.commit).not.toHaveBeenCalled();
  });
  it('leaves changes unchecked, allows returning to recheck, and only updates selected content', async () => {
    runtime.snapshot = importBooks().snapshot;
    const value = book(); value.highlights[0].markText = 'Changed original.';
    render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: vi.fn() }));
    await loadLocal([value]); selectAndPreview();
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: '返回编辑 / 重新检查' }));
    fireEvent.click(screen.getByRole('button', { name: '检查导入变化' }));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(runtime.snapshot?.cards[0].back).toBe(original);
    expect(screen.getByRole('status').textContent).toContain('跳过 1');
  });
  it('prevents double import, closing, Escape and document unload while commit is pending', async () => {
    const hold = deferred<void>(), close = vi.fn(), escaped = vi.fn();
    runtime.commit.mockImplementationOnce(async (change: (current: RecallStateSnapshot) => RecallStateSnapshot) => { runtime.snapshot = change(runtime.snapshot!); await hold.promise; });
    render(createElement(MemoryWereadImport, { onClose: close, onComplete: vi.fn() }));
    await loadLocal(); selectAndPreview();
    const confirm = screen.getByRole('button', { name: '确认导入' });
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    fireEvent.click(screen.getByRole('button', { name: '返回导入' }));
    document.addEventListener('keydown', escaped);
    fireEvent.keyDown(document, { key: 'Escape' });
    document.removeEventListener('keydown', escaped);
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    expect(escaped).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(runtime.commit).toHaveBeenCalledTimes(1);
    await act(async () => { hold.resolve(); await hold.promise; });
    fireEvent.click(screen.getByRole('button', { name: '返回导入' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('preserves save errors and the preview for retry without calling completion on failure', async () => {
    const complete = vi.fn(); runtime.commit.mockRejectedValueOnce(new Error('Local save failed'));
    render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: complete }));
    await loadLocal(); selectAndPreview();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(screen.getByRole('alert').textContent).toBe('Local save failed');
    expect((screen.getByRole('button', { name: '确认导入' }) as HTMLButtonElement).disabled).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(runtime.snapshot?.cards).toHaveLength(1);
  });
  it('keeps a stale-preview error visible and requires a new check', async () => {
    render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: vi.fn() }));
    await loadLocal(); selectAndPreview();
    runtime.snapshot = { ...runtime.snapshot!, decks: [{ id: 'new-root', name: 'New root', description: '', color: 'slate', createdAt: at, updatedAt: at, parentId: null }] };
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(screen.getByRole('alert').textContent).toContain('数据已变化');
    expect(runtime.snapshot.cards).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '返回编辑 / 重新检查' }));
    expect(screen.getByRole('alert').textContent).toContain('数据已变化');
    fireEvent.click(screen.getByRole('button', { name: '检查导入变化' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(runtime.snapshot.cards).toHaveLength(1);
  });
  it('ignores slower obsolete file reads and their failures', async () => {
    const old = deferred<string>();
    render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: vi.fn() }));
    fireEvent.change(fileInput(), { target: { files: [localFile(old.promise, 'old.json')] } });
    await loadLocal([book('new')]);
    await act(async () => { old.reject(new Error('Obsolete parse failure')); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('export.json')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });
  it('cancels file parsing when a sample, an oversize file, or unmount supersedes it', async () => {
    const first = deferred<string>(), second = deferred<string>(), close = vi.fn();
    const view = render(createElement(MemoryWereadImport, { onClose: close, onComplete: vi.fn() }));
    fireEvent.change(fileInput(), { target: { files: [localFile(first.promise)] } });
    fireEvent.click(screen.getByRole('button', { name: /体验原创示例书架/ }));
    await act(async () => { first.resolve(text()); });
    expect(screen.getByText(/原创预置书架和问题/)).toBeTruthy();
    fireEvent.change(fileInput(), { target: { files: [localFile(second.promise)] } });
    const huge = localFile(text()); Object.defineProperty(huge, 'size', { value: WEREAD_MAX_BYTES + 1 });
    await act(async () => { fireEvent.change(fileInput(), { target: { files: [huge] } }); });
    await act(async () => { second.resolve(text()); });
    expect(screen.getByRole('alert').textContent).toContain('5 MB');
    expect(screen.queryByRole('checkbox')).toBeNull();
    const third = deferred<string>(); fireEvent.change(fileInput(), { target: { files: [localFile(third.promise)] } });
    fireEvent.click(screen.getByRole('button', { name: '返回导入' }));
    expect(close).not.toHaveBeenCalled();
    view.unmount();
    await act(async () => { third.resolve(text()); });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('reports file loading synchronously and keeps the parent busy until the latest read finishes', async () => {
    const first = deferred<string>(), second = deferred<string>(), onBusy = vi.fn(), close = vi.fn();
    render(createElement(MemoryWereadImport, { onClose: close, onComplete: vi.fn(), onBusy }));
    fireEvent.change(fileInput(), { target: { files: [localFile(first.promise, 'first.json')] } });
    expect(onBusy.mock.calls).toEqual([[true]]);
    expect((screen.getByRole('button', { name: '返回导入' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '返回导入' }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.change(fileInput(), { target: { files: [localFile(second.promise, 'second.json')] } });
    await act(async () => { first.resolve(text()); });
    expect(onBusy.mock.calls).toEqual([[true]]);
    expect(screen.getByRole('status').textContent).toContain('正在读取');
    await act(async () => { second.resolve(text([book('latest')])); });
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByText('second.json')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回导入' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it.each(['read', 'parse', 'size'] as const)('releases the parent busy guard after a %s error', async failure => {
    const onBusy = vi.fn(), read = deferred<string>();
    render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: vi.fn(), onBusy }));
    const file = localFile(failure === 'read' ? read.promise : '{');
    if (failure === 'size') Object.defineProperty(file, 'size', { value: WEREAD_MAX_BYTES + 1 });
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
      if (failure === 'read') read.reject(new Error('Local read failed'));
    });
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect((screen.getByRole('button', { name: '返回导入' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('releases a cancelled sample read without letting its stale result unlock an active save', async () => {
    const read = deferred<string>(), save = deferred<void>(), onBusy = vi.fn();
    const complete = vi.fn(() => { expect(onBusy).toHaveBeenLastCalledWith(false); });
    runtime.commit.mockImplementationOnce(async (change: (current: RecallStateSnapshot) => RecallStateSnapshot) => {
      expect(onBusy).toHaveBeenLastCalledWith(true);
      runtime.snapshot = change(runtime.snapshot!);
      await save.promise;
    });
    render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: complete, onBusy }));
    fireEvent.change(fileInput(), { target: { files: [localFile(read.promise)] } });
    fireEvent.click(screen.getByRole('button', { name: /体验原创示例书架/ }));
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    selectAndPreview();
    act(() => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(onBusy.mock.calls).toEqual([[true], [false], [true]]);
    await act(async () => { read.resolve(text()); });
    expect(onBusy.mock.calls).toEqual([[true], [false], [true]]);
    expect(complete).not.toHaveBeenCalled();
    await act(async () => { save.resolve(); await save.promise; });
    expect(onBusy.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('releases busy on save failure and restores it during a successful retry', async () => {
    const onBusy = vi.fn();
    runtime.commit.mockRejectedValueOnce(new Error('Local save failed'));
    render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: vi.fn(), onBusy }));
    await loadLocal(); selectAndPreview(); onBusy.mockClear();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByRole('alert').textContent).toBe('Local save failed');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(onBusy.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(runtime.snapshot?.cards).toHaveLength(1);
  });
  it('keeps the current busy callback informed and cleans it up once on unmount during loading', async () => {
    const read = deferred<string>(), first = vi.fn(), latest = vi.fn(), close = vi.fn(), complete = vi.fn();
    const view = render(createElement(MemoryWereadImport, { onClose: close, onComplete: complete, onBusy: first }));
    fireEvent.change(fileInput(), { target: { files: [localFile(read.promise)] } });
    view.rerender(createElement(MemoryWereadImport, { onClose: close, onComplete: complete, onBusy: latest }));
    expect(first.mock.calls).toEqual([[true]]);
    expect(latest.mock.calls).toEqual([[true]]);
    view.unmount();
    expect(latest.mock.calls).toEqual([[true], [false]]);
    await act(async () => { read.resolve(text()); });
    expect(latest.mock.calls).toEqual([[true], [false]]);
    expect(runtime.commit).not.toHaveBeenCalled();
  });
  it('cleans up the parent busy guard on unmount during saving without late notifications or completion', async () => {
    const save = deferred<void>(), onBusy = vi.fn(), complete = vi.fn();
    runtime.commit.mockImplementationOnce(async () => { await save.promise; });
    const view = render(createElement(MemoryWereadImport, { onClose: vi.fn(), onComplete: complete, onBusy }));
    await loadLocal(); selectAndPreview(); onBusy.mockClear();
    act(() => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
    expect(onBusy.mock.calls).toEqual([[true]]);
    view.unmount();
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    await act(async () => { save.resolve(); await save.promise; });
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    expect(complete).not.toHaveBeenCalled();
  });
});
