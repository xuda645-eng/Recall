import { test, expect, type Page } from '@playwright/test';
import { createSeedSnapshot } from '../src/data/seed';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

async function api(page: Page, method: string, body?: unknown, query = '') {
  return page.evaluate(async input => {
    const modulePath = '/app/app_17hv4js1tsy/client/src/api/recall-http.ts';
    const module = await import(modulePath);
    const transport = module.createMiaodaBackendTransport();
    const response: Response = await transport(`/api/recall/personal-sync${input.query}`, {
      method: input.method, cache: 'no-store',
      headers: { ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(sessionStorage.getItem('synthetic-account-binding') ? { 'X-Recall-Account-Key': sessionStorage.getItem('synthetic-account-binding')! } : {}) },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    const binding = response.headers.get('x-recall-account-key');
    if (binding) sessionStorage.setItem('synthetic-account-binding', binding);
    return { status: response.status, cache: response.headers.get('cache-control'), libraryKey: response.headers.get('x-recall-library-key'), body: await response.json() };
  }, { method, body, query });
}

test('actual SDK aggregate round trip, two clients, concurrent CAS, replay and HTTP guards', async ({ page, context }) => {
  if (!/^synthetic-[a-zA-Z0-9-]{1,80}$/.test(process.env.MIAODA_PERSONAL_LIBRARY_KEY ?? '')) {
    throw new Error('A fresh synthetic server library is required; real personal library tests are forbidden');
  }
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const peer = await context.newPage();
  await peer.goto('./', { waitUntil: 'domcontentloaded' });
  const initial = await api(page, 'GET');
  expect(initial.status).toBe(200);
  expect(initial.libraryKey).toBe(process.env.MIAODA_PERSONAL_LIBRARY_KEY);
  expect(initial.cache).toContain('no-store');
  expect(initial.body).toEqual({ revision: 0, entities: [] });
  const seed = createSeedSnapshot();
  const deck = { ...seed.decks[0], id: 'personal-synthetic-deck', parentId: null };
  const card = { ...seed.cards[0], id: 'personal-synthetic-card', deckId: deck.id };
  const first = { id: 'personal-sdk-first', baseRevision: 0, changes: [
    { kind: 'deck', id: deck.id, value: deck, expectedRevision: 0 },
    { kind: 'card', id: card.id, value: card, expectedRevision: 0 },
    { kind: 'setting', id: 'dailyGoal', value: 20, expectedRevision: 0 },
  ] };
  expect(await api(page, 'POST', first)).toMatchObject({ status: 200, body: { revision: 1 } });
  const remote = await api(peer, 'GET');
  expect(remote.body.revision).toBe(1);
  expect(remote.body.entities.find((entity: { id: string }) => entity.id === card.id).value).toEqual(card);
  const mutation = (id: string, value: number) => ({ id, baseRevision: 1, changes: [{ kind: 'setting', id: 'dailyGoal', value, expectedRevision: 1 }] });
  const writers = await Promise.all([api(page, 'POST', mutation('writer-a', 30)), api(peer, 'POST', mutation('writer-b', 40))]);
  expect(writers.map(result => result.status).sort()).toEqual([200, 409]);
  const after = await api(peer, 'GET');
  expect(after.body.revision).toBe(2);
  const goal = after.body.entities.find((entity: { id: string }) => entity.id === 'dailyGoal');
  expect(goal.value).toBe(writers[0].status === 200 ? 30 : 40);
  expect(await api(page, 'POST', first)).toMatchObject({ status: 200, body: { revision: 1 } });
  expect(await api(page, 'POST', { ...first, changes: first.changes.slice(0, 1) })).toMatchObject({ status: 409 });
  expect(await api(page, 'POST', { ...mutation('wrong-entity-revision', 50), baseRevision: 2, changes: [{ kind: 'setting', id: 'dailyGoal', value: 50, expectedRevision: 0 }] })).toMatchObject({ status: 409 });
  expect(await api(page, 'POST', { ...mutation('credential-attempt', 50), baseRevision: 2, changes: [{ kind: 'setting', id: 'syncCode', value: 'synthetic-never-store', expectedRevision: 0 }] })).toMatchObject({ status: 400 });
  expect(await api(page, 'GET', undefined, '?owner=another')).toMatchObject({ status: 400 });
  expect(await api(page, 'GET', undefined, '?since=2')).toMatchObject({ status: 200, body: { revision: 2, entities: [] } });
  const noCsrf = await context.request.post('http://localhost:8187/app/app_17hv4js1tsy/api/recall/personal-sync', { data: {}, headers: { Cookie: '' } });
  expect(noCsrf.status()).toBe(403);
  expect((await api(peer, 'GET')).body.revision).toBe(2);
  await peer.reload({ waitUntil: 'domcontentloaded' });
  expect((await api(peer, 'GET')).body.entities.find((entity: { id: string }) => entity.id === card.id).value).toEqual(card);
  const image = readFileSync(new URL('./fixtures/source-screenshot.png', import.meta.url));
  const imageId = `${createHash('sha256').update(image).digest('hex')}.png`;
  const media = (client: Page, method: string, binding = true) => client.evaluate(async input => {
    const module = await import('/app/app_17hv4js1tsy/client/src/api/recall-http.ts');
    const response: Response = await module.createMiaodaBackendTransport()(`/api/recall/personal-media/${input.id}`, {
      method: input.method, cache: 'no-store', headers: {
        ...(input.binding ? { 'X-Recall-Account-Key': sessionStorage.getItem('synthetic-account-binding')! } : {}),
        ...(input.method === 'PUT' ? { 'Content-Type': 'image/png' } : {}),
      }, body: input.method === 'PUT' ? Uint8Array.from(atob(input.base64), character => character.charCodeAt(0)).buffer : undefined,
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { status: response.status, mime: response.headers.get('content-type'), cache: response.headers.get('cache-control'), length: bytes.length, hash };
  }, { id: imageId, method, base64: image.toString('base64'), binding });
  expect(await media(page, 'GET', false)).toMatchObject({ status: 401 });
  expect(await media(page, 'HEAD')).toMatchObject({ status: 404 });
  const imageCard = { ...card, back: `![Synthetic source](recall://${imageId})` };
  const imageChange = { id: 'image-card-not-ready', baseRevision: 2, changes: [{ kind: 'card', id: card.id, value: imageCard, expectedRevision: 1 }] };
  expect(await api(page, 'POST', imageChange)).toMatchObject({ status: 422 });
  expect(await media(page, 'PUT')).toMatchObject({ status: 200 });
  expect(await media(peer, 'HEAD')).toMatchObject({ status: 200, mime: 'image/png', length: 0 });
  expect(await media(peer, 'GET')).toMatchObject({ status: 200, mime: 'image/png', length: image.length, hash: imageId.split('.')[0], cache: expect.stringContaining('no-store') });
  const uploaded = await api(page, 'GET');
  expect(uploaded.body.revision).toBe(4);
  expect(JSON.stringify(uploaded.body)).not.toMatch(/mediaKey|recall-encrypted|bucket_/);
  expect(await api(page, 'POST', { ...imageChange, id: 'image-card-ready', baseRevision: 4 })).toMatchObject({ status: 200, body: { revision: 5 } });
  expect(await media(page, 'PUT')).toMatchObject({ status: 200 });
  expect((await api(page, 'GET')).body.revision).toBe(5);
  expect((await api(peer, 'GET')).body.entities.find((entity: { id: string }) => entity.id === card.id).value).toEqual(imageCard);
  test.info().annotations.push({ type: 'scope', description: 'Two page clients, same legitimate SDK dev account, fresh synthetic library only; not real phones or installed-PWA acceptance.' });
});

test('personal UI connects two isolated browsers, downloads images and retains data after refresh', async ({ browser }) => {
  if (!/^synthetic-[a-zA-Z0-9-]{1,80}$/.test(process.env.MIAODA_PERSONAL_LIBRARY_KEY ?? '')) throw new Error('Fresh synthetic library required');
  const clients = await Promise.all([browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }), browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })]);
  try {
    const seed = createSeedSnapshot();
    const empty = { ...seed, decks: [], cards: [], reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true, syncCode: null, syncEnabled: false } };
    for (const context of clients) await context.addInitScript(value => {
      if (location.origin !== 'http://localhost:8187') return;
      if (!localStorage.getItem('synthetic-personal-ui-seeded')) {
        localStorage.setItem('recall.snapshot.v1', JSON.stringify(value));
        localStorage.setItem('synthetic-personal-ui-seeded', '1');
      }
    }, empty);
    const pages = await Promise.all(clients.map(context => context.newPage()));
    for (const page of pages) {
      await page.goto('http://localhost:8187/app/app_17hv4js1tsy/personal/#settings', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: '我知道了，开始体验', exact: true }).click();
      await expect(page.getByRole('button', { name: '连接个人同步', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '连接个人同步', exact: true }).click();
      await page.getByRole('button', { name: '确认连接并同步', exact: true }).click();
      await expect(page.getByRole('button', { name: '立即同步', exact: true })).toBeEnabled();
      await expect(page.locator('[role="alert"]')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).cards.length)).toBe(1);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).cards[0].back)).toContain('recall://');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: '立即同步', exact: true })).toBeEnabled();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!).cards.length)).toBe(1);
      expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`personal-${pages.indexOf(page)}.png`), scale: 'css' });
    }
  } finally { await Promise.all(clients.map(context => context.close())); }
});
