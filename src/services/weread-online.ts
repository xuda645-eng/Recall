import { parseWereadExport, type WereadBook } from '@/lib/memory-weread';
import { validateQuestion } from '../../shared/weread-ai';

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

async function request(path: 'books' | 'book' | 'progress' | 'question', input: unknown, signal: AbortSignal): Promise<unknown> {
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

export async function loadOnlineBook(bookId: string, signal: AbortSignal): Promise<WereadBook> {
  const result = parseWereadExport(JSON.stringify(await request('book', { bookId }, signal)));
  if (result.books.length !== 1 || result.books[0].bookId !== bookId) throw new Error('在线书籍来源不一致');
  return result.books[0];
}

export async function generateWereadQuestion(markText: string, summary: boolean, signal: AbortSignal): Promise<{ question: string; summary: string | null }> {
  const value = await request('question', { markText, summary }, signal) as Record<string, unknown>;
  return validateQuestion({ question: value.question, summary: value.summary }, summary);
}
