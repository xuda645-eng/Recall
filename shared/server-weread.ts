import { ApiError, isRecord, json, readJson, sha256 } from './server';
import type { ServerEnv } from './server';
import type { AuthenticatedDevice } from './server-auth';
import { AI_DAILY_MODEL_ATTEMPTS, AI_MAX_CHARS, QUESTION_VERSION, arkResponsesUrl, parseQuestionResponse, questionRequest, validateQuestion } from './weread-ai';
import { MERGE_VERSION, mergeRequest, parseMergeResponse, validateMergeBatch, validateMergeGroups } from './weread-merge';
import type { MergeBatch, MergeGroup } from './weread-merge';
import { parseWereadHighlights, parseWereadNotebooks, parseWereadProgress, requestWereadGateway, requestWereadUpstream as upstream } from './weread-gateway';

async function limit(env: ServerEnv, space: string, bucket: string, maximum: number, duration: number): Promise<void> {
  const now = Date.now(), window = Math.floor(now / duration) * duration;
  const results = await env.DB.batch<{ attempts: number }>([
    env.DB.prepare('DELETE FROM import_request_limits WHERE space_id = ? AND bucket = ? AND window_start < ?').bind(space, bucket, window),
    env.DB.prepare(`INSERT INTO import_request_limits (space_id, bucket, window_start, attempts) VALUES (?, ?, ?, 1)
      ON CONFLICT (space_id, bucket, window_start) DO UPDATE SET attempts = import_request_limits.attempts + 1 WHERE import_request_limits.attempts < ?
      RETURNING attempts`).bind(space, bucket, window, maximum),
  ]);
  if (!results[1].results.length) throw new ApiError(429, '已达到在线调用上限，请稍后重试或使用手动问题');
}

async function gateway(env: ServerEnv, name: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  return requestWereadGateway(env.WEREAD_API_KEY, name, params);
}

export async function wereadBooks(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const input = await readJson(request, 1024);
  if (!isRecord(input) || Object.keys(input).some(key => key !== 'cursor')
    || (input.cursor !== undefined && (!Number.isSafeInteger(input.cursor) || (input.cursor as number) < 0))) throw new ApiError(400, 'Invalid request');
  await limit(env, auth.session.spaceId, 'weread', 120, 3600000);
  const value = await gateway(env, '/user/notebooks', { count: 20, ...(input.cursor === undefined ? {} : { lastSort: input.cursor }) });
  return json(parseWereadNotebooks(value, input.cursor as number | undefined));
}

export async function wereadProgress(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const input = await readJson(request, 1024);
  if (!isRecord(input) || Object.keys(input).join(',') !== 'bookId' || typeof input.bookId !== 'string'
    || !/^[A-Za-z0-9_-]{1,200}$/.test(input.bookId)) throw new ApiError(400, 'Invalid request');
  await limit(env, auth.session.spaceId, 'weread', 120, 3600000);
  const value = await gateway(env, '/book/getprogress', { bookId: input.bookId });
  return json(parseWereadProgress(value, input.bookId));
}

export async function wereadBook(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const input = await readJson(request, 1024);
  if (!isRecord(input) || Object.keys(input).join(',') !== 'bookId' || typeof input.bookId !== 'string'
    || !/^[A-Za-z0-9_-]{1,200}$/.test(input.bookId)) throw new ApiError(400, 'Invalid request');
  await limit(env, auth.session.spaceId, 'weread', 120, 3600000);
  const value = await gateway(env, '/book/bookmarklist', { bookId: input.bookId });
  return json(parseWereadHighlights(value, input.bookId));
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
  await limit(env, space, 'ai-model', AI_DAILY_MODEL_ATTEMPTS, 86400000);
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

export async function wereadMerge(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const value = await readJson(request, 64000);
  let input: MergeBatch;
  try { input = validateMergeBatch(value); } catch { throw new ApiError(400, 'Invalid merge batch'); }
  if (!env.ARK_API_KEY || !env.ARK_ENDPOINT_ID || !env.ARK_BASE_URL) throw new ApiError(503, 'AI 连接尚未配置');
  let url: string;
  try { url = arkResponsesUrl(env.ARK_BASE_URL); } catch { throw new ApiError(503, 'AI 连接配置无效'); }
  const space = auth.session.spaceId;
  await limit(env, space, 'ai-request', 120, 3600000);
  const hash = await sha256(JSON.stringify(['/api/weread/merge', MERGE_VERSION, env.ARK_ENDPOINT_ID, input]));
  const old = await env.DB.prepare('SELECT value_json FROM import_question_cache WHERE space_id = ? AND content_hash = ? AND expires_at > ?')
    .bind(space, hash, Date.now()).first<{ value_json: string }>();
  if (old) {
    try { return json({ cards: validateMergeGroups(JSON.parse(old.value_json), input), cached: true }); } catch { /* Regenerate invalid cached output. */ }
  }
  await limit(env, space, 'ai-model', AI_DAILY_MODEL_ATTEMPTS, 86400000);
  const response = await upstream(url, env.ARK_API_KEY, mergeRequest(env.ARK_ENDPOINT_ID, input));
  let cards: MergeGroup[];
  try { cards = parseMergeResponse(response, input); } catch { throw new ApiError(502, 'AI 输出未通过检查，请重试或手动出题'); }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM import_question_cache WHERE space_id = ? AND expires_at <= ?').bind(space, Date.now()),
    env.DB.prepare(`INSERT INTO import_question_cache (space_id, content_hash, value_json, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (space_id, content_hash) DO UPDATE SET value_json = excluded.value_json, expires_at = excluded.expires_at`)
      .bind(space, hash, JSON.stringify({ cards }), Date.now() + 7 * 86400000),
  ]);
  return json({ cards, cached: false });
}
