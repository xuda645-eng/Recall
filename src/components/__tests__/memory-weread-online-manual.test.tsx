import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSeedSnapshot } from '@/data/seed';
import type { RecallStateSnapshot } from '@/types';
import { applyWereadImport, buildWereadDrafts, planWereadImport, type WereadBook } from '@/lib/memory-weread';
import { createWereadJob } from '@/lib/weread-job';
import { createMergeSession } from '@/lib/weread-merge-session';
import { installMiaodaWeread, useMiaodaWeread } from '@/services/miaoda-weread';
import { installBackendTransport, type BackendTransport } from '../../../shared/client-http';
import { MemoryWereadImport } from '../memory-weread-import';

const runtime = vi.hoisted(() => ({ snapshot: null as RecallStateSnapshot | null, commit: vi.fn(), loadJob: vi.fn(), loadMerge: vi.fn(), saveJob: vi.fn() }));
vi.mock('@/stores/recall-store', () => ({ useRecallStore: { getState: () => runtime.snapshot } }));
vi.mock('@/services/memory-actions', () => ({ commitMemory: runtime.commit }));
vi.mock('@/services/weread-job-storage', () => ({ loadWereadJob: runtime.loadJob, saveWereadJob: runtime.saveJob, checkWereadBudget: vi.fn(), discardWereadJob: vi.fn(), withWereadJobLock: vi.fn() }));
vi.mock('@/services/weread-merge-storage', () => ({ loadMergeSession: runtime.loadMerge, saveMergeSession: vi.fn(), discardMergeSession: vi.fn() }));

const accountKey = 'a'.repeat(64);
const original = '  Synthetic first line.\r\n\tSecond line.\n  ';
const book: WereadBook = { bookId: 'synthetic-book', title: 'Synthetic book', highlights: [{ bookmarkId: 'mark-1', chapterUid: 'chapter-1', chapterIdx: 1, range: '0-20', chapterTitle: 'Synthetic chapter', markText: original }] };
let stop: (() => void) | undefined;
let remove: (() => void) | undefined;
let peer: ReturnType<typeof vi.fn<BackendTransport>>;

beforeEach(() => {
  vi.stubEnv('VITE_RECALL_MIAODA_LEARNING', '1');
  runtime.snapshot = { ...createSeedSnapshot(new Date('2026-11-13T00:00:00Z')), decks: [], cards: [], reviewLogs: [], studySessions: [] };
  runtime.commit.mockReset().mockImplementation(async (change: (snapshot: RecallStateSnapshot) => RecallStateSnapshot) => { runtime.snapshot = change(runtime.snapshot!); });
  runtime.loadJob.mockReset().mockResolvedValue(null);
  runtime.loadMerge.mockReset().mockResolvedValue(null);
  runtime.saveJob.mockReset();
  peer = vi.fn(async (endpoint: string) => {
    if (endpoint.endsWith('/status')) return Response.json({ available: true, aiAvailable: false, accountKey });
    if (endpoint.endsWith('/books')) return Response.json({ books: [{ bookId: book.bookId, title: book.title, highlightCount: book.highlights.length }], cursor: null });
    if (endpoint.endsWith('/book')) return Response.json({ format: 'recall-weread-export-v1', books: [book] });
    throw new Error('No upstream/model requests allowed');
  });
  remove = installBackendTransport(peer);
  stop = installMiaodaWeread();
});
afterEach(() => { cleanup(); stop?.(); remove?.(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function selectManual(): Promise<void> {
  await vi.waitFor(() => expect(useMiaodaWeread.getState().available).toBe(true));
  render(<MemoryWereadImport onClose={vi.fn()} onComplete={vi.fn()}/>);
  await screen.findByRole('button', { name: '连接微信读书' });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '连接微信读书' })); });
  fireEvent.click(screen.getByRole('button', { name: 'Synthetic book，1 条我的划线' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '下一步 · 手动整理划线' })); });
  expect(runtime.commit).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '生成并自动导入' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '下一步 · 手动预览' }));
}

