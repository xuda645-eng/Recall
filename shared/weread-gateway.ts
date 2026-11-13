import { ApiError, isRecord, readJson } from './server';
import { wereadRangeStart } from './weread-merge';

export async function requestWereadUpstream(url: string, key: string, body: unknown, transport: typeof fetch = fetch, credentialStatus = 502): Promise<unknown> {
  try {
    const response = await transport(url, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(45000), redirect: 'manual',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError([401, 403].includes(response.status) ? credentialStatus : 502, '上游服务暂不可用，请稍后重试');
    }
    return await readJson(new Request('https://response.invalid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: response.body, duplex: 'half',
    } as RequestInit), 5 * 1024 * 1024);
  } catch (error) {
    if (error instanceof ApiError && [502, credentialStatus].includes(error.status)) throw error;
    throw new ApiError(502, '在线服务超时或响应无效，请稍后重试');
  }
}

export async function requestWereadGateway(key: string | undefined, name: string, params: Record<string, unknown>, transport?: typeof fetch): Promise<Record<string, unknown>> {
  if (!key) throw new ApiError(503, '微信读书连接尚未配置');
  const value = await requestWereadUpstream('https://i.weread.qq.com/api/agent/gateway', key,
    { api_name: name, skill_version: '1.0.5', ...params }, transport);
  if (!isRecord(value)) throw new ApiError(502, '微信读书响应无效');
  if (value.upgrade_info) throw new ApiError(503, '微信读书接口需要更新，请联系维护者');
  if (value.errcode !== undefined && value.errcode !== 0) throw new ApiError(502, '微信读书连接失效或服务暂不可用');
  return value;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[<>]/.test(value)
    || Array.from(value).some(character => character.charCodeAt(0) < 32)) throw new ApiError(502, '微信读书返回的书籍信息无效');
  return value;
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function cover(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\//i.test(value) || /[\s\\<>]/.test(value)
    || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function date(value: unknown): string | null {
  const seconds = count(value);
  return seconds === null || seconds > 253402300799 ? null : new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function parseWereadNotebooks(value: Record<string, unknown>, previousCursor?: number) {
  if (!Array.isArray(value.books) || value.books.length > 200) throw new ApiError(502, '微信读书列表无效');
  const books = value.books.map(item => {
    if (!isRecord(item) || !isRecord(item.book) || count(item.noteCount) === null) throw new ApiError(502, '微信读书列表无效');
    const highlightCount = item.noteCount as number;
    const thoughtsCount = count(item.reviewCount), bookmarkCount = count(item.bookmarkCount);
    const totalNoteCount = thoughtsCount === null || bookmarkCount === null ? null : count(highlightCount + thoughtsCount + bookmarkCount);
    return { bookId: text(item.bookId, 200), title: text(item.book.title, 80), author: typeof item.book.author === 'string' ? text(item.book.author || '作者未提供', 200) : '',
      highlightCount, cover: cover(item.book.cover), markedFinished: item.markedStatus === 1 ? true : item.markedStatus === 0 ? false : null,
      thoughtsCount, bookmarkCount, totalNoteCount, lastNoteAt: date(item.sort), readingProgress: null };
  });
  const last = value.books.at(-1);
  const cursor = value.hasMore === 1 || value.hasMore === true ? isRecord(last) ? last.sort : undefined : null;
  if (cursor !== null && (count(cursor) === null || cursor === previousCursor)) throw new ApiError(502, '微信读书分页无效');
  return { books, cursor: cursor as number | null };
}

export function parseWereadProgress(value: Record<string, unknown>, bookId: string) {
  if (value.bookId !== undefined && value.bookId !== bookId) throw new ApiError(502, '微信读书进度来源不一致');
  const progress = isRecord(value.book) ? count(value.book.progress) : null;
  return { bookId, readingProgress: progress !== null && progress <= 100 ? progress : null };
}

export function parseWereadHighlights(value: Record<string, unknown>, bookId: string) {
  if (!Array.isArray(value.updated) || value.updated.length > 1000 || !Array.isArray(value.chapters) || !isRecord(value.book)) {
    throw new ApiError(502, '划线超过限制或响应无效，请使用分批文件导入');
  }
  const chapters = new Map<string, Record<string, unknown>>(), ambiguous = new Set<string>();
  for (const chapter of value.chapters.filter(isRecord)) {
    if (typeof chapter.chapterUid !== 'string' && count(chapter.chapterUid) === null) continue;
    const uid = String(chapter.chapterUid);
    if (chapters.has(uid)) ambiguous.add(uid);
    chapters.set(uid, chapter);
  }
  const seen = new Set<string>();
  const highlights = value.updated.filter(item => isRecord(item) && item.type === 1).map(item => {
    if (!isRecord(item) || typeof item.markText !== 'string' || !item.markText.trim() || item.markText.length > 20000
      || (item.bookId !== undefined && String(item.bookId) !== bookId)) throw new ApiError(502, '微信读书划线无效');
    const bookmarkId = text(item.bookmarkId, 200);
    if (seen.has(bookmarkId)) throw new ApiError(502, '微信读书返回重复划线');
    seen.add(bookmarkId);
    const chapterUid = item.chapterUid === undefined ? undefined : String(item.chapterUid);
    const chapter = chapterUid === undefined ? undefined : chapters.get(chapterUid);
    const chapterTitle = chapter?.title;
    const chapterIdx = chapterUid !== undefined && !ambiguous.has(chapterUid) ? count(chapter?.chapterIdx) : null;
    const range = wereadRangeStart(item.range) === null ? undefined : item.range as string;
    return { bookmarkId, markText: item.markText, ...(chapterUid === undefined ? {} : { chapterUid: text(chapterUid, 200) }),
      ...(chapterTitle === undefined ? {} : { chapterTitle: text(chapterTitle, 200) }),
      ...(chapterIdx === null ? {} : { chapterIdx }), ...(range === undefined ? {} : { range }) };
  });
  return { format: 'recall-weread-export-v1', books: [{ bookId, title: text(value.book.title, 80),
    author: typeof value.book.author === 'string' ? value.book.author.slice(0, 200) : '', highlights }] };
}
