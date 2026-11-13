import { ApiError, isRecord, sha256 } from '../shared/server';
import { parseWereadHighlights, parseWereadNotebooks, parseWereadProgress, requestWereadGateway, requestWereadUpstream } from '../shared/weread-gateway';
import { AI_DAILY_MODEL_ATTEMPTS, AI_MAX_CHARS, QUESTION_VERSION, arkResponsesUrl, parseQuestionResponse, questionRequest, validateQuestion } from '../shared/weread-ai';
import { MERGE_VERSION, mergeRequest, parseMergeResponse, validateMergeBatch, validateMergeGroups } from '../shared/weread-merge';
import type { WereadOperation } from '../shared/weread-api';

export interface WereadCredentials {
  WEREAD_API_KEY?: string;
  ARK_API_KEY?: string;
  ARK_ENDPOINT_ID?: string;
  ARK_BASE_URL?: string;
}
export interface WereadRepository {
  connected(owner: string): Promise<boolean>;
  take(owner: string, bucket: string, window: number, maximum: number): Promise<boolean>;
  attempts(owner: string, bucket: string, window: number): Promise<number>;
  cached(owner: string, hash: string, now: number): Promise<string | null>;
  cache(owner: string, hash: string, value: string, expires: number): Promise<void>;
}
export { WEREAD_OPERATIONS, type WereadOperation } from '../shared/weread-api';

export class WereadEngine {
  constructor(private readonly repository: WereadRepository, private readonly credentials: () => WereadCredentials,
    private readonly transport: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  private model(config: WereadCredentials): { url: string; key: string; endpoint: string } | null {
    if (!config.ARK_API_KEY || !config.ARK_ENDPOINT_ID || !config.ARK_BASE_URL) return null;
    try { return { url: arkResponsesUrl(config.ARK_BASE_URL), key: config.ARK_API_KEY, endpoint: config.ARK_ENDPOINT_ID }; }
    catch { return null; }
  }
  async status(owner: string) {
    const config = this.credentials();
    const available = Boolean(config.WEREAD_API_KEY) && await this.repository.connected(owner);
    return { available, aiAvailable: available && Boolean(this.model(config)) };
  }
  private async limit(owner: string, bucket: string, maximum: number, duration: number): Promise<void> {
    const window = Math.floor(this.now() / duration) * duration;
    if (!await this.repository.take(owner, bucket, window, maximum)) throw new ApiError(429, '已达到在线调用上限，请稍后重试或手动出题');
  }
  async call(owner: string, operation: WereadOperation, input: unknown): Promise<unknown> {
    if (!/^\d{1,64}$/.test(owner)) throw new ApiError(401, 'Authentication required');
    const config = this.credentials();
    if (!await this.repository.connected(owner)) throw new ApiError(403, '此账号未连接微信读书');
    if (!config.WEREAD_API_KEY) throw new ApiError(503, '微信读书连接尚未配置');
    if (!isRecord(input) || new TextEncoder().encode(JSON.stringify(input)).byteLength > 64000) throw new ApiError(400, 'Invalid request');
    if (operation === 'books') {
      if (Object.keys(input).some(key => key !== 'cursor') || (input.cursor !== undefined
        && (!Number.isSafeInteger(input.cursor) || (input.cursor as number) < 0))) throw new ApiError(400, 'Invalid cursor');
      await this.limit(owner, 'weread', 120, 3600000);
      return parseWereadNotebooks(await requestWereadGateway(config.WEREAD_API_KEY, '/user/notebooks',
        { count: 20, ...(input.cursor === undefined ? {} : { lastSort: input.cursor }) }, this.transport), input.cursor as number | undefined);
    }
    if (operation === 'book' || operation === 'progress') {
      if (Object.keys(input).join(',') !== 'bookId' || typeof input.bookId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(input.bookId)) throw new ApiError(400, 'Invalid book');
      await this.limit(owner, 'weread', 120, 3600000);
      const value = await requestWereadGateway(config.WEREAD_API_KEY, operation === 'book' ? '/book/bookmarklist' : '/book/getprogress', { bookId: input.bookId }, this.transport);
      return operation === 'book' ? parseWereadHighlights(value, input.bookId) : parseWereadProgress(value, input.bookId);
    }
    const model = this.model(config);
    if (!model) throw new ApiError(503, 'AI 连接尚未配置');
    if (operation === 'budget') {
      if (Object.keys(input).length) throw new ApiError(400, 'Invalid request');
      const attempts = await this.repository.attempts(owner, 'ai-model', Math.floor(this.now() / 86400000) * 86400000);
      if (!Number.isSafeInteger(attempts) || attempts < 0) throw new ApiError(503, 'Service unavailable');
      return { remaining: Math.max(0, AI_DAILY_MODEL_ATTEMPTS - attempts) };
    }
    let body: unknown, cacheInput: unknown, validate: (value: unknown) => unknown, parse: (value: unknown) => unknown;
    if (operation === 'question') {
      if (Object.keys(input).some(key => !['markText', 'summary'].includes(key)) || typeof input.markText !== 'string'
        || !input.markText.trim() || input.markText.length > AI_MAX_CHARS || typeof input.summary !== 'boolean') throw new ApiError(400, 'AI 单条支持 1-6000 字原文，请缩小划线或手动出题');
      const summary = input.summary;
      body = questionRequest(model.endpoint, input.markText, summary);
      cacheInput = [QUESTION_VERSION, model.endpoint, input.markText, summary];
      validate = value => validateQuestion(value, summary);
      parse = value => parseQuestionResponse(value, summary);
    } else if (operation === 'merge') {
      let batch;
      try { batch = validateMergeBatch(input); } catch { throw new ApiError(400, 'Invalid merge batch'); }
      body = mergeRequest(model.endpoint, batch);
      cacheInput = ['/api/weread/merge', MERGE_VERSION, model.endpoint, batch];
      validate = value => ({ cards: validateMergeGroups({ cards: value }, batch) });
      parse = value => ({ cards: parseMergeResponse(value, batch) });
    } else throw new ApiError(404, 'Unknown operation');
    await this.limit(owner, 'ai-request', 120, 3600000);
    const hash = await sha256(JSON.stringify(cacheInput));
    const cached = await this.repository.cached(owner, hash, this.now());
    if (cached) {
      let validated: unknown;
      try { validated = validate(JSON.parse(cached)); } catch { validated = null; }
      if (isRecord(validated)) return { ...validated, cached: true };
    }
    await this.limit(owner, 'ai-model', AI_DAILY_MODEL_ATTEMPTS, 86400000);
    const response = await requestWereadUpstream(model.url, model.key, body, this.transport, 503);
    let result: unknown;
    try { result = parse(response); } catch { throw new ApiError(502, 'AI 输出未通过检查，请重试或手动出题'); }
    const cacheValue = operation === 'merge' ? (result as { cards: unknown }).cards : result;
    await this.repository.cache(owner, hash, JSON.stringify(cacheValue), this.now() + 7 * 86400000);
    return { ...(result as Record<string, unknown>), cached: false };
  }
}

export { ApiError as WereadError };
