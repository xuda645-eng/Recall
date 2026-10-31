export interface D1Result<Row = Record<string, unknown>> {
  success: boolean;
  results: Row[];
  meta: { changes?: number };
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<Row = Record<string, unknown>>(): Promise<Row | null>;
  all<Row = Record<string, unknown>>(): Promise<D1Result<Row>>;
  run<Row = Record<string, unknown>>(): Promise<D1Result<Row>>;
}

export interface RecallDatabase {
  prepare(query: string): D1Statement;
  batch<Row = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<Row>[]>;
}

export interface ServerEnv {
  DB: RecallDatabase;
  RECALL_BOOTSTRAP_CODE?: string;
  RECALL_SPACE_ID?: string;
}

export interface ServerContext {
  request: Request;
  env: ServerEnv;
}

export const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
export const COOKIE_NAME = 'recall_device';
export const COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60;
export const ROTATION_INTERVAL = 30 * 24 * 60 * 60 * 1000;
export const ROTATION_GRACE = 2 * 60 * 1000;
export const LAST_SEEN_INTERVAL = 24 * 60 * 60 * 1000;
export const CODE_LIFETIME = 15 * 60 * 1000;
export const PAIR_WINDOW = 15 * 60 * 1000;
export const PAIR_ATTEMPTS = 10;

export class ApiError extends Error {
  constructor(public status: number, message: string, public revision?: number) {
    super(message);
  }
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function requireOrigin(request: Request): void {
  const url = new URL(request.url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    || request.headers.get('Origin') !== url.origin) {
    throw new ApiError(403, 'Forbidden');
  }
}

export async function readJson(request: Request, limit = MAX_PAYLOAD_BYTES, allowEmpty = false): Promise<unknown> {
  const jsonType = /^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '');
  if (!jsonType && !allowEmpty) {
    throw new ApiError(415, 'Unsupported media type');
  }
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    throw new ApiError(413, 'Payload too large');
  }
  if (!request.body) {
    if (allowEmpty) return {};
    throw new ApiError(400, 'Invalid request');
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const fragments: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new ApiError(413, 'Payload too large');
      }
      fragments.push(decoder.decode(chunk.value, { stream: true }));
    }
    fragments.push(decoder.decode());
    if (bytes === 0 && allowEmpty) return {};
    if (!jsonType) throw new ApiError(415, 'Unsupported media type');
    return JSON.parse(fragments.join(''));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Invalid request');
  } finally {
    reader.releaseLock();
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
}

export function spaceId(env: ServerEnv): string {
  const id = env.RECALL_SPACE_ID ?? 'personal';
  if (!validId(id)) throw new ApiError(503, 'Service unavailable');
  return id;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function randomSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function setDeviceCookie(response: Response, token: string | null): void {
  response.headers.set('Set-Cookie', `${COOKIE_NAME}=${token ?? ''}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${token === null ? 0 : COOKIE_MAX_AGE}`);
}
