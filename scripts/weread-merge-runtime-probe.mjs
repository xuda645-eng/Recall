import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--runtime-modules')) {
  throw new Error('Usage: node scripts/weread-merge-runtime-probe.mjs [--runtime-modules /path/to/cached/wrangler/node_modules]');
}
const requireRuntime = createRequire(args.length ? resolve(args[1], 'recall-merge-probe.cjs') : import.meta.url);
let Miniflare, build, runtimeVersion, convertV4MiniflareOptions;
try {
  ({ Miniflare, convertV4MiniflareOptions } = requireRuntime('miniflare'));
  ({ build } = requireRuntime('esbuild'));
  runtimeVersion = requireRuntime('workerd/package.json').version;
} catch {
  throw new Error('Use --runtime-modules with an existing Wrangler node_modules directory containing Miniflare and esbuild. This probe never installs dependencies.');
}
const contractBundle = await build({
  stdin: { contents: "export { MERGE_VERSION, numberedMergeBatch } from './shared/weread-merge.ts';", resolveDir: root, sourcefile: 'synthetic-merge-contract.ts' },
  bundle: true, format: 'esm', platform: 'node', target: 'es2022', write: false, logLevel: 'silent',
});
const { MERGE_VERSION: mergeVersion, numberedMergeBatch } = await import(`data:text/javascript;base64,${Buffer.from(contractBundle.outputFiles[0].text).toString('base64')}`);

