import { ApiError, isRecord, json, readJson, sha256 } from './server';
import type { ServerEnv } from './server';
import type { AuthenticatedDevice } from './server-auth';
import { AI_MAX_CHARS, QUESTION_VERSION, arkResponsesUrl, parseQuestionResponse, questionRequest, validateQuestion } from './weread-ai';

async function limit(env: ServerEnv, space: string, bucket: string, maximum: number, duration: number): Promise<void> {
  const now = Date.now(), window = Math.floor(now / duration) * duration;
  const results = await env.DB.batch<{ attempts: number }>([
    env.DB.prepare('DELETE FROM import_request_limits WHERE space_id = ? AND bucket = ? AND window_start < ?').bind(space, bucket, window),
    env.DB.prepare(`INSERT INTO import_request_limits (space_id, bucket, window_start, attempts) VALUES (?, ?, ?, 1)
      ON CONFLICT (space_id, bucket, window_start) DO UPDATE SET attempts = attempts + 1 WHERE attempts < ?
      RETURNING attempts`).bind(space, bucket, window, maximum),
  ]);
  if (!results[1].results.length) throw new ApiError(429, '已达到在线调用上限，请稍后重试或使用手动问题');
}

async function upstream(url: string, key: string, body: unknown): Promise<unknown> {
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(45000), redirect: 'manual',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError(502, '上游服务暂不可用，请稍后重试');
    }
    return await readJson(new Request('https://response.invalid', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: response.body, duplex: 'half',
    } as RequestInit), 5 * 1024 * 1024);
  } catch (error) {
    if (error instanceof ApiError && error.status === 502) throw error;
    throw new ApiError(502, '在线服务超时或响应无效，请稍后重试');
  }
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[<>]/.test(value)
    || Array.from(value).some(character => character.charCodeAt(0) < 32)) {
    throw new ApiError(502, '微信读书返回的书籍信息无效');
  }
  return value;
}

async function gateway(env: ServerEnv, name: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!env.WEREAD_API_KEY) throw new ApiError(503, '微信读书连接尚未配置');
  const value = await upstream('https://i.weread.qq.com/api/agent/gateway', env.WEREAD_API_KEY,
    { api_name: name, skill_version: '1.0.5', ...params });
  if (!isRecord(value)) throw new ApiError(502, '微信读书响应无效');
  if (value.upgrade_info) throw new ApiError(503, '微信读书接口需要更新，请联系维护者');
  if (value.errcode !== undefined && value.errcode !== 0) throw new ApiError(502, '微信读书连接失效或服务暂不可用');
  return value;
}

export async function wereadBooks(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const input = await readJson(request, 1024);
  if (!isRecord(input) || Object.keys(input).some(key => key !== 'cursor')
    || (input.cursor !== undefined && (!Number.isSafeInteger(input.cursor) || (input.cursor as number) < 0))) throw new ApiError(400, 'Invalid request');
  await limit(env, auth.session.spaceId, 'weread', 120, 3600000);
  const value = await gateway(env, '/user/notebooks', { count: 20, ...(input.cursor === undefined ? {} : { lastSort: input.cursor }) });
  if (!Array.isArray(value.books) || value.books.length > 200) throw new ApiError(502, '微信读书列表无效');
  const books = value.books.map(item => {
    if (!isRecord(item) || !isRecord(item.book) || !Number.isSafeInteger(item.noteCount) || (item.noteCount as number) < 0) throw new ApiError(502, '微信读书列表无效');
    return { bookId: text(item.bookId, 200), title: text(item.book.title, 80), author: typeof item.book.author === 'string' ? text(item.book.author || '作者未提供', 200) : '', highlightCount: item.noteCount };
  });
  const last = value.books.at(-1);
  const cursor = value.hasMore === 1 || value.hasMore === true ? isRecord(last) ? last.sort : undefined : null;
  if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor === input.cursor)) throw new ApiError(502, '微信读书分页无效');
  return json({ books, cursor });
}

