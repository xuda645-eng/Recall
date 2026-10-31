import { ApiError, isRecord, json, readJson } from './server';
import type { ServerEnv } from './server';
import type { AuthenticatedDevice } from './server-auth';
import { arkResponsesUrl } from './weread-ai';

export async function wereadBudget(request: Request, env: ServerEnv, auth: AuthenticatedDevice): Promise<Response> {
  const input = await readJson(request, 1024);
  if (!isRecord(input) || Object.keys(input).length) throw new ApiError(400, 'Invalid request');
  if (!env.ARK_API_KEY || !env.ARK_ENDPOINT_ID || !env.ARK_BASE_URL) throw new ApiError(503, 'AI 连接尚未配置');
  try { arkResponsesUrl(env.ARK_BASE_URL); } catch { throw new ApiError(503, 'AI 连接配置无效'); }
  const start = Math.floor(Date.now() / 86400000) * 86400000;
  const count = await env.DB.prepare('SELECT attempts FROM import_request_limits WHERE space_id = ? AND bucket = ? AND window_start = ?')
    .bind(auth.session.spaceId, 'ai-model', start).first<{ attempts: unknown }>();
  const attempts = count === null ? 0 : count.attempts;
  if (typeof attempts !== 'number' || !Number.isSafeInteger(attempts) || attempts < 0) throw new ApiError(503, 'Service unavailable');
  return json({ remaining: Math.max(0, 100 - attempts) });
}
