import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRecallApplication } from '../server/application';
import { ObjectMediaRepository } from '../server/object-media';
import { postgresFixture } from './postgres-fixture';

describe('local NestJS application with isolated PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof postgresFixture>>;
  let app: Awaited<ReturnType<typeof createRecallApplication>>;
  let url: string;
  const origin = 'https://recall.test';
  const code = 'synthetic-nest-application-owner-code-not-production';

  beforeAll(async () => {
    fixture = await postgresFixture();
    const objects = new Map<string, ArrayBuffer>();
    app = await createRecallApplication({ DB: fixture.database, RECALL_BOOTSTRAP_CODE: code,
      MEDIA: new ObjectMediaRepository(fixture.database, {
        async putIfAbsent(key, bytes) { if (!objects.has(key)) objects.set(key, bytes); },
        async get(key) { const bytes = objects.get(key); if (!bytes) throw new Error('Missing synthetic object'); return bytes; },
      }),
    }, { publicOrigin: origin });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.engine.close();
  });

  it('pairs through the real Node HTTP bridge and returns secure cookies and authenticated sessions', async () => {
    const pair = await fetch(`${url}/api/auth/pair`, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': 'spoofed' },
      body: JSON.stringify({ code, label: 'Synthetic iPhone' }),
    });
    expect(pair.status).toBe(200);
    expect(pair.headers.get('X-Powered-By')).toBeNull();
    const cookie = pair.headers.get('Set-Cookie')!;
    expect(cookie).toContain('HttpOnly; Secure; SameSite=Strict');
    const session = await pair.json();
    const response = await fetch(`${url}/api/auth/session`, { headers: { Cookie: cookie.split(';')[0] } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(session);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects untrusted Origin and oversized/invalid streamed bodies without generic parser interception', async () => {
    const send = (body: string, suppliedOrigin = origin) => fetch(`${url}/api/auth/pair`, { method: 'POST',
      headers: { Origin: suppliedOrigin, 'Content-Type': 'application/json' }, body });
    expect((await send('{}', 'https://evil.test')).status).toBe(403);
    expect((await send('{invalid')).status).toBe(400);
    expect((await send('x'.repeat(4097))).status).toBe(413);
  });
});