it('shows the pending authorization state without mounting an online or file editor prematurely', async () => {
  stop?.();
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  peer.mockReturnValueOnce(pending);
  stop = installMiaodaWeread();
  render(<MemoryWereadImport onClose={vi.fn()} onComplete={vi.fn()}/>);
  expect(screen.getByRole('status').textContent).toBe('正在检查微信读书授权…');
  expect(screen.queryByRole('button', { name: '连接微信读书' })).toBeNull();
  expect(screen.queryByLabelText('载入本地 Skill 导出文件')).toBeNull();
  await act(async () => {
    finish(Response.json({ available: true, aiAvailable: false, accountKey }));
    await vi.waitFor(() => expect(useMiaodaWeread.getState().available).toBe(true));
  });
  await screen.findByRole('button', { name: '连接微信读书' });
});

it('offers manual questions from selected online text with no AI and commits only after preview and explicit confirmation', async () => {
  await selectManual();
  expect(screen.queryByRole('button', { name: 'AI 生成所选问题' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: '第 1 条划线的卡片形式' }), { target: { value: 'qa' } });
  fireEvent.change(screen.getByRole('textbox', { name: '第 1 条划线的回忆提示' }), { target: { value: 'What did I learn?' } });
  fireEvent.click(screen.getByRole('button', { name: '检查导入变化' }));
  expect(runtime.commit).not.toHaveBeenCalled();
  expect(runtime.saveJob).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
  expect(runtime.commit).toHaveBeenCalledTimes(1);
  expect(runtime.snapshot!.cards).toHaveLength(1);
  expect(runtime.snapshot!.cards[0]).toMatchObject({ front: 'What did I learn?', back: original, sourceRef: { provider: 'weread', bookId: book.bookId, bookmarkId: 'mark-1', chapterUid: 'chapter-1' } });
  expect(peer.mock.calls.map(call => call[0])).toEqual(['/api/recall/weread/status', '/api/recall/weread/books', '/api/recall/weread/book']);
});

it('imports an excerpt without inventing a question and cancels without modifying the library', async () => {
  await selectManual();
  fireEvent.change(screen.getByRole('combobox', { name: '第 1 条划线的卡片形式' }), { target: { value: 'excerpt' } });
  expect(screen.queryByRole('textbox', { name: '第 1 条划线的回忆提示' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '返回导入' }));
  expect(runtime.commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '下一步 · 手动预览' }));
  fireEvent.change(screen.getByRole('combobox', { name: '第 1 条划线的卡片形式' }), { target: { value: 'excerpt' } });
  fireEvent.click(screen.getByRole('button', { name: '检查导入变化' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
  expect(runtime.snapshot!.cards[0]).toMatchObject({ contentKind: 'excerpt', front: '', back: original });
});

it('skips duplicate originals and requires an explicit changed-content update while retaining IDs and review progress', async () => {
  const seededBook = { ...book, highlights: [{ ...book.highlights[0], question: 'Existing question' }] };
  const drafts = buildWereadDrafts(runtime.snapshot!, [seededBook], new Set([book.bookId]));
  runtime.snapshot = applyWereadImport(runtime.snapshot!, planWereadImport(runtime.snapshot!, drafts), new Set()).snapshot;
  const existing = runtime.snapshot.cards[0];
  existing.reps = 7;
  existing.nextReviewDate = '2026-12-01T00:00:00Z';
  await selectManual();
  expect((screen.getByRole('textbox', { name: '第 1 条划线的回忆提示' }) as HTMLTextAreaElement).value).toBe('Existing question');
  fireEvent.change(screen.getByRole('textbox', { name: '第 1 条划线的回忆提示' }), { target: { value: 'Manual revision' } });
  fireEvent.click(screen.getByRole('button', { name: '检查导入变化' }));
  const update = screen.getByRole('checkbox', { name: '明确更新这张卡片的内容与来源' });
  expect((update as HTMLInputElement).checked).toBe(false);
  fireEvent.click(update);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
  expect(runtime.snapshot!.cards[0]).toMatchObject({ id: existing.id, deckId: existing.deckId, front: 'Manual revision', back: original, reps: 7, nextReviewDate: existing.nextReviewDate, sourceRef: existing.sourceRef });
});

it('leaves an existing duplicate and all its scheduling fields untouched', async () => {
  const seededBook = { ...book, highlights: [{ ...book.highlights[0], question: 'Existing question' }] };
  const drafts = buildWereadDrafts(runtime.snapshot!, [seededBook], new Set([book.bookId]));
  runtime.snapshot = applyWereadImport(runtime.snapshot!, planWereadImport(runtime.snapshot!, drafts), new Set()).snapshot;
  runtime.snapshot.cards[0].reps = 9;
  const before = structuredClone(runtime.snapshot.cards[0]);
  await selectManual();
  fireEvent.click(screen.getByRole('button', { name: '检查导入变化' }));
  expect(screen.queryByRole('checkbox', { name: '明确更新这张卡片的内容与来源' })).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '确认导入' })); });
  expect(runtime.snapshot!.cards).toEqual([before]);
});

