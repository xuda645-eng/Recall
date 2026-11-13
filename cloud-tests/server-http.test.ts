import { Readable } from 'node:stream';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { nodeRequest, recallHttpHandler, validatePublicOrigin, writeResponse } from '../server/http';
import { createRecallApplication } from '../server/application';
import { SqliteD1 } from './sqlite-d1';

function request(body = '', headers: Record<string, string> = {}, method = 'POST'): ExpressRequest {
  return Object.assign(Readable.from([Buffer.from(body)]), {
    originalUrl: '/api/auth/pair', method, headers, ip: '203.0.113.7',
    socket: { remoteAddress: '203.0.113.8' },
  }) as unknown as ExpressRequest;
}

describe('NestJS HTTP bridge', () => {
  it('requires a fixed HTTPS public origin and rejects credentials, paths and remote HTTP', () => {
    expect(validatePublicOrigin('https://recall.test/')).toBe('https://recall.test');
    expect(validatePublicOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    for (const value of ['http://recall.test', 'https://user:secret@recall.test', 'https://recall.test/api', 'https://recall.test/?x=1', 'https://recall.test/#x']) {
      expect(() => validatePublicOrigin(value)).toThrow();
    }
  });

  it('preserves raw request bytes and cookies, ignoring untrusted proxy and Cloudflare headers', async () => {
    const input = request('{"code":"test"}', { host: 'evil.test', 'x-forwarded-proto': 'http', 'x-forwarded-host': 'evil.test',
      'x-forwarded-for': 'spoofed', 'cf-connecting-ip': 'spoofed', origin: 'https://recall.test', cookie: 'recall_device=token', 'content-type': 'application/json' });
    const converted = nodeRequest(input, 'https://recall.test');
    expect(converted.url).toBe('https://recall.test/api/auth/pair');
    expect(await converted.text()).toBe('{"code":"test"}');
    expect(converted.headers.get('Cookie')).toBe('recall_device=token');
    expect(converted.headers.get('CF-Connecting-IP')).toBeNull();
    expect(converted.headers.get('X-Forwarded-For')).toBeNull();
  });

  it('does not send a body on GET or HEAD and rejects non-API request targets', () => {
    for (const method of ['GET', 'HEAD']) expect(nodeRequest(request('', {}, method), 'https://recall.test').body).toBeNull();
    for (const path of ['https://evil.test/api', '//evil.test/api', '/api\\auth', '/outside']) {
      const input = request(); input.originalUrl = path;
      expect(() => nodeRequest(input, 'https://recall.test')).toThrow();
    }
  });

  it('preserves private media bytes and all Set-Cookie values', async () => {
    const headers = new Map<string, unknown>();
    const end = vi.fn();
    const status = vi.fn();
    const output = { status, setHeader: (name: string, value: unknown) => headers.set(name, value), end } as unknown as ExpressResponse;
    const result = new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
    result.headers.append('Set-Cookie', 'first=one; HttpOnly; Secure');
    result.headers.append('Set-Cookie', 'second=two; HttpOnly; Secure');
    await writeResponse(result, output);
    expect(status).toHaveBeenCalledWith(200);
    expect(headers.get('Set-Cookie')).toEqual(['first=one; HttpOnly; Secure', 'second=two; HttpOnly; Secure']);
    expect(end).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
  });

  it('uses the runtime IP for pairing limits and retains Origin enforcement', async () => {
    const db = new SqliteD1();
    const handler = recallHttpHandler({ DB: db, RECALL_BOOTSTRAP_CODE: 'synthetic-http-test-owner-code-not-production' }, 'https://recall.test');
    const statuses: number[] = [];
    const output = { status: (value: number) => statuses.push(value), setHeader() {}, end() {} } as unknown as ExpressResponse;
    try {
      await handler(request('{}', { origin: 'https://evil.test', 'content-type': 'application/json' }), output);
      expect(statuses).toEqual([403]);
      expect(db.sqlite.prepare('SELECT count(*) AS count FROM pair_rate_limits').get()?.count).toBe(0);
    } finally { db.close(); }
  });

  it('refuses to start an apparently ready backend without private storage and PostgreSQL', async () => {
    const db = new SqliteD1();
    try {
      await expect(createRecallApplication({ DB: db }, { publicOrigin: 'https://recall.test' })).rejects.toThrow('adapters are required');
    } finally { db.close(); }
  });
});