const origin = 'https://recall-merge-runtime.test';
const space = 'synthetic-weread-merge-runtime';
const bootstrap = 'synthetic-only-weread-merge-runtime-recovery-code';
const marker = 'synthetic-private-upstream-detail';
const arkUrl = 'https://ark.cn-beijing.volces.com/api/v3/responses';
const bindings = {
  RECALL_SPACE_ID: space, RECALL_BOOTSTRAP_CODE: bootstrap,
  ARK_API_KEY: 'synthetic-ark-key', ARK_ENDPOINT_ID: 'ep-synthetic-merge-runtime',
  ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3',
};
const question = 'Which original observations support the stated conclusion?';
const original = {
  bookId: 'book-1', chapterUid: 'chapter-1', chapterIdx: 0, chapterTitle: 'Synthetic chapter', highlights: [
    { id: 'mark-1', markText: '  Original first observation.\nKeep its whitespace.  ', range: '0002-9999' },
    { id: 'mark-2', markText: 'Original second observation.', range: '10-0' },
    { id: 'mark-3', markText: 'Original third observation.', range: '20-4' },
  ],
};
function groups(batch) {
  const cards = [];
  for (let index = 0; index < batch.highlights.length; index += 2) {
    cards.push({ highlightIds: batch.highlights.slice(index, index + 2).map(highlight => highlight.id), question });
  }
  return cards;
}
function completion(cards) {
  return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ cards }) }] }] };
}
function expectedHash(batch) {
  return createHash('sha256').update(JSON.stringify(['/api/weread/merge', mergeVersion, bindings.ARK_ENDPOINT_ID, batch])).digest('hex');
}
const bundle = await build({
  stdin: { contents: `import { onRequest } from './functions/api/[[path]].ts';
    export default { fetch(request, env) { return onRequest({ request, env }); } };`,
  resolveDir: root, sourcefile: 'synthetic-weread-merge-worker.ts' },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent',
});
const calls = [];
const defaultReply = body => {
  if (body.text.format.name === 'weread-question-v1') return Response.json({ status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ question, summary: null }) }] }] });
  return Response.json(completion(groups(JSON.parse(body.input))));
};
let reply = defaultReply, blockedOutbound = 0, cookie, checks = 0;
const runtimeOptions = {
  modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-30',
  host: '127.0.0.1', port: 0, cf: false, bindings,
  d1Databases: { DB: 'synthetic-weread-merge-runtime-db' }, d1Persist: false,
  outboundService: async request => {
    if (request.url !== arkUrl) {
      blockedOutbound += 1;
      return new Response('Synthetic probe blocks every other outbound request', { status: 502 });
    }
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('Authorization'), `Bearer ${bindings.ARK_API_KEY}`);
    const body = await request.json();
    calls.push(body);
    return reply(body);
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
  const response = await runtime.dispatchFetch(`${origin}/api/${path}`, { method, headers,
    ...(['GET', 'HEAD', 'OPTIONS'].includes(method) ? {} : { body: options.raw ?? JSON.stringify(body) }),
  });
  const text = await response.text();
  assert.ok(![marker, bootstrap, bindings.ARK_API_KEY, bindings.ARK_ENDPOINT_ID].some(value => text.includes(value)));
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
  const library = async () => ({
    entities: (await db.prepare('SELECT * FROM cloud_entities ORDER BY space_id, kind, id').all()).results,
    receipts: (await db.prepare('SELECT * FROM mutation_receipts ORDER BY space_id, id').all()).results,
    revision: await db.prepare('SELECT revision FROM spaces WHERE id = ?').bind(space).first(),
  });
  const dayStart = Math.floor(Date.now() / 86400000) * 86400000;
  const hourStart = Math.floor(Date.now() / 3600000) * 3600000;
  const attempts = async bucket => (await db.prepare('SELECT attempts FROM import_request_limits WHERE space_id = ? AND bucket = ? AND window_start = ?')
    .bind(space, bucket, bucket === 'ai-model' ? dayStart : hourStart).first())?.attempts ?? 0;
  const setLimit = async (bucket, count) => db.prepare(`INSERT INTO import_request_limits VALUES (?, ?, ?, ?)
    ON CONFLICT (space_id, bucket, window_start) DO UPDATE SET attempts = excluded.attempts`)
    .bind(space, bucket, bucket === 'ai-model' ? dayStart : hourStart, count).run();
  const cache = async batch => db.prepare('SELECT * FROM import_question_cache WHERE space_id = ? AND content_hash = ?')
    .bind(space, expectedHash(batch)).first();
  const changed = label => ({ ...structuredClone(original), chapterTitle: `Synthetic ${label}` });
  const at = '2026-11-02T00:00:00.000Z';
  const deck = { id: 'deck-synthetic', name: 'Synthetic local sentinel', description: '', color: 'slate', parentId: null,
    createdAt: at, updatedAt: at };
  const sentinel = { id: 'card-sentinel', deckId: deck.id, front: 'Synthetic sentinel question', back: 'Synthetic sentinel answer',
    hint: '', source: '', tags: [], cardType: 'basic', state: 'new', lastReviewDate: null, nextReviewDate: at,
    stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, learningSteps: 0, createdAt: at, updatedAt: at };
  const mutation = (id, changes, baseRevision = 0) => ({ id, baseRevision, changes });
  const change = (kind, value, expectedRevision = 0) => ({ kind, id: value.id, value, expectedRevision });

  await check('synthetic pairing, protected cookie and sentinel through real local sync', async () => {
    const paired = await api('auth/pair', { code: bootstrap, label: 'synthetic-merge-runtime' }, { auth: false });
    assert.equal(paired.response.status, 200);
    assert.equal(paired.value.spaceId, space);
    const header = paired.response.headers.get('Set-Cookie');
    assert.match(header, /HttpOnly; Secure; SameSite=Strict/);
    cookie = header.split(';')[0];
    const saved = await api('sync', mutation('synthetic-seed', [change('deck', deck), change('card', sentinel)]));
    assert.equal(saved.response.status, 200);
    assert.deepEqual(saved.value, { revision: 1 });
    assert.equal(calls.length, 0);
  });
  const libraryBefore = await library();

  await check('merge device auth, same-origin, cookie and method gates precede upstream', async () => {
    for (const [options, status] of [[{ auth: false }, 401], [{ origin: 'https://evil.test' }, 403],
      [{ origin: null }, 403], [{ cookie: `${cookie}; ${cookie}` }, 401], [{ method: 'GET' }, 404]]) {
      assert.equal((await api('weread/merge', original, options)).response.status, status);
    }
    assert.equal(calls.length, 0);
    assert.equal(await attempts('ai-request'), 0);
    assert.equal(await attempts('ai-model'), 0);
  });

  await check('bounded JSON, credentials, input IDs, safety and ambiguous starts reject before budgets', async () => {
    const invalid = [null, {}, { ...original, token: marker }, { ...original, chapterIdx: -1 },
      { ...original, highlights: [] }, { ...original, highlights: original.highlights.slice().reverse() },
      { ...original, highlights: [original.highlights[0], { ...original.highlights[1], id: original.highlights[0].id }] },
      { ...original, highlights: [original.highlights[0], { ...original.highlights[1], range: '0002-0' }] },
      { ...original, highlights: [{ ...original.highlights[0], range: '2-9007199254740992' }] },
      { ...original, highlights: [{ ...original.highlights[0], markText: 'java\nscript:run' }] },
      { ...original, highlights: [{ ...original.highlights[0], markText: 'x'.repeat(6001) }] },
      { ...original, highlights: Array.from({ length: 13 }, (_, index) => ({ id: `mark-${index}`, markText: 'original', range: `${index}-0` })) },
    ];
    for (const body of invalid) assert.equal((await api('weread/merge', body)).response.status, 400);
    for (const [options, status] of [[{ raw: '{' }, 400], [{ contentType: 'text/plain' }, 415], [{ raw: 'x'.repeat(64001) }, 413]]) {
      assert.equal((await api('weread/merge', original, options)).response.status, status);
    }
    assert.equal(calls.length, 0);
    assert.equal(await attempts('ai-model'), 0);
    assert.equal(await attempts('ai-request'), 0);
  });

  await check('daily model budget starts at 300 and budget reads have no writes or upstream', async () => {
    const before = (await db.prepare('SELECT * FROM import_request_limits').all()).results;
    for (let repeat = 0; repeat < 2; repeat += 1) assert.deepEqual((await api('weread/budget')).value, { remaining: 300 });
    assert.deepEqual((await db.prepare('SELECT * FROM import_request_limits').all()).results, before);
    assert.equal(calls.length, 0);
  });

  await check('actual merge endpoint, strict IDs-only model schema and preserved start-second ranges', async () => {
    const result = await api('weread/merge', original);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.value, { cards: groups(original), cached: false });
    assert.equal(calls.length, 1);
    const body = calls[0], format = body.text.format;
    assert.equal(body.model, bindings.ARK_ENDPOINT_ID);
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.equal(body.max_output_tokens, 4096);
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.ok(!Object.hasOwn(body, 'tools') && !Object.hasOwn(body, 'tool_choice'));
    const numbered = numberedMergeBatch(original);
    assert.deepEqual(numbered, { ...original, highlights: original.highlights.map((highlight, index) => ({
      ...highlight, id: `H${String(index + 1).padStart(3, '0')}`,
    })) });
    assert.deepEqual(JSON.parse(body.input), numbered);
    assert.equal(format.name, mergeVersion);
    assert.equal(format.strict, true);
    assert.equal(format.schema.additionalProperties, false);
    assert.deepEqual(format.schema.required, ['cards']);
    const item = format.schema.properties.cards.items;
    assert.equal(format.schema.properties.cards.maxItems, 3);
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.required, ['highlightIds', 'question']);
    assert.deepEqual(Object.keys(item.properties).sort(), ['highlightIds', 'question']);
    assert.equal(item.properties.highlightIds.maxItems, 4);
    assert.deepEqual(item.properties.highlightIds.items.enum, numbered.highlights.map(highlight => highlight.id));
    assert.ok(!JSON.stringify(body).includes(bindings.ARK_API_KEY));
    assert.equal(await attempts('ai-model'), 1);
    assert.deepEqual((await api('weread/budget')).value, { remaining: 299 });
    assert.deepEqual(await library(), libraryBefore);
  });

  await check('seven-day cache validates partitions and preserves endpoint/version/entire-batch identity', async () => {
    const beforeCalls = calls.length;
    const result = await api('weread/merge', original);
    assert.deepEqual(result.value, { cards: groups(original), cached: true });
    assert.equal(calls.length, beforeCalls);
    const row = await cache(original);
    assert.ok(row);
    assert.deepEqual(JSON.parse(row.value_json), { cards: groups(original) });
    assert.ok(row.expires_at > Date.now() + 7 * 86400000 - 60000 && row.expires_at <= Date.now() + 7 * 86400000);
    assert.equal(await attempts('ai-model'), 1);
    assert.equal(await attempts('ai-request'), 2);
    for (const field of ['bookId', 'chapterUid', 'chapterIdx', 'chapterTitle', 'id', 'markText', 'range']) {
      const batch = structuredClone(original);
      if (['bookId', 'chapterUid', 'chapterTitle'].includes(field)) batch[field] += '-changed';
      else if (field === 'chapterIdx') batch.chapterIdx += 1;
      else batch.highlights[0][field] = field === 'range' ? '0002-0' : `${batch.highlights[0][field]}-changed`;
      const merged = await api('weread/merge', batch);
      assert.equal(merged.response.status, 200);
      assert.equal(merged.value.cached, false);
      assert.ok(await cache(batch));
    }
    assert.equal(calls.length, beforeCalls + 7);
  });

  await check('question and merge cache namespaces cannot reuse each other', async () => {
    const before = calls.length;
    const body = { markText: original.highlights[0].markText, summary: false };
    assert.equal((await api('weread/question', body)).value.cached, false);
    assert.equal((await api('weread/question', body)).value.cached, true);
    assert.equal((await api('weread/merge', original)).value.cached, true);
    assert.equal(calls.length, before + 1);
    assert.equal(calls.at(-1).text.format.name, 'weread-question-v1');
  });

  await check('maximum 12 highlights and 6000 characters remain bounded in workerd', async () => {
    const batch = { ...changed('maximum'), highlights: Array.from({ length: 12 }, (_, index) => ({
      id: `maximum-${index}`, markText: 'x'.repeat(500), range: `${index}-0`,
    })) };
    const result = await api('weread/merge', batch);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.value.cards, groups(batch));
    batch.highlights[11].markText += ' ';
    const before = calls.length;
    assert.equal((await api('weread/merge', batch)).response.status, 400);
    assert.equal(calls.length, before);
  });

  await check('poisoned and expired cache regenerates only after full validation', async () => {
    for (const value of ['{', JSON.stringify({ cards: [{ highlightIds: ['unknown'], question }] }),
      JSON.stringify({ cards: groups(numberedMergeBatch(original)) }), JSON.stringify({ question, summary: null })]) {
      await db.prepare('UPDATE import_question_cache SET value_json = ? WHERE space_id = ? AND content_hash = ?')
        .bind(value, space, expectedHash(original)).run();
      const before = calls.length;
      assert.deepEqual((await api('weread/merge', original)).value, { cards: groups(original), cached: false });
      assert.equal(calls.length, before + 1);
    }
    await db.prepare('UPDATE import_question_cache SET expires_at = ? WHERE space_id = ? AND content_hash = ?')
      .bind(Date.now() - 1, space, expectedHash(original)).run();
    assert.equal((await api('weread/merge', original)).value.cached, false);
  });

  await check('malformed, incomplete, unknown, duplicate, reordered and missing model output counts attempts', async () => {
    const numbered = numberedMergeBatch(original);
    const values = [completion([]), completion([{ highlightIds: ['unknown'], question }]),
      completion([{ highlightIds: ['H001', 'H001'], question }, { highlightIds: ['H002', 'H003'], question }]),
      completion([{ highlightIds: ['H002', 'H001', 'H003'], question }]),
      completion([{ highlightIds: ['H001', 'H003'], question }, { highlightIds: ['H002'], question }]),
      completion([{ highlightIds: ['H001', 'H002'], question }]),
      completion(groups(original)),
      completion([{ highlightIds: ['H001', 'mark-2'], question }, { highlightIds: ['H003'], question }]),
      completion(groups(numbered).map(card => ({ ...card, answer: marker }))),
      completion(groups(numbered).map(card => ({ ...card, question: '<script>unsafe question</script>' }))),
      { ...completion(groups(numbered)), status: 'incomplete' }, { status: 'completed', output: [] },
    ];
    for (const [index, value] of values.entries()) {
      const batch = changed(`invalid-output-${index}`), before = await attempts('ai-model');
      reply = () => Response.json(value);
      assert.equal((await api('weread/merge', batch)).response.status, 502);
      assert.equal(await attempts('ai-model'), before + 1);
      assert.equal(await cache(batch), null);
    }
    const batch = changed('malformed-json');
    reply = () => new Response('{', { headers: { 'Content-Type': 'application/json' } });
    const before = await attempts('ai-model');
    assert.equal((await api('weread/merge', batch)).response.status, 502);
    assert.equal(await attempts('ai-model'), before + 1);
    reply = defaultReply;
  });

  await check('complete model partition with five members is rejected', async () => {
    const batch = { ...changed('five-members'), highlights: Array.from({ length: 5 }, (_, index) => ({
      id: `member-${index}`, markText: 'Synthetic original.', range: `${index}-0`,
    })) };
    reply = () => Response.json(completion([{ highlightIds: numberedMergeBatch(batch).highlights.map(highlight => highlight.id), question }]));
    const before = await attempts('ai-model');
    assert.equal((await api('weread/merge', batch)).response.status, 502);
    assert.equal(await attempts('ai-model'), before + 1);
    assert.equal(await cache(batch), null);
    reply = defaultReply;
  });

  await check('redirects and HTTP errors never follow Location or expose upstream detail', async () => {
    for (const status of [301, 302, 303, 307, 308, 401, 500]) {
      const batch = changed(`http-${status}`), before = calls.length, beforeAttempts = await attempts('ai-model');
      reply = () => new Response(marker, { status, headers: { Location: 'https://evil.test/collect' } });
      assert.equal((await api('weread/merge', batch)).response.status, 502);
      assert.equal(calls.length, before + 1);
      assert.equal(await attempts('ai-model'), beforeAttempts + 1);
      assert.equal(await cache(batch), null);
    }
    assert.equal(blockedOutbound, 0);
    reply = defaultReply;
  });

  await check('failed 300th attempt consumes shared budget, valid cache still works and 301st is blocked', async () => {
    await setLimit('ai-model', 299);
    assert.deepEqual((await api('weread/budget')).value, { remaining: 1 });
    const batch = changed('final-failed-attempt'), before = calls.length;
    reply = () => Response.json(completion([{ highlightIds: ['unknown'], question }]));
    assert.equal((await api('weread/merge', batch)).response.status, 502);
    assert.equal(await attempts('ai-model'), 300);
    assert.deepEqual((await api('weread/budget')).value, { remaining: 0 });
    assert.equal((await api('weread/merge', batch)).response.status, 429);
    assert.equal((await api('weread/question', { markText: 'An uncached synthetic observation.', summary: false })).response.status, 429);
    assert.deepEqual((await api('weread/merge', original)).value, { cards: groups(original), cached: true });
    assert.equal(calls.length, before + 1);
    await db.prepare('UPDATE import_question_cache SET value_json = ? WHERE space_id = ? AND content_hash = ?')
      .bind(JSON.stringify({ cards: [] }), space, expectedHash(original)).run();
    assert.equal((await api('weread/merge', original)).response.status, 429);
    assert.equal(calls.length, before + 1);
    reply = defaultReply;
  });

  await check('hourly ai-request bucket rejects question and cached merge alike', async () => {
    await setLimit('ai-request', 120);
    const before = calls.length;
    assert.equal((await api('weread/merge', original)).response.status, 429);
    assert.equal((await api('weread/question', { markText: original.highlights[0].markText, summary: false })).response.status, 429);
    assert.equal(calls.length, before);
    assert.deepEqual(await library(), libraryBefore);
  });

  const members = original.highlights.slice(0, 2).map(highlight => ({ bookmarkId: highlight.id, markText: highlight.markText,
    chapterUid: original.chapterUid, chapterIdx: original.chapterIdx, range: highlight.range }));
  const merged = { ...sentinel, id: `weread-group:${'a'.repeat(64)}`, front: question, contentKind: 'qa', recallKind: 'question',
    back: members.map(member => member.markText).join('\n\n'), sourceRef: { provider: 'weread', bookId: original.bookId,
      bookmarkId: members[0].bookmarkId, chapterUid: original.chapterUid, highlights: members } };
  await check('sourceRef.highlights saves and reopens exactly through actual sync validation', async () => {
    const before = calls.length;
    const saved = await api('sync', mutation('synthetic-merged-save', [change('card', merged)], 1));
    assert.equal(saved.response.status, 200);
    assert.deepEqual(saved.value, { revision: 2 });
    const reopened = await api('sync', {}, { method: 'GET' });
    assert.equal(reopened.response.status, 200);
    assert.deepEqual(reopened.value.entities.find(entity => entity.id === merged.id)?.value, merged);
    assert.deepEqual(reopened.value.entities.find(entity => entity.id === sentinel.id)?.value, sentinel);
    assert.equal(calls.length, before);
  });

  await check('tampered grouped source, originals, chapter and ordering cannot mutate local saved data', async () => {
    const before = await library();
    for (const [index, fault] of ['answer', 'duplicate', 'chapter', 'index', 'equal-start', 'unsafe', 'credential', 'five-members'].entries()) {
      const value = structuredClone(merged), source = value.sourceRef;
      if (fault === 'answer') value.back += ' Tampered answer.';
      if (fault === 'duplicate') source.highlights[1].bookmarkId = source.highlights[0].bookmarkId;
      if (fault === 'chapter') source.highlights[1].chapterUid = 'different-chapter';
      if (fault === 'index') source.highlights[1].chapterIdx += 1;
      if (fault === 'equal-start') source.highlights[1].range = '2-0';
      if (fault === 'unsafe') source.highlights[1].markText = '<script>execute</script>';
      if (fault === 'credential') source.highlights[1].cookie = marker;
      if (fault === 'five-members') source.highlights.push(...structuredClone(source.highlights), structuredClone(source.highlights[0]));
      assert.equal((await api('sync', mutation(`synthetic-invalid-${index}`, [change('card', value, 2)], 2))).response.status, 400);
      assert.deepEqual(await library(), before);
    }
  });

  await check('merge stays library-readonly after valid grouped sync and revoked devices fail closed', async () => {
    await setLimit('ai-model', 0);
    await setLimit('ai-request', 0);
    const before = await library();
    assert.equal((await api('weread/merge', changed('after-sync'))).response.status, 200);
    assert.deepEqual(await library(), before);
    await db.prepare('UPDATE trusted_devices SET revoked_at = ? WHERE space_id = ?').bind(Date.now(), space).run();
    const beforeCalls = calls.length;
    assert.equal((await api('weread/merge', original)).response.status, 401);
    assert.equal((await api('weread/budget')).response.status, 401);
    assert.equal(calls.length, beforeCalls);
    assert.deepEqual(await library(), before);
  });
  assert.equal(blockedOutbound, 0);
  console.log(`PASS ${checks} local workerd merge checks; workerd=${runtimeVersion}; intercepted synthetic Ark calls=${calls.length}; real external calls=0; ephemeral local D1 only; no browser or production access`);
} finally {
  await runtime.dispose();
}
