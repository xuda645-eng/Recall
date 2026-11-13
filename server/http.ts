import { Readable } from 'node:stream';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { handleRecallRequest } from '../shared/server-router';
import { json } from '../shared/server';
import type { ServerEnv } from '../shared/server';

export function validatePublicOrigin(value: string): string {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('RECALL_PUBLIC_ORIGIN must be an HTTPS origin (HTTP only on loopback)');
  }
  return url.origin;
}

export function nodeRequest(request: ExpressRequest, origin: string): Request {
  const path = request.originalUrl;
  if (!path.startsWith('/api/') || path.startsWith('//') || path.includes('\\')) throw new Error('Invalid API request target');
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined && !['host', 'cf-connecting-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'].includes(name)) {
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
  }
  const method = request.method;
  const init: RequestInit & { duplex?: 'half' } = { method, headers };
  if (!['GET', 'HEAD'].includes(method)) {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }
  return new Request(new URL(path, origin), init);
}

export async function writeResponse(result: Response, response: ExpressResponse): Promise<void> {
  response.status(result.status);
  result.headers.forEach((value, name) => {
    if (name !== 'set-cookie') response.setHeader(name, value);
  });
  const cookies = result.headers.getSetCookie();
  if (cookies.length) response.setHeader('Set-Cookie', cookies);
  if (!result.body) { response.end(); return; }
  response.end(Buffer.from(await result.arrayBuffer()));
}

export function recallHttpHandler(env: ServerEnv, publicOrigin: string) {
  const origin = validatePublicOrigin(publicOrigin);
  return async (request: ExpressRequest, response: ExpressResponse): Promise<void> => {
    let result: Response;
    try {
      result = await handleRecallRequest({ request: nodeRequest(request, origin),
        env: { ...env, CLIENT_IP: request.ip ?? request.socket.remoteAddress ?? 'unknown' } });
    } catch {
      result = json({ error: 'Invalid request' }, 400);
    }
    await writeResponse(result, response);
  };
}
