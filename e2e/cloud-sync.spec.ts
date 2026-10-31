import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createSeedSnapshot } from '../src/data/seed';
import type { RecallStateSnapshot } from '../src/types';
import type { CloudState, DeviceSession } from '../shared/cloud';

const origin = 'https://127.0.0.1:8788';
const syntheticCode = 'synthetic-local-only-recovery-not-a-production-secret';

async function disk(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('recall.snapshot.v1')!));
}
async function pair(page: Page, code: string, label: string) {
  await page.goto('/#settings');
  await page.reload();
  await page.getByLabel('设备名称', { exact: true }).fill(label);
  await page.getByLabel('授权 / 恢复码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '授权并合并', exact: true }).click();
  await expect(page.getByText('云同步 · 已同步', { exact: true })).toBeVisible();
}

test('isolated D1: shared devices, offline archive, durable replay, conflicts and revocation', async ({ browser, request, baseURL }, info) => {
  expect(baseURL).toBe(origin + '/');
  const headers = { Origin: origin, 'CF-Connecting-IP': crypto.randomUUID() };
  const setup = await request.post('/api/auth/pair', { headers, data: { code: syntheticCode, label: 'Synthetic setup' } });
  expect(setup.ok()).toBe(true);
  const before = await (await request.get('/api/sync')).json() as CloudState;
  const deletes = before.entities.filter(entity => entity.kind !== 'setting' && entity.value !== null)
    .map(entity => ({ kind: entity.kind, id: entity.id, value: null, expectedRevision: entity.revision }));
  if (deletes.length) expect((await request.post('/api/sync', { headers, data: { id: crypto.randomUUID(), baseRevision: before.revision, changes: deletes } })).ok()).toBe(true);

  const seed = createSeedSnapshot();
  const identifier = crypto.randomUUID();
  const snapshot: RecallStateSnapshot = {
    ...seed,
    decks: [{ ...seed.decks[0], id: `deck-${identifier}`, parentId: null }],
    cards: [{ ...seed.cards[0], id: `card-${identifier}`, deckId: `deck-${identifier}`, front: 'Cloud question', back: 'Cloud answer', reps: 12, difficulty: 3, lastReviewDate: '2026-09-30T00:00:00Z', nextReviewDate: '2026-10-01T00:00:00Z' }],
    reviewLogs: [], studySessions: [], settings: { ...seed.settings, onboardingComplete: true },
  };
  const options = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, serviceWorkers: 'block' as const, extraHTTPHeaders: { 'CF-Connecting-IP': headers['CF-Connecting-IP'] } };
  const first = await browser.newContext(options);
  const second = await browser.newContext(options);
  try {
    const deviceA = await first.newPage();
    await deviceA.goto(origin);
    await expect(deviceA.locator('.memory-app')).toBeVisible();
    await deviceA.evaluate(value => localStorage.setItem('recall.snapshot.v1', JSON.stringify(value)), snapshot);
    await pair(deviceA, syntheticCode, 'Synthetic phone A');
    expect((await disk(deviceA)).cards[0].reps).toBe(12);
    const cookie = (await first.cookies()).find(value => value.name === 'recall_device')!;
    expect(cookie.httpOnly && cookie.secure).toBe(true);
    expect(cookie.path).toBe('/api');
    const sessionA = await (await first.request.get(origin + '/api/auth/session')).json() as DeviceSession;
    expect(sessionA.spaceId).toBe('synthetic-local-test');
    const codeResponse = await first.request.post(origin + '/api/auth/codes', { headers, data: {} });
    const issued = await codeResponse.json();
    const deviceB = await second.newPage();
    await pair(deviceB, issued.code, 'Synthetic phone B');
    expect((await disk(deviceB)).cards).toEqual((await disk(deviceA)).cards);
    const sessionB = await (await second.request.get(origin + '/api/auth/session')).json() as DeviceSession;
    expect(sessionA.device.id).not.toBe(sessionB.device.id);

    await deviceA.goto(origin + '/#home');
    await deviceA.reload();
    await deviceA.getByRole('button', { name: '开始复习', exact: true }).click();
    await deviceA.getByRole('button', { name: '显示答案', exact: true }).click();
    await deviceA.locator('[data-rating="good"]').click();
    await expect.poll(async () => (await disk(deviceA)).reviewLogs.length).toBe(1);
    await expect.poll(async () => {
      const state = await (await first.request.get(origin + '/api/sync')).json() as CloudState;
      return state.entities.filter(entity => entity.kind === 'reviewLog' && entity.value !== null).length;
    }).toBe(1);
    await deviceB.getByRole('button', { name: '立即同步', exact: true }).click();
    await expect.poll(async () => (await disk(deviceB)).reviewLogs.length).toBe(1);
    await expect(deviceA.getByRole('heading', { name: '本轮完成', exact: true })).toBeVisible();
    await deviceA.getByRole('button', { name: '撤销上次评分', exact: true }).click();
    await expect(deviceA.locator('.m-reading[data-active="true"]')).toBeVisible();
    await expect.poll(async () => (await disk(deviceA)).reviewLogs.length).toBe(0);
    await expect.poll(async () => {
      const state = await (await first.request.get(origin + '/api/sync')).json() as CloudState;
      return state.entities.filter(entity => entity.kind === 'reviewLog' && entity.value !== null).length;
    }).toBe(0);
    await deviceB.getByRole('button', { name: '立即同步', exact: true }).click();
    await expect.poll(async () => (await disk(deviceB)).reviewLogs.length).toBe(0);

    await deviceA.route('**/api/**', route => route.abort());
    await deviceA.goto(origin + '/#home');
    await deviceA.reload();
    await deviceA.getByRole('button', { name: '开始复习', exact: true }).click();
    await deviceA.getByRole('button', { name: '归档当前卡片', exact: true }).click();
    await expect.poll(async () => !!(await disk(deviceA)).cards[0].archivedAt).toBe(true);
    await deviceA.reload();
    await expect(deviceA.locator('.memory-app')).toBeVisible();
    expect((await disk(deviceA)).cards[0].reps).toBe(12);
    await deviceA.goto(origin + '/#settings');
    await deviceA.reload();
    let dropped = false;
    await deviceA.route('**/api/sync', async route => {
      if (route.request().method() === 'POST' && !dropped) {
        dropped = true;
        await route.fetch();
        await route.abort();
      } else if (dropped) await route.abort();
      else await route.continue();
    });
    await deviceA.unroute('**/api/**');
    await deviceA.getByRole('button', { name: '重试同步', exact: true }).click();
    await expect(deviceA.getByText('云同步 · 同步未完成', { exact: true })).toBeVisible();
    await expect.poll(async () => (await disk(deviceA)).cloudJournal.pending?.id).toBeTruthy();
    const committed = await (await first.request.get(origin + '/api/sync')).json() as CloudState;
    await deviceA.unroute('**/api/sync');
    await deviceA.getByRole('button', { name: '重试同步', exact: true }).click();
    await expect(deviceA.getByText('云同步 · 已同步', { exact: true })).toBeVisible();
    expect((await (await first.request.get(origin + '/api/sync')).json()).revision).toBe(committed.revision);
    await deviceB.getByRole('button', { name: '立即同步', exact: true }).click();
    await expect.poll(async () => !!(await disk(deviceB)).cards[0].archivedAt).toBe(true);

    await deviceA.route('**/api/**', route => route.abort());
    await deviceA.evaluate(() => {
      const cached = JSON.parse(localStorage.getItem('recall.snapshot.v1')!);
      cached.cards[0].front = 'Local conflicting question';
      localStorage.setItem('recall.snapshot.v1', JSON.stringify(cached));
    });
    await deviceA.reload();
    await expect(deviceA.getByText('云同步 · 同步未完成', { exact: true })).toBeVisible();
    const card = committed.entities.find(entity => entity.kind === 'card' && entity.id === snapshot.cards[0].id)!;
    const remoteEdit = await second.request.post(origin + '/api/sync', { headers, data: {
      id: crypto.randomUUID(), baseRevision: committed.revision,
      changes: [{ kind: 'card', id: card.id, expectedRevision: card.revision, value: { ...(card.value as object), front: 'Remote conflicting question' } }],
    } });
    expect(remoteEdit.ok()).toBe(true);
    await deviceA.unroute('**/api/**');
    await deviceA.getByRole('button', { name: '重试同步', exact: true }).click();
    await expect(deviceA.getByText('云同步 · 有冲突待处理', { exact: true })).toBeVisible();
    const downloadPromise = deviceA.waitForEvent('download');
    await deviceA.getByRole('button', { name: '导出冲突双方备份', exact: true }).click();
    const backupPath = await (await downloadPromise).path();
    const backup = await readFile(backupPath!, 'utf8');
    expect(backup).toContain('Local conflicting question');
    expect(backup).toContain('Remote conflicting question');
    expect(backup).not.toContain(cookie.value);
    expect(backup).not.toContain(syntheticCode);
    await deviceA.getByLabel('我已保存包含本机和云端双方版本的备份文件').check();
    await deviceA.getByLabel('使用云端版本，覆盖本机冲突').check();
    deviceA.once('dialog', dialog => dialog.accept());
    await deviceA.getByRole('button', { name: '确认使用云端版本', exact: true }).click();
    await expect(deviceA.getByText('云同步 · 已同步', { exact: true })).toBeVisible();
    expect((await disk(deviceA)).cards[0].front).toBe('Remote conflicting question');
    expect((await disk(deviceA)).cards[0].reps).toBe(12);
    expect(await deviceA.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await deviceA.screenshot({ path: info.outputPath('cloud-mobile.png'), scale: 'css' });

    expect((await first.request.delete(origin + `/api/auth/devices/${sessionB.device.id}`, { headers })).ok()).toBe(true);
    expect((await second.request.get(origin + '/api/sync')).status()).toBe(401);
    await deviceB.reload();
    await expect(deviceB.getByText('云同步 · 需要设备授权', { exact: true })).toBeVisible();
    expect((await disk(deviceB)).cards).toHaveLength(1);
  } finally {
    await Promise.allSettled([first.close(), second.close()]);
  }
});
