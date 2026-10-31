import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--runtime-modules')) {
  throw new Error('Usage: node scripts/weread-runtime-probe.mjs [--runtime-modules /path/to/cached/wrangler/node_modules]');
}
const requireRuntime = createRequire(args.length ? resolve(args[1], 'recall-probe.cjs') : import.meta.url);
let Miniflare, build, runtimeVersion, convertV4MiniflareOptions;
try {
  ({ Miniflare, convertV4MiniflareOptions } = requireRuntime('miniflare'));
  ({ build } = requireRuntime('esbuild'));
  runtimeVersion = requireRuntime('workerd/package.json').version;
} catch {
  throw new Error('Use --runtime-modules with an existing Wrangler node_modules directory containing Miniflare and esbuild. This probe never installs dependencies.');
}

const origin = 'https://recall-runtime.test';
const space = 'synthetic-weread-runtime';
const bootstrap = 'synthetic-only-weread-runtime-recovery-code';
const marker = 'synthetic-private-upstream-detail';
const gatewayUrl = 'https://i.weread.qq.com/api/agent/gateway';
const bindings = {
  RECALL_SPACE_ID: space, RECALL_BOOTSTRAP_CODE: bootstrap,
  WEREAD_API_KEY: 'synthetic-weread-key', ARK_API_KEY: 'synthetic-ark-key',
  ARK_ENDPOINT_ID: 'ep-synthetic-runtime', ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3',
};
const bundle = await build({
  stdin: { contents: `import { onRequest } from './functions/api/[[path]].ts';
    export default { fetch(request, env) { return onRequest({ request, env }); } };`, resolveDir: root, sourcefile: 'synthetic-weread-worker.ts' },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent',
});
const calls = [];
let reply = () => Response.json({});
let blockedOutbound = 0;
let cookie;
let checks = 0;
const runtimeOptions = {
  modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-30',
  host: '127.0.0.1', port: 0, cf: false, bindings, d1Databases: { DB: 'synthetic-weread-runtime-db' },
  outboundService: async request => {
    if (request.url !== gatewayUrl) {
      blockedOutbound += 1;
      return new Response('Synthetic probe blocks all other outbound requests', { status: 502 });
    }
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('Authorization'), `Bearer ${bindings.WEREAD_API_KEY}`);
    calls.push(await request.json());
    return reply();
  },
};
const runtime = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(runtimeOptions) : runtimeOptions);

async function check(label, verify) {
  try { await verify(); } catch (error) { console.error(`FAIL ${label}`); throw error; }
  checks += 1;
  console.log(`PASS ${label}`);
}

async function api(path, body = {}, options = {}) {
  const method = options.method ?? 'POST';
  const headers = new Headers({ 'Content-Type': options.contentType ?? 'application/json' });
  if (options.origin !== null) headers.set('Origin', options.origin ?? origin);
  if (options.auth !== false && cookie) headers.set('Cookie', options.cookie ?? cookie);
  const response = await runtime.dispatchFetch(`${origin}/api/${path}`, {
    method, headers, ...(['GET', 'HEAD', 'OPTIONS'].includes(method) ? {} : { body: options.raw ?? JSON.stringify(body) }),
  });
  const text = await response.text();
  assert.ok(![marker, bootstrap, bindings.WEREAD_API_KEY, bindings.ARK_API_KEY, bindings.ARK_ENDPOINT_ID].some(value => text.includes(value)));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  return { response, value: text ? JSON.parse(text) : null };
}