export async function wereadBook(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const input = await readJson(request, 1024);
  if (!isRecord(input) || Object.keys(input).join(',') !== 'bookId' || typeof input.bookId !== 'string'
    || !/^[A-Za-z0-9_-]{1,200}$/.test(input.bookId)) throw new ApiError(400, 'Invalid request');
  await limit(env, auth.session.spaceId, 'weread', 120, 3600000);
  const value = await gateway(env, '/book/bookmarklist', { bookId: input.bookId });
  if (!Array.isArray(value.updated) || value.updated.length > 1000 || !Array.isArray(value.chapters) || !isRecord(value.book)) throw new ApiError(502, '划线超过限制或响应无效，请使用分批文件导入');
  const chapters = new Map(value.chapters.filter(isRecord).map(chapter => [String(chapter.chapterUid), chapter.title]));
  const seen = new Set<string>();
  const highlights = value.updated.filter(item => isRecord(item) && item.type === 1).map(item => {
    if (!isRecord(item) || typeof item.markText !== 'string' || !item.markText.trim() || item.markText.length > 20000
      || (item.bookId !== undefined && String(item.bookId) !== input.bookId)) throw new ApiError(502, '微信读书划线无效');
    const bookmarkId = text(item.bookmarkId, 200);
    if (seen.has(bookmarkId)) throw new ApiError(502, '微信读书返回重复划线');
    seen.add(bookmarkId);
    const chapterUid = item.chapterUid === undefined ? undefined : String(item.chapterUid);
    const chapterTitle = chapterUid === undefined ? undefined : chapters.get(chapterUid);
    return { bookmarkId, markText: item.markText, ...(chapterUid === undefined ? {} : { chapterUid: text(chapterUid, 200) }),
      ...(chapterTitle === undefined ? {} : { chapterTitle: text(chapterTitle, 200) }) };
  });
  return json({ format: 'recall-weread-export-v1', books: [{ bookId: input.bookId, title: text(value.book.title, 80),
    author: typeof value.book.author === 'string' ? value.book.author.slice(0, 200) : '', highlights }] });
}

export async function wereadQuestion(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const input = await readJson(request, 30000);
  if (!isRecord(input) || Object.keys(input).some(key => !['markText', 'summary'].includes(key))
    || typeof input.markText !== 'string' || !input.markText.trim() || input.markText.length > AI_MAX_CHARS
    || typeof input.summary !== 'boolean') throw new ApiError(400, 'AI 单条支持 1-6000 字原文，请缩小划线或手动出题');
  if (!env.ARK_API_KEY || !env.ARK_ENDPOINT_ID || !env.ARK_BASE_URL) throw new ApiError(503, 'AI 连接尚未配置');
  let url: string;
  try { url = arkResponsesUrl(env.ARK_BASE_URL); } catch { throw new ApiError(503, 'AI 连接配置无效'); }
  const space = auth.session.spaceId;
  await limit(env, space, 'ai-request', 120, 3600000);
  const hash = await sha256(JSON.stringify([QUESTION_VERSION, env.ARK_ENDPOINT_ID, input.markText, input.summary]));
  const old = await env.DB.prepare('SELECT value_json FROM import_question_cache WHERE space_id = ? AND content_hash = ? AND expires_at > ?')
    .bind(space, hash, Date.now()).first<{ value_json: string }>();
  if (old) {
    try { return json({ ...validateQuestion(JSON.parse(old.value_json), input.summary), cached: true }); } catch { /* Regenerate invalid cached output. */ }
  }
  await limit(env, space, 'ai-model', 100, 86400000);
  const response = await upstream(url, env.ARK_API_KEY, questionRequest(env.ARK_ENDPOINT_ID, input.markText, input.summary));
  let result: { question: string; summary: string | null };
  try { result = parseQuestionResponse(response, input.summary); } catch { throw new ApiError(502, 'AI 输出未通过检查，请重试或手动出题'); }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM import_question_cache WHERE space_id = ? AND expires_at <= ?').bind(space, Date.now()),
    env.DB.prepare(`INSERT INTO import_question_cache (space_id, content_hash, value_json, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (space_id, content_hash) DO UPDATE SET value_json = excluded.value_json, expires_at = excluded.expires_at`)
      .bind(space, hash, JSON.stringify(result), Date.now() + 7 * 86400000),
  ]);
  return json({ ...result, cached: false });
}
