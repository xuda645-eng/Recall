import { parseWereadExport, type WereadBook } from '@/lib/memory-weread';
import { validateQuestion } from '../../shared/weread-ai';
import { validateMergeBatch, validateMergeGroups, wereadRangeStart } from '../../shared/weread-merge';
import type { MergeBatch, MergeGroup } from '../../shared/weread-merge';

export type WereadOnlineHighlight = WereadBook['highlights'][number] & { chapterIdx?: number; range?: string };
export type WereadOnlineLoadedBook = Omit<WereadBook, 'highlights'> & { highlights: WereadOnlineHighlight[] };

export interface WereadOnlineBook {
  bookId: string;
  title: string;
  author?: string;
  highlightCount: number;
  cover?: string | null;
  markedFinished?: boolean | null;
  thoughtsCount?: number | null;
  bookmarkCount?: number | null;
  totalNoteCount?: number | null;
  lastNoteAt?: string | null;
  readingProgress?: number | null;
}

function onlineRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlineCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function onlineCover(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\//i.test(value) || /[\s\\<>]/.test(value)
    || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function onlineDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

async function request(path: 'books' | 'book' | 'progress' | 'question' | 'merge', input: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/weread/${path}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(response.status === 401 ? '请先在“设置与数据 > 云同步”授权当前设备，再连接微信读书'
      : response.status === 429 ? '已达到在线调用上限，请稍后重试或手动出题'
        : response.status === 503 ? '在线连接尚未配置或需要维护，请使用本地文件导入'
          : '在线服务超时或响应无效，请重试；已有草稿不会自动导入');
  }
  return response.json();
}

export async function loadOnlineBooks(cursor: number | null, signal: AbortSignal): Promise<{ books: WereadOnlineBook[]; cursor: number | null }> {
  const value = await request('books', cursor === null ? {} : { cursor }, signal);
  if (!onlineRecord(value) || !Array.isArray(value.books) || value.books.length > 200 || (value.cursor !== null && onlineCount(value.cursor) === null)) throw new Error('在线书籍列表无效');
  const books = value.books.map(book => {
    if (!onlineRecord(book)) throw new Error('在线书籍列表无效');
    const validated = parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ bookId: book.bookId, title: book.title, ...(book.author === undefined ? {} : { author: book.author }), highlights: [] }] })).books[0];
    const highlightCount = onlineCount(book.highlightCount);
    if (highlightCount === null) throw new Error('在线划线数量无效');
    const thoughtsCount = onlineCount(book.thoughtsCount), bookmarkCount = onlineCount(book.bookmarkCount);
    const total = thoughtsCount === null || bookmarkCount === null ? null : onlineCount(highlightCount + thoughtsCount + bookmarkCount);
    const totalNoteCount = total !== null && onlineCount(book.totalNoteCount) === total ? total : null;
    return { bookId: validated.bookId, title: validated.title, author: validated.author, highlightCount,
      cover: onlineCover(book.cover), markedFinished: typeof book.markedFinished === 'boolean' ? book.markedFinished : null,
      thoughtsCount, bookmarkCount, totalNoteCount, lastNoteAt: onlineDate(book.lastNoteAt), readingProgress: null };
  });
  return { books, cursor: value.cursor as number | null };
}

export async function loadOnlineProgress(bookId: string, signal: AbortSignal): Promise<number | null> {
  const value = await request('progress', { bookId }, signal);
  if (!onlineRecord(value) || value.bookId !== bookId) throw new Error('在线阅读进度来源不一致');
  const progress = onlineCount(value.readingProgress);
  return progress !== null && progress <= 100 ? progress : null;
}

export async function loadOnlineBook(bookId: string, signal: AbortSignal): Promise<WereadOnlineLoadedBook> {
  const value = await request('book', { bookId }, signal);
  if (!onlineRecord(value) || !Array.isArray(value.books) || value.books.length !== 1
    || !onlineRecord(value.books[0]) || !Array.isArray(value.books[0].highlights)) throw new Error('在线书籍来源不一致');
  const metadata = value.books[0].highlights.map(highlight => {
    if (!onlineRecord(highlight)) throw new Error('在线划线无效');
    const { chapterIdx, range, ...original } = highlight;
    return { original, chapterIdx: onlineCount(chapterIdx), range: wereadRangeStart(range) === null ? undefined : range as string };
  });
  const result = parseWereadExport(JSON.stringify({ ...value, books: [{ ...value.books[0], highlights: metadata.map(highlight => highlight.original) }] }));
  if (result.books.length !== 1 || result.books[0].bookId !== bookId) throw new Error('在线书籍来源不一致');
  return { ...result.books[0], highlights: result.books[0].highlights.map((highlight, index) => {
    const { chapterIdx: _chapterIdx, range: _range, ...original } = highlight as WereadOnlineHighlight;
    return { ...original,
      ...(metadata[index].chapterIdx === null ? {} : { chapterIdx: metadata[index].chapterIdx as number }),
      ...(metadata[index].range === undefined ? {} : { range: metadata[index].range }),
    };
  }) };
}

export async function generateWereadQuestion(markText: string, summary: boolean, signal: AbortSignal): Promise<{ question: string; summary: string | null }> {
  const value = await request('question', { markText, summary }, signal) as Record<string, unknown>;
  return validateQuestion({ question: value.question, summary: value.summary }, summary);
}

export async function generateWereadMerge(batch: MergeBatch, signal: AbortSignal): Promise<MergeGroup[]> {
  const input = validateMergeBatch(batch), value = await request('merge', input, signal);
  if (!onlineRecord(value) || Object.keys(value).some(key => !['cards', 'cached'].includes(key))
    || (Object.hasOwn(value, 'cached') && typeof value.cached !== 'boolean')) throw new Error('Invalid merge response');
  return validateMergeGroups({ cards: value.cards }, input);
}