try {
  await runtime.ready;
  const db = await runtime.getD1Database('DB');
  for (const migration of ['20261031_recall_cloud.sql', '20261031_weread_ai.sql']) {
    const sql = await readFile(resolve(root, 'migrations', migration), 'utf8');
    await db.exec(sql.replace(/\r?\n/g, ' ').replace(/;(?=\s*CREATE\b)/g, ';\n'));
  }
  await check('local D1 pairing and protected cookie', async () => {
    const result = await api('auth/pair', { code: bootstrap, label: 'synthetic-runtime' }, { auth: false });
    assert.equal(result.response.status, 200);
    assert.equal(result.value.spaceId, space);
    const header = result.response.headers.get('Set-Cookie');
    assert.match(header, /HttpOnly; Secure; SameSite=Strict/);
    cookie = header.split(';')[0];
  });
  await db.prepare('INSERT INTO cloud_entities (space_id, kind, id, value_json, revision) VALUES (?, ?, ?, ?, ?)')
    .bind(space, 'card', 'synthetic-sentinel', JSON.stringify({ id: 'synthetic-sentinel', answer: 'Synthetic local data to preserve' }), 1).run();
  const libraryBefore = (await db.prepare('SELECT * FROM cloud_entities').all()).results;

  await check('auth and same-origin gates precede every upstream call', async () => {
    for (const [path, body] of [['books', {}], ['progress', { bookId: 'book-1' }], ['budget', {}]]) {
      for (const [options, status] of [[{ auth: false }, 401], [{ origin: 'https://evil.test' }, 403], [{ origin: null }, 403], [{ cookie: `${cookie}; ${cookie}` }, 401]]) {
        assert.equal((await api(`weread/${path}`, body, options)).response.status, status);
      }
      assert.equal((await api(`weread/${path}`, {}, { method: 'GET' })).response.status, 404);
    }
    assert.equal(calls.length, 0);
  });

  await check('strict JSON and field validation without upstream calls', async () => {
    for (const [path, body, options, status] of [
      ['books', { cursor: -1 }, {}, 400], ['books', { key: marker }, {}, 400],
      ['progress', { bookId: '../book' }, {}, 400], ['progress', { bookId: 'book-1', extra: true }, {}, 400],
      ['budget', { spaceId: 'other-space' }, {}, 400], ['budget', [], {}, 400],
      ['budget', {}, { contentType: 'text/plain' }, 415], ['budget', {}, { raw: '{' }, 400],
      ['budget', {}, { raw: `{"extra":"${'a'.repeat(1024)}"}` }, 413],
    ]) assert.equal((await api(`weread/${path}`, body, options)).response.status, status);
    assert.equal(calls.length, 0);
  });

  await check('notebook metadata projection and raw pagination in workerd', async () => {
    reply = () => Response.json({ books: [{ bookId: 'book-1', book: { title: 'Synthetic book', author: 'Synthetic author', cover: 'https://covers.test/book.jpg', privateUser: marker },
      noteCount: 2, reviewCount: 40, bookmarkCount: 3, markedStatus: 1, readingProgress: 1, sort: 1748563200, vid: marker }], hasMore: 1, privateGateway: marker });
    const result = await api('weread/books', { cursor: 1748649600 });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.value, { books: [{ bookId: 'book-1', title: 'Synthetic book', author: 'Synthetic author', highlightCount: 2,
      cover: 'https://covers.test/book.jpg', markedFinished: true, thoughtsCount: 40, bookmarkCount: 3, totalNoteCount: 45,
      lastNoteAt: '2025-05-30', readingProgress: null }], cursor: 1748563200 });
    assert.deepEqual(calls.at(-1), { api_name: '/user/notebooks', skill_version: '1.0.5', count: 20, lastSort: 1748649600 });
  });

  await check('unsafe optional metadata stays unknown', async () => {
    reply = () => Response.json({ books: [{ bookId: 'book-1', book: { title: 'Synthetic book', cover: 'https://user:password@covers.test/book.jpg' },
      noteCount: 0, reviewCount: '40', bookmarkCount: -1, markedStatus: '1', sort: 1748563200000, readingProgress: 100 }], hasMore: 0 });
    const result = await api('weread/books');
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.value.books[0], { bookId: 'book-1', title: 'Synthetic book', author: '', highlightCount: 0,
      cover: null, thoughtsCount: null, bookmarkCount: null, totalNoteCount: null, markedFinished: null, lastNoteAt: null, readingProgress: null });
  });

  await check('required counts and stalled pagination fail closed', async () => {
    for (const value of [
      { books: [{ bookId: 'book-1', book: { title: 'Synthetic book' }, noteCount: -1 }], hasMore: 0 },
      { books: [{ bookId: 'book-1', book: { title: 'Synthetic book' }, noteCount: 0, sort: 123 }], hasMore: 1 },
    ]) {
      reply = () => Response.json(value);
      assert.equal((await api('weread/books', { cursor: 123 })).response.status, 502);
    }
  });

  await check('streamed authoritative progress uses integer 0-100 only', async () => {
    for (const progress of [0, 1, 45, 100, -1, 101, 0.5, '45', null]) {
      const data = JSON.stringify({ bookId: 'book-1', book: { progress, privateUser: marker }, vid: marker });
      reply = () => new Response(new ReadableStream({ start(controller) {
        const bytes = new TextEncoder().encode(data);
        controller.enqueue(bytes.slice(0, 12)); controller.enqueue(bytes.slice(12)); controller.close();
      } }), { headers: { 'Content-Type': 'application/json' } });
      const result = await api('weread/progress', { bookId: 'book-1' });
      assert.equal(result.response.status, 200);
      assert.deepEqual(result.value, { bookId: 'book-1', readingProgress: Number.isInteger(progress) && progress >= 0 && progress <= 100 ? progress : null });
      assert.deepEqual(calls.at(-1), { api_name: '/book/getprogress', skill_version: '1.0.5', bookId: 'book-1' });
    }
    reply = () => Response.json({ bookId: 'book-2', book: { progress: 100 } });
    assert.equal((await api('weread/progress', { bookId: 'book-1' })).response.status, 502);
  });

  await check('redirects are not followed and upstream details stay private', async () => {
    for (const status of [301, 302, 303, 307, 308, 401, 500]) {
      const before = calls.length;
      reply = () => new Response(marker, { status, headers: { Location: 'https://evil.test/collect' } });
      assert.equal((await api('weread/books')).response.status, 502);
      assert.equal(calls.length, before + 1);
    }
    assert.equal(blockedOutbound, 0);
  });

  const dayStart = Math.floor(Date.now() / 86400000) * 86400000;
  await check('budget isolates space, bucket and UTC window without writes or calls', async () => {
    await db.batch([
      db.prepare('INSERT INTO import_request_limits VALUES (?, ?, ?, ?)').bind(space, 'ai-model', dayStart, 37),
      db.prepare('INSERT INTO import_request_limits VALUES (?, ?, ?, ?)').bind('other-space', 'ai-model', dayStart, 100),
      db.prepare('INSERT INTO import_request_limits VALUES (?, ?, ?, ?)').bind(space, 'ai-request', dayStart, 100),
      db.prepare('INSERT INTO import_request_limits VALUES (?, ?, ?, ?)').bind(space, 'ai-model', dayStart - 86400000, 100),
    ]);
    const query = 'SELECT * FROM import_request_limits ORDER BY space_id, bucket, window_start';
    const before = (await db.prepare(query).all()).results;
    const beforeCalls = calls.length;
    for (let repeat = 0; repeat < 3; repeat += 1) assert.deepEqual((await api('weread/budget')).value, { remaining: 63 });
    assert.deepEqual((await db.prepare(query).all()).results, before);
    assert.equal(calls.length, beforeCalls);
  });

  await check('budget is bounded and corrupt counters fail closed in local D1', async () => {
    const beforeCalls = calls.length;
    for (const attempts of [100, 101, -1, 0.5, 'invalid']) {
      await db.prepare('UPDATE import_request_limits SET attempts = ? WHERE space_id = ? AND bucket = ? AND window_start = ?').bind(attempts, space, 'ai-model', dayStart).run();
      const result = await api('weread/budget');
      assert.equal(result.response.status, Number.isSafeInteger(attempts) && attempts >= 0 ? 200 : 503);
      assert.deepEqual(result.value, Number.isSafeInteger(attempts) && attempts >= 0 ? { remaining: 0 } : { error: 'Service unavailable' });
    }
    assert.equal(calls.length, beforeCalls);
  });

  await check('progress shares WeRead rate limit, no model budget is consumed', async () => {
    const windowStart = Math.floor(Date.now() / 3600000) * 3600000;
    await db.prepare('UPDATE import_request_limits SET attempts = 120 WHERE space_id = ? AND bucket = ? AND window_start = ?').bind(space, 'weread', windowStart).run();
    const before = calls.length;
    assert.equal((await api('weread/progress', { bookId: 'book-1' })).response.status, 429);
    assert.equal(calls.length, before);
    assert.deepEqual((await db.prepare('SELECT * FROM cloud_entities').all()).results, libraryBefore);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM mutation_receipts').first()).count, 0);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM import_question_cache').first()).count, 0);
  });

  await check('revoked device cannot read metadata, progress or budget', async () => {
    await db.prepare('UPDATE trusted_devices SET revoked_at = ? WHERE space_id = ?').bind(Date.now(), space).run();
    const before = calls.length;
    for (const [path, body] of [['books', {}], ['progress', { bookId: 'book-1' }], ['budget', {}]]) {
      assert.equal((await api(`weread/${path}`, body)).response.status, 401);
    }
    assert.equal(calls.length, before);
  });
  assert.equal(blockedOutbound, 0);
  console.log(`PASS ${checks} local workerd checks; workerd=${runtimeVersion}; intercepted synthetic gateway calls=${calls.length}; real external calls=0; ephemeral local D1 only`);
} finally {
  await runtime.dispose();
}
