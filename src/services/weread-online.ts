import { parseWereadExport, type WereadBook } from '@/lib/memory-weread';
import { validateQuestion } from '../../shared/weread-ai';

export interface WereadOnlineBook {
  bookId: string;
  title: string;
  author?: string;
  highlightCount: number;
}

async function request(path: 'books' | 'book' | 'question', input: unknown, signal: AbortSignal): Promise<unknown> {
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
  const value = await request('books', cursor === null ? {} : { cursor }, signal) as { books?: WereadOnlineBook[]; cursor?: unknown };
  if (!Array.isArray(value.books) || value.books.length > 200 || (value.cursor !== null && !Number.isSafeInteger(value.cursor))) throw new Error('在线书籍列表无效');
  const books = value.books.map(book => {
    const validated = parseWereadExport(JSON.stringify({ format: 'recall-weread-export-v1', books: [{ bookId: book.bookId, title: book.title, ...(book.author === undefined ? {} : { author: book.author }), highlights: [] }] })).books[0];
    if (!Number.isSafeInteger(book.highlightCount) || book.highlightCount < 0) throw new Error('在线划线数量无效');
    return { bookId: validated.bookId, title: validated.title, author: validated.author, highlightCount: book.highlightCount };
  });
  return { books, cursor: value.cursor as number | null };
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