it('retains the individual and merge workflow when AI is available and still offers an explicit manual choice', async () => {
  await vi.waitFor(() => expect(useMiaodaWeread.getState().available).toBe(true));
  act(() => useMiaodaWeread.setState({ aiAvailable: true }));
  render(<MemoryWereadImport onClose={vi.fn()} onComplete={vi.fn()}/>);
  await screen.findByRole('button', { name: '连接微信读书' });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '连接微信读书' })); });
  fireEvent.click(screen.getByRole('button', { name: 'Synthetic book，1 条我的划线' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '下一步 · AI 问题与导入' })); });
  expect((screen.getByRole('radio', { name: /^逐条生成/ }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole('radio', { name: /^智能合并/ })).toBeDefined();
  fireEvent.click(screen.getByRole('radio', { name: /^手动问题/ }));
  expect(screen.queryByRole('button', { name: '生成并自动导入' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '下一步 · 手动预览' }));
  expect(runtime.commit).not.toHaveBeenCalled();
  expect(peer.mock.calls.map(call => call[0])).not.toContain('/api/recall/weread/question');
});

it('does not let unavailable AI draft storage disable online manual selection', async () => {
  runtime.loadMerge.mockRejectedValue(new Error('Synthetic draft storage failure'));
  await selectManual();
  expect(screen.getByRole('textbox', { name: '第 1 条划线的回忆提示' })).toBeDefined();
  expect(runtime.commit).not.toHaveBeenCalled();
  expect(runtime.saveJob).not.toHaveBeenCalled();
});

it('offers manual editing of a paused AI job without deleting or restarting the original draft', async () => {
  const drafts = buildWereadDrafts(runtime.snapshot!, [book], new Set([book.bookId]));
  const saved = { ...createWereadJob(runtime.snapshot!, drafts, new Set()), status: 'paused' as const };
  runtime.loadJob.mockResolvedValue(saved);
  await vi.waitFor(() => expect(useMiaodaWeread.getState().available).toBe(true));
  render(<MemoryWereadImport onClose={vi.fn()} onComplete={vi.fn()}/>);
  fireEvent.click(await screen.findByRole('button', { name: '手动整理本机划线草稿' }));
  expect(screen.getByRole('textbox', { name: '第 1 条划线的回忆提示' })).toBeDefined();
  expect(saved.drafts[0].highlight.markText).toBe(original);
  expect(runtime.saveJob).not.toHaveBeenCalled();
  expect(runtime.commit).not.toHaveBeenCalled();
  expect(peer.mock.calls.map(call => call[0])).toEqual(['/api/recall/weread/status']);
});

it('keeps a saved merge session intact and permits manual original-text editing when AI is unavailable', async () => {
  const drafts = buildWereadDrafts(runtime.snapshot!, [book], new Set([book.bookId]));
  const saved = createMergeSession(runtime.snapshot!, drafts);
  runtime.loadMerge.mockResolvedValue(saved);
  await vi.waitFor(() => expect(useMiaodaWeread.getState().available).toBe(true));
  render(<MemoryWereadImport onClose={vi.fn()} onComplete={vi.fn()}/>);
  const generate = await screen.findByRole('button', { name: '生成分组与问题' });
  expect((generate as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '手动整理原划线' }));
  expect(screen.getByRole('textbox', { name: '第 1 条划线的回忆提示' })).toBeDefined();
  expect(saved.sources[0].highlight.markText).toBe(original);
  expect(runtime.commit).not.toHaveBeenCalled();
  expect(runtime.saveJob).not.toHaveBeenCalled();
  expect(peer.mock.calls.map(call => call[0])).toEqual(['/api/recall/weread/status']);
});
